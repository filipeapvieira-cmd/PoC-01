import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class NatureScotPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'naturescot',
            name: 'NatureScot Protected Areas',
            description: 'NatureScot open data on protected areas via data.gov.uk CKAN API. Lists SSSI, NNR, SPA, SAC datasets.',
            docsUrl: 'https://www.data.gov.uk/search?q=naturescot+protected+areas',
            authType: 'none',
            rateLimitNotes: 'CKAN API: no published rate limits.',
            licence: 'Open Government Licence v3.0',
            tier: 'A',
            sampleRequest: 'GET https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=naturescot+SSSI&rows=10',
            fieldMapping: 'results[].title → dataset name, results[].notes → description, count → total datasets',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Use data.gov.uk CKAN API to search for NatureScot protected area datasets
        const url = 'https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=naturescot+protected+areas+scotland&rows=20';
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
            throw new Error(`data.gov.uk CKAN API returned ${res.status}: ${res.statusText}`);
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
        const data = raw as { result?: { count?: number; results?: Array<{ title?: string; notes?: string; organization?: { title?: string }; metadata_created?: string; num_resources?: number }> } };

        if (!data?.result) return results;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Total count of datasets found
        if (data.result.count != null) {
            results.push({
                metricKey: 'protected_areas_datasets_count',
                sourceSlug: 'naturescot',
                geoType: 'national',
                geoCode: 'scotland',
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: data.result.count,
                unit: 'datasets',
                metadata: {
                    query: 'naturescot protected areas scotland',
                    attribution: 'NatureScot via data.gov.uk',
                    licence: 'Open Government Licence v3.0',
                },
            });
        }

        // Individual dataset records
        const datasets = data.result.results ?? [];
        for (const ds of datasets.slice(0, 20)) {
            results.push({
                metricKey: 'protected_area_dataset',
                sourceSlug: 'naturescot',
                geoType: 'national',
                geoCode: 'scotland',
                periodStart: ds.metadata_created ? new Date(ds.metadata_created) : startOfDay,
                periodEnd: endOfDay,
                value: ds.num_resources ?? 0,
                unit: 'resources',
                metadata: {
                    title: ds.title ?? 'Unknown',
                    description: (ds.notes ?? '').substring(0, 200),
                    organization: ds.organization?.title ?? 'NatureScot',
                    attribution: 'NatureScot via data.gov.uk',
                    licence: 'Open Government Licence v3.0',
                },
            });
        }

        return results;
    }
}
