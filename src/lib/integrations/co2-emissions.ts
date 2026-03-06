import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';
import { SCOTTISH_COUNCILS } from '../councils';
import { fetchAndParseXlsx } from '../xlsx-fetcher';

// Known GOV.UK XLSX URLs for UK LA greenhouse gas emissions
const GHG_XLSX_URLS = [
    'https://assets.publishing.service.gov.uk/media/686539026569be0acf74db5a/2005-23-uk-local-authority-ghg-emissions.xlsx',
];

// Columns in sheet 1_1: 2=LA Name, 3=LA Code, 4=Year, 45=Grand Total (kt), 46=Population (thousands), 47=Per Capita
const COL_LA_NAME = 2;
const COL_LA_CODE = 3;
const COL_YEAR = 4;
const COL_TOTAL_KT = 45;
const COL_POPULATION = 46;
const COL_PER_CAPITA = 47;
const DATA_START_ROW = 5;

// Hardcoded fallback data (verified from official GOV.UK XLSX 2024 publication)
const FALLBACK_PER_CAPITA: Record<string, Record<number, number>> = {
    'Aberdeen City': { 2014: 7.2, 2015: 6.8, 2016: 6.3, 2017: 5.9, 2018: 5.8, 2019: 5.7, 2020: 4.9, 2021: 5.4, 2022: 5.0, 2023: 4.7 },
    'Aberdeenshire': { 2014: 12.9, 2015: 12.5, 2016: 12.1, 2017: 12.0, 2018: 11.4, 2019: 11.3, 2020: 10.7, 2021: 10.9, 2022: 10.6, 2023: 10.2 },
    'Angus': { 2014: 12.0, 2015: 11.8, 2016: 11.4, 2017: 11.3, 2018: 10.9, 2019: 10.8, 2020: 10.2, 2021: 10.6, 2022: 10.1, 2023: 10.0 },
    'Argyll and Bute': { 2014: 3.6, 2015: 3.7, 2016: 3.0, 2017: 3.0, 2018: 2.8, 2019: 2.6, 2020: 2.2, 2021: 3.0, 2022: 3.2, 2023: 3.3 },
    'Clackmannanshire': { 2014: 11.1, 2015: 11.5, 2016: 11.5, 2017: 11.2, 2018: 11.4, 2019: 11.2, 2020: 10.3, 2021: 10.0, 2022: 9.8, 2023: 9.4 },
    'Dumfries and Galloway': { 2014: 16.4, 2015: 16.4, 2016: 16.2, 2017: 16.2, 2018: 15.6, 2019: 15.6, 2020: 15.0, 2021: 15.9, 2022: 15.5, 2023: 15.3 },
    'Dundee City': { 2014: 5.9, 2015: 5.6, 2016: 5.2, 2017: 5.1, 2018: 5.0, 2019: 4.6, 2020: 4.5, 2021: 4.6, 2022: 4.2, 2023: 4.1 },
    'East Ayrshire': { 2014: 7.9, 2015: 7.8, 2016: 7.3, 2017: 7.3, 2018: 7.1, 2019: 7.1, 2020: 6.5, 2021: 6.9, 2022: 6.5, 2023: 6.3 },
    'East Dunbartonshire': { 2014: 5.3, 2015: 5.1, 2016: 4.8, 2017: 4.7, 2018: 4.4, 2019: 4.3, 2020: 3.8, 2021: 4.2, 2022: 3.8, 2023: 3.7 },
    'East Lothian': { 2014: 14.3, 2015: 13.2, 2016: 13.9, 2017: 14.6, 2018: 13.8, 2019: 13.4, 2020: 11.3, 2021: 12.2, 2022: 11.5, 2023: 11.3 },
    'East Renfrewshire': { 2014: 5.3, 2015: 5.4, 2016: 5.0, 2017: 4.9, 2018: 4.8, 2019: 4.6, 2020: 4.2, 2021: 4.5, 2022: 4.2, 2023: 4.1 },
    'City of Edinburgh': { 2014: 6.0, 2015: 5.9, 2016: 5.4, 2017: 5.1, 2018: 5.0, 2019: 4.7, 2020: 4.0, 2021: 4.4, 2022: 4.2, 2023: 4.1 },
    'Na h-Eileanan Siar': { 2014: 33.5, 2015: 33.3, 2016: 33.3, 2017: 33.1, 2018: 33.1, 2019: 33.0, 2020: 32.7, 2021: 32.9, 2022: 32.8, 2023: 32.7 },
    'Falkirk': { 2014: 16.3, 2015: 16.0, 2016: 15.6, 2017: 16.4, 2018: 16.6, 2019: 15.5, 2020: 15.0, 2021: 14.6, 2022: 14.3, 2023: 12.7 },
    'Fife': { 2014: 10.3, 2015: 10.5, 2016: 10.2, 2017: 10.0, 2018: 9.7, 2019: 8.8, 2020: 9.1, 2021: 8.6, 2022: 8.9, 2023: 8.9 },
    'Glasgow City': { 2014: 5.9, 2015: 5.8, 2016: 5.3, 2017: 5.1, 2018: 5.0, 2019: 4.7, 2020: 4.0, 2021: 4.5, 2022: 4.2, 2023: 3.8 },
    'Highland': { 2014: 10.8, 2015: 12.1, 2016: 10.5, 2017: 10.1, 2018: 12.0, 2019: 11.0, 2020: 9.5, 2021: 10.8, 2022: 9.9, 2023: 12.4 },
    'Inverclyde': { 2014: 5.8, 2015: 5.7, 2016: 5.1, 2017: 4.9, 2018: 4.7, 2019: 4.5, 2020: 4.4, 2021: 4.6, 2022: 4.2, 2023: 4.1 },
    'Midlothian': { 2014: 6.7, 2015: 6.5, 2016: 6.3, 2017: 6.2, 2018: 6.0, 2019: 5.7, 2020: 5.0, 2021: 5.4, 2022: 5.0, 2023: 4.8 },
    'Moray': { 2014: 10.2, 2015: 9.8, 2016: 9.3, 2017: 8.7, 2018: 8.6, 2019: 8.5, 2020: 7.7, 2021: 8.3, 2022: 7.9, 2023: 7.5 },
    'North Ayrshire': { 2014: 8.1, 2015: 7.9, 2016: 7.5, 2017: 6.7, 2018: 6.5, 2019: 6.5, 2020: 5.7, 2021: 6.4, 2022: 6.1, 2023: 5.3 },
    'North Lanarkshire': { 2014: 6.5, 2015: 6.4, 2016: 6.0, 2017: 6.1, 2018: 6.3, 2019: 5.8, 2020: 5.2, 2021: 5.6, 2022: 5.4, 2023: 5.4 },
    'Orkney Islands': { 2014: 19.7, 2015: 19.3, 2016: 18.5, 2017: 17.9, 2018: 17.2, 2019: 16.9, 2020: 16.2, 2021: 16.4, 2022: 15.7, 2023: 15.3 },
    'Perth and Kinross': { 2014: 10.3, 2015: 9.6, 2016: 9.2, 2017: 9.2, 2018: 8.9, 2019: 8.6, 2020: 7.7, 2021: 8.1, 2022: 7.9, 2023: 7.7 },
    'Renfrewshire': { 2014: 6.2, 2015: 6.2, 2016: 5.9, 2017: 5.8, 2018: 5.9, 2019: 5.5, 2020: 4.8, 2021: 5.3, 2022: 5.2, 2023: 4.9 },
    'Scottish Borders': { 2014: 13.0, 2015: 12.8, 2016: 12.3, 2017: 12.1, 2018: 11.6, 2019: 11.4, 2020: 10.2, 2021: 10.7, 2022: 10.3, 2023: 10.2 },
    'Shetland Islands': { 2014: 26.7, 2015: 26.2, 2016: 25.5, 2017: 25.3, 2018: 24.9, 2019: 24.9, 2020: 24.2, 2021: 24.4, 2022: 23.9, 2023: 24.0 },
    'South Ayrshire': { 2014: 8.5, 2015: 8.4, 2016: 8.1, 2017: 8.0, 2018: 7.5, 2019: 7.5, 2020: 7.0, 2021: 7.5, 2022: 7.1, 2023: 7.0 },
    'South Lanarkshire': { 2014: 7.0, 2015: 6.7, 2016: 6.3, 2017: 6.4, 2018: 6.3, 2019: 6.0, 2020: 5.4, 2021: 5.8, 2022: 5.4, 2023: 5.3 },
    'Stirling': { 2014: 8.5, 2015: 8.3, 2016: 8.1, 2017: 7.7, 2018: 7.9, 2019: 7.9, 2020: 6.9, 2021: 7.4, 2022: 7.0, 2023: 6.9 },
    'West Dunbartonshire': { 2014: 5.5, 2015: 5.2, 2016: 4.8, 2017: 4.6, 2018: 4.8, 2019: 5.5, 2020: 4.0, 2021: 4.5, 2022: 4.3, 2023: 4.1 },
    'West Lothian': { 2014: 7.7, 2015: 7.5, 2016: 7.4, 2017: 7.2, 2018: 6.9, 2019: 7.1, 2020: 6.1, 2021: 6.5, 2022: 6.2, 2023: 6.0 },
};

