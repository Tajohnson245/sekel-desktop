import { useState, useEffect, useCallback } from 'react';
import { ShieldOff, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import type { MetricSnapshot } from '@sekel/observability';
import './AdminDashboard.css';

export default function AdminDashboard() {
    const { user } = useAuthStore();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [snapshot, setSnapshot] = useState<MetricSnapshot | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    useEffect(() => {
        if (user?.email) {
            window.electronAPI.obs.isAdmin(user.email).then(setIsAdmin);
        } else {
            setIsAdmin(false);
        }
    }, [user?.email]);

    const refresh = useCallback(async () => {
        const data = await window.electronAPI.obs.getMetrics();
        setSnapshot(data);
        setLastRefresh(new Date());
    }, []);

    useEffect(() => {
        if (isAdmin) refresh();
    }, [isAdmin, refresh]);

    // Auto-refresh every 10 seconds
    useEffect(() => {
        if (!isAdmin) return;
        const id = setInterval(refresh, 10_000);
        return () => clearInterval(id);
    }, [isAdmin, refresh]);

    if (isAdmin === null) return null;

    if (!isAdmin) {
        return (
            <div className="admin-denied">
                <ShieldOff size={48} className="admin-denied__icon" />
                <h2>Access Denied</h2>
                <p>This page is restricted to admin users.</p>
            </div>
        );
    }

    const counters = snapshot ? Object.entries(snapshot.counters).sort(([a], [b]) => a.localeCompare(b)) : [];
    const timers   = snapshot ? Object.entries(snapshot.timers).sort(([a], [b]) => a.localeCompare(b)) : [];
    const gauges   = snapshot ? Object.entries(snapshot.gauges).sort(([a], [b]) => a.localeCompare(b)) : [];

    return (
        <div className="admin-dashboard">
            <div className="page-header">
                <h2>Diagnostics</h2>
                <p>Live observability metrics from the main process</p>
            </div>

            <div className="admin-toolbar">
                <span className="admin-toolbar__info">
                    {lastRefresh ? `Last refreshed: ${lastRefresh.toLocaleTimeString()}` : 'Loading...'}
                    {' \u00B7 '}Auto-refreshes every 10s
                </span>
                <button className="btn btn-secondary" onClick={refresh}>
                    <RefreshCw size={14} />
                    Refresh
                </button>
            </div>

            {/* ── Counters ────────────────────────────────────────────── */}
            <section className="admin-section">
                <h3 className="admin-section__title">Counters</h3>
                {counters.length === 0 ? (
                    <p className="admin-empty">No counter metrics recorded yet.</p>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Metric</th>
                                <th style={{ textAlign: 'right' }}>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {counters.map(([name, value]) => (
                                <tr key={name}>
                                    <td className="metric-name">{name}</td>
                                    <td className="metric-value">{value.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            {/* ── Timers ──────────────────────────────────────────────── */}
            <section className="admin-section">
                <h3 className="admin-section__title">Timers</h3>
                {timers.length === 0 ? (
                    <p className="admin-empty">No timer metrics recorded yet.</p>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Metric</th>
                                <th style={{ textAlign: 'right' }}>Calls</th>
                                <th style={{ textAlign: 'right' }}>Avg (ms)</th>
                                <th style={{ textAlign: 'right' }}>Max (ms)</th>
                                <th style={{ textAlign: 'right' }}>Total (ms)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {timers.map(([name, t]) => (
                                <tr key={name}>
                                    <td className="metric-name">{name}</td>
                                    <td className="metric-value">{t.count.toLocaleString()}</td>
                                    <td className="metric-avg">
                                        {t.count > 0 ? Math.round(t.totalMs / t.count).toLocaleString() : '—'}
                                    </td>
                                    <td className="metric-max">{Math.round(t.maxMs).toLocaleString()}</td>
                                    <td className="metric-value">{Math.round(t.totalMs).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            {/* ── Gauges ──────────────────────────────────────────────── */}
            {gauges.length > 0 && (
                <section className="admin-section">
                    <h3 className="admin-section__title">Gauges</h3>
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Metric</th>
                                <th style={{ textAlign: 'right' }}>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gauges.map(([name, value]) => (
                                <tr key={name}>
                                    <td className="metric-name">{name}</td>
                                    <td className="metric-value">{value.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
}
