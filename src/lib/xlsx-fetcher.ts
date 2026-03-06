import * as XLSX from 'xlsx';

const MAX_RETRIES = 2;
const TIMEOUT_MS = 60_000;

/**
 * Download an XLSX file from a URL and return parsed sheets.
 * Handles HTTP redirects, retries, and timeouts.
 */
export async function fetchAndParseXlsx(
    url: string,
    options?: { sheetName?: string; timeout?: number }
): Promise<{ sheets: Record<string, unknown[][]>; rawBuffer: Buffer }> {
    const timeout = options?.timeout ?? TIMEOUT_MS;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (CSP Data Ingestion Engine)' },
                redirect: 'follow',
                signal: AbortSignal.timeout(timeout),
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status} from ${url}`);
            }

            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const wb = XLSX.read(buffer, { type: 'buffer' });

            const sheets: Record<string, unknown[][]> = {};
            const targetSheets = options?.sheetName
                ? [options.sheetName]
                : wb.SheetNames;

            for (const name of targetSheets) {
                const sheet = wb.Sheets[name];
                if (sheet) {
                    sheets[name] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
                }
            }

            return { sheets, rawBuffer: buffer };
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
            }
        }
    }

    throw lastError ?? new Error('Failed to fetch XLSX');
}

/**
 * Extract rows from a parsed sheet where column `colIdx` matches a value in `matchValues`.
 */
export function filterRows(
    data: unknown[][],
    colIdx: number,
    matchValues: Set<string>,
    startRow = 0
): unknown[][] {
    const results: unknown[][] = [];
    for (let i = startRow; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        const val = String(row[colIdx] ?? '').trim();
        if (matchValues.has(val)) {
            results.push(row);
        }
    }
    return results;
}
