import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class OnsPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'ons',
            name: 'ONS Beta API',
            description: 'Office for National Statistics beta API providing UK-wide comparator datasets including population estimates, emissions, and economic indicators.',
            docsUrl: 'https://developer.ons.gov.uk/',
            authType: 'none',
            rateLimitNotes: '120 requests per 10 seconds, 200 per minute.',
            licence: 'Open Government Licence v3.0',
            tier: 'B',
            sampleRequest: 'GET https://api.beta.ons.gov.uk/v1/datasets',
            fieldMapping: 'items[].id → dataset slug, items[].title → name, observations → metric values',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // List available datasets
        const url = 'https://api.beta.ons.gov.uk/v1/datasets?limit=20';
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
            throw new Error(`ONS API returned ${res.status}: ${res.statusText}`);
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
        const data = raw as { items?: Array<{ id?: string; title?: string; description?: string; next_release?: string; links?: Record<string, unknown> }> };

        if (!data?.items) return results;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // For dataset discovery, emit a count metric and individual dataset records
        results.push({
            metricKey: 'ons_datasets_available',
            sourceSlug: 'ons',
            geoType: 'national',
            geoCode: 'UK',
            periodStart: startOfDay,
            periodEnd: endOfDay,
            value: data.items.length,
            unit: 'datasets',
            metadata: {
                datasetIds: data.items.map(d => d.id).filter(Boolean),
                attribution: 'Office for National Statistics',
                licence: 'Open Government Licence v3.0',
            },
        });

        for (const item of data.items.slice(0, 10)) {
            results.push({
                metricKey: `ons_dataset_${(item.id ?? 'unknown').replace(/[^a-z0-9]/g, '_')}`,
                sourceSlug: 'ons',
                geoType: 'national',
                geoCode: 'UK',
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: 1,
                unit: 'dataset',
                metadata: {
                    datasetId: item.id,
                    title: item.title,
                    description: item.description?.substring(0, 200),
                    attribution: 'Office for National Statistics',
                    licence: 'Open Government Licence v3.0',
                },
            });
        }

        return results;
    }
}
