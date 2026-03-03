import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class ElexonPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'elexon',
            name: 'Elexon BMRS API',
            description: 'Elexon BMRS API — real-time GB generation by fuel type (MW) plus demand outturn data.',
            docsUrl: 'https://bmrs.elexon.co.uk/api-documentation',
            authType: 'none',
            rateLimitNotes: 'No API key required. Rate limits may apply.',
            licence: 'BMRS Data Licence',
            tier: 'A',
            sampleRequest: 'GET https://data.elexon.co.uk/bmrs/api/v1/generation/outturn/summary + /demand/outturn',
            fieldMapping: 'data[].fuelType → fuel, data[].currentUsageInMW → generation MW, demand → MW',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Fetch both generation summary AND demand outturn in parallel
        const [genRes, demandRes] = await Promise.all([
            fetch('https://data.elexon.co.uk/bmrs/api/v1/generation/outturn/summary', {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(15000),
            }),
            fetch('https://data.elexon.co.uk/bmrs/api/v1/demand/outturn', {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(15000),
            }).catch(() => null), // Don't fail if demand endpoint errors
        ]);
        const latencyMs = Date.now() - start;

        if (!genRes.ok) {
            const text = await genRes.text();
            throw new Error(`Elexon API returned ${genRes.status}: ${text.substring(0, 500)}`);
        }

        const genData = await genRes.json();
        let demandData = null;
        if (demandRes?.ok) {
            demandData = await demandRes.json();
        }

        const combined = { generation: genData, demand: demandData };
        const payload = JSON.stringify(combined, null, 2);

        return {
            data: combined,
            httpStatus: genRes.status,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as {
            generation?: { data?: Array<{ fuelType?: string; currentUsageInMW?: number; generation?: number; from?: string; to?: string }> };
            demand?: { data?: Array<{ settlementDate?: string; settlementPeriod?: number; demand?: number; transmissionSystemDemand?: number; from?: string; to?: string }> };
        };

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Generation by fuel type
        const genData = data?.generation?.data ?? [];
        let totalGeneration = 0;
        let renewableGeneration = 0;
        const renewableFuels = ['wind', 'solar', 'hydro', 'biomass'];

        for (const entry of genData) {
            const fuel = entry.fuelType ?? 'unknown';
            const value = entry.currentUsageInMW ?? entry.generation ?? 0;
            const from = entry.from ? new Date(entry.from) : startOfDay;
            const to = entry.to ? new Date(entry.to) : endOfDay;

            totalGeneration += value;
            if (renewableFuels.some(r => fuel.toLowerCase().includes(r))) {
                renewableGeneration += value;
            }

            results.push({
                metricKey: `generation_${fuel.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
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

        // Total generation
        if (totalGeneration > 0) {
            results.push({
                metricKey: 'total_generation',
                sourceSlug: 'elexon',
                geoType: 'national',
                geoCode: 'GB',
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: totalGeneration,
                unit: 'MW',
                metadata: { attribution: 'Elexon', licence: 'BMRS Data Licence' },
            });

            // Renewable percentage
            results.push({
                metricKey: 'renewable_generation_percent',
                sourceSlug: 'elexon',
                geoType: 'national',
                geoCode: 'GB',
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: Math.round((renewableGeneration / totalGeneration) * 1000) / 10,
                unit: 'percent',
                metadata: {
                    renewableMW: renewableGeneration,
                    totalMW: totalGeneration,
                    attribution: 'Elexon',
                    licence: 'BMRS Data Licence',
                },
            });
        }

        // Demand data
        const demandData = data?.demand?.data ?? [];
        for (const entry of demandData.slice(0, 48)) { // Last 48 half-hours = 24 hours
            const demand = entry.demand ?? entry.transmissionSystemDemand ?? 0;
            const from = entry.from ? new Date(entry.from) : startOfDay;
            const to = entry.to ? new Date(entry.to) : endOfDay;

            if (demand > 0) {
                results.push({
                    metricKey: 'electricity_demand',
                    sourceSlug: 'elexon',
                    geoType: 'national',
                    geoCode: 'GB',
                    periodStart: from,
                    periodEnd: to,
                    value: demand,
                    unit: 'MW',
                    metadata: {
                        settlementPeriod: entry.settlementPeriod,
                        attribution: 'Elexon',
                        licence: 'BMRS Data Licence',
                    },
                });
            }
        }

        return results;
    }
}
