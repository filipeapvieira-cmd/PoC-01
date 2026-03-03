import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class StatisticsGovScotPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'statistics-gov-scot',
            name: 'statistics.gov.scot (via data.gov.uk)',
            description: 'Scottish Government statistics datasets discovered via data.gov.uk CKAN API. The native SPARQL endpoint has TLS issues with Node.js, so we use CKAN dataset discovery instead.',
            docsUrl: 'https://statistics.gov.scot/home',
            authType: 'none',
            rateLimitNotes: 'No published rate limits on CKAN API.',
            licence: 'Open Government Licence v3.0',
            tier: 'A',
            sampleRequest: 'GET https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=scottish+statistics+population&rows=10',
            fieldMapping: 'result.results[].title → dataset name, result.count → total datasets',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Use data.gov.uk CKAN to discover Scottish Government statistics datasets
        const url = 'https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=scottish+government+statistics+population+council&rows=15';
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`data.gov.uk CKAN API returned ${res.status}: ${body.substring(0, 200)}`);
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
                metricKey: 'scot_stats_datasets_count',
                sourceSlug: 'statistics-gov-scot',
                geoType: 'national',
                geoCode: 'scotland',
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: data.result.count,
                unit: 'datasets',
                metadata: {
                    query: 'scottish government statistics population council',
                    attribution: 'Scottish Government via data.gov.uk',
                    licence: 'Open Government Licence v3.0',
                },
            });
        }

        // Individual dataset records
        const datasets = data.result.results ?? [];
        for (const ds of datasets) {
            results.push({
                metricKey: 'scot_stats_dataset',
                sourceSlug: 'statistics-gov-scot',
                geoType: 'national',
                geoCode: 'scotland',
                periodStart: ds.metadata_created ? new Date(ds.metadata_created) : startOfDay,
                periodEnd: endOfDay,
                value: ds.num_resources ?? 0,
                unit: 'resources',
                metadata: {
                    title: ds.title ?? 'Unknown',
                    description: (ds.notes ?? '').substring(0, 200),
                    organization: ds.organization?.title ?? 'Scottish Government',
                    attribution: 'Scottish Government via data.gov.uk',
                    licence: 'Open Government Licence v3.0',
                },
            });
        }

        return results;
    }
}
