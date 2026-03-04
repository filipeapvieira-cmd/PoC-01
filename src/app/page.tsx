'use client';

import { useEffect, useState } from 'react';
import { SCOTTISH_COUNCILS } from '@/lib/councils';
import { StatCard } from '@/components/StatCard';
import { ChartWidget } from '@/components/ChartWidget';
import { TrendViewer } from '@/components/TrendViewer';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart,
} from 'recharts';
import { Leaf, Recycle, ShieldCheck, Zap, Bike, Wind } from 'lucide-react';
import Link from 'next/link';

interface DashboardData {
  councilCode: string;
  councilName: string;
  kpis: {
    greenspace: { value: number; unit: string; lastUpdated?: string | null } | null;
    recycling: { value: number; unit: string; lastUpdated?: string | null } | null;
    cycling: { value: number; unit: string; lastUpdated?: string | null } | null;
    protectedAreas: { value: number; unit: string; lastUpdated?: string | null } | null;
    carbonIntensity: { value: number; unit: string; lastUpdated?: string | null } | null;
    aqi: { value: number; unit: string; lastUpdated?: string | null } | null;
    energyElec: { value: number; unit: string; lastUpdated?: string | null } | null;
    energyGas: { value: number; unit: string; lastUpdated?: string | null } | null;
    evChargers: { value: number; unit: string; lastUpdated?: string | null } | null;
  };
  greenspaceBreakdown: Array<{ type: string; value: number; unit: string }>;
  wasteLifecycle: Array<{ stage: string; value: number }>;
  generationMix: Array<{ fuel: string; rawFuel: string; value: number }>;
  climateTrends: Array<{
    date: string;
    mean_temperature?: number;
    total_precipitation?: number;
    solar_radiation?: number;
    max_wind_gust?: number;
    national_wind_mw?: number;
    national_solar_mw?: number;
  }>;
}

const GENERATION_COLORS: Record<string, string> = {
  WIND: '#10b981', SOLAR: '#f59e0b', NPSHYD: '#3b82f6',
  NUCLEAR: '#8b5cf6', BIOMASS: '#84cc16', CCGT: '#f43f5e',
  OCGT: '#fb923c', COAL: '#3f3f46', OIL: '#78716c', OTHER: '#94a3b8',
  INTFR: '#64748b', INTNED: '#64748b', INTIFA2: '#64748b',
  INTELEC: '#64748b', INTNEM: '#64748b', INTNSL: '#64748b', INTVKL: '#64748b',
};

// Colors for the Greenspace & Transport Breakdown
const BREAKDOWN_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#84cc16', '#06b6d4', '#eab308'];

