import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';
import { SCOTTISH_COUNCILS } from '../councils';
import { fetchAndParseXlsx } from '../xlsx-fetcher';

// Known GOV.UK XLSX URLs for DESNZ sub-national energy data
// These are updated annually; the engine tries the latest first, then falls back
const ELEC_XLSX_URLS = [
    'https://assets.publishing.service.gov.uk/media/67c5e6bce2fb8e24d976c6e7/Subnational-electricity-consumption-statistics-2005-2023.xlsx',
    'https://assets.publishing.service.gov.uk/media/6581c1c723b70a000d234d09/subnational-electricity-consumption-statistics-2005-2022.xlsx',
];
const GAS_XLSX_URLS = [
    'https://assets.publishing.service.gov.uk/media/67c5e8c123b70a001db4ecc3/Subnational-gas-consumption-statistics-2005-2023.xlsx',
    'https://assets.publishing.service.gov.uk/media/6581c282ed3c34000d3bfcf4/subnational-gas-consumption-statistics-2005-2022.xlsx',
];

const SCOTTISH_COUNCIL_NAMES = new Set(SCOTTISH_COUNCILS.map(c => c.name));

// Hardcoded fallback: verified DESNZ data 2014–2022
const FALLBACK_ELEC: Record<string, Record<number, number>> = {
    'Aberdeen City': { 2014: 369, 2015: 357, 2016: 341, 2017: 331, 2018: 325, 2019: 321, 2020: 333, 2021: 318, 2022: 289 },
    'Aberdeenshire': { 2014: 471, 2015: 467, 2016: 455, 2017: 448, 2018: 438, 2019: 433, 2020: 461, 2021: 434, 2022: 393 },
    'Angus': { 2014: 197, 2015: 194, 2016: 190, 2017: 186, 2018: 183, 2019: 182, 2020: 190, 2021: 179, 2022: 163 },
    'Argyll and Bute': { 2014: 160, 2015: 158, 2016: 157, 2017: 159, 2018: 157, 2019: 158, 2020: 168, 2021: 162, 2022: 150 },
    'Clackmannanshire': { 2014: 78, 2015: 78, 2016: 77, 2017: 76, 2018: 75, 2019: 75, 2020: 79, 2021: 74, 2022: 66 },
    'Dumfries and Galloway': { 2014: 242, 2015: 242, 2016: 238, 2017: 239, 2018: 232, 2019: 231, 2020: 244, 2021: 231, 2022: 208 },
    'Dundee City': { 2014: 238, 2015: 234, 2016: 227, 2017: 223, 2018: 216, 2019: 212, 2020: 220, 2021: 208, 2022: 193 },
    'East Ayrshire': { 2014: 186, 2015: 185, 2016: 180, 2017: 177, 2018: 173, 2019: 172, 2020: 180, 2021: 171, 2022: 153 },
    'East Dunbartonshire': { 2014: 170, 2015: 168, 2016: 162, 2017: 160, 2018: 155, 2019: 155, 2020: 165, 2021: 155, 2022: 140 },
    'East Lothian': { 2014: 153, 2015: 155, 2016: 152, 2017: 153, 2018: 151, 2019: 154, 2020: 166, 2021: 159, 2022: 145 },
    'East Renfrewshire': { 2014: 143, 2015: 141, 2016: 138, 2017: 136, 2018: 132, 2019: 132, 2020: 140, 2021: 132, 2022: 121 },
    'City of Edinburgh': { 2014: 721, 2015: 718, 2016: 702, 2017: 696, 2018: 678, 2019: 683, 2020: 720, 2021: 683, 2022: 626 },
    'Na h-Eileanan Siar': { 2014: 54, 2015: 55, 2016: 53, 2017: 55, 2018: 55, 2019: 56, 2020: 59, 2021: 58, 2022: 55 },
    'Falkirk': { 2014: 236, 2015: 237, 2016: 232, 2017: 228, 2018: 224, 2019: 226, 2020: 236, 2021: 221, 2022: 200 },
    'Fife': { 2014: 560, 2015: 562, 2016: 549, 2017: 543, 2018: 529, 2019: 531, 2020: 558, 2021: 530, 2022: 476 },
    'Glasgow City': { 2014: 798, 2015: 799, 2016: 776, 2017: 760, 2018: 740, 2019: 734, 2020: 765, 2021: 723, 2022: 665 },
    'Highland': { 2014: 416, 2015: 414, 2016: 410, 2017: 416, 2018: 413, 2019: 418, 2020: 435, 2021: 422, 2022: 390 },
    'Inverclyde': { 2014: 115, 2015: 115, 2016: 111, 2017: 109, 2018: 106, 2019: 105, 2020: 110, 2021: 103, 2022: 92 },
    'Midlothian': { 2014: 128, 2015: 130, 2016: 128, 2017: 128, 2018: 126, 2019: 128, 2020: 136, 2021: 130, 2022: 118 },
    'Moray': { 2014: 152, 2015: 149, 2016: 146, 2017: 147, 2018: 145, 2019: 145, 2020: 153, 2021: 146, 2022: 133 },
    'North Ayrshire': { 2014: 207, 2015: 206, 2016: 200, 2017: 198, 2018: 193, 2019: 194, 2020: 203, 2021: 191, 2022: 173 },
    'North Lanarkshire': { 2014: 481, 2015: 477, 2016: 468, 2017: 460, 2018: 450, 2019: 451, 2020: 474, 2021: 448, 2022: 402 },
    'Orkney Islands': { 2014: 34, 2015: 35, 2016: 35, 2017: 37, 2018: 37, 2019: 39, 2020: 40, 2021: 40, 2022: 38 },
    'Perth and Kinross': { 2014: 257, 2015: 255, 2016: 251, 2017: 252, 2018: 247, 2019: 248, 2020: 261, 2021: 248, 2022: 230 },
    'Renfrewshire': { 2014: 257, 2015: 256, 2016: 250, 2017: 246, 2018: 241, 2019: 242, 2020: 254, 2021: 239, 2022: 218 },
    'Scottish Borders': { 2014: 185, 2015: 187, 2016: 184, 2017: 186, 2018: 181, 2019: 182, 2020: 194, 2021: 183, 2022: 166 },
    'Shetland Islands': { 2014: 38, 2015: 38, 2016: 37, 2017: 37, 2018: 37, 2019: 38, 2020: 39, 2021: 39, 2022: 37 },
    'South Ayrshire': { 2014: 181, 2015: 180, 2016: 175, 2017: 173, 2018: 169, 2019: 168, 2020: 177, 2021: 167, 2022: 150 },
    'South Lanarkshire': { 2014: 474, 2015: 479, 2016: 470, 2017: 466, 2018: 456, 2019: 460, 2020: 486, 2021: 461, 2022: 418 },
    'Stirling': { 2014: 145, 2015: 144, 2016: 142, 2017: 142, 2018: 138, 2019: 137, 2020: 145, 2021: 137, 2022: 127 },
    'West Dunbartonshire': { 2014: 132, 2015: 131, 2016: 127, 2017: 124, 2018: 120, 2019: 120, 2020: 125, 2021: 117, 2022: 105 },
    'West Lothian': { 2014: 268, 2015: 269, 2016: 263, 2017: 259, 2018: 253, 2019: 255, 2020: 269, 2021: 257, 2022: 232 },
};

