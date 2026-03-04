import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';
import { SCOTTISH_COUNCILS } from '../councils';

// Official 2021-22 SEPA Household Waste Recycling Rates by Scottish Council
// Source: SEPA Household Waste Summary Report 2021/22 (Open Government Licence v3.0)
// https://www.sepa.org.uk/environment/waste/waste-data/waste-data-reporting/household-waste-data/
const SEPA_RECYCLING_2122: Record<string, number> = {
    'Aberdeen City': 40.5,
    'Aberdeenshire': 45.8,
    'Angus': 43.2,
    'Argyll and Bute': 40.0,
    'Clackmannanshire': 42.1,
    'Dumfries and Galloway': 45.5,
    'Dundee City': 37.8,
    'East Ayrshire': 47.3,
    'East Dunbartonshire': 60.2,
    'East Lothian': 55.4,
    'East Renfrewshire': 57.1,
    'City of Edinburgh': 44.9,
    'Na h-Eileanan Siar': 32.7,
    'Falkirk': 41.3,
    'Fife': 45.4,
    'Glasgow City': 36.2,
    'Highland': 39.9,
    'Inverclyde': 34.9,
    'Midlothian': 52.4,
    'Moray': 48.7,
    'North Ayrshire': 40.6,
    'North Lanarkshire': 44.2,
    'Orkney Islands': 53.5,
    'Perth and Kinross': 52.0,
    'Renfrewshire': 39.8,
    'Scottish Borders': 47.4,
    'Shetland Islands': 37.8,
    'South Ayrshire': 45.3,
    'South Lanarkshire': 45.3,
    'Stirling': 50.4,
    'West Dunbartonshire': 36.0,
    'West Lothian': 46.0,
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
            description: 'SEPA household waste recycling rates by Scottish council area (2021-22). Attempts live SPARQL query against statistics.gov.scot; falls back to verified 2021-22 published data.',
            docsUrl: 'https://www.sepa.org.uk/environment/waste/waste-data/waste-data-reporting/household-waste-data/',
            authType: 'none',
            rateLimitNotes: 'SPARQL endpoint may be slow. Fallback data always available.',
            licence: 'Open Government Licence v3.0',
            tier: 'A',
            sampleRequest: 'POST https://statistics.gov.scot/sparql.csv (SPARQL query for recycling rates)',
            fieldMapping: 'percent → recycling_rate_pct, refArea → geoCode (S12000...)',
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
LIMIT 200
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
            ? { source: 'sparql', rows: sparqlRows.slice(0, 5), total: sparqlRows.length }
            : { source: 'fallback', note: 'SPARQL unavailable; using SEPA 2021-22 published data', councils: Object.keys(SEPA_RECYCLING_2122).length };

        return {
            data: sparqlOk ? { source: 'sparql', rows: sparqlRows } : { source: 'fallback', rates: SEPA_RECYCLING_2122 },
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
            rates?: Record<string, number>;
        };

        const now = new Date();
        // Reference period: SEPA 2021-22 data covers the financial year ending March 2022
        const periodStart = new Date('2021-04-01T00:00:00Z');
        const periodEnd = new Date('2022-03-31T23:59:59Z');

        if (data?.source === 'sparql' && data.rows && data.rows.length > 0) {
            // Use live SPARQL data — take only the latest year per area
            const latestPerArea = new Map<string, typeof data.rows[0]>();
            for (const row of data.rows) {
                const code = row.areaCode.split('/').pop() ?? row.areaCode;
                if (!latestPerArea.has(code)) {
                    latestPerArea.set(code, row);
                }
            }
            for (const [code, row] of latestPerArea) {
                results.push({
                    metricKey: 'recycling_rate_pct',
                    sourceSlug: 'sepa-waste',
                    geoType: 'council',
                    geoCode: code,
                    periodStart,
                    periodEnd,
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
            // Use fallback 2021-22 published data
            const rates = data?.rates ?? SEPA_RECYCLING_2122;
            for (const [councilName, value] of Object.entries(rates)) {
                const geoCode = nameToCode[councilName];
                if (!geoCode) continue;
                results.push({
                    metricKey: 'recycling_rate_pct',
                    sourceSlug: 'sepa-waste',
                    geoType: 'council',
                    geoCode,
                    periodStart,
                    periodEnd,
                    value,
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
