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

        // Step 1: Get all timeseries
        const tsUrl = 'https://uk-air.defra.gov.uk/sos-ukair/api/v1/timeseries?expanded=true';
        const tsRes = await fetch(tsUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(20000),
        });
        const latencyMs = Date.now() - start;

        if (!tsRes.ok) {
            throw new Error(`UK AIR API returned ${tsRes.status}: ${tsRes.statusText}`);
        }

        const allTs = await tsRes.json() as Array<{
            id?: string;
            uom?: string;
            station?: { properties?: { id?: number; label?: string } };
            lastValue?: { timestamp?: number; value?: number };
            parameters?: { phenomenon?: { id?: string; label?: string } };
        }>;

        // Filter for Scottish stations
        const scottishKeywords = [
            'edinburgh', 'glasgow', 'aberdeen', 'dundee', 'inverness', 'stirling', 'perth',
            'grangemouth', 'bush estate', 'auchencorth', 'lerwick', 'strath vaich',
            'fort william', 'ayr', 'falkirk', 'dumfries', 'kilmarnock', 'greenock',
            'paisley', 'motherwell', 'hamilton', 'kirkcaldy', 'dunfermline', 'livingston',
        ];

        const scottishTs = allTs.filter(ts => {
            const label = (ts.station?.properties?.label ?? '').toLowerCase();
            return scottishKeywords.some(k => label.includes(k));
        });

        // Group by station
        const stationMap = new Map<number, { stationId: number; stationName: string; measurements: any[] }>();

        const phenomenonIdMap: Record<string, string> = {
            '5': 'PM10',
            '6001': 'PM2.5',
            '8': 'NO2',
            '1': 'SO2',
            '10': 'CO',
            '7': 'O3'
        };

        for (const ts of scottishTs) {
            const stId = ts.station?.properties?.id;
            const stName = ts.station?.properties?.label;
            if (!stId || !stName) continue;

            if (!stationMap.has(stId)) {
                stationMap.set(stId, { stationId: stId, stationName: stName, measurements: [] });
            }

            if (ts.lastValue?.value != null && ts.lastValue?.timestamp != null) {
                const pId = ts.parameters?.phenomenon?.id ?? 'unknown';
                stationMap.get(stId)!.measurements.push({
                    phenomenon: phenomenonIdMap[pId] ?? `id_${pId}`,
                    value: ts.lastValue.value,
                    unit: ts.uom ?? 'unknown',
                    timestamp: new Date(ts.lastValue.timestamp).toISOString(),
                    timeseriesId: ts.id ?? 'unknown',
                });
            }
        }

        const stationData = Array.from(stationMap.values());

        const data = {
            totalTimeseriesUK: allTs.length,
            scottishStations: stationData,
            totalScottishStations: stationData.length,
            totalMeasurements: stationData.reduce((sum, s) => sum + s.measurements.length, 0),
        };

        const payload = JSON.stringify(data, null, 2);

        return {
            data,
            httpStatus: tsRes.status,
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
