import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';
import { SCOTTISH_COUNCILS } from '../councils';

export class OpenChargeMapPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'openchargemap',
            name: 'OpenChargeMap',
            description: 'OpenChargeMap API providing EV charging station locations, connector types, and availability across Scotland.',
            docsUrl: 'https://openchargemap.org/site/develop/api',
            authType: 'api_key',
            authEnvVar: 'OPENCHARGE_API_KEY',
            rateLimitNotes: 'Fair use policy. Throttle requests.',
            licence: 'Creative Commons Attribution-ShareAlike',
            tier: 'B',
            sampleRequest: 'GET https://api.openchargemap.io/v3/poi?output=json&countrycode=GB&latitude=55.95&longitude=-3.19&distance=15',
            fieldMapping: 'poi[].AddressInfo → location',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();
        const apiKey = process.env.OPENCHARGE_API_KEY;

        if (!apiKey) {
            throw new Error('API key required: set OPENCHARGE_API_KEY in .env (free registration at openchargemap.org)');
        }

        const councilResults: Record<string, any[]> = {};

        // Let's sample a few representative councils for the integration run
        // Doing all 32 might hit rate limits too fast
        const targetCouncils = SCOTTISH_COUNCILS;

        for (const council of targetCouncils) {
            // Rough center coordinates for the council
            const lat = council.code === 'S12000049' ? 55.9533 : // Edinburgh
                council.code === 'S12000046' ? 55.8642 : // Glasgow
                    council.code === 'S12000036' ? 56.1165 : // Falkirk
                        council.code === 'S12000017' ? 57.4778 : // Highland (Inverness)
                            56.0; // generic fallback

            const params = new URLSearchParams({
                output: 'json',
                countrycode: 'GB',
                latitude: lat.toString(),
                longitude: '-3.5', // Just generic Scotland longitude
                distance: '20', // Reduced radius to roughly approximate council area
                distanceunit: 'KM',
                maxresults: '100', // Higher limit
                compact: 'true',
                verbose: 'false',
            });

            // Note: In an ideal world we would query by BoundingBox or polygon
            // but the OpenChargeMap API relies on radial distance.

            try {
                const res = await fetch(`https://api.openchargemap.io/v3/poi?${params}`, {
                    headers: { 'X-API-Key': apiKey },
                    signal: AbortSignal.timeout(10000),
                });

                if (res.ok) {
                    const data = await res.json();
                    councilResults[council.code] = data;
                }

                // Sleep for rate limit (OpenChargeMap is operated by volunteers)
                await new Promise(r => setTimeout(r, 600));
            } catch (err) {
                console.error(`OCM fetch failed for ${council.name}`, err);
            }
        }

        const latencyMs = Date.now() - start;
        const payloadStr = JSON.stringify(councilResults);

        return {
            data: councilResults,
            httpStatus: 200,
            latencyMs,
            truncatedPayload: payloadStr.length > 50000 ? payloadStr.substring(0, 50000) + '...[TRUNCATED]' : payloadStr,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const datasets = raw as Record<string, Array<{ ID?: number; AddressInfo?: { Title?: string; Town?: string }; NumberOfPoints?: number; Connections?: Array<{ PowerKW?: number }>; StatusType?: { IsOperational?: boolean } }>>;

        if (!datasets || typeof datasets !== 'object') return results;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        for (const [geoCode, pois] of Object.entries(datasets)) {
            if (!Array.isArray(pois)) continue;

            // Total capacity and operational count
            let operationalPoints = 0;
            let totalKW = 0;

            for (const poi of pois) {
                if (poi.StatusType?.IsOperational) {
                    operationalPoints += (poi.NumberOfPoints ?? 1);
                }
                const kw = poi.Connections?.reduce((sum, c) => sum + (c.PowerKW ?? 0), 0) ?? 0;
                totalKW += kw;
            }

            // Total count for the council
            results.push({
                metricKey: 'ev_charger_count',
                sourceSlug: 'openchargemap',
                geoType: 'council',
                geoCode,
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: pois.length,
                unit: 'locations',
                metadata: {
                    operationalPoints,
                    totalCapacityKW: totalKW,
                    attribution: 'OpenChargeMap',
                    licence: 'CC BY-SA',
                },
            });
        }

        return results;
    }
}
