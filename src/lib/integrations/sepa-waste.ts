import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class SepaWastePlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'sepa-waste',
            name: 'SEPA Waste Data',
            description: 'SEPA household waste data for Scottish council areas. Uses data.gov.uk CKAN API to discover latest waste/recycling datasets.',
            docsUrl: 'https://www.sepa.org.uk/environment/waste/',
            authType: 'none',
            rateLimitNotes: 'No rate limits on CKAN discovery endpoint.',
            licence: 'Open Government Licence v3.0',
            tier: 'A',
            sampleRequest: 'GET https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=SEPA+household+waste+scotland',
            fieldMapping: 'results[].title → dataset name, results[].resources → downloadable files',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Use data.gov.uk CKAN to discover SEPA waste datasets
        const url = 'https://ckan.publishing.service.gov.uk/api/3/action/package_search?q=SEPA+household+waste+recycling+scotland&rows=10';
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
        const data = raw as { result?: { count?: number; results?: Array<{ title?: string; notes?: string; organization?: { title?: string }; metadata_created?: string; num_resources?: number; resources?: Array<{ format?: string; url?: string; name?: string }> }> } };

        if (!data?.result) return results;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Total count
        if (data.result.count != null) {
            results.push({
                metricKey: 'sepa_waste_datasets_count',
                sourceSlug: 'sepa-waste',
                geoType: 'national',
                geoCode: 'scotland',
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: data.result.count,
                unit: 'datasets',
                metadata: {
                    query: 'SEPA household waste recycling scotland',
                    attribution: 'SEPA via data.gov.uk',
                    licence: 'Open Government Licence v3.0',
                },
            });
        }

        // Individual datasets
        const datasets = data.result.results ?? [];
        for (const ds of datasets) {
            const csvResources = (ds.resources ?? []).filter(r => r.format?.toUpperCase() === 'CSV');
            results.push({
                metricKey: 'sepa_waste_dataset',
                sourceSlug: 'sepa-waste',
                geoType: 'national',
                geoCode: 'scotland',
                periodStart: ds.metadata_created ? new Date(ds.metadata_created) : startOfDay,
                periodEnd: endOfDay,
                value: csvResources.length,
                unit: 'csv_resources',
                metadata: {
                    title: ds.title ?? 'Unknown',
                    description: (ds.notes ?? '').substring(0, 200),
                    organization: ds.organization?.title ?? 'SEPA',
                    resourceCount: ds.num_resources ?? 0,
                    attribution: 'SEPA via data.gov.uk',
                    licence: 'Open Government Licence v3.0',
                },
            });
        }

        return results;
    }
}