const FALLBACK_TOTAL_KT: Record<string, Record<number, number>> = {
    'Aberdeen City': { 2014: 1619.7, 2015: 1541.0, 2016: 1414.7, 2017: 1319.7, 2018: 1290.4, 2019: 1270.7, 2020: 1098.1, 2021: 1192.3, 2022: 1131.9, 2023: 1079.3 },
    'Aberdeenshire': { 2014: 3371.4, 2015: 3302.9, 2016: 3198.1, 2017: 3160.9, 2018: 2999.2, 2019: 2964.3, 2020: 2786.2, 2021: 2880.2, 2022: 2784.7, 2023: 2701.9 },
    'City of Edinburgh': { 2014: 2937.1, 2015: 2929.0, 2016: 2708.0, 2017: 2603.6, 2018: 2575.8, 2019: 2457.7, 2020: 2108.9, 2021: 2335.2, 2022: 2222.1, 2023: 2149.2 },
    'Glasgow City': { 2014: 3562.7, 2015: 3574.6, 2016: 3245.4, 2017: 3128.0, 2018: 3066.0, 2019: 2907.6, 2020: 2514.7, 2021: 2802.1, 2022: 2622.6, 2023: 2401.4 },
    'Fife': { 2014: 3788.0, 2015: 3869.1, 2016: 3761.3, 2017: 3699.6, 2018: 3588.6, 2019: 3271.5, 2020: 3372.3, 2021: 3207.0, 2022: 3314.7, 2023: 3324.7 },
};

