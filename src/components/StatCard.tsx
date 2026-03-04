import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string | number | null;
    unit?: string;
    icon: LucideIcon;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    color?: string;
    lastUpdated?: string | null;
}

export function StatCard({ title, value, unit, icon: Icon, trend, trendValue, color = 'var(--accent-green)', lastUpdated }: StatCardProps) {
    const isNull = value === null || value === undefined;

    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '4px',
                height: '100%',
                background: color
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', margin: 0 }}>
                    {title}
                </h3>
                <div style={{
                    padding: '8px',
                    borderRadius: '8px',
                    background: `${color}15`,
                    color: color
                }}>
                    <Icon size={20} />
                </div>
            </div>

            <div>
                {isNull ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-muted)' }}>--</span>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {typeof value === 'number' ? value.toLocaleString() : value}
                        </span>
                        {unit && (
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                {unit}
                            </span>
                        )}
                    </div>
                )}

                {trendValue && !isNull && (
                    <div style={{
                        marginTop: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.75rem',
                        color: trend === 'up' ? 'var(--accent-red)' : trend === 'down' ? 'var(--accent-green)' : 'var(--text-muted)'
                    }}>
                        <span>{trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}</span>
                        <span>{trendValue}</span>
                    </div>
                )}

                {lastUpdated && (
                    <div style={{
                        marginTop: 'auto',
                        paddingTop: '0.75rem',
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                    }}>
                        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-blue)', opacity: 0.7 }}></span>
                        Updated: {new Date(lastUpdated).toLocaleDateString()} {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                )}
            </div>
        </div>
    );
}
