import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class ScottishAirQualityPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'scottish-air-quality',
            name: 'Scottish Air Quality',
            description: 'UK DEFRA Air Quality API providing pollution forecasts and monitoring station data for Scotland.',
            docsUrl: 'https://uk-air.defra.gov.uk/data/API',
            authType: 'none',
            rateLimitNotes: 'No published rate limits.',
            licence: 'Open Government Licence',
            tier: 'A',
            sampleRequest: 'GET https://uk-air.defra.gov.uk/sos-ukair/api/v1/stations?expanded=true',
            fieldMapping: 'stations[].id/label → station info, timeseries values → pollutant measurements',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Use UK AIR DEFRA API for Scottish stations
        const url = 'https://uk-air.defra.gov.uk/sos-ukair/api/v1/stations?expanded=true';
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
            throw new Error(`UK AIR API returned ${res.status}: ${res.statusText}`);
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
        const stations = raw as Array<{
            id?: number;
            properties?: {
                id?: number;
                label?: string;
                timeseries?: Record<string, {
                    phenomenon?: { label?: string };
                    uom?: string;
                    lastValue?: { timestamp?: number; value?: number };
                }>;
            };
        }>;

        if (!Array.isArray(stations)) return results;

        const now = new Date();

        // Filter for Scottish stations (label contains Scotland-related locations)
        const scottishKeywords = ['edinburgh', 'glasgow', 'aberdeen', 'dundee', 'inverness', 'stirling', 'perth', 'scotland', 'grangemouth', 'bush estate'];
        const scottishStations = stations.filter(s => {
            const label = (s.properties?.label ?? '').toLowerCase();
            return scottishKeywords.some(k => label.includes(k));
        });

        for (const station of scottishStations.slice(0, 20)) {
            const stationLabel = station.properties?.label ?? `station_${station.id}`;
            const timeseries = station.properties?.timeseries;

            if (!timeseries) continue;

            for (const [tsId, ts] of Object.entries(timeseries)) {
                const phenomenon = ts.phenomenon?.label ?? 'unknown';
                const uom = ts.uom ?? 'µg/m³';
                const lastVal = ts.lastValue;

                if (lastVal?.value == null || lastVal?.timestamp == null) continue;

                const timestamp = new Date(lastVal.timestamp);

                results.push({
                    metricKey: `air_quality_${phenomenon.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                    sourceSlug: 'scottish-air-quality',
                    geoType: 'station',
                    geoCode: `ukair_station_${station.id}`,
                    periodStart: timestamp,
                    periodEnd: timestamp,
                    value: lastVal.value,
                    unit: uom,
                    metadata: {
                        stationName: stationLabel,
                        phenomenon,
                        timeseriesId: tsId,
                        attribution: 'DEFRA UK-AIR',
                        licence: 'Open Government Licence',
                    },
                });
            }
        }

        return results;
    }
}
