import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

export class ScottishAirQualityPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'scottish-air-quality',
            name: 'Scottish Air Quality (DEFRA)',
            description: 'DEFRA UK-AIR API — pulls station metadata AND actual pollutant measurement time series for Scottish monitoring stations.',
            docsUrl: 'https://uk-air.defra.gov.uk/data/API',
            authType: 'none',
            rateLimitNotes: 'No published rate limits.',
            licence: 'Open Government Licence',
            tier: 'A',
            sampleRequest: 'GET https://uk-air.defra.gov.uk/sos-ukair/api/v1/stations?expanded=true then /timeseries/{id}/getData',
            fieldMapping: 'stations → metadata, timeseries/getData → actual pollutant values (µg/m³)',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Step 1: Get all stations
        const stationUrl = 'https://uk-air.defra.gov.uk/sos-ukair/api/v1/stations?expanded=true';
        const stationRes = await fetch(stationUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        const latencyMs = Date.now() - start;

        if (!stationRes.ok) {
            throw new Error(`UK AIR API returned ${stationRes.status}: ${stationRes.statusText}`);
        }

        const allStations = await stationRes.json() as Array<{
            id?: number;
            properties?: {
                id?: number;
                label?: string;
                timeseries?: Record<string, {
                    phenomenon?: { label?: string };
                    uom?: string;
                    lastValue?: { timestamp?: number; value?: number };
                    station?: { properties?: { label?: string } };
                }>;
            };
        }>;

        // Filter for Scottish stations
        const scottishKeywords = [
            'edinburgh', 'glasgow', 'aberdeen', 'dundee', 'inverness', 'stirling', 'perth',
            'grangemouth', 'bush estate', 'auchencorth', 'lerwick', 'strath vaich',
            'fort william', 'ayr', 'falkirk', 'dumfries', 'kilmarnock', 'greenock',
            'paisley', 'motherwell', 'hamilton', 'kirkcaldy', 'dunfermline', 'livingston',
        ];

        const scottishStations = allStations.filter(s => {
            const label = (s.properties?.label ?? '').toLowerCase();
            return scottishKeywords.some(k => label.includes(k));
        });

        // Step 2: For each Scottish station, extract latest values from timeseries
        const stationData = scottishStations.map(station => {
            const timeseries = station.properties?.timeseries ?? {};
            const measurements: Array<{ phenomenon: string; value: number; unit: string; timestamp: string; timeseriesId: string }> = [];

            for (const [tsId, ts] of Object.entries(timeseries)) {
                if (ts.lastValue?.value != null && ts.lastValue?.timestamp != null) {
                    measurements.push({
                        phenomenon: ts.phenomenon?.label ?? 'unknown',
                        value: ts.lastValue.value,
                        unit: ts.uom ?? 'µg/m³',
                        timestamp: new Date(ts.lastValue.timestamp).toISOString(),
                        timeseriesId: tsId,
                    });
                }
            }

            return {
                stationId: station.id,
                stationName: station.properties?.label ?? `Station ${station.id}`,
                measurements,
            };
        });

        const data = {
            totalStationsUK: allStations.length,
            scottishStations: stationData,
            totalScottishStations: stationData.length,
            totalMeasurements: stationData.reduce((sum, s) => sum + s.measurements.length, 0),
        };

        const payload = JSON.stringify(data, null, 2);

        return {
            data,
            httpStatus: stationRes.status,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as {
            scottishStations?: Array<{
                stationId?: number;
                stationName: string;
                measurements: Array<{ phenomenon: string; value: number; unit: string; timestamp: string; timeseriesId: string }>;
            }>;
            totalScottishStations?: number;
        };

        if (!data?.scottishStations) return results;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Summary metric
        results.push({
            metricKey: 'scottish_air_stations_count',
            sourceSlug: 'scottish-air-quality',
            geoType: 'national',
            geoCode: 'scotland',
            periodStart: startOfDay,
            periodEnd: endOfDay,
            value: data.totalScottishStations ?? 0,
            unit: 'stations',
            metadata: { attribution: 'DEFRA UK-AIR', licence: 'OGL' },
        });

        // Per-station, per-pollutant measurements
        for (const station of data.scottishStations) {
            for (const m of station.measurements) {
                const phenomenonKey = m.phenomenon.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const timestamp = new Date(m.timestamp);
                const validTimestamp = isNaN(timestamp.getTime()) ? startOfDay : timestamp;

                results.push({
                    metricKey: `air_quality_${phenomenonKey}`,
                    sourceSlug: 'scottish-air-quality',
                    geoType: 'station',
                    geoCode: `ukair_${station.stationId}`,
                    periodStart: validTimestamp,
                    periodEnd: validTimestamp,
                    value: m.value,
                    unit: m.unit,
                    metadata: {
                        stationName: station.stationName,
                        phenomenon: m.phenomenon,
                        timeseriesId: m.timeseriesId,
                        attribution: 'DEFRA UK-AIR',
                        licence: 'Open Government Licence',
                    },
                });
            }
        }

        return results;
    }
}
