import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';
import { SCOTTISH_COUNCILS } from '../councils';
import { fetchGhgData } from './co2-emissions';

// Hardcoded fallback: NRS mid-year population estimates (thousands)
const FALLBACK_POP: Record<string, Record<number, number>> = {
    'Aberdeen City': { 2014: 226.17, 2015: 226.68, 2016: 225.34, 2017: 223.89, 2018: 222.17, 2019: 222.76, 2020: 222.71, 2021: 220.63, 2022: 224.25, 2023: 227.75 },
    'Aberdeenshire': { 2014: 261.35, 2015: 263.25, 2016: 263.46, 2017: 262.92, 2018: 262.22, 2019: 261.9, 2020: 261.51, 2021: 263.14, 2022: 263.75, 2023: 264.32 },
    'Angus': { 2014: 116.55, 2015: 116.87, 2016: 116.45, 2017: 116.09, 2018: 115.61, 2019: 115.53, 2020: 114.99, 2021: 114.95, 2022: 114.67, 2023: 114.82 },
    'Argyll and Bute': { 2014: 88.45, 2015: 87.85, 2016: 88.23, 2017: 88.09, 2018: 87.59, 2019: 87.36, 2020: 87.16, 2021: 87.96, 2022: 87.93, 2023: 87.81 },
    'Clackmannanshire': { 2014: 51.39, 2015: 51.56, 2016: 51.54, 2017: 51.63, 2018: 51.54, 2019: 51.66, 2020: 51.4, 2021: 51.6, 2022: 51.75, 2023: 51.94 },
    'Dumfries and Galloway': { 2014: 149.49, 2015: 148.82, 2016: 148.39, 2017: 147.81, 2018: 146.99, 2019: 146.81, 2020: 146.09, 2021: 146.25, 2022: 145.77, 2023: 145.67 },
    'Dundee City': { 2014: 147.36, 2015: 147.32, 2016: 147.22, 2017: 147.81, 2018: 147.77, 2019: 148.29, 2020: 148.07, 2021: 146.79, 2022: 148.47, 2023: 150.39 },
    'East Ayrshire': { 2014: 121.87, 2015: 121.62, 2016: 121.58, 2017: 121.15, 2018: 120.81, 2019: 120.87, 2020: 120.34, 2021: 120.5, 2022: 120.4, 2023: 120.75 },
    'East Dunbartonshire': { 2014: 106.93, 2015: 107.35, 2016: 107.83, 2017: 108.46, 2018: 108.56, 2019: 108.87, 2020: 108.88, 2021: 108.92, 2022: 108.99, 2023: 109.23 },
    'East Lothian': { 2014: 102.88, 2015: 104.11, 2016: 105.17, 2017: 106.08, 2018: 107.07, 2019: 108.51, 2020: 109.51, 2021: 111.34, 2022: 112.46, 2023: 113.74 },
    'East Renfrewshire': { 2014: 92.53, 2015: 93.09, 2016: 93.88, 2017: 94.81, 2018: 95.07, 2019: 95.41, 2020: 95.82, 2021: 96.21, 2022: 97.17, 2023: 98.6 },
    'City of Edinburgh': { 2014: 485.27, 2015: 490.28, 2016: 496.2, 2017: 500.77, 2018: 503.92, 2019: 508.28, 2020: 509.55, 2021: 505.75, 2022: 514.57, 2023: 523.25 },
    'Na h-Eileanan Siar': { 2014: 27.18, 2015: 26.93, 2016: 26.7, 2017: 26.69, 2018: 26.5, 2019: 26.34, 2020: 26.08, 2021: 26.16, 2022: 26.12, 2023: 26.03 },
    'Falkirk': { 2014: 157.27, 2015: 157.88, 2016: 158.66, 2017: 159.24, 2018: 159.09, 2019: 159.53, 2020: 158.99, 2021: 158.76, 2022: 158.45, 2023: 158.62 },
    'Fife': { 2014: 366.37, 2015: 367.02, 2016: 368.83, 2017: 369.4, 2018: 369.27, 2019: 370.62, 2020: 370.76, 2021: 370.88, 2022: 371.39, 2023: 373.21 },
    'Glasgow City': { 2014: 592.4, 2015: 595.2, 2016: 600.82, 2017: 604.22, 2018: 608.19, 2019: 612.49, 2020: 612.71, 2021: 610.86, 2022: 622.05, 2023: 631.97 },
    'Highland': { 2014: 233.18, 2015: 234.06, 2016: 234.57, 2017: 234.8, 2018: 234.53, 2019: 234.51, 2020: 233.91, 2021: 235.85, 2022: 235.71, 2023: 236.33 },
    'Inverclyde': { 2014: 80.54, 2015: 80.34, 2016: 80.11, 2017: 79.82, 2018: 79.35, 2019: 79.15, 2020: 78.58, 2021: 78.39, 2022: 78.35, 2023: 78.33 },
    'Midlothian': { 2014: 86.88, 2015: 88.18, 2016: 89.47, 2017: 91.0, 2018: 92.22, 2019: 93.42, 2020: 94.18, 2021: 95.67, 2022: 97.04, 2023: 98.26 },
    'Moray': { 2014: 94.18, 2015: 94.8, 2016: 95.11, 2017: 94.66, 2018: 94.09, 2019: 94.17, 2020: 93.87, 2021: 94.27, 2022: 94.3, 2023: 94.67 },
    'North Ayrshire': { 2014: 136.67, 2015: 136.22, 2016: 135.95, 2017: 135.81, 2018: 135.13, 2019: 134.57, 2020: 134.04, 2021: 133.86, 2022: 133.49, 2023: 133.57 },
    'North Lanarkshire': { 2014: 338.44, 2015: 338.75, 2016: 339.74, 2017: 340.31, 2018: 340.35, 2019: 341.57, 2020: 341.4, 2021: 341.28, 2022: 340.92, 2023: 341.89 },
    'Orkney Islands': { 2014: 21.51, 2015: 21.52, 2016: 21.64, 2017: 21.73, 2018: 21.83, 2019: 21.87, 2020: 21.97, 2021: 22.03, 2022: 22.03, 2023: 22.0 },
    'Perth and Kinross': { 2014: 147.8, 2015: 148.49, 2016: 149.17, 2017: 149.54, 2018: 149.35, 2019: 149.74, 2020: 149.41, 2021: 150.7, 2022: 151.13, 2023: 152.56 },
    'Renfrewshire': { 2014: 175.28, 2015: 175.9, 2016: 177.4, 2017: 178.53, 2018: 179.51, 2019: 181.04, 2020: 181.61, 2021: 182.33, 2022: 184.37, 2023: 186.54 },
    'Scottish Borders': { 2014: 114.76, 2015: 114.89, 2016: 115.46, 2017: 115.97, 2018: 116.19, 2019: 116.49, 2020: 116.38, 2021: 117.08, 2022: 116.82, 2023: 116.63 },
    'Shetland Islands': { 2014: 23.33, 2015: 23.37, 2016: 23.24, 2017: 23.11, 2018: 23.0, 2019: 22.91, 2020: 22.89, 2021: 22.96, 2022: 23.02, 2023: 23.0 },
    'South Ayrshire': { 2014: 112.44, 2015: 112.26, 2016: 112.2, 2017: 112.4, 2018: 111.99, 2019: 112.01, 2020: 111.47, 2021: 111.56, 2022: 111.56, 2023: 111.83 },
    'South Lanarkshire': { 2014: 316.77, 2015: 318.11, 2016: 319.05, 2017: 320.48, 2018: 321.32, 2019: 323.12, 2020: 323.62, 2021: 325.39, 2022: 327.46, 2023: 330.28 },
    'Stirling': { 2014: 90.15, 2015: 90.89, 2016: 91.6, 2017: 91.78, 2018: 91.94, 2019: 92.1, 2020: 92.09, 2021: 91.47, 2022: 92.61, 2023: 93.55 },
    'West Dunbartonshire': { 2014: 89.95, 2015: 89.93, 2016: 90.26, 2017: 90.12, 2018: 89.66, 2019: 89.56, 2020: 88.99, 2021: 88.51, 2022: 88.27, 2023: 88.75 },
    'West Lothian': { 2014: 176.06, 2015: 177.06, 2016: 178.33, 2017: 179.08, 2018: 179.27, 2019: 179.74, 2020: 179.92, 2021: 180.85, 2022: 181.73, 2023: 183.81 },
};

