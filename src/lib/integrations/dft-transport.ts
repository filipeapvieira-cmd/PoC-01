import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';
import { SCOTTISH_COUNCILS } from '../councils';
import { fetchAndParseXlsx } from '../xlsx-fetcher';

export class DftTransportPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'dft-transport',
            name: 'DfT Road Traffic Estimates (TRA8902)',
            description: 'Extracts historical vehicle miles for specific vehicle types (Buses, Pedal Cycles) across all Scottish local authorities.',
            docsUrl: 'https://www.gov.uk/government/statistical-data-sets/road-traffic-statistics-tra',
            authType: 'none',
            rateLimitNotes: 'Public download of open ODS sheet',
            licence: 'Open Government Licence v3.0',
            tier: 'B',
            sampleRequest: 'GET tra8902.ods',
            fieldMapping: 'Pedal Cycles / Buses and Coaches -> metric values',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();
        const url = 'https://assets.publishing.service.gov.uk/media/684967a8a271ab34edd1dee4/tra8902-miles-by-local-authority-and-selected-vehicle-type.ods';

        console.log(`[dft-transport] Downloading ODS from ${url}...`);
        const parsed = await fetchAndParseXlsx(url, { timeout: 120_000 });

        let sheetKey = Object.keys(parsed.sheets).find(k => k.includes('TRA8902')) || Object.keys(parsed.sheets)[1];
        if (!sheetKey) sheetKey = Object.keys(parsed.sheets)[0];

        const sheet = parsed.sheets[sheetKey] as unknown[][];
        if (!sheet || sheet.length < 5) {
            throw new Error(`Invalid sheet structure. Found ${sheet?.length} rows.`);
        }

        const latencyMs = Date.now() - start;
        const payload = JSON.stringify({ sheetName: sheetKey, rowCount: sheet.length, sample: sheet.slice(0, 5) });
        return {
            data: sheet,
            httpStatus: 200,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const metrics: MetricSeriesInput[] = [];
        const rows = raw as unknown[][];
        if (!Array.isArray(rows) || rows.length === 0) return metrics;

        let headerRow = -1;
        for (let i = 0; i < 20; i++) {
            if (!rows[i]) continue;
            const str = rows[i].map(x => String(x || '').toLowerCase()).join(' ');
            if (str.includes('vehicle') && str.includes('local authority') && str.includes('units')) {
                headerRow = i;
                break;
            }
        }

        if (headerRow === -1) {
            console.error('[dft-transport] Failed to find header row.');
            return metrics;
        }

        const headers = rows[headerRow].map(h => String(h || '').trim());
        const vehicleCol = headers.findIndex(h => h.toLowerCase() === 'vehicle' || h.toLowerCase() === 'vehicle type');
        const codeCol = headers.findIndex(h => h.toLowerCase().includes('local authority or region code'));
        const nameCol = headers.findIndex(h => h.toLowerCase() === 'local authority');

        if (vehicleCol === -1 || codeCol === -1) {
            console.error('[dft-transport] Missing core columns!', { vehicleCol, codeCol });
            return metrics;
        }

        const yearColumns = new Map<number, number>(); // colIndex -> year
        for (let i = 0; i < headers.length; i++) {
            const h = headers[i];
            const yearMatch = h.match(/^(\d{4})/);
            if (yearMatch) {
                yearColumns.set(i, parseInt(yearMatch[1], 10));
            }
        }

        for (let r = headerRow + 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row || !row[vehicleCol]) continue;

            const vehicleType = String(row[vehicleCol]).trim().toLowerCase();
            const rawCode = String(row[codeCol] || '').trim();

            if (!rawCode.startsWith('S12')) continue; // Only process Scottish Local Authorities

            const council = SCOTTISH_COUNCILS.find(c => c.code === rawCode || c.name.toLowerCase() === String(row[nameCol] || '').toLowerCase());
            if (!council) continue;

            let metricKey = '';
            if (vehicleType.includes('pedal cycle')) {
                metricKey = 'dft_pedal_cycles_miles';
            } else if (vehicleType.includes('bus') && vehicleType.includes('coach')) {
                metricKey = 'dft_buses_coaches_miles';
            } else if (vehicleType === 'all motor vehicles') {
                metricKey = 'dft_all_motor_vehicles_miles';
            } else {
                continue;
            }

            for (const [colIdx, year] of yearColumns.entries()) {
                const val = parseFloat(String(row[colIdx]).replace(/,/g, ''));
                if (!isNaN(val)) {
                    // Create Date range
                    const startOfDay = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
                    const endOfDay = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

                    metrics.push({
                        metricKey,
                        sourceSlug: 'dft-transport',
                        geoType: 'council',
                        geoCode: council.code,
                        periodStart: startOfDay,
                        periodEnd: endOfDay,
                        value: val,
                        unit: 'million miles',
                        metadata: {
                            vehicleType: vehicleType,
                            note: 'Vehicle miles travelled',
                            attribution: 'Department for Transport (TRA8902)',
                        }
                    });
                }
            }
        }

        return metrics;
    }
}