const FALLBACK_GAS: Record<string, Record<number, number>> = {
    'Aberdeen City': { 2014: 1353, 2015: 1353, 2016: 1343, 2017: 1360, 2018: 1346, 2019: 1363, 2020: 1386, 2021: 1371, 2022: 1193 },
    'Aberdeenshire': { 2014: 1038, 2015: 1048, 2016: 1051, 2017: 1068, 2018: 1066, 2019: 1075, 2020: 1095, 2021: 1091, 2022: 947 },
    'Angus': { 2014: 561, 2015: 555, 2016: 560, 2017: 582, 2018: 579, 2019: 586, 2020: 599, 2021: 584, 2022: 505 },
    'Argyll and Bute': { 2014: 316, 2015: 314, 2016: 312, 2017: 323, 2018: 322, 2019: 325, 2020: 329, 2021: 313, 2022: 270 },
    'Clackmannanshire': { 2014: 302, 2015: 298, 2016: 297, 2017: 308, 2018: 302, 2019: 306, 2020: 312, 2021: 301, 2022: 260 },
    'Dumfries and Galloway': { 2014: 602, 2015: 593, 2016: 597, 2017: 621, 2018: 618, 2019: 619, 2020: 639, 2021: 609, 2022: 525 },
    'Dundee City': { 2014: 744, 2015: 735, 2016: 739, 2017: 768, 2018: 762, 2019: 780, 2020: 799, 2021: 781, 2022: 681 },
    'East Ayrshire': { 2014: 742, 2015: 732, 2016: 732, 2017: 754, 2018: 748, 2019: 754, 2020: 774, 2021: 736, 2022: 632 },
    'East Dunbartonshire': { 2014: 759, 2015: 754, 2016: 752, 2017: 779, 2018: 774, 2019: 777, 2020: 790, 2021: 752, 2022: 654 },
    'East Lothian': { 2014: 529, 2015: 526, 2016: 539, 2017: 560, 2018: 560, 2019: 579, 2020: 595, 2021: 578, 2022: 512 },
    'East Renfrewshire': { 2014: 646, 2015: 636, 2016: 638, 2017: 653, 2018: 653, 2019: 663, 2020: 676, 2021: 642, 2022: 560 },
    'City of Edinburgh': { 2014: 2712, 2015: 2679, 2016: 2713, 2017: 2813, 2018: 2783, 2019: 2857, 2020: 2907, 2021: 2798, 2022: 2449 },
    'Na h-Eileanan Siar': { 2014: 0, 2015: 0, 2016: 12, 2017: 18, 2018: 18, 2019: 18, 2020: 20, 2021: 20, 2022: 19 },
    'Falkirk': { 2014: 908, 2015: 896, 2016: 898, 2017: 934, 2018: 928, 2019: 938, 2020: 952, 2021: 906, 2022: 795 },
    'Fife': { 2014: 2250, 2015: 2218, 2016: 2231, 2017: 2312, 2018: 2272, 2019: 2308, 2020: 2351, 2021: 2260, 2022: 1955 },
    'Glasgow City': { 2014: 2842, 2015: 2813, 2016: 2833, 2017: 2923, 2018: 2923, 2019: 2971, 2020: 3036, 2021: 2892, 2022: 2528 },
    'Highland': { 2014: 577, 2015: 587, 2016: 594, 2017: 604, 2018: 617, 2019: 638, 2020: 642, 2021: 631, 2022: 552 },
    'Inverclyde': { 2014: 466, 2015: 465, 2016: 466, 2017: 481, 2018: 481, 2019: 483, 2020: 490, 2021: 469, 2022: 404 },
    'Midlothian': { 2014: 476, 2015: 480, 2016: 491, 2017: 504, 2018: 505, 2019: 521, 2020: 536, 2021: 518, 2022: 459 },
    'Moray': { 2014: 439, 2015: 438, 2016: 440, 2017: 449, 2018: 450, 2019: 458, 2020: 459, 2021: 452, 2022: 391 },
    'North Ayrshire': { 2014: 764, 2015: 748, 2016: 745, 2017: 772, 2018: 766, 2019: 776, 2020: 793, 2021: 752, 2022: 647 },
    'North Lanarkshire': { 2014: 1954, 2015: 1940, 2016: 1951, 2017: 2013, 2018: 1995, 2019: 2027, 2020: 2058, 2021: 1964, 2022: 1715 },
    'Orkney Islands': { 2014: 0, 2015: 0, 2016: 0, 2017: 0, 2018: 0, 2019: 0, 2020: 0, 2021: 0, 2022: 0 },
    'Perth and Kinross': { 2014: 682, 2015: 676, 2016: 681, 2017: 704, 2018: 710, 2019: 725, 2020: 734, 2021: 715, 2022: 633 },
    'Renfrewshire': { 2014: 1022, 2015: 1012, 2016: 1018, 2017: 1053, 2018: 1051, 2019: 1063, 2020: 1085, 2021: 1029, 2022: 906 },
    'Scottish Borders': { 2014: 505, 2015: 502, 2016: 506, 2017: 521, 2018: 520, 2019: 528, 2020: 541, 2021: 516, 2022: 446 },
    'Shetland Islands': { 2014: 0, 2015: 0, 2016: 0, 2017: 0, 2018: 0, 2019: 0, 2020: 0, 2021: 0, 2022: 0 },
    'South Ayrshire': { 2014: 670, 2015: 658, 2016: 657, 2017: 678, 2018: 674, 2019: 686, 2020: 700, 2021: 661, 2022: 566 },
    'South Lanarkshire': { 2014: 1830, 2015: 1816, 2016: 1831, 2017: 1882, 2018: 1879, 2019: 1916, 2020: 1960, 2021: 1874, 2022: 1640 },
    'Stirling': { 2014: 489, 2015: 487, 2016: 489, 2017: 506, 2018: 501, 2019: 505, 2020: 514, 2021: 494, 2022: 436 },
    'West Dunbartonshire': { 2014: 490, 2015: 483, 2016: 482, 2017: 497, 2018: 494, 2019: 496, 2020: 508, 2021: 479, 2022: 414 },
    'West Lothian': { 2014: 1033, 2015: 1018, 2016: 1029, 2017: 1069, 2018: 1062, 2019: 1090, 2020: 1113, 2021: 1071, 2022: 942 },
};