export default function Dashboard() {
  const [selectedCouncil, setSelectedCouncil] = useState('S12000049');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard?council=${selectedCouncil}`);
        if (res.ok) setData(await res.json());
      } catch (e) {
        console.error('Dashboard fetch error', e);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [selectedCouncil]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });

  return (
    <main className="page" style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Council Sustainability Snapshot</h1>
          <p className="page-subtitle">Live, aggregated environmental indicators mapped to local communities.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/rankings" className="btn btn-secondary btn-sm">🏆 Rankings</Link>
          <select
            className="form-select"
            value={selectedCouncil}
            onChange={e => setSelectedCouncil(e.target.value)}
            style={{ padding: '0.75rem 1rem', fontSize: '1rem', borderRadius: '8px', minWidth: '250px' }}
          >
            {SCOTTISH_COUNCILS.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem' }} />
          <p>Aggregating local indicators...</p>
        </div>
      ) : data ? (
        <>
          {/* ── KPI Cards Row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
            <StatCard title="Air Quality (PM10)" value={data.kpis.aqi?.value ?? null} unit={data.kpis.aqi?.unit ?? 'µg/m³'} icon={Wind} color="#0ea5e9" lastUpdated={data.kpis.aqi?.lastUpdated} />
            <StatCard title="Household Recycling" value={data.kpis.recycling?.value ?? null} unit="%" icon={Recycle} color="#3b82f6"
              trendValue={data.kpis.recycling ? 'Scotland 2021-22 data' : undefined} trend="neutral" lastUpdated={data.kpis.recycling?.lastUpdated} />
            <StatCard title="Urban Greenspace" value={data.kpis.greenspace?.value ?? null} unit="green features" icon={Leaf} color="#10b981" lastUpdated={data.kpis.greenspace?.lastUpdated} />
            <StatCard title="Cycling Routes (OSM)" value={data.kpis.cycling?.value ?? null} unit="routes" icon={Bike} color="#06b6d4" lastUpdated={data.kpis.cycling?.lastUpdated} />
            <StatCard title="Protected Nature Sites" value={data.kpis.protectedAreas?.value ?? null} unit="SSSI datasets" icon={ShieldCheck} color="#8b5cf6" lastUpdated={data.kpis.protectedAreas?.lastUpdated} />
            <StatCard title="Regional Grid Intensity" value={data.kpis.carbonIntensity?.value ?? null} unit="gCO₂/kWh" icon={Zap} color="#f59e0b" lastUpdated={data.kpis.carbonIntensity?.lastUpdated} />
            <StatCard title="Public EV Chargers" value={data.kpis.evChargers?.value ?? null} unit="stations" icon={Zap} color="#84cc16" lastUpdated={data.kpis.evChargers?.lastUpdated} />
            <StatCard title="Electricity Use" value={data.kpis.energyElec?.value ?? null} unit="GWh" icon={Zap} color="#eab308" lastUpdated={data.kpis.energyElec?.lastUpdated} />
            <StatCard title="Gas Use" value={data.kpis.energyGas?.value ?? null} unit="GWh" icon={Zap} color="#f43f5e" lastUpdated={data.kpis.energyGas?.lastUpdated} />
          </div>

          {/* ── Charts Row 1: Climate + Generation Mix ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <ChartWidget title="Local Climate Trends (7 Days)">
              {data.climateTrends?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.climateTrends} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="date" tickFormatter={(d) => formatDate(String(d))} stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="temp" orientation="left" stroke="#f43f5e" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${v}°`} />
                    <YAxis yAxisId="rain" orientation="right" stroke="#3b82f6" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${v}mm`} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                      labelFormatter={(label) => formatDate(String(label))}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar yAxisId="rain" dataKey="total_precipitation" name="Precipitation (mm)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                    <Line yAxisId="temp" type="monotone" dataKey="mean_temperature" name="Avg Temp (°C)" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No recent climate data</div>
              )}
            </ChartWidget>

            <ChartWidget title="Live National Generation Mix">
              {data.generationMix?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.generationMix}
                      cx="50%" cy="50%"
                      innerRadius={80} outerRadius={120}
                      paddingAngle={2}
                      dataKey="value" nameKey="fuel"
                      label={({ percent }) => (percent ?? 0) > 0.05 ? `${((percent ?? 0) * 100).toFixed(0)}%` : ''}
                      labelLine={false}
                    >
                      {data.generationMix.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={GENERATION_COLORS[entry.rawFuel] ?? GENERATION_COLORS.OTHER} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`${Number(value).toLocaleString()} MW`, 'Generation']}
                      contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    />
                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No live grid data</div>
              )}
            </ChartWidget>
          </div>

          <div style={{ marginBottom: '1.5rem', height: '350px' }}>
            <ChartWidget title={`Renewables Potential: Local Weather vs. National Generation (${data.councilName})`}>
              {data.climateTrends?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.climateTrends} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="date" tickFormatter={(d) => formatDate(String(d))} stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="natl" orientation="left" stroke="#10b981" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(1)}GW`} />
                    <YAxis yAxisId="local" orientation="right" stroke="#8b5cf6" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${v}`} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                      labelFormatter={(label) => formatDate(String(label))}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    {/* National Generation (Bars) */}
                    <Bar yAxisId="natl" dataKey="national_wind_mw" name="National Wind (MW)" fill="#10b981" barSize={15} stackId="a" />
                    <Bar yAxisId="natl" dataKey="national_solar_mw" name="National Solar (MW)" fill="#f59e0b" barSize={15} stackId="a" radius={[4, 4, 0, 0]} />
                    {/* Local Weather Potential (Lines) */}
                    <Line yAxisId="local" type="monotone" dataKey="max_wind_gust" name="Local Wind Gust (km/h)" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="local" type="monotone" dataKey="solar_radiation" name="Local Solar (MJ/m²)" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No recent renewables data</div>
              )}
            </ChartWidget>
          </div>

          {/* ── Historical Trend Viewer ── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <TrendViewer councilCode={selectedCouncil} />
          </div>

          {/* ── Charts Row 2: Waste & Greenspace ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <ChartWidget title={`Household Waste Lifecycle (2021-22) — ${data.councilName}`}>
              {data.wasteLifecycle?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.wasteLifecycle} margin={{ top: 20, right: 30, left: 0, bottom: 20 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                    <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="stage" type="category" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} width={80} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                      formatter={(v, name, props) => [`${Number(v).toLocaleString()} tonnes`, name]}
                    />
                    <Bar dataKey="value" name="Tonnage" radius={[0, 4, 4, 0]} barSize={32}>
                      {data.wasteLifecycle.map((entry, index) => (
                        <Cell key={`wc-${index}`} fill={entry.stage === 'Recycled' ? '#10b981' : entry.stage === 'Landfilled' ? '#ef4444' : '#64748b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No waste data</div>
              )}
            </ChartWidget>
            {data.greenspaceBreakdown?.length > 0 && (
              <ChartWidget title={`Green & Transport Infrastructure Breakdown — ${data.councilName}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.greenspaceBreakdown} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="type" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                      formatter={(v, name, props) => [`${Number(v).toLocaleString()} ${props.payload?.unit ?? ''}`, name]}
                    />
                    <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]} barSize={48}>
                      {data.greenspaceBreakdown.map((_, index) => (
                        <Cell key={`bc-${index}`} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartWidget>
            )}
          </div>
        </>
      ) : null}

      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { 100% { transform: rotate(360deg); } }` }} />
    </main>
  );
}
