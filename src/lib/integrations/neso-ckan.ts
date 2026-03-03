import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class NesoCkanPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'neso-ckan',
            name: 'NESO Data Portal (CKAN)',
            description: 'National Energy System Operator data portal built on CKAN, providing energy datasets for GB including generation, demand, and forecasts.',
            docsUrl: 'https://data.neso.energy/',
            authType: 'none',
            rateLimitNotes: 'No published rate limits. Standard CKAN API.',
            licence: 'Various — check per dataset',
            tier: 'B',
            sampleRequest: 'GET https://api.neso.energy/api/3/action/package_search?q=energy&rows=10',
            fieldMapping: 'result.results[].name → dataset slug, result.results[].title → name, result.results[].resources → download links',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Search for energy-related datasets
        const url = 'https://api.neso.energy/api/3/action/package_search?q=energy+generation&rows=10';
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
            throw new Error(`NESO CKAN API returned ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        const payload = JSON.stringify(data, null, 2);

        return {
            data,
            httpStatus: res.status,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as { result?: { count?: number; results?: Array<{ name?: string; title?: string; notes?: string; license_title?: string; num_resources?: number; resources?: Array<{ format?: string; name?: string }> }> } };

        if (!data?.result?.results) return results;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Dataset discovery count
        results.push({
            metricKey: 'neso_datasets_found',
            sourceSlug: 'neso-ckan',
            geoType: 'national',
            geoCode: 'GB',
            periodStart: startOfDay,
            periodEnd: endOfDay,
            value: data.result.count ?? data.result.results.length,
            unit: 'datasets',
            metadata: {
                searchQuery: 'energy generation',
                attribution: 'National Energy System Operator',
            },
        });

        for (const dataset of data.result.results) {
            const formats = dataset.resources?.map(r => r.format).filter(Boolean) ?? [];
            results.push({
                metricKey: `neso_dataset_${(dataset.name ?? 'unknown').substring(0, 50)}`,
                sourceSlug: 'neso-ckan',
                geoType: 'national',
                geoCode: 'GB',
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: dataset.num_resources ?? 0,
                unit: 'resources',
                metadata: {
                    datasetName: dataset.name,
                    title: dataset.title,
                    description: dataset.notes?.substring(0, 200),
                    licence: dataset.license_title,
                    formats: [...new Set(formats)],
                    attribution: 'National Energy System Operator',
                },
            });
        }

        return results;
    }
}
