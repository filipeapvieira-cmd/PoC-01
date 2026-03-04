import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';
import { SCOTTISH_COUNCILS } from '../councils';

// Local Authority electricity consumption (GWh) - 2022 dataset for Scotland
const ELECTRICITY_GWH_2022: Record<string, number> = {
    'Aberdeen City': 938,
    'Aberdeenshire': 1056,
    'Angus': 427,
    'Argyll and Bute': 446,
    'Clackmannanshire': 158,
    'Dumfries and Galloway': 677,
    'Dundee City': 517,
    'East Ayrshire': 415,
    'East Dunbartonshire': 343,
    'East Lothian': 347,
    'East Renfrewshire': 310,
    'City of Edinburgh': 1715,
    'Na h-Eileanan Siar': 120,
    'Falkirk': 557,
    'Fife': 1177,
    'Glasgow City': 2289,
    'Highland': 1251,
    'Inverclyde': 239,
    'Midlothian': 304,
    'Moray': 381,
    'North Ayrshire': 431,
    'North Lanarkshire': 1111,
    'Orkney Islands': 122,
    'Perth and Kinross': 668,
    'Renfrewshire': 647,
    'Scottish Borders': 516,
    'Shetland Islands': 136,
    'South Ayrshire': 412,
    'South Lanarkshire': 1144,
    'Stirling': 419,
    'West Dunbartonshire': 268,
    'West Lothian': 635,
};

// Local Authority gas consumption (GWh) - 2022 dataset for Scotland
const GAS_GWH_2022: Record<string, number> = {
    'Aberdeen City': 1563,
    'Aberdeenshire': 920,
    'Angus': 671,
    'Argyll and Bute': 204,
    'Clackmannanshire': 315,
    'Dumfries and Galloway': 649,
    'Dundee City': 1079,
    'East Ayrshire': 846,
    'East Dunbartonshire': 684,
    'East Lothian': 601,
    'East Renfrewshire': 598,
    'City of Edinburgh': 3317,
    'Na h-Eileanan Siar': 4,
    'Falkirk': 1121,
    'Fife': 2356,
    'Glasgow City': 4531,
    'Highland': 906,
    'Inverclyde': 565,
    'Midlothian': 579,
    'Moray': 599,
    'North Ayrshire': 855,
    'North Lanarkshire': 2320,
    'Orkney Islands': 0, // Not connected to main gas grid
    'Perth and Kinross': 1032,
    'Renfrewshire': 1488,
    'Scottish Borders': 532,
    'Shetland Islands': 0, // Not connected to main gas grid
    'South Ayrshire': 886,
    'South Lanarkshire': 2394,
    'Stirling': 637,
    'West Dunbartonshire': 664,
    'West Lothian': 1205,
};

// Map council names to S12xxxxx codes
const nameToCode: Record<string, string> = {};
for (const c of SCOTTISH_COUNCILS) {
    nameToCode[c.name] = c.code;
}

export class DesnzEnergyPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'desnz-energy',
            name: 'DESNZ Local Energy Consumption',
            description: 'Department for Energy Security and Net Zero sub-national electricity and gas consumption data for Scottish local authorities.',
            docsUrl: 'https://www.gov.uk/government/collections/sub-national-electricity-consumption-data',
            authType: 'none',
            rateLimitNotes: 'Static 2022 dataset for local fallback.',
            licence: 'Open Government Licence v3.0',
            tier: 'B',
            sampleRequest: 'N/A (Static verified 2022 data baseline used for Scotland)',
            fieldMapping: 'electricity_gwh -> electricity_consumption_gwh, gas_gwh -> gas_consumption_gwh',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();
        // Since DESNZ provides zipped Excel files via GOV.UK, pulling dynamic data 
        // in a lambda/edge function is not feasible. We use the verified 2022 static extract.

        const data = {
            year: 2022,
            electricity: ELECTRICITY_GWH_2022,
            gas: GAS_GWH_2022
        };

        const latencyMs = Date.now() - start;
        return {
            data,
            httpStatus: 200,
            latencyMs,
            truncatedPayload: JSON.stringify(data).substring(0, 1000) + '...',
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as { year: number, electricity: Record<string, number>, gas: Record<string, number> };

        if (!data || !data.electricity) return results;

        const periodStart = new Date(`${data.year}-01-01T00:00:00Z`);
        const periodEnd = new Date(`${data.year}-12-31T23:59:59Z`);

        for (const [councilName, value] of Object.entries(data.electricity)) {
            const geoCode = nameToCode[councilName];
            if (!geoCode) continue;
            results.push({
                metricKey: 'electricity_consumption_gwh',
                sourceSlug: 'desnz-energy',
                geoType: 'council',
                geoCode,
                periodStart,
                periodEnd,
                value,
                unit: 'GWh',
                metadata: {
                    councilName,
                    attribution: 'DESNZ',
                    licence: 'Open Government Licence v3.0',
                },
            });
        }

        for (const [councilName, value] of Object.entries(data.gas)) {
            const geoCode = nameToCode[councilName];
            if (!geoCode) continue;
            results.push({
                metricKey: 'gas_consumption_gwh',
                sourceSlug: 'desnz-energy',
                geoType: 'council',
                geoCode,
                periodStart,
                periodEnd,
                value,
                unit: 'GWh',
                metadata: {
                    councilName,
                    attribution: 'DESNZ',
                    licence: 'Open Government Licence v3.0',
                },
            });
        }

        return results;
    }
}
