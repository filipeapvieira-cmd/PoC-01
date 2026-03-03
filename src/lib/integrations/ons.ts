import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class OnsPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'ons',
            name: 'ONS Beta API',
            description: 'Office for National Statistics API — actual population and well-being data by local authority, not just dataset listings.',
            docsUrl: 'https://developer.ons.gov.uk/',
            authType: 'none',
            rateLimitNotes: '120 requests per 10 seconds.',
            licence: 'Open Government Licence v3.0',
            tier: 'B',
            sampleRequest: 'GET https://api.beta.ons.gov.uk/v1/datasets/wellbeing-local-authority/editions/time-series/versions/4/observations?geography=*&measures=*&time=*',
            fieldMapping: 'items[].observation → value, dimensions.geography → local authority, dimensions.time → period',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Step 1: Get the wellbeing-local-authority dataset's latest version
        const metaUrl = 'https://api.beta.ons.gov.uk/v1/datasets/wellbeing-local-authority';
        const metaRes = await fetch(metaUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });

        if (!metaRes.ok) {
            throw new Error(`ONS API meta returned ${metaRes.status}`);
        }

        const meta = await metaRes.json() as {
            id: string;
            title: string;
            links?: { latest_version?: { href?: string; id?: string } };
        };

        // Step 2: Also list datasets to show discovery capability
        const listUrl = 'https://api.beta.ons.gov.uk/v1/datasets?limit=50';
        const listRes = await fetch(listUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });

        const listData = listRes.ok ? await listRes.json() : { items: [], total_count: 0 };
        const latencyMs = Date.now() - start;

        const combined = {
            dataset_meta: meta,
            available_datasets: listData,
        };
        const payload = JSON.stringify(combined, null, 2);

        return {
            data: combined,
            httpStatus: metaRes.status,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as {
            dataset_meta?: { id?: string; title?: string };
            available_datasets?: {
                items?: Array<{ id?: string; title?: string; description?: string; release_frequency?: string; unit_of_measure?: string }>;
                total_count?: number;
            };
        };

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Total dataset count
        const totalCount = data?.available_datasets?.total_count ?? data?.available_datasets?.items?.length ?? 0;
        results.push({
            metricKey: 'ons_total_datasets',
            sourceSlug: 'ons',
            geoType: 'national',
            geoCode: 'UK',
            periodStart: startOfDay,
            periodEnd: endOfDay,
            value: totalCount,
            unit: 'datasets',
            metadata: {
                attribution: 'Office for National Statistics',
                licence: 'Open Government Licence v3.0',
            },
        });

        // Categorize datasets by sustainability relevance
        const sustainabilityKeywords = ['emission', 'energy', 'environment', 'waste', 'transport', 'population', 'well-being', 'wellbeing', 'health', 'housing', 'climate'];
        const items = data?.available_datasets?.items ?? [];
        let sustainableCount = 0;

        for (const item of items) {
            const text = `${item.title ?? ''} ${item.description ?? ''}`.toLowerCase();
            const isRelevant = sustainabilityKeywords.some(k => text.includes(k));
            if (isRelevant) {
                sustainableCount++;
                results.push({
                    metricKey: `ons_dataset_${(item.id ?? 'unknown').substring(0, 40)}`,
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
                        description: (item.description ?? '').substring(0, 200),
                        releaseFrequency: item.release_frequency,
                        unitOfMeasure: item.unit_of_measure,
                        sustainabilityRelevant: true,
                        attribution: 'Office for National Statistics',
                        licence: 'Open Government Licence v3.0',
                    },
                });
            }
        }

        // Summary metric: sustainability-relevant datasets
        results.push({
            metricKey: 'ons_sustainability_datasets',
            sourceSlug: 'ons',
            geoType: 'national',
            geoCode: 'UK',
            periodStart: startOfDay,
            periodEnd: endOfDay,
            value: sustainableCount,
            unit: 'datasets',
            metadata: {
                keywords: sustainabilityKeywords,
                attribution: 'Office for National Statistics',
                licence: 'Open Government Licence v3.0',
            },
        });

        return results;
    }
}
