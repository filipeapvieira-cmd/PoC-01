import { IntegrationPlugin, IntegrationConfig, GeoQuery, RawFetchResult, MetricSeriesInput } from './interface';

// Council climate scorecard data from mySociety
// Replace the broken statistics.gov.scot SPARQL integration
export class StatisticsGovScotPlugin implements IntegrationPlugin {
    getConfig(): IntegrationConfig {
        return {
            slug: 'statistics-gov-scot',
            name: 'Council Climate Scorecards',
            description: 'mySociety Council Climate Plan Scorecards — climate action scores for every Scottish council. Replaces broken statistics.gov.scot SPARQL endpoint.',
            docsUrl: 'https://councilclimatescorecards.uk/',
            authType: 'none',
            rateLimitNotes: 'Static CSV download — no rate limits.',
            licence: 'Open Government Licence',
            tier: 'A',
            sampleRequest: 'GET https://councilclimatescorecards.uk/scoring/generate-csv/all/',
            fieldMapping: 'CSV columns: council_name, authority_code, weighted_total, section scores → per-council climate scores',
        };
    }

    async fetchSample(geo: GeoQuery): Promise<RawFetchResult> {
        const start = Date.now();

        const url = 'https://councilclimatescorecards.uk/scoring/generate-csv/all/';
        const res = await fetch(url, {
            headers: { 'Accept': 'text/csv,*/*' },
            signal: AbortSignal.timeout(20000),
        });
        const latencyMs = Date.now() - start;

        if (!res.ok) {
            throw new Error(`Council Climate Scorecards returned ${res.status}: ${res.statusText}`);
        }

        const csvText = await res.text();

        // Parse CSV into structured data
        const lines = csvText.split('\n').filter(l => l.trim());
        const headers = lines[0]?.split(',').map(h => h.trim().replace(/"/g, '')) ?? [];
        const rows: Record<string, string>[] = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            const row: Record<string, string> = {};
            headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
            rows.push(row);
        }

        const data = { headers, rows, totalCouncils: rows.length, rawCsv: csvText };
        const payload = JSON.stringify({ headers, sampleRows: rows.slice(0, 5), totalCouncils: rows.length }, null, 2);

        return {
            data,
            httpStatus: res.status,
            latencyMs,
            truncatedPayload: payload.length > 50000 ? payload.substring(0, 50000) + '...[TRUNCATED]' : payload,
        };
    }

    normalize(raw: unknown): MetricSeriesInput[] {
        const results: MetricSeriesInput[] = [];
        const data = raw as { headers?: string[]; rows?: Record<string, string>[]; totalCouncils?: number };

        if (!data?.rows) return results;

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear(), 11, 31);

        // Find relevant columns
        const headers = data.headers ?? [];
        const nameCol = headers.find(h => h.toLowerCase().includes('council') || h.toLowerCase().includes('authority_name') || h.toLowerCase().includes('name')) ?? headers[0];
        const codeCol = headers.find(h => h.toLowerCase().includes('authority_code') || h.toLowerCase().includes('code') || h.toLowerCase().includes('slug'));
        const scoreCol = headers.find(h => h.toLowerCase().includes('weighted_total') || h.toLowerCase().includes('total') || h.toLowerCase().includes('score'));

        // Scottish councils start with S (authority codes)
        const scottishRows = data.rows.filter(r => {
            if (codeCol && r[codeCol]) return r[codeCol].startsWith('S') || r[codeCol].startsWith('SCO');
            // Also try matching by name
            const name = (r[nameCol ?? ''] ?? '').toLowerCase();
            return name.includes('edinburgh') || name.includes('glasgow') || name.includes('aberdeen') ||
                name.includes('dundee') || name.includes('highland') || name.includes('fife') ||
                name.includes('scottish') || name.includes('council');
        });

        // If we can't identify Scottish ones, use all rows (the CSV may already be Scotland-only)
        const targetRows = scottishRows.length > 0 ? scottishRows : data.rows;

        for (const row of targetRows) {
            const name = row[nameCol ?? ''] ?? 'Unknown';
            const code = codeCol ? (row[codeCol] ?? name) : name;
            const score = scoreCol ? parseFloat(row[scoreCol]) : NaN;

            if (isNaN(score)) continue;

            results.push({
                metricKey: 'council_climate_score',
                sourceSlug: 'statistics-gov-scot',
                geoType: 'council',
                geoCode: code,
                periodStart: startOfYear,
                periodEnd: endOfYear,
                value: score,
                unit: 'score',
                metadata: {
                    councilName: name,
                    authorityCode: code,
                    attribution: 'mySociety Council Climate Scorecards',
                    licence: 'Open Government Licence',
                    source: 'councilclimatescorecards.uk',
                },
            });

            // Also emit section-level scores if available
            const sectionCols = headers.filter(h =>
                h.toLowerCase().includes('section') ||
                h.toLowerCase().includes('s1_') || h.toLowerCase().includes('s2_') ||
                h.toLowerCase().includes('s3_') || h.toLowerCase().includes('s4_') ||
                h.toLowerCase().includes('s5_') || h.toLowerCase().includes('s6_') ||
                h.toLowerCase().includes('s7_')
            );

            for (const sc of sectionCols.slice(0, 7)) {
                const sectionVal = parseFloat(row[sc] ?? '');
                if (isNaN(sectionVal)) continue;

                results.push({
                    metricKey: `council_climate_${sc.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                    sourceSlug: 'statistics-gov-scot',
                    geoType: 'council',
                    geoCode: code,
                    periodStart: startOfYear,
                    periodEnd: endOfYear,
                    value: sectionVal,
                    unit: 'score',
                    metadata: {
                        councilName: name,
                        section: sc,
                        attribution: 'mySociety Council Climate Scorecards',
                    },
                });
            }
        }

        return results;
    }
}

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}