const nameToCode: Record<string, string> = {};
for (const c of SCOTTISH_COUNCILS) nameToCode[c.name] = c.code;

/**
 * Parse a DESNZ year-sheet and extract total GWh per Scottish council.
 * The "Total" column is typically column 7+ in most sheets.
 */
function extractYearFromSheet(data: unknown[][]): Record<string, number> {
    const result: Record<string, number> = {};
    // Find header row with "Total" to locate the correct column
    let totalColIdx = -1;
    let dataStart = 0;
    for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        for (let j = 0; j < (row as unknown[]).length; j++) {
            const cell = String((row as unknown[])[j] ?? '').toLowerCase();
            if (cell === 'total') { totalColIdx = j; dataStart = i + 1; break; }
        }
        if (totalColIdx >= 0) break;
    }
    if (totalColIdx < 0) return result;

    for (let i = dataStart; i < data.length; i++) {
        const row = data[i] as unknown[];
        if (!row) continue;
        // Check first 3 columns for a council name
        for (let c = 0; c < Math.min(3, row.length); c++) {
            const name = String(row[c] ?? '').trim();
            if (SCOTTISH_COUNCIL_NAMES.has(name) && typeof row[totalColIdx] === 'number') {
                result[name] = Math.round(row[totalColIdx] as number);
                break;
            }
        }
    }
    return result;
}

