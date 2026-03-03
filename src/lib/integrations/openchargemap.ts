import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class OpenChargeMapPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'openchargemap',
            name: 'OpenChargeMap',
            description: 'OpenChargeMap API providing EV charging station locations, connector types, and availability across Scotland.',
            docsUrl: 'https://openchargemap.org/site/develop/api',
            authType: 'api_key',
            authEnvVar: 'OPENCHARGE_API_KEY',
            rateLimitNotes: 'Fair use policy. Avoid duplicate queries. Throttle requests.',
            licence: 'Creative Commons Attribution-ShareAlike',
            tier: 'B',
            sampleRequest: 'GET https://api.openchargemap.io/v3/poi?output=json&countrycode=GB&latitude=55.95&longitude=-3.19&distance=25&maxresults=50',
            fieldMapping: 'poi[].AddressInfo → location, poi[].Connections → connector types, poi[].StatusType → availability',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();
        const apiKey = process.env.OPENCHARGE_API_KEY;

        if (!apiKey) {
            throw new Error('API key required: set OPENCHARGE_API_KEY in .env (free registration at openchargemap.org)');
        }

        // Edinburgh coordinates as default
        const lat = 55.9533;
        const lon = -3.1883;

        const params = new URLSearchParams({
            output: 'json',
            countrycode: 'GB',
            latitude: lat.toString(),
            longitude: lon.toString(),
            distance: '25',
            distanceunit: 'KM',
            maxresults: '50',
            compact: 'true',
            verbose: 'false',
        });

        const url = `https://api.openchargemap.io/v3/poi?${params}`;
        const res = await fetch(url, {
            headers: {
                'X-API-Key': apiKey,
            },
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
            throw new Error(`OpenChargeMap API returned ${res.status}: ${res.statusText}`);
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
        const pois = raw as Array<{ ID?: number; AddressInfo?: { Title?: string; Town?: string; Postcode?: string; Latitude?: number; Longitude?: number }; NumberOfPoints?: number; Connections?: Array<{ ConnectionTypeID?: number; PowerKW?: number }>; StatusType?: { Title?: string; IsOperational?: boolean } }>;

        if (!Array.isArray(pois)) return results;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Total count
        results.push({
            metricKey: 'ev_charger_count',
            sourceSlug: 'openchargemap',
            geoType: 'council',
            geoCode: 'S12000036',
            periodStart: startOfDay,
            periodEnd: endOfDay,
            value: pois.length,
            unit: 'stations',
            metadata: {
                searchRadius: '25km',
                center: 'Edinburgh',
                attribution: 'OpenChargeMap',
                licence: 'CC BY-SA',
            },
        });

        // Individual stations
        for (const poi of pois.slice(0, 20)) {
            const addr = poi.AddressInfo;
            const totalKW = poi.Connections?.reduce((sum, c) => sum + (c.PowerKW ?? 0), 0) ?? 0;

            results.push({
                metricKey: 'ev_charger_station',
                sourceSlug: 'openchargemap',
                geoType: 'point',
                geoCode: `ocm_${poi.ID}`,
                periodStart: startOfDay,
                periodEnd: endOfDay,
                value: poi.NumberOfPoints ?? 1,
                unit: 'charge_points',
                metadata: {
                    stationName: addr?.Title,
                    town: addr?.Town,
                    postcode: addr?.Postcode,
                    lat: addr?.Latitude,
                    lon: addr?.Longitude,
                    totalPowerKW: totalKW,
                    connectionCount: poi.Connections?.length ?? 0,
                    operational: poi.StatusType?.IsOperational,
                    statusTitle: poi.StatusType?.Title,
                    attribution: 'OpenChargeMap',
                    licence: 'CC BY-SA',
                },
            });
        }

        return results;
    }
}
