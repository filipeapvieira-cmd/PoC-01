import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class CarbonIntensityPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'carbon-intensity',
            name: 'Carbon Intensity API',
            description: 'National Grid ESO Carbon Intensity API providing forecast and actual carbon intensity for GB electricity generation, with regional breakdowns.',
            docsUrl: 'https://carbon-intensity.github.io/api-definitions/',
            authType: 'none',
            rateLimitNotes: 'No published rate limits. Use reasonable request frequency.',
            licence: 'CC BY 4.0',
            tier: 'A',
            sampleRequest: 'GET https://api.carbonintensity.org.uk/regional/scotland',
            fieldMapping: 'data[].data[].intensity.forecast → value (gCO2/kWh), data[].from/to → period',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();
        // Scotland is within the North Scotland (region 1) and South Scotland (region 2) regions
        // Use the /regional endpoint for current intensity
        const url = 'https://api.carbonintensity.org.uk/regional';
        const res = await fetch(url);
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
        const data = raw as { data?: Array<{ regionid: number; dnoregion: string; shortname: string; data?: Array<{ from: string; to: string; intensity: { forecast: number; index: string }; generationmix: Array<{ fuel: string; perc: number }> }> }> };

        if (!data?.data) return results;

        // Scottish regions: 1 = North Scotland, 2 = South Scotland
        const scottishRegions = data.data.filter(r => [1, 2].includes(r.regionid));

        for (const region of scottishRegions) {
            if (!region.data) continue;
            for (const entry of region.data) {
                const from = new Date(entry.from);
                const to = new Date(entry.to);

                // Carbon intensity metric
                if (entry.intensity?.forecast != null) {
                    results.push({
                        metricKey: 'carbon_intensity_forecast',
                        sourceSlug: 'carbon-intensity',
                        geoType: 'region',
                        geoCode: `scotland_region_${region.regionid}`,
                        periodStart: from,
                        periodEnd: to,
                        value: entry.intensity.forecast,
                        unit: 'gCO2/kWh',
                        metadata: {
                            regionName: region.shortname,
                            intensityIndex: entry.intensity.index,
                            attribution: 'National Grid ESO',
                            licence: 'CC BY 4.0',
                        },
                    });
                }

                // Generation mix metrics
                if (entry.generationmix) {
                    for (const mix of entry.generationmix) {
                        results.push({
                            metricKey: `generation_mix_${mix.fuel}`,
                            sourceSlug: 'carbon-intensity',
                            geoType: 'region',
                            geoCode: `scotland_region_${region.regionid}`,
                            periodStart: from,
                            periodEnd: to,
                            value: mix.perc,
                            unit: '%',
                            metadata: {
                                fuel: mix.fuel,
                                regionName: region.shortname,
                                attribution: 'National Grid ESO',
                                licence: 'CC BY 4.0',
                            },
                        });
                    }
                }
            }
        }

        return results;
    }
}
