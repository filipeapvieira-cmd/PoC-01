import { prisma } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { IntegrationPlugin, classifyError, type GeoQuery, type MetricSeriesInput } from '@/lib/integrations/interface';

const MAX_RETRIES = 3;
const MAX_RAW_PAYLOAD_LENGTH = 50000; // 50KB truncation

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function truncatePayload(data: unknown): string {
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    if (str.length > MAX_RAW_PAYLOAD_LENGTH) {
        return str.substring(0, MAX_RAW_PAYLOAD_LENGTH) + '\n... [TRUNCATED]';
    }
    return str;
}

export interface RunResult {
    sourceSlug: string;
    success: boolean;
    recordCount: number;
    latencyMs: number;
    error?: string;
    errorType?: string;
}

export async function runIntegration(
    plugin: IntegrationPlugin,
    geo: GeoQuery,
): Promise<RunResult> {
    const config = plugin.getConfig();
    const jobRunId = uuidv4();
    let lastError: Error | null = null;
    let retryCount = 0;

    // Check auth requirements
    if (config.authType === 'api_key' && config.authEnvVar) {
        if (!process.env[config.authEnvVar]) {
            const errorMessage = `API key required: set ${config.authEnvVar} in .env`;
            await prisma.sourceConfig.upsert({
                where: { slug: config.slug },
                update: { lastStatus: 'red', lastRunAt: new Date(), lastError: errorMessage },
                create: {
                    slug: config.slug,
                    name: config.name,
                    tier: config.tier,
                    docsUrl: config.docsUrl,
                    authType: config.authType,
                    authEnvVar: config.authEnvVar,
                    rateLimitNotes: config.rateLimitNotes,
                    licence: config.licence,
                    lastStatus: 'red',
                    lastRunAt: new Date(),
                    lastError: errorMessage,
                },
            });
            await prisma.ingestionLog.create({
                data: {
                    sourceSlug: config.slug,
                    jobRunId,
                    errorType: 'AUTH_MISSING',
                    errorMessage,
                    retryCount: 0,
                },
            });
            return { sourceSlug: config.slug, success: false, recordCount: 0, latencyMs: 0, error: errorMessage, errorType: 'AUTH_MISSING' };
        }
    }

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        retryCount = attempt;
        try {
            // Fetch
            const fetchResult = await plugin.fetchSample(geo);

            // Normalize
            const normalized: MetricSeriesInput[] = plugin.normalize(fetchResult.data);

            // Upsert source config FIRST (FK target for IngestionLog + MetricSeries)
            await prisma.sourceConfig.upsert({
                where: { slug: config.slug },
                update: {
                    lastStatus: 'green',
                    lastRunAt: new Date(),
                    lastError: null,
                    lastLatencyMs: fetchResult.latencyMs,
                },
                create: {
                    slug: config.slug,
                    name: config.name,
                    tier: config.tier,
                    docsUrl: config.docsUrl,
                    authType: config.authType,
                    authEnvVar: config.authEnvVar,
                    rateLimitNotes: config.rateLimitNotes,
                    licence: config.licence,
                    lastStatus: 'green',
                    lastRunAt: new Date(),
                    lastLatencyMs: fetchResult.latencyMs,
                },
            });

            // Persist ingestion log
            await prisma.ingestionLog.create({
                data: {
                    sourceSlug: config.slug,
                    jobRunId,
                    httpStatus: fetchResult.httpStatus,
                    latencyMs: fetchResult.latencyMs,
                    rawPayload: fetchResult.truncatedPayload,
                    recordCount: normalized.length,
                    retryCount: attempt,
                },
            });

            // Persist normalized records
            if (normalized.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const records = normalized.map(m => ({
                    metricKey: m.metricKey,
                    sourceSlug: m.sourceSlug,
                    geoType: m.geoType,
                    geoCode: m.geoCode,
                    periodStart: m.periodStart,
                    periodEnd: m.periodEnd,
                    value: m.value,
                    unit: m.unit,
                    metadata: JSON.parse(JSON.stringify(m.metadata)),
                    jobRunId,
                }));
                await prisma.metricSeries.createMany({
                    data: records,
                });
            }

            return {
                sourceSlug: config.slug,
                success: true,
                recordCount: normalized.length,
                latencyMs: fetchResult.latencyMs,
            };
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));

            if (attempt < MAX_RETRIES) {
                const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
                await sleep(backoff);
            }
        }
    }

    // All retries exhausted
    const errorType = classifyError(lastError);
    const errorMessage = lastError?.message ?? 'Unknown error';

    await prisma.sourceConfig.upsert({
        where: { slug: config.slug },
        update: {
            lastStatus: 'red',
            lastRunAt: new Date(),
            lastError: errorMessage.substring(0, 500),
        },
        create: {
            slug: config.slug,
            name: config.name,
            tier: config.tier,
            docsUrl: config.docsUrl,
            authType: config.authType,
            authEnvVar: config.authEnvVar,
            rateLimitNotes: config.rateLimitNotes,
            licence: config.licence,
            lastStatus: 'red',
            lastRunAt: new Date(),
            lastError: errorMessage.substring(0, 500),
        },
    });

    await prisma.ingestionLog.create({
        data: {
            sourceSlug: config.slug,
            jobRunId,
            errorType,
            errorMessage: errorMessage.substring(0, 2000),
            retryCount,
        },
    });

    return {
        sourceSlug: config.slug,
        success: false,
        recordCount: 0,
        latencyMs: 0,
        error: errorMessage,
        errorType,
    };
}

export async function runAll(
    plugins: IntegrationPlugin[],
    geo: GeoQuery,
): Promise<RunResult[]> {
    const results: RunResult[] = [];
    // Run sequentially to respect rate limits
    for (const plugin of plugins) {
        const result = await runIntegration(plugin, geo);
        results.push(result);
    }
    return results;
}
