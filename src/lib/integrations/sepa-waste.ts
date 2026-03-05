import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';
import { SCOTTISH_COUNCILS } from '../councils';

// Official 2021-22 SEPA Household Waste Recycling Rates by Scottish Council
// Source: SEPA Household Waste Summary Report 2021/22 (Open Government Licence v3.0)
// https://www.sepa.org.uk/environment/waste/waste-data/waste-data-reporting/household-waste-data/
const SEPA_WASTE_2122: Record<string, { generated: number; recycled: number; landfilled: number }> = {
    'Aberdeen City': { generated: 92451, recycled: 37402, landfilled: 3105 },
    'Aberdeenshire': { generated: 119859, recycled: 54911, landfilled: 51227 },
    'Angus': { generated: 49451, recycled: 21370, landfilled: 26034 },
    'Argyll and Bute': { generated: 41255, recycled: 16487, landfilled: 14755 },
    'Clackmannanshire': { generated: 20110, recycled: 8466, landfilled: 11210 },
    'Dumfries and Galloway': { generated: 65113, recycled: 29606, landfilled: 33742 },
    'Dundee City': { generated: 58572, recycled: 22129, landfilled: 1913 },
    'East Ayrshire': { generated: 61159, recycled: 28943, landfilled: 31102 },
    'East Dunbartonshire': { generated: 40960, recycled: 24651, landfilled: 15451 },
    'East Lothian': { generated: 50493, recycled: 27958, landfilled: 16295 },
    'East Renfrewshire': { generated: 37722, recycled: 21542, landfilled: 11090 },
    'City of Edinburgh': { generated: 211115, recycled: 94799, landfilled: 15488 },
    'Na h-Eileanan Siar': { generated: 11186, recycled: 3658, landfilled: 6867 },
    'Falkirk': { generated: 76543, recycled: 31580, landfilled: 42104 },
    'Fife': { generated: 172659, recycled: 78378, landfilled: 56910 },
    'Glasgow City': { generated: 236166, recycled: 85558, landfilled: 17652 },
    'Highland': { generated: 115061, recycled: 45963, landfilled: 66904 },
    'Inverclyde': { generated: 32662, recycled: 11397, landfilled: 20496 },
    'Midlothian': { generated: 37887, recycled: 19839, landfilled: 7711 },
    'Moray': { generated: 42084, recycled: 20484, landfilled: 21326 },
    'North Ayrshire': { generated: 65992, recycled: 26823, landfilled: 34188 },
    'North Lanarkshire': { generated: 161048, recycled: 71190, landfilled: 88204 },
    'Orkney Islands': { generated: 10476, recycled: 5604, landfilled: 3041 },
    'Perth and Kinross': { generated: 71362, recycled: 37107, landfilled: 33261 },
    'Renfrewshire': { generated: 83525, recycled: 33280, landfilled: 41808 },
    'Scottish Borders': { generated: 49452, recycled: 23450, landfilled: 22755 },
    'Shetland Islands': { generated: 10143, recycled: 3833, landfilled: 1618 }, // ERF incinerator
    'South Ayrshire': { generated: 57685, recycled: 26155, landfilled: 30883 },
    'South Lanarkshire': { generated: 151520, recycled: 68571, landfilled: 81198 },
    'Stirling': { generated: 39185, recycled: 19747, landfilled: 18721 },
    'West Dunbartonshire': { generated: 43282, recycled: 15598, landfilled: 27129 },
    'West Lothian': { generated: 82510, recycled: 37941, landfilled: 42358 },
};

// Build reverse lookup: council name → code
const nameToCode: Record<string, string> = {};
for (const c of SCOTTISH_COUNCILS) {
    nameToCode[c.name] = c.code;
}

