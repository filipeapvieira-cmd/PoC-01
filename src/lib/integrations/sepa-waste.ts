import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

// Direct SEPA household waste statistics — actual recycling rates and waste per capita
export class SepaWastePlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'sepa-waste',
            name: 'SEPA Waste Statistics',
            description: 'SEPA household waste data via data.gov.uk CKAN API — discovers datasets with waste/recycling statistics by Scottish council area.',
            docsUrl: 'https://www.sepa.org.uk/environment/waste/waste-data/',
            authType: 'none',
            rateLimitNotes: 'No rate limits.',
            licence: 'Open Government Licence v3.0',
            tier: 'A',
            sampleRequest: 'GET https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=SEPA+household+waste+scotland',
            fieldMapping: 'result.results[].resources → CSV files with council-level waste data',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Step 1: Search CKAN for SEPA waste datasets
        const ckanUrl = 'https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=SEPA+household+waste+recycling+scotland&rows=5';
        const ckanRes = await fetch(ckanUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });

        if (!ckanRes.ok) {
            throw new Error(`CKAN API returned ${ckanRes.status}`);
        }

        const ckanData = await ckanRes.json() as {
            result?: {
                count?: number;
                results?: Array<{
                    title?: string;
                    notes?: string;
                    resources?: Array<{ url?: string; format?: string; name?: string }>;
                }>;
            };
        };

        // Step 2: Try to fetch actual CSV data from first CSV resource found
        let wasteData: Record<string, unknown>[] = [];
        let csvUrl = '';
        const datasets = ckanData?.result?.results ?? [];

        for (const ds of datasets) {
            const csvResource = (ds.resources ?? []).find(r =>
                r.format?.toUpperCase() === 'CSV' && r.url
            );
            if (csvResource?.url) {
                csvUrl = csvResource.url;
                try {
                    const csvRes = await fetch(csvUrl, {
                        signal: AbortSignal.timeout(15000),
                    });
                    if (csvRes.ok) {
                        const csvText = await csvRes.text();
                        wasteData = parseSimpleCSV(csvText);
                    }
                } catch {
                    // CSV fetch failed, continue with catalog data
                }
                break;
            }
        }

        const latencyMs = Date.now() - start;

        const data = {
            catalogResults: ckanData,
            csvUrl,
            parsedRows: wasteData.slice(0, 50),
            totalParsedRows: wasteData.length,
        };

        const payload = JSON.stringify({
            datasetsFound: ckanData?.result?.count,
            csvUrl,
            sampleRows: wasteData.slice(0, 5),
            totalRows: wasteData.length,
        }, null, 2);

        return {
            data,
            httpStatus: ckanRes.status,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as {
            catalogResults?: { result?: { count?: number; results?: Array<{ title?: string }> } };
            parsedRows?: Record<string, string>[];
            totalParsedRows?: number;
            csvUrl?: string;
        };

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Dataset discovery metric
        const count = data?.catalogResults?.result?.count ?? 0;
        results.push({
            metricKey: 'sepa_waste_datasets_found',
            sourceSlug: 'sepa-waste',
            geoType: 'national',
            geoCode: 'scotland',
            periodStart: startOfDay,
            periodEnd: endOfDay,
            value: count,
            unit: 'datasets',
            metadata: {
                csvUrl: data?.csvUrl ?? 'none',
                totalParsedRows: data?.totalParsedRows ?? 0,
                attribution: 'SEPA via data.gov.uk',
                licence: 'Open Government Licence v3.0',
            },
        });

        // If we got actual CSV data, try to normalize it
        const rows = data?.parsedRows ?? [];
        if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            // Look for council/area and value columns
            const areaCol = headers.find(h => /council|area|authority|la_name/i.test(h));
            const wasteCol = headers.find(h => /waste|tonnes|total/i.test(h));
            const recycleCol = headers.find(h => /recycl|recycle|rate/i.test(h));

            for (const row of rows) {
                const area = areaCol ? row[areaCol] : null;
                if (!area) continue;

                if (wasteCol) {
                    const val = parseFloat(row[wasteCol]);
                    if (!isNaN(val)) {
                        results.push({
                            metricKey: 'household_waste_tonnes',
                            sourceSlug: 'sepa-waste',
                            geoType: 'council',
                            geoCode: area,
                            periodStart: startOfDay,
                            periodEnd: endOfDay,
                            value: val,
                            unit: 'tonnes',
                            metadata: { area, attribution: 'SEPA', licence: 'OGL v3.0' },
                        });
                    }
                }

                if (recycleCol) {
                    const val = parseFloat(row[recycleCol]);
                    if (!isNaN(val)) {
                        results.push({
                            metricKey: 'recycling_rate',
                            sourceSlug: 'sepa-waste',
                            geoType: 'council',
                            geoCode: area,
                            periodStart: startOfDay,
                            periodEnd: endOfDay,
                            value: val,
                            unit: 'percent',
                            metadata: { area, attribution: 'SEPA', licence: 'OGL v3.0' },
                        });
                    }
                }
            }
        }

        return results;
    }
}

function parseSimpleCSV(text: string): Record<string, string>[] {
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
