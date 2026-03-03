import { z } from 'zod';

export const GeoQuerySchema = z.object({
    geoType: z.string().min(1),
    geoCode: z.string().min(1),
    geoName: z.string().optional(),
});

export const MetricSeriesInputSchema = z.object({
    metricKey: z.string().min(1),
    sourceSlug: z.string().min(1),
    geoType: z.string().min(1),
    geoCode: z.string().min(1),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    value: z.number(),
    unit: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).default({}),
});

export const IntegrationConfigSchema = z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    docsUrl: z.string().url(),
    authType: z.enum(['none', 'api_key', 'pending_approval']),
    authEnvVar: z.string().optional(),
    rateLimitNotes: z.string(),
    licence: z.string(),
    tier: z.enum(['A', 'B']),
    sampleRequest: z.string(),
    fieldMapping: z.string(),
});

export const RunRequestSchema = z.object({
    source: z.string().optional(),
    geoType: z.string().default('council'),
    geoCode: z.string().default('S12000036'), // City of Edinburgh
    geoName: z.string().default('City of Edinburgh'),
});

export const MetricsQuerySchema = z.object({
    geoCode: z.string().optional(),
    metricKey: z.string().optional(),
    sourceSlug: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().min(1).max(500).default(100),
});

export type GeoQueryInput = z.infer<typeof GeoQuerySchema>;
export type MetricSeriesInputType = z.infer<typeof MetricSeriesInputSchema>;
export type RunRequest = z.infer<typeof RunRequestSchema>;
export type MetricsQuery = z.infer<typeof MetricsQuerySchema>;