const nameToCode: Record<string, string> = {};
for (const c of SCOTTISH_COUNCILS) nameToCode[c.name] = c.code;

interface GhgParsedData {
    source: string;
    perCapita: Record<string, Record<number, number>>;
    totalKt: Record<string, Record<number, number>>;
    population: Record<string, Record<number, number>>;
}

/** Parse the GHG XLSX sheet 1_1 and extract Scottish council data */
function parseGhgSheet(data: unknown[][]): GhgParsedData {
    const perCapita: Record<string, Record<number, number>> = {};
    const totalKt: Record<string, Record<number, number>> = {};
    const population: Record<string, Record<number, number>> = {};

    for (let i = DATA_START_ROW; i < data.length; i++) {
        const row = data[i] as unknown[];
        if (!row) continue;
        const laCode = String(row[COL_LA_CODE] ?? '');
        if (!laCode.startsWith('S12')) continue;
        const year = row[COL_YEAR] as number;
        if (typeof year !== 'number' || year < 2005) continue;

        const laName = String(row[COL_LA_NAME] ?? '');
        const pcVal = row[COL_PER_CAPITA];
        const totalVal = row[COL_TOTAL_KT];
        const popVal = row[COL_POPULATION];

        if (typeof pcVal === 'number') {
            if (!perCapita[laName]) perCapita[laName] = {};
            perCapita[laName][year] = Math.round(pcVal * 10) / 10;
        }
        if (typeof totalVal === 'number') {
            if (!totalKt[laName]) totalKt[laName] = {};
            totalKt[laName][year] = Math.round(totalVal * 10) / 10;
        }
        if (typeof popVal === 'number') {
            if (!population[laName]) population[laName] = {};
            population[laName][year] = Math.round(popVal * 100) / 100;
        }
    }

    return { source: 'live_xlsx', perCapita, totalKt, population };
}

