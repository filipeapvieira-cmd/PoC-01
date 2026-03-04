import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// What AQI metric keys exist?
const r1 = await pool.query(`
  SELECT "metricKey", "geoCode", "geoType", "unit",
         (metadata::json->>'stationName') as station,
         AVG(value) as avg_value, COUNT(*) as cnt
  FROM "MetricSeries"
  WHERE "sourceSlug" = 'scottish-air-quality'
    AND "metricKey" != 'scottish_air_stations_count'
  GROUP BY "metricKey", "geoCode", "geoType", "unit", (metadata::json->>'stationName')
  ORDER BY "metricKey", cnt DESC
  LIMIT 40
`);
console.log('=== AQI Metrics ===');
console.table(r1.rows);

// What's the ingestion log status?
const r2 = await pool.query(`
  SELECT "sourceSlug", "lastRunAt", "lastStatus", "lastLatencyMs"
  FROM "SourceConfig"
  ORDER BY "lastRunAt" DESC NULLS LAST
  LIMIT 10
`);
console.log('\n=== Source last-run status ===');
console.table(r2.rows);

await pool.end();
