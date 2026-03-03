import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class ElexonPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'elexon',
            name: 'Elexon BMRS API',
            description: 'Elexon Insights Solution / BMRS API providing electricity generation mix, demand data, and balancing mechanism data for Great Britain.',
            docsUrl: 'https://bmrs.elexon.co.uk/api-documentation',
            authType: 'none',
            rateLimitNotes: 'No API key required. Rate limits may apply.',
            licence: 'BMRS Data Licence',
            tier: 'A',
            sampleRequest: 'GET https://data.elexon.co.uk/bmrs/api/v1/generation/outturn/summary',
            fieldMapping: 'data[].fuelType → fuel, data[].currentUsageInMW → value (MW)',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Get current generation by fuel type (no API key needed)
        const url = 'https://data.elexon.co.uk/bmrs/api/v1/generation/outturn/summary';
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Elexon API returned ${res.status}: ${text.substring(0, 500)}`);
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
        const data = raw as { data?: Array<{ fuelType?: string; currentUsageInMW?: number; generation?: number; from?: string; to?: string; settlementPeriod?: number }> };

        if (!data?.data) return results;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        for (const entry of data.data) {
            const fuel = entry.fuelType ?? 'unknown';
            const value = entry.currentUsageInMW ?? entry.generation ?? 0;
            const from = entry.from ? new Date(entry.from) : startOfDay;
            const to = entry.to ? new Date(entry.to) : endOfDay;

            results.push({
                metricKey: `generation_mix_${fuel.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                sourceSlug: 'elexon',
                geoType: 'national',
                geoCode: 'GB',
                periodStart: from,
                periodEnd: to,
                value,
                unit: 'MW',
                metadata: {
                    fuelType: fuel,
                    attribution: 'Elexon',
                    licence: 'BMRS Data Licence',
                },
            });
        }

        return results;
    }
}
