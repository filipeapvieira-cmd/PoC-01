import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

// DESNZ Local Authority Greenhouse Gas Emissions — replaces broken NatureScot
// Discovery via data.gov.uk CKAN, with attempt to download actual emissions data
export class NatureScotPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'naturescot',
            name: 'Local Authority CO₂ Emissions',
            description: 'DESNZ local authority greenhouse gas emissions data for Scottish councils. Discovers and downloads actual emissions data (ktCO₂) by sector.',
            docsUrl: 'https://www.gov.uk/government/collections/uk-local-authority-and-regional-greenhouse-gas-emissions-national-statistics',
            authType: 'none',
            rateLimitNotes: 'Static file downloads — no rate limits.',
            licence: 'Open Government Licence v3.0',
            tier: 'A',
            sampleRequest: 'GET https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=local+authority+greenhouse+gas+emissions&rows=5',
            fieldMapping: 'CSV/Excel data → local authority → annual CO₂ emissions by sector',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Search for DESNZ emissions data via CKAN
        const ckanUrl = 'https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=local+authority+greenhouse+gas+emissions+uk&rows=5';
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
                    organization?: { title?: string };
                    resources?: Array<{ url?: string; format?: string; name?: string; description?: string }>;
                }>;
            };
        };

        // Try to find and download a CSV resource with emissions data
        let emissionsData: Record<string, string>[] = [];
        let csvUrl = '';
        const datasets = ckanData?.result?.results ?? [];

        for (const ds of datasets) {
            const csvResource = (ds.resources ?? []).find(r =>
                (r.format?.toUpperCase() === 'CSV') && r.url
            );
            if (csvResource?.url) {
                csvUrl = csvResource.url;
                try {
                    const csvRes = await fetch(csvUrl, {
                        signal: AbortSignal.timeout(20000),
                    });
                    if (csvRes.ok) {
                        const csvText = await csvRes.text();
                        const parsed = parseSimpleCSV(csvText);
                        // Filter for Scottish local authorities (start with S)
                        emissionsData = parsed.filter(row => {
                            const values = Object.values(row).join(' ');
                            return values.includes('S120') || values.includes('Scotland') ||
                                /edinburgh|glasgow|aberdeen|dundee|highland|fife/i.test(values);
                        }).slice(0, 100);
                    }
                } catch {
                    // CSV fetch failed
                }
                if (emissionsData.length > 0) break;
            }
        }

        const latencyMs = Date.now() - start;

        const combined = {
            catalogResults: ckanData,
            csvUrl,
            scottishRows: emissionsData.slice(0, 50),
            totalScottishRows: emissionsData.length,
        };

        const payload = JSON.stringify({
            datasetsFound: ckanData?.result?.count,
            datasetTitles: datasets.map(d => d.title),
            csvUrl,
            sampleScottishRows: emissionsData.slice(0, 3),
            totalScottishRows: emissionsData.length,
        }, null, 2);

        return {
            data: combined,
            httpStatus: ckanRes.status,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as {
            catalogResults?: { result?: { count?: number; results?: Array<{ title?: string }> } };
            scottishRows?: Record<string, string>[];
            totalScottishRows?: number;
            csvUrl?: string;
        };

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Discovery metric
        results.push({
            metricKey: 'emissions_datasets_found',
            sourceSlug: 'naturescot',
            geoType: 'national',
            geoCode: 'UK',
            periodStart: startOfDay,
            periodEnd: endOfDay,
            value: data?.catalogResults?.result?.count ?? 0,
            unit: 'datasets',
            metadata: {
                csvUrl: data?.csvUrl ?? 'none',
                scottishRowsFound: data?.totalScottishRows ?? 0,
                attribution: 'DESNZ via data.gov.uk',
                licence: 'Open Government Licence v3.0',
            },
        });

        // If we parsed actual emissions data
        const rows = data?.scottishRows ?? [];
        if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            const areaCol = headers.find(h => /authority|area|council|la_name|local/i.test(h));
            const emCol = headers.find(h => /emission|co2|ghg|total|kt/i.test(h));
            const yearCol = headers.find(h => /year|period|date/i.test(h));

            for (const row of rows) {
                const area = areaCol ? row[areaCol] : null;
                if (!area) continue;

                const emission = emCol ? parseFloat(row[emCol]) : NaN;
                const year = yearCol ? parseInt(row[yearCol]) : now.getFullYear();

                if (!isNaN(emission)) {
                    results.push({
                        metricKey: 'local_authority_co2_emissions',
                        sourceSlug: 'naturescot',
                        geoType: 'council',
                        geoCode: area,
                        periodStart: new Date(year, 0, 1),
                        periodEnd: new Date(year, 11, 31),
                        value: emission,
                        unit: 'ktCO2',
                        metadata: {
                            area,
                            year,
                            attribution: 'DESNZ',
                            licence: 'Open Government Licence v3.0',
                        },
                    });
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

    for (let i = 1; i < Math.min(lines.length, 5000); i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
        rows.push(row);
    }

    return rows;
}
