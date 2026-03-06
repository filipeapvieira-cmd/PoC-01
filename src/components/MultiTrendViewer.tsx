"use client";

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';

const TREND_METRICS = [
    { key: 'co2_total_kt', label: 'Total CO₂ Emissions', unit: 'kt CO₂e', color: 'var(--accent-red)' },
    { key: 'co2_per_capita_tonnes', label: 'CO₂ Per Capita', unit: 't CO₂e/person', color: 'var(--accent-orange)' },
    { key: 'electricity_consumption_gwh', label: 'Electricity Consumption', unit: 'GWh', color: 'var(--accent-yellow)' },
    { key: 'gas_consumption_gwh', label: 'Gas Consumption', unit: 'GWh', color: 'var(--accent-cyan)' },
    { key: 'population_thousands', label: 'Population', unit: 'thousands', color: 'var(--accent-purple)' },
];

export function MultiTrendViewer({ councilCode }: { councilCode: string }) {
    const [chartData, setChartData] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAllHistory() {
            setLoading(true);
            try {
                const fetchPromises = TREND_METRICS.map(m =>
                    fetch(`/api/metrics?geoCode=${councilCode}&metricKey=${m.key}&format=minimal&years=20`)
                        .then(res => res.json())
                        .then(json => ({ key: m.key, data: json.history || [] }))
                );

                const results = await Promise.all(fetchPromises);
                const newData: Record<string, any[]> = {};

                for (const result of results) {
                    const formatted = result.data.map((d: any) => ({
                        dateRaw: new Date(d.periodStart),
                        label: new Date(d.periodStart).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
                        value: d.value,
                    }));

                    const uniqueLabels = new Map();
                    for (const item of formatted) {
                        uniqueLabels.set(item.label, item);
                    }
                    const deduplicated = Array.from(uniqueLabels.values());

                    // Sort chronologically
                    deduplicated.sort((a: any, b: any) => a.dateRaw.getTime() - b.dateRaw.getTime());
                    newData[result.key] = deduplicated;
                }

                setChartData(newData);
            } catch (err) {
                console.error("Failed to load historical trends", err);
            } finally {
                setLoading(false);
            }
        }
        fetchAllHistory();
    }, [councilCode]);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', width: '100%' }}>
            {TREND_METRICS.map(metric => {
                const data = chartData[metric.key] || [];

                return (
                    <div key={metric.key} style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px var(--shadow-color)', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{metric.label}</h3>
                        <div style={{ flex: 1, minHeight: 250, position: 'relative' }}>
                            {loading && (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-card)', zIndex: 10 }}>
                                    <Loader2 className="spinner" size={24} style={{ color: 'var(--text-muted)' }} />
                                </div>
                            )}

                            {!loading && data.length === 0 ? (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    No data available
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                        <XAxis
                                            dataKey="label"
                                            stroke="var(--text-muted)"
                                            fontSize={11}
                                            tickLine={false}
                                            axisLine={false}
                                            minTickGap={30}
                                        />
                                        <YAxis
                                            stroke="var(--text-muted)"
                                            fontSize={11}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                                            domain={['auto', 'auto']}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem' }}
                                            formatter={(value: any) => [`${Number(value).toLocaleString()} ${metric.unit}`, metric.label]}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke={metric.color}
                                            strokeWidth={3}
                                            dot={{ r: 3, fill: "var(--bg-card)", strokeWidth: 2 }}
                                            activeDot={{ r: 5 }}
                                            animationDuration={1000}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
