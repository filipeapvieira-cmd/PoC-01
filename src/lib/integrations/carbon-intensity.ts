import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class CarbonIntensityPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'carbon-intensity',
            name: 'Carbon Intensity API',
            description: 'National Grid ESO Carbon Intensity API — real-time and forecast carbon intensity and generation mix for Scotland (North, South, aggregate).',
            docsUrl: 'https://carbon-intensity.github.io/api-definitions/',
            authType: 'none',
            rateLimitNotes: '1000 requests/month. 30 per minute.',
            licence: 'CC BY 4.0',
            tier: 'A',
            sampleRequest: 'GET https://api.carbonintensity.org.uk/regional',
            fieldMapping: 'regions[regionid=1,2,16] → N.Scotland, S.Scotland, Scotland; intensity.forecast → gCO₂/kWh; generationmix[].perc → fuel %',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Fetch regional data — includes Scotland regions
        const url = 'https://api.carbonintensity.org.uk/regional';
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
            throw new Error(`Carbon Intensity API returned ${res.status}: ${res.statusText}`);
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
        const data = raw as {
            data?: Array<{
                from?: string;
                to?: string;
                regions?: Array<{
                    regionid: number;
                    shortname: string;
                    dnoregion: string;
                    intensity: { forecast: number; index: string };
                    generationmix: Array<{ fuel: string; perc: number }>;
                }>;
            }>;
        };

        if (!data?.data?.[0]?.regions) return results;

        const entry = data.data[0];
        const from = entry.from ? new Date(entry.from) : new Date();
        const to = entry.to ? new Date(entry.to) : new Date();

        // Scotland-relevant regions: 1 (North Scotland), 2 (South Scotland), 16 (Scotland aggregate)
        const scottishRegionIds = [1, 2, 16];
        const regionCodeMap: Record<number, string> = {
            1: 'north-scotland',
            2: 'south-scotland',
            16: 'scotland',
        };

        for (const region of entry.regions ?? []) {
            if (!scottishRegionIds.includes(region.regionid)) continue;

            const geoCode = regionCodeMap[region.regionid] ?? `region-${region.regionid}`;

            // Carbon intensity metric
            results.push({
                metricKey: 'carbon_intensity_forecast',
                sourceSlug: 'carbon-intensity',
                geoType: 'region',
                geoCode,
                periodStart: from,
                periodEnd: to,
                value: region.intensity.forecast,
                unit: 'gCO2/kWh',
                metadata: {
                    index: region.intensity.index,
                    regionName: region.shortname,
                    dnoRegion: region.dnoregion,
                    attribution: 'National Grid ESO',
                    licence: 'CC BY 4.0',
                },
            });

            // Generation mix — one metric per fuel type
            for (const fuel of region.generationmix) {
                if (fuel.perc === 0) continue; // Skip zero-contribution fuels

                results.push({
                    metricKey: `generation_mix_${fuel.fuel}`,
                    sourceSlug: 'carbon-intensity',
                    geoType: 'region',
                    geoCode,
                    periodStart: from,
                    periodEnd: to,
                    value: fuel.perc,
                    unit: 'percent',
                    metadata: {
                        fuelType: fuel.fuel,
                        regionName: region.shortname,
                        attribution: 'National Grid ESO',
                        licence: 'CC BY 4.0',
                    },
                });
            }
        }

        return results;
    }
}
