import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

// NESO: Fetch actual demand/generation data from specific dataset APIs
export class NesoCkanPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'neso-ckan',
            name: 'NESO Energy Data',
            description: 'National Energy System Operator data portal — fetches actual energy demand and generation datasets, not just catalog listings.',
            docsUrl: 'https://data.neso.energy/',
            authType: 'none',
            rateLimitNotes: 'No published rate limits.',
            licence: 'Various — check per dataset',
            tier: 'B',
            sampleRequest: 'GET https://api.neso.energy/api/3/action/datastore_search?resource_id=<id>&limit=20',
            fieldMapping: 'result.records → actual data rows with energy metrics',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Step 1: Search for energy generation/demand datasets
        const searchUrl = 'https://api.neso.energy/api/3/action/package_search?q=demand+generation+electricity&rows=5';
        const searchRes = await fetch(searchUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        const latencyMs = Date.now() - start;

        if (!searchRes.ok) {
            throw new Error(`NESO API returned ${searchRes.status}: ${searchRes.statusText}`);
        }

        const searchData = await searchRes.json() as {
            result?: {
                count?: number;
                results?: Array<{
                    name?: string;
                    title?: string;
                    notes?: string;
                    resources?: Array<{ id?: string; url?: string; format?: string; name?: string; datastore_active?: boolean }>;
                }>;
            };
        };

        // Step 2: Try to fetch actual data from first datastore-active resource
        let datastoreData: unknown = null;
        let datastoreResourceId = '';
        let datastoreDatasetTitle = '';

        const datasets = searchData?.result?.results ?? [];
        for (const ds of datasets) {
            const dsResource = (ds.resources ?? []).find(r => r.datastore_active && r.id);
            if (dsResource?.id) {
                datastoreResourceId = dsResource.id;
                datastoreDatasetTitle = ds.title ?? ds.name ?? '';
                try {
                    const dsUrl = `https://api.neso.energy/api/3/action/datastore_search?resource_id=${dsResource.id}&limit=20`;
                    const dsRes = await fetch(dsUrl, {
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(15000),
                    });
                    if (dsRes.ok) {
                        datastoreData = await dsRes.json();
                    }
                } catch {
                    // Datastore fetch failed
                }
                break;
            }
        }

        const combined = {
            searchResults: searchData,
            datastoreResourceId,
            datastoreDatasetTitle,
            datastoreData,
        };

        const payload = JSON.stringify(combined, null, 2);

        return {
            data: combined,
            httpStatus: searchRes.status,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as {
            searchResults?: { result?: { count?: number; results?: Array<{ name?: string; title?: string }> } };
            datastoreResourceId?: string;
            datastoreDatasetTitle?: string;
            datastoreData?: { result?: { records?: Array<Record<string, unknown>>; total?: number; fields?: Array<{ id: string; type: string }> } };
        };

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Dataset discovery count
        const searchCount = data?.searchResults?.result?.count ?? 0;
        results.push({
            metricKey: 'neso_energy_datasets',
            sourceSlug: 'neso-ckan',
            geoType: 'national',
            geoCode: 'GB',
            periodStart: startOfDay,
            periodEnd: endOfDay,
            value: searchCount,
            unit: 'datasets',
            metadata: {
                searchQuery: 'demand generation electricity',
                datastoreResourceId: data?.datastoreResourceId,
                datastoreDatasetTitle: data?.datastoreDatasetTitle,
                attribution: 'National Energy System Operator',
            },
        });

        // If we got actual datastore records, normalize them
        const records = data?.datastoreData?.result?.records ?? [];
        const fields = data?.datastoreData?.result?.fields ?? [];

        if (records.length > 0) {
            // Try to identify numeric value columns and date columns
            const numericFields = fields.filter(f => f.type === 'numeric' || f.type === 'float8' || f.type === 'int4');
            const dateFields = fields.filter(f => f.type === 'timestamp' || f.type === 'date' || f.id.toLowerCase().includes('date') || f.id.toLowerCase().includes('time'));

            const dateField = dateFields[0]?.id;

            // Emit total records metric
            results.push({
                metricKey: 'neso_datastore_records',
                sourceSlug: 'neso-ckan',
                geoType: 'national',
                geoCode: 'GB',
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: data?.datastoreData?.result?.total ?? records.length,
                unit: 'records',
                metadata: {
                    datasetTitle: data?.datastoreDatasetTitle,
                    resourceId: data?.datastoreResourceId,
                    sampleFields: fields.map(f => `${f.id}(${f.type})`).slice(0, 10),
                    attribution: 'National Energy System Operator',
                },
            });

            // Try to emit actual energy values from numeric columns
            for (const record of records.slice(0, 10)) {
                for (const nf of numericFields.slice(0, 3)) {
                    const val = Number(record[nf.id]);
                    if (isNaN(val)) continue;

                    const timestamp = dateField && record[dateField]
                        ? new Date(String(record[dateField]))
                        : startOfDay;
                    const validTimestamp = isNaN(timestamp.getTime()) ? startOfDay : timestamp;

                    results.push({
                        metricKey: `neso_${nf.id.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                        sourceSlug: 'neso-ckan',
                        geoType: 'national',
                        geoCode: 'GB',
                        periodStart: validTimestamp,
                        periodEnd: validTimestamp,
                        value: val,
                        unit: nf.id,
                        metadata: {
                            field: nf.id,
                            fieldType: nf.type,
                            datasetTitle: data?.datastoreDatasetTitle,
                            attribution: 'National Energy System Operator',
                        },
                    });
                }
            }
        }

        return results;
    }
}
