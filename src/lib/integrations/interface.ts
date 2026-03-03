export interface GeoQuery {
    geoType: string;    // 'council', 'national', 'station', etc.
    geoCode: string;    // council code, name, URI, bounding box, etc.
    geoName?: string;   // human-readable name
}

export interface IntegrationConfig {
    slug: string;
    name: string;
    description: string;
    docsUrl: string;
    authType: 'none' | 'api_key' | 'pending_approval';
    authEnvVar?: string;
    rateLimitNotes: string;
    licence: string;
    tier: 'A' | 'B';
    sampleRequest: string;
    fieldMapping: string;
}

export interface RawFetchResult {
    data: unknown;
    httpStatus: number;
    latencyMs: number;
    truncatedPayload: string;  // JSON string, truncated for storage
}

export interface MetricSeriesInput {
    metricKey: string;
    sourceSlug: string;
    geoType: string;
    geoCode: string;
    periodStart: Date;
    periodEnd: Date;
    value: number;
    unit: string;
    metadata: Record<string, unknown>;
}

export interface IntegrationPlugin {
    getConfig(): IntegrationConfig;
    fetchSample(geo: GeoQuery): Promise<RawFetchResult>;
    fetchRange?(geo: GeoQuery, from: Date, to: Date): Promise<RawFetchResult>;
    normalize(raw: unknown): MetricSeriesInput[];
}

export type ErrorType =
    | 'AUTH_MISSING'
    | 'RATE_LIMITED'
    | 'INVALID_RESPONSE'
    | 'PARSE_ERROR'
    | 'UPSTREAM_DOWN'
    | 'TIMEOUT'
    | 'UNKNOWN';

export function classifyError(error: unknown): ErrorType {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('api key')) {
            return 'AUTH_MISSING';
        }
        if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) {
            return 'RATE_LIMITED';
        }
        if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('econnaborted')) {
            return 'TIMEOUT';
        }
        if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('503') || msg.includes('502')) {
            return 'UPSTREAM_DOWN';
        }
        if (msg.includes('parse') || msg.includes('json') || msg.includes('unexpected token')) {
            return 'PARSE_ERROR';
        }
        if (msg.includes('invalid') || msg.includes('400')) {
            return 'INVALID_RESPONSE';
        }
    }
    return 'UNKNOWN';
}