export class SepaWastePlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'sepa-waste',
            name: 'SEPA Waste Statistics',
            description: 'SEPA household waste recycling and landfill volumes (2021-22). Live SPARQL for recycling %, static fallback for full lifecycle volumes.',
            docsUrl: 'https://www.sepa.org.uk/environment/waste/waste-data/waste-data-reporting/household-waste-data/',
            authType: 'none',
            rateLimitNotes: 'SPARQL endpoint may be slow.',
            licence: 'Open Government Licence v3.0',
            tier: 'A',
            sampleRequest: 'POST https://statistics.gov.scot/sparql.csv',
            fieldMapping: 'percent → recycling_rate_pct, waste_generated_tonnes, waste_recycled_tonnes, waste_landfilled_tonnes',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Try SPARQL endpoint on statistics.gov.scot for live data
        const sparqlQuery = `
PREFIX qb: <http://purl.org/linked-data/cube#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?areaCode ?areaLabel ?periodLabel ?value WHERE {
  ?obs a qb:Observation ;
       <http://statistics.gov.scot/def/dimension/refArea> ?area ;
       <http://statistics.gov.scot/def/dimension/refPeriod> ?period ;
       <http://statistics.gov.scot/def/measure-properties/percent> ?value .
  ?area rdfs:label ?areaLabel ;
        <http://www.w3.org/2004/02/skos/core#notation> ?areaCode .
  ?period rdfs:label ?periodLabel .
  FILTER(LANG(?areaLabel) = "en")
  FILTER(STRSTARTS(STR(?obs), "http://statistics.gov.scot/data/household-waste"))
}
ORDER BY DESC(?periodLabel) ?areaLabel
LIMIT 1500
`.trim();

        let sparqlRows: Array<{ areaCode: string; areaLabel: string; periodLabel: string; value: number }> = [];
        let sparqlOk = false;

        try {
            const res = await fetch('https://statistics.gov.scot/sparql.csv', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'text/csv',
                },
                body: `query=${encodeURIComponent(sparqlQuery)}`,
                signal: AbortSignal.timeout(20000),
            });

            if (res.ok) {
                const csv = await res.text();
                const rows = parseCSV(csv);
                if (rows.length > 0) {
                    sparqlRows = rows
                        .map(r => ({
                            areaCode: r['areaCode'] ?? '',
                            areaLabel: r['areaLabel'] ?? '',
                            periodLabel: r['periodLabel'] ?? '',
                            value: parseFloat(r['value'] ?? ''),
                        }))
                        .filter(r => !isNaN(r.value) && r.areaCode);
                    sparqlOk = sparqlRows.length > 0;
                }
            }
        } catch {
            // SPARQL failed — use fallback below
        }

        const latencyMs = Date.now() - start;

        // Build the result payload
        const payload = sparqlOk
            ? { source: 'sparql', rows: sparqlRows.slice(0, 5), total: sparqlRows.length, volumeInfo: 'Included from fallback' }
            : { source: 'fallback', note: 'SPARQL unavailable; using SEPA 2021-22 published data', councils: Object.keys(SEPA_WASTE_2122).length };

        return {
            data: sparqlOk ? { source: 'sparql', rows: sparqlRows, volumes: SEPA_WASTE_2122 } : { source: 'fallback', rates: SEPA_WASTE_2122, volumes: SEPA_WASTE_2122 },
            httpStatus: sparqlOk ? 200 : 200,
            latencyMs,
            truncatedPayload: JSON.stringify(payload, null, 2),
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as {
            source?: string;
            rows?: Array<{ areaCode: string; areaLabel: string; periodLabel: string; value: number }>;
            rates?: Record<string, { generated: number; recycled: number; landfilled: number }>;
            volumes?: Record<string, { generated: number; recycled: number; landfilled: number }>;
        };

        const now = new Date();
        // Reference period: SEPA 2021-22 data covers the financial year ending March 2022
        const periodStart = new Date('2021-04-01T00:00:00Z');
        const periodEnd = new Date('2022-03-31T23:59:59Z');

        // 1. Parse Live SPARQL Percentages if they exist
        if (data?.source === 'sparql' && data.rows && data.rows.length > 0) {
            // Use live SPARQL data — we now accept ALL years for historical trend tracking
            for (const row of data.rows) {
                const code = row.areaCode.split('/').pop() ?? row.areaCode;
                // Parse periodLabel (e.g., "2022") into accurate periodStart boundaries
                const yearMatch = row.periodLabel.match(/\d{4}/);
                const year = yearMatch ? parseInt(yearMatch[0]) : 2021;
                const dynamicPeriodStart = new Date(`${year}-04-01T00:00:00Z`);
                const dynamicPeriodEnd = new Date(`${year + 1}-03-31T23:59:59Z`);

                results.push({
                    metricKey: 'recycling_rate_pct',
                    sourceSlug: 'sepa-waste',
                    geoType: 'council',
                    geoCode: code,
                    periodStart: dynamicPeriodStart,
                    periodEnd: dynamicPeriodEnd,
                    value: row.value,
                    unit: '%',
                    metadata: {
                        councilName: row.areaLabel,
                        period: row.periodLabel,
                        attribution: 'SEPA / statistics.gov.scot',
                        licence: 'Open Government Licence v3.0',
                    },
                });
            }
        } else {
            // Use fallback 2021-22 published data percentage rate
            const rates = data?.rates ?? SEPA_WASTE_2122;
            for (const [councilName, valueObj] of Object.entries(rates)) {
                const geoCode = nameToCode[councilName];
                if (!geoCode) continue;
                results.push({
                    metricKey: 'recycling_rate_pct',
                    sourceSlug: 'sepa-waste',
                    geoType: 'council',
                    geoCode,
                    periodStart,
                    periodEnd,
                    value: valueObj.recycled / valueObj.generated * 100,
                    unit: '%',
                    metadata: {
                        councilName,
                        period: '2021-22',
                        attribution: 'SEPA Household Waste Summary Report 2021/22',
                        licence: 'Open Government Licence v3.0',
                        note: 'Fallback from published report',
                    },
                });
            }
        }

        // 2. Map Tonnages regardless of source (Tonnage data isn't easily in SPARQL so we use the 2021/22 release)
        const volumes = data?.volumes ?? SEPA_WASTE_2122;
        for (const [councilName, valueObj] of Object.entries(volumes)) {
            const geoCode = nameToCode[councilName];
            if (!geoCode) continue;

            const baseMeta = {
                councilName,
                period: '2021-22',
                attribution: 'SEPA Household Waste Summary Report',
                licence: 'Open Government Licence v3.0',
            };

            results.push({
                metricKey: 'waste_generated_tonnes',
                sourceSlug: 'sepa-waste',
                geoType: 'council', geoCode, periodStart, periodEnd,
                value: valueObj.generated, unit: 'tonnes', metadata: baseMeta
            });

            results.push({
                metricKey: 'waste_recycled_tonnes',
                sourceSlug: 'sepa-waste',
                geoType: 'council', geoCode, periodStart, periodEnd,
                value: valueObj.recycled, unit: 'tonnes', metadata: baseMeta
            });

            results.push({
                metricKey: 'waste_landfilled_tonnes',
                sourceSlug: 'sepa-waste',
                geoType: 'council', geoCode, periodStart, periodEnd,
                value: valueObj.landfilled, unit: 'tonnes', metadata: baseMeta
            });
        }

        return results;
    }
}

function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
        rows.push(row);
    }
    return rows;
}