/** Shared fetch: downloads the GHG XLSX and parses it. Used by both Co2EmissionsPlugin and PopulationPlugin. */
let cachedGhgData: GhgParsedData | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function fetchGhgData(): Promise<GhgParsedData> {
    // Return cached if fresh
    if (cachedGhgData && Date.now() - cachedAt < CACHE_TTL_MS) {
        return cachedGhgData;
    }

    for (const url of GHG_XLSX_URLS) {
        try {
            const { sheets } = await fetchAndParseXlsx(url, { sheetName: '1_1', timeout: 90_000 });
            const sheetData = sheets['1_1'];
            if (sheetData && sheetData.length > 100) {
                const parsed = parseGhgSheet(sheetData);
                if (Object.keys(parsed.perCapita).length >= 20) {
                    cachedGhgData = parsed;
                    cachedAt = Date.now();
                    return parsed;
                }
            }
        } catch {
            continue;
        }
    }

    throw new Error('Failed to download GHG XLSX');
}

export class Co2EmissionsPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'co2-emissions',
            name: 'UK Local Authority CO2 Emissions',
            description: 'Territorial greenhouse gas emissions (CO2e) per local authority. Auto-fetches from GOV.UK XLSX.',
            docsUrl: 'https://www.gov.uk/government/collections/uk-local-authority-and-regional-greenhouse-gas-emissions-national-statistics',
            authType: 'none',
            rateLimitNotes: 'Downloads ~24MB XLSX from GOV.UK. Cached for 1 hour. Falls back to verified 2014–2023 data.',
            licence: 'Open Government Licence v3.0',
            tier: 'A',
            sampleRequest: 'Auto-downloads from assets.publishing.service.gov.uk',
            fieldMapping: 'co2_per_capita_tonnes, co2_total_kt',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();
        let data: { source: string; perCapita: Record<string, Record<number, number>>; totalKt: Record<string, Record<number, number>> };

        try {
            const ghg = await fetchGhgData();
            data = { source: ghg.source, perCapita: ghg.perCapita, totalKt: ghg.totalKt };
        } catch {
            // Fallback to hardcoded
            data = { source: 'fallback', perCapita: FALLBACK_PER_CAPITA, totalKt: FALLBACK_TOTAL_KT };
        }

        return {
            data,
            httpStatus: 200,
            latencyMs: Date.now() - start,
            truncatedPayload: JSON.stringify({ source: data.source, councils: Object.keys(data.perCapita).length }),
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as { source?: string; perCapita: Record<string, Record<number, number>>; totalKt: Record<string, Record<number, number>> };
        if (!data?.perCapita) return results;

        for (const [councilName, yearData] of Object.entries(data.perCapita)) {
            const geoCode = nameToCode[councilName];
            if (!geoCode) continue;
            for (const [yearStr, value] of Object.entries(yearData)) {
                const year = parseInt(yearStr);
                if (year < 2014) continue;
                results.push({
                    metricKey: 'co2_per_capita_tonnes', sourceSlug: 'co2-emissions', geoType: 'council', geoCode,
                    periodStart: new Date(`${year}-01-01T00:00:00Z`), periodEnd: new Date(`${year}-12-31T23:59:59Z`),
                    value, unit: 't CO2e/person',
                    metadata: { councilName, period: `${year}`, attribution: 'DESNZ UK LA GHG Emissions', licence: 'OGL v3.0', source: data.source },
                });
            }
        }

        for (const [councilName, yearData] of Object.entries(data.totalKt || {})) {
            const geoCode = nameToCode[councilName];
            if (!geoCode) continue;
            for (const [yearStr, value] of Object.entries(yearData)) {
                const year = parseInt(yearStr);
                if (year < 2014) continue;
                results.push({
                    metricKey: 'co2_total_kt', sourceSlug: 'co2-emissions', geoType: 'council', geoCode,
                    periodStart: new Date(`${year}-01-01T00:00:00Z`), periodEnd: new Date(`${year}-12-31T23:59:59Z`),
                    value, unit: 'kt CO2e',
                    metadata: { councilName, period: `${year}`, attribution: 'DESNZ UK LA GHG Emissions', licence: 'OGL v3.0', source: data.source },
                });
            }
        }

        return results;
    }
}
