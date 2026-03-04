import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';
import { SCOTTISH_COUNCILS } from '../councils';

export class StatisticsGovScotPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'statistics-gov-scot',
            name: 'Scottish Climate (Open-Meteo)',
            description: 'Retrieves solar radiation, precipitation, and temperature data for all 32 Scottish councils.',
            docsUrl: 'https://open-meteo.com/en/docs/',
            authType: 'none',
            rateLimitNotes: 'Open-Meteo allows up to 10k calls/day free.',
            licence: 'Attribution 4.0 International (CC BY 4.0)',
            tier: 'A',
            sampleRequest: 'GET https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&past_days=7',
            fieldMapping: 'daily.shortwave_radiation_sum -> solar_mj_m2, daily.precipitation_sum -> precipitation_mm',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        // Process all councils in batches of 4
        const results: any[] = [];
        const batchSize = 4;

        for (let i = 0; i < SCOTTISH_COUNCILS.length; i += batchSize) {
            const batch = SCOTTISH_COUNCILS.slice(i, i + batchSize);

            const batchPromises = batch.map(async (council) => {
                const lat = council.lat;
                const lon = council.lng;
                // Fetch the past 7 days of actuals up to yesterday
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&past_days=7&forecast_days=0&daily=temperature_2m_mean,precipitation_sum,shortwave_radiation_sum,wind_gusts_10m_max&timezone=Europe%2FLondon`;

                try {
                    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
                    if (!res.ok) {
                        return null;
                    }
                    const data = await res.json();
                    return { council: council.code, data };
                } catch (e) {
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(r => r !== null));
        }

        const validResults = results;
        const latencyMs = Date.now() - start;
        const payload = JSON.stringify(validResults, null, 2);

        return {
            data: validResults,
            httpStatus: 200,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const metrics: MetricSeriesInput[] = [];
        const rawArray = Array.isArray(raw) ? raw : [];

        for (const item of rawArray) {
            const councilCode = item.council;
            const daily = item.data?.daily;
            if (!daily || !daily.time) continue;

            const days = daily.time.length;

            for (let i = 0; i < days; i++) {
                const dateStr = daily.time[i];
                const periodStart = new Date(`${dateStr}T00:00:00Z`);
                const periodEnd = new Date(`${dateStr}T23:59:59Z`);

                const temp = daily.temperature_2m_mean?.[i];
                const rain = daily.precipitation_sum?.[i];
                const solar = daily.shortwave_radiation_sum?.[i];
                const wind = daily.wind_gusts_10m_max?.[i];

                if (temp != null) {
                    metrics.push({
                        metricKey: 'mean_temperature',
                        sourceSlug: 'statistics-gov-scot',
                        geoType: 'council',
                        geoCode: councilCode,
                        periodStart, periodEnd,
                        value: temp,
                        unit: 'celsius',
                        metadata: { attribution: 'Open-Meteo' }
                    });
                }
                if (rain != null) {
                    metrics.push({
                        metricKey: 'total_precipitation',
                        sourceSlug: 'statistics-gov-scot',
                        geoType: 'council',
                        geoCode: councilCode,
                        periodStart, periodEnd,
                        value: rain,
                        unit: 'mm',
                        metadata: { attribution: 'Open-Meteo' }
                    });
                }
                if (solar != null) {
                    metrics.push({
                        metricKey: 'solar_radiation',
                        sourceSlug: 'statistics-gov-scot',
                        geoType: 'council',
                        geoCode: councilCode,
                        periodStart, periodEnd,
                        value: solar,
                        unit: 'MJ/m²',
                        metadata: { attribution: 'Open-Meteo', notes: 'Shortwave radiation sum' }
                    });
                }
                if (wind != null) {
                    metrics.push({
                        metricKey: 'max_wind_gust',
                        sourceSlug: 'statistics-gov-scot',
                        geoType: 'council',
                        geoCode: councilCode,
                        periodStart, periodEnd,
                        value: wind,
                        unit: 'km/h',
                        metadata: { attribution: 'Open-Meteo' }
                    });
                }
            }
        }

        return metrics;
    }
}