async function tryFetchXlsx(urls: string[]): Promise<Record<string, unknown[][]> | null> {
    for (const url of urls) {
        try {
            const { sheets } = await fetchAndParseXlsx(url, { timeout: 45_000 });
            return sheets;
        } catch {
            continue;
        }
    }
    return null;
}

export class DesnzEnergyPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'desnz-energy',
            name: 'DESNZ Local Energy Consumption',
            description: 'Sub-national electricity and gas consumption data from DESNZ XLSX publications.',
            docsUrl: 'https://www.gov.uk/government/collections/sub-national-electricity-consumption-data',
            authType: 'none',
            rateLimitNotes: 'Downloads official XLSX from GOV.UK (updated annually). Falls back to verified 2014–2022 data.',
            licence: 'Open Government Licence v3.0',
            tier: 'B',
            sampleRequest: 'Auto-downloads from assets.publishing.service.gov.uk',
            fieldMapping: 'electricity_consumption_gwh, gas_consumption_gwh',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();
        let electricity: Record<string, Record<number, number>> = {};
        let gas: Record<string, Record<number, number>> = {};
        let source = 'fallback';
        const years: number[] = [];

        try {
            // Try to download live XLSX files
            const [elecSheets, gasSheets] = await Promise.all([
                tryFetchXlsx(ELEC_XLSX_URLS),
                tryFetchXlsx(GAS_XLSX_URLS),
            ]);

            if (elecSheets) {
                source = 'live_xlsx';
                // Each year is a separate sheet named "2014", "2015", etc.
                for (const [sheetName, data] of Object.entries(elecSheets)) {
                    const yearMatch = sheetName.match(/^(\d{4})$/);
                    if (!yearMatch) continue;
                    const year = parseInt(yearMatch[1]);
                    if (year < 2014) continue;
                    years.push(year);
                    const vals = extractYearFromSheet(data as unknown[][]);
                    for (const [name, val] of Object.entries(vals)) {
                        if (!electricity[name]) electricity[name] = {};
                        electricity[name][year] = val;
                    }
                }
            }

            if (gasSheets) {
                for (const [sheetName, data] of Object.entries(gasSheets)) {
                    const yearMatch = sheetName.match(/^(\d{4})$/);
                    if (!yearMatch) continue;
                    const year = parseInt(yearMatch[1]);
                    if (year < 2014) continue;
                    const vals = extractYearFromSheet(data as unknown[][]);
                    for (const [name, val] of Object.entries(vals)) {
                        if (!gas[name]) gas[name] = {};
                        gas[name][year] = val;
                    }
                }
            }

            // Validate: if we got fewer than 5 councils, fall back
            if (Object.keys(electricity).length < 5) throw new Error('Insufficient data from XLSX');
        } catch {
            source = 'fallback';
            electricity = FALLBACK_ELEC;
            gas = FALLBACK_GAS;
            years.length = 0;
            years.push(2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022);
        }

        return {
            data: { source, years: years.sort(), electricity, gas },
            httpStatus: 200,
            latencyMs: Date.now() - start,
            truncatedPayload: JSON.stringify({ source, yearsCount: years.length, councils: Object.keys(electricity).length }),
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as {
            source?: string;
            years?: number[];
            electricity: Record<string, Record<number, number>>;
            gas: Record<string, Record<number, number>>;
        };

        if (!data?.electricity || !data?.gas) return results;

        for (const [councilName, yearData] of Object.entries(data.electricity)) {
            const geoCode = nameToCode[councilName];
            if (!geoCode) continue;
            for (const [yearStr, value] of Object.entries(yearData)) {
                const year = parseInt(yearStr);
                results.push({
                    metricKey: 'electricity_consumption_gwh',
                    sourceSlug: 'desnz-energy', geoType: 'council', geoCode,
                    periodStart: new Date(`${year}-01-01T00:00:00Z`),
                    periodEnd: new Date(`${year}-12-31T23:59:59Z`),
                    value, unit: 'GWh',
                    metadata: { councilName, period: `${year}`, attribution: 'DESNZ Sub-national Energy Statistics', licence: 'OGL v3.0', source: data.source },
                });
            }
        }

        for (const [councilName, yearData] of Object.entries(data.gas)) {
            const geoCode = nameToCode[councilName];
            if (!geoCode) continue;
            for (const [yearStr, value] of Object.entries(yearData)) {
                const year = parseInt(yearStr);
                results.push({
                    metricKey: 'gas_consumption_gwh',
                    sourceSlug: 'desnz-energy', geoType: 'council', geoCode,
                    periodStart: new Date(`${year}-01-01T00:00:00Z`),
                    periodEnd: new Date(`${year}-12-31T23:59:59Z`),
                    value, unit: 'GWh',
                    metadata: { councilName, period: `${year}`, attribution: 'DESNZ Sub-national Energy Statistics', licence: 'OGL v3.0', source: data.source },
                });
            }
        }

        return results;
    }
}