const nameToCode: Record<string, string> = {};
for (const c of SCOTTISH_COUNCILS) nameToCode[c.name] = c.code;

export class PopulationPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'population',
            name: 'Mid-Year Population Estimates',
            description: 'NRS mid-year population estimates by Scottish council. Auto-fetches from GOV.UK GHG XLSX.',
            docsUrl: 'https://www.nrscotland.gov.uk/statistics-and-data/statistics/statistics-by-theme/population/population-estimates/',
            authType: 'none',
            rateLimitNotes: 'Shares the GHG XLSX download with CO2 plugin (cached). Falls back to verified 2014–2023 data.',
            licence: 'Open Government Licence v3.0',
            tier: 'B',
            sampleRequest: 'N/A',
            fieldMapping: 'population_thousands',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();
        let population: Record<string, Record<number, number>>;
        let source = 'fallback';

        try {
            const ghg = await fetchGhgData();
            if (Object.keys(ghg.population).length >= 20) {
                population = ghg.population;
                source = 'live_xlsx';
            } else {
                population = FALLBACK_POP;
            }
        } catch {
            population = FALLBACK_POP;
        }

        return {
            data: { source, population },
            httpStatus: 200,
            latencyMs: Date.now() - start,
            truncatedPayload: JSON.stringify({ source, councils: Object.keys(population).length }),
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as { source?: string; population: Record<string, Record<number, number>> };
        if (!data?.population) return results;

        for (const [councilName, yearData] of Object.entries(data.population)) {
            const geoCode = nameToCode[councilName];
            if (!geoCode) continue;
            for (const [yearStr, value] of Object.entries(yearData)) {
                const year = parseInt(yearStr);
                if (year < 2014) continue;
                results.push({
                    metricKey: 'population_thousands',
                    sourceSlug: 'population', geoType: 'council', geoCode,
                    periodStart: new Date(`${year}-06-30T00:00:00Z`),
                    periodEnd: new Date(`${year}-06-30T23:59:59Z`),
                    value, unit: 'thousands',
                    metadata: { councilName, period: `${year}`, attribution: 'NRS via GOV.UK', licence: 'OGL v3.0', source: data.source },
                });
            }
        }

        return results;
    }
}
