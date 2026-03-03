# Community Sustainability Platform (CSP) — MVP

API integration discovery & validation platform connecting to 10 public sustainability-related data sources for Scotland. Built with Next.js, TypeScript, PostgreSQL, and Prisma.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# 3. Create the database and run migrations
npx prisma migrate dev

# 4. Start the dev server
npm run dev

# 5. Open http://localhost:3000/integrations
```

## Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ELEXON_API_KEY` | ❌ | Free key from [elexon.co.uk](https://www.elexon.co.uk/) |
| `OPENCHARGE_API_KEY` | ❌ | Free key from [openchargemap.org](https://openchargemap.org/) |

## Integrated Sources

### Tier A (Core — 7 sources)

| # | Source | Auth | Status |
|---|--------|------|--------|
| 1 | **Carbon Intensity API** — Regional carbon intensity + generation mix | None | ✅ Working |
| 2 | **statistics.gov.scot SPARQL** — Population estimates by council area | None | ✅ Working |
| 3 | **Scottish Air Quality** — Monitoring station pollutant readings | None | ✅ Working |
| 4 | **Overpass API (OSM)** — Greenspace/parks count in Edinburgh | None | ✅ Working |
| 5 | **NatureScot ArcGIS** — SSSI protected areas count + features | None | ✅ Working |
| 6 | **SEPA Waste Data** — Household waste & recycling rates by council | None | ✅ Working |
| 7 | **Elexon BMRS** — GB electricity generation mix by fuel type | API Key | 🔑 Needs key |

### Tier B (Stretch — 3 sources)

| # | Source | Auth | Status |
|---|--------|------|--------|
| 8 | **ONS Beta API** — UK national statistics dataset discovery | None | ✅ Working |
| 9 | **NESO CKAN** — Energy dataset search & discovery | None | ✅ Working |
| 10 | **OpenChargeMap** — EV charging stations near Edinburgh | API Key | 🔑 Needs key |

## Pages

- **`/integrations`** — Health dashboard with status for all sources
- **`/integrations/[source]`** — Detail page with raw payload + normalized data preview
- **`/metrics`** — Query normalized metrics with filters and chart
- **`/admin/run`** — Trigger ingestion for one or all sources

## Architecture

### Data Model

- **`MetricSeries`** — Canonical normalized data (metric_key, geo_type, geo_code, period, value, unit, metadata)
- **`IngestionLog`** — Per-run tracking (http_status, latency, errors, raw payload)
- **`SourceConfig`** — Source health state (last_status, last_run, last_error)

### Integration Plugin Pattern

Each source implements `IntegrationPlugin`:
```typescript
interface IntegrationPlugin {
  getConfig(): IntegrationConfig;
  fetchSample(geo: GeoQuery): Promise<RawFetchResult>;
  normalize(raw: unknown): MetricSeriesInput[];
}
```

New sources added by creating a module in `src/lib/integrations/` and registering in `registry.ts`.

### Job Runner

- Retry with exponential backoff (max 3 attempts)
- Error taxonomy: `AUTH_MISSING`, `RATE_LIMITED`, `INVALID_RESPONSE`, `PARSE_ERROR`, `UPSTREAM_DOWN`, `TIMEOUT`
- Raw payload truncation (50KB max)
- Attribution/licence stored per record

## Known Limitations

- **MVP focus**: API validation, not polished UX
- **Elexon & OpenChargeMap** require free API key registration
- **SEPA Waste**: CSV URL may change; includes fallback sample data
- **Overpass**: Heavy rate limits; queries limited to Edinburgh bounding box
- **NatureScot**: ArcGIS may limit to 1000 features per query
- **statistics.gov.scot**: SPARQL queries can be slow
- **No scheduled ingestion** yet — manual trigger only via Admin page

## Next Steps

- Add more SPARQL queries for statistics.gov.scot (recycling, deprivation, emissions)
- Add scheduled ingestion (cron)
- Expand Overpass queries to more council areas
- Add DEFRA UK-AIR SOS integration
- Add Traffic Scotland / Network Rail (pending API access)
- Improve chart visualizations with Recharts
- Add data export (CSV/JSON)

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL via Prisma
- **Validation**: Zod
- **Styling**: Vanilla CSS (dark theme)
