"use client";

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';

export const RANKING_METRICS = [
    { key: 'recycling_rate_pct', label: 'Recycling Rate', unit: '%' },
    { key: 'air_quality_pm10', label: 'Air Quality (PM10)', unit: 'µg/m³' },
    { key: 'electricity_consumption_gwh', label: 'Electricity Consumption', unit: 'GWh' },
    { key: 'gas_consumption_gwh', label: 'Gas Consumption', unit: 'GWh' },
    { key: 'waste_generated_tonnes', label: 'Waste Generated', unit: 'tonnes' },
    { key: 'waste_landfilled_tonnes', label: 'Waste Landfilled', unit: 'tonnes' },
    { key: 'ev_charger_count', label: 'Public EV Chargers', unit: 'locations' },
    { key: 'solar_radiation', label: 'Solar Potential', unit: 'MJ/m²' },
    { key: 'osm_greenspace_total', label: 'Green Features', unit: 'Count' },
];

export function TrendViewer({ councilCode }: { councilCode: string }) {
    const [selectedMetric, setSelectedMetric] = useState(RANKING_METRICS[0].key);
    const [data, setData] = useState<Array<{ periodStart: string; value: number }>>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        async function fetchHistory() {
            setLoading(true);
            try {
                const res = await fetch(`/api/metrics?geoCode=${councilCode}&metricKey=${selectedMetric}&format=minimal&years=10`);
                if (res.ok) {
                    const json = await res.json();

                    // Group and format the history points. 
                    // If multiple points exist per year (e.g. daily climate), just take the yearly average to keep the chart clean,
                    // or just plot them all if it's a small dataset like Annual Waste.
                    const formatted = (json.history || []).map((d: any) => ({
                        dateRaw: new Date(d.periodStart),
                        label: new Date(d.periodStart).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
                        value: d.value,
                    }));

                    // Deduplicate by label (e.g. if we have 5 runs from 'Mar 2026', just keep the latest)
                    const uniqueLabels = new Map();
                    for (const item of formatted) {
                        uniqueLabels.set(item.label, item);
                    }
                    const deduplicated = Array.from(uniqueLabels.values());

                    // Sort strictly chronologically
                    deduplicated.sort((a: { dateRaw: Date }, b: { dateRaw: Date }) => a.dateRaw.getTime() - b.dateRaw.getTime());

                    // If there's only 1 data point, duplicate it to "Today" so Recharts can draw a flat line visibly
                    if (deduplicated.length === 1) {
                        const today = new Date();
                        if (today.getTime() - deduplicated[0].dateRaw.getTime() > 86400000) {
                            deduplicated.push({
                                ...deduplicated[0],
                                dateRaw: today,
                                label: 'Today',
                            });
                        }
                    }

                    setData(deduplicated);
                }
            } catch (err) {
                console.error("Failed to load historical trends", err);
            } finally {
                setLoading(false);
            }
        }
        fetchHistory();
    }, [councilCode, selectedMetric]);

    const activeMetricMeta = RANKING_METRICS.find(m => m.key === selectedMetric);

    return (
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px var(--shadow-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Historical Trend Tracker</h3>
                <select
                    value={selectedMetric}
                    onChange={e => setSelectedMetric(e.target.value)}
                    className="form-select"
                    style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                    {RANKING_METRICS.map(m => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                </select>
            </div>

            <div style={{ width: '100%', height: 300, position: 'relative' }}>
                {loading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.1)', zIndex: 10, borderRadius: '8px' }}>
                        <Loader2 className="spinner" size={32} style={{ color: 'var(--primary-color)' }} />
                    </div>
                )}

                {data.length === 0 && !loading ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        <p>No historical data recorded for this metric yet.</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                            <XAxis
                                dataKey="label"
                                stroke="var(--text-muted)"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke="var(--text-muted)"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                                formatter={(value: any) => [`${Number(value)} ${activeMetricMeta?.unit}`, activeMetricMeta?.label]}
                            />
                            <Line
                                type="monotone"
                                dataKey="value"
                                stroke="var(--accent-cyan)"
                                strokeWidth={3}
                                dot={{ r: 4, fill: "var(--bg-card)", strokeWidth: 2 }}
                                activeDot={{ r: 6 }}
                                animationDuration={1000}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
