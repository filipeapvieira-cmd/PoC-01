-- CreateTable
CREATE TABLE "SourceConfig" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'A',
    "docsUrl" TEXT NOT NULL DEFAULT '',
    "authType" TEXT NOT NULL DEFAULT 'none',
    "authEnvVar" TEXT,
    "rateLimitNotes" TEXT NOT NULL DEFAULT '',
    "licence" TEXT NOT NULL DEFAULT 'unspecified',
    "lastStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastLatencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionLog" (
    "id" TEXT NOT NULL,
    "sourceSlug" TEXT NOT NULL,
    "jobRunId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "httpStatus" INTEGER,
    "latencyMs" INTEGER,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "rawPayload" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSeries" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "sourceSlug" TEXT NOT NULL,
    "geoType" TEXT NOT NULL,
    "geoCode" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "jobRunId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceConfig_slug_key" ON "SourceConfig"("slug");

-- CreateIndex
CREATE INDEX "MetricSeries_sourceSlug_idx" ON "MetricSeries"("sourceSlug");

-- CreateIndex
CREATE INDEX "MetricSeries_metricKey_idx" ON "MetricSeries"("metricKey");

-- CreateIndex
CREATE INDEX "MetricSeries_geoCode_idx" ON "MetricSeries"("geoCode");

-- CreateIndex
CREATE INDEX "MetricSeries_periodStart_periodEnd_idx" ON "MetricSeries"("periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "IngestionLog" ADD CONSTRAINT "IngestionLog_sourceSlug_fkey" FOREIGN KEY ("sourceSlug") REFERENCES "SourceConfig"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSeries" ADD CONSTRAINT "MetricSeries_sourceSlug_fkey" FOREIGN KEY ("sourceSlug") REFERENCES "SourceConfig"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
