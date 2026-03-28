import { useState, useEffect, useCallback } from 'react';
import { ShieldOff, RefreshCw, ArrowLeft, Users, MessageSquare, Activity, BarChart3 } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Tabs, TabList, Tab, TabPanel } from '../UI';
import { useAuthStore } from '../../stores/authStore';
import type { MetricSnapshot } from '@sekel/observability';
import type { AdminOverview, AdminUserRow, AdminUserDetail } from '../../ipc/admin';
import type { Feedback } from '@sekel/db';
import './AdminDashboard.css';

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ email }: { email: string }) {
    const [overview, setOverview] = useState<AdminOverview | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        window.electronAPI.admin.getOverview(email)
            .then(setOverview)
            .catch(() => setOverview(null))
            .finally(() => setLoading(false));
    }, [email]);

    if (loading) return <p className="admin-empty">Loading overview...</p>;
    if (!overview) return <p className="admin-empty">Failed to load overview. Check service role key.</p>;

    return (
        <div className="admin-tab-content">
            <div className="admin-stat-grid">
                <StatCard label="Total Users" value={overview.totalUsers} />
                <StatCard label="Active Today" value={overview.activeToday} />
                <StatCard label="Active (7d)" value={overview.activeLast7Days} />
                <StatCard label="Active (30d)" value={overview.activeLast30Days} />
                <StatCard label="Total Decks" value={overview.totalDecks} />
                <StatCard label="Total Cards" value={overview.totalCards} />
                <StatCard label="Total Reviews" value={overview.totalReviews} />
                <StatCard label="Feedback" value={overview.totalFeedback} />
            </div>

            {overview.reviewsByDay.length > 0 && (
                <section className="admin-section">
                    <h3 className="admin-section__title">Reviews (Last 30 Days)</h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={overview.reviewsByDay} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="date" stroke="var(--muted)" tick={{ fontSize: 11 }}
                                tickFormatter={(d) => d.slice(5)} />
                            <YAxis stroke="var(--muted)" tick={{ fontSize: 12 }} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }} />
                            <Bar dataKey="count" fill="var(--teal)" radius={[3, 3, 0, 0]} name="Reviews" />
                        </BarChart>
                    </ResponsiveContainer>
                </section>
            )}

            {overview.signupsByDay.length > 0 && (
                <section className="admin-section">
                    <h3 className="admin-section__title">New Signups (Last 30 Days)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={overview.signupsByDay} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="date" stroke="var(--muted)" tick={{ fontSize: 11 }}
                                tickFormatter={(d) => d.slice(5)} />
                            <YAxis stroke="var(--muted)" tick={{ fontSize: 12 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }} />
                            <Line type="monotone" dataKey="count" stroke="var(--violet)" strokeWidth={2}
                                dot={{ r: 3 }} name="Signups" />
                        </LineChart>
                    </ResponsiveContainer>
                </section>
            )}
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: number }) {
    return (
        <div className="admin-stat-card">
            <span className="admin-stat-card__value">{value.toLocaleString()}</span>
            <span className="admin-stat-card__label">{label}</span>
        </div>
    );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab({ email }: { email: string }) {
    const [users, setUsers] = useState<AdminUserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        window.electronAPI.admin.getUsers(email)
            .then(setUsers)
            .catch(() => setUsers([]))
            .finally(() => setLoading(false));
    }, [email]);

    if (selectedUser) {
        return <UserDetailView email={email} userId={selectedUser} onBack={() => setSelectedUser(null)} />;
    }

    if (loading) return <p className="admin-empty">Loading users...</p>;
    if (users.length === 0) return <p className="admin-empty">No users found.</p>;

    return (
        <div className="admin-tab-content">
            <table className="admin-table admin-table--clickable">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>School</th>
                        <th>Exam</th>
                        <th style={{ textAlign: 'right' }}>Decks</th>
                        <th style={{ textAlign: 'right' }}>Cards</th>
                        <th style={{ textAlign: 'right' }}>Reviews</th>
                        <th>Last Active</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(u => (
                        <tr key={u.id} onClick={() => setSelectedUser(u.id)}>
                            <td>
                                <div className="admin-user-cell">
                                    <span className="admin-user-cell__name">
                                        {u.first_name || u.last_name
                                            ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
                                            : 'No name'}
                                    </span>
                                    <span className="admin-user-cell__email">{u.email ?? '—'}</span>
                                </div>
                            </td>
                            <td>{u.medical_school ?? '—'}</td>
                            <td>{u.exam ?? '—'}</td>
                            <td className="metric-value">{u.deck_count}</td>
                            <td className="metric-value">{u.card_count.toLocaleString()}</td>
                            <td className="metric-value">{u.review_count.toLocaleString()}</td>
                            <td className="admin-date">
                                {u.last_review_at
                                    ? new Date(u.last_review_at).toLocaleDateString()
                                    : u.last_sign_in_at
                                    ? new Date(u.last_sign_in_at).toLocaleDateString()
                                    : '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── User Detail View ──────────────────────────────────────────────────────────

function UserDetailView({ email, userId, onBack }: { email: string; userId: string; onBack: () => void }) {
    const [detail, setDetail] = useState<AdminUserDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        window.electronAPI.admin.getUserDetail(email, userId)
            .then(setDetail)
            .catch(() => setDetail(null))
            .finally(() => setLoading(false));
    }, [email, userId]);

    if (loading) return <p className="admin-empty">Loading user details...</p>;
    if (!detail) return <p className="admin-empty">Failed to load user details.</p>;

    const profile = detail.profile as Record<string, unknown>;

    return (
        <div className="admin-tab-content">
            <button className="btn btn-secondary admin-back-btn" onClick={onBack}>
                <ArrowLeft size={14} /> Back to users
            </button>

            <div className="admin-user-header">
                <h3>{(profile.first_name as string) || (profile.last_name as string)
                    ? `${(profile.first_name as string) ?? ''} ${(profile.last_name as string) ?? ''}`.trim()
                    : 'Unknown User'}</h3>
                <span className="text-muted">{userId}</span>
            </div>

            <div className="admin-stat-grid">
                <StatCard label="Decks" value={detail.deckCount} />
                <StatCard label="Cards" value={detail.cardCount} />
                <StatCard label="Reviews" value={detail.reviewCount} />
                <StatCard label="Sessions" value={detail.sessionCount} />
            </div>

            <div className="admin-detail-grid">
                <div className="admin-detail-info">
                    <h4>Profile</h4>
                    <dl className="admin-dl">
                        <dt>Role</dt><dd>{(profile.role as string) ?? '—'}</dd>
                        <dt>School</dt><dd>{(profile.medical_school as string) ?? '—'}</dd>
                        <dt>Exam</dt><dd>{(profile.exam as string) ?? '—'}</dd>
                        <dt>Target Date</dt><dd>{(profile.target_date as string) ?? '—'}</dd>
                        <dt>Location</dt><dd>{(profile.location as string) ?? '—'}</dd>
                        <dt>Language</dt><dd>{(profile.language as string) ?? '—'}</dd>
                        <dt>Joined</dt><dd>{profile.created_at ? new Date(profile.created_at as string).toLocaleDateString() : '—'}</dd>
                    </dl>
                </div>

                {detail.decks.length > 0 && (
                    <div className="admin-detail-info">
                        <h4>Decks ({detail.decks.length})</h4>
                        <table className="admin-table admin-table--compact">
                            <thead><tr><th>Name</th><th style={{ textAlign: 'right' }}>Cards</th><th>Created</th></tr></thead>
                            <tbody>
                                {detail.decks.map(d => (
                                    <tr key={d.id}>
                                        <td>{d.name}</td>
                                        <td className="metric-value">{d.card_count}</td>
                                        <td className="admin-date">{new Date(d.created_at).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {detail.recentReviews.length > 0 && (
                <section className="admin-section">
                    <h3 className="admin-section__title">Review Activity (Last 30 Days)</h3>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={detail.recentReviews} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="date" stroke="var(--muted)" tick={{ fontSize: 11 }}
                                tickFormatter={(d) => d.slice(5)} />
                            <YAxis stroke="var(--muted)" tick={{ fontSize: 12 }} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
                                formatter={(v: number, name: string) =>
                                    name === 'retention' ? [`${v}%`, 'Retention'] : [v, 'Reviews']} />
                            <Bar dataKey="count" fill="var(--teal)" radius={[3, 3, 0, 0]} name="Reviews" />
                            <Line type="monotone" dataKey="retention" stroke="var(--amber)" strokeWidth={2}
                                dot={{ r: 2 }} name="retention" yAxisId="right" />
                        </BarChart>
                    </ResponsiveContainer>
                </section>
            )}

            {detail.feedback.length > 0 && (
                <section className="admin-section">
                    <h3 className="admin-section__title">Feedback ({detail.feedback.length})</h3>
                    {detail.feedback.map(f => (
                        <div key={f.id} className="admin-feedback-card">
                            <div className="admin-feedback-card__header">
                                <span className="admin-feedback-card__areas">{f.areas.join(', ')}</span>
                                <span className="admin-date">{new Date(f.created_at).toLocaleDateString()}</span>
                            </div>
                            <p>{f.description}</p>
                        </div>
                    ))}
                </section>
            )}
        </div>
    );
}

// ── Feedback Tab ──────────────────────────────────────────────────────────────

function FeedbackTab({ email }: { email: string }) {
    const [feedback, setFeedback] = useState<(Feedback & { user_email: string })[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        window.electronAPI.admin.getFeedback(email)
            .then(setFeedback)
            .catch(() => setFeedback([]))
            .finally(() => setLoading(false));
    }, [email]);

    if (loading) return <p className="admin-empty">Loading feedback...</p>;
    if (feedback.length === 0) return <p className="admin-empty">No feedback submitted yet.</p>;

    return (
        <div className="admin-tab-content">
            {feedback.map(f => (
                <div key={f.id} className="admin-feedback-card">
                    <div className="admin-feedback-card__header">
                        <span className="admin-feedback-card__user">{f.user_email}</span>
                        <span className="admin-feedback-card__areas">{f.areas.join(', ')}</span>
                        <span className="admin-date">{new Date(f.created_at).toLocaleDateString()}</span>
                    </div>
                    <p>{f.description}</p>
                    {f.desired_fix && (
                        <p className="admin-feedback-card__fix"><strong>Desired fix:</strong> {f.desired_fix}</p>
                    )}
                    {f.os && <span className="admin-feedback-card__os">{f.os}{f.mac_chip ? ` (${f.mac_chip})` : ''}</span>}
                </div>
            ))}
        </div>
    );
}

// ── Metrics Tab ───────────────────────────────────────────────────────────────

function MetricsTab() {
    const [snapshot, setSnapshot] = useState<MetricSnapshot | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const refresh = useCallback(async () => {
        const data = await window.electronAPI.obs.getMetrics();
        setSnapshot(data);
        setLastRefresh(new Date());
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        const id = setInterval(refresh, 10_000);
        return () => clearInterval(id);
    }, [refresh]);

    const counters = snapshot ? Object.entries(snapshot.counters).sort(([a], [b]) => a.localeCompare(b)) : [];
    const timers   = snapshot ? Object.entries(snapshot.timers).sort(([a], [b]) => a.localeCompare(b)) : [];
    const gauges   = snapshot ? Object.entries(snapshot.gauges).sort(([a], [b]) => a.localeCompare(b)) : [];

    return (
        <div className="admin-tab-content">
            <div className="admin-toolbar">
                <span className="admin-toolbar__info">
                    {lastRefresh ? `Last refreshed: ${lastRefresh.toLocaleTimeString()}` : 'Loading...'}
                    {' \u00B7 '}Auto-refreshes every 10s
                </span>
                <button className="btn btn-secondary" onClick={refresh}>
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            <section className="admin-section">
                <h3 className="admin-section__title">Counters</h3>
                {counters.length === 0 ? (
                    <p className="admin-empty">No counter metrics recorded yet.</p>
                ) : (
                    <table className="admin-table">
                        <thead><tr><th>Metric</th><th style={{ textAlign: 'right' }}>Value</th></tr></thead>
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

            {gauges.length > 0 && (
                <section className="admin-section">
                    <h3 className="admin-section__title">Gauges</h3>
                    <table className="admin-table">
                        <thead><tr><th>Metric</th><th style={{ textAlign: 'right' }}>Value</th></tr></thead>
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

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
    const { user } = useAuthStore();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

    useEffect(() => {
        if (user?.email) {
            window.electronAPI.obs.isAdmin(user.email).then(setIsAdmin);
        } else {
            setIsAdmin(false);
        }
    }, [user?.email]);

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

    const email = user!.email!;

    return (
        <div className="admin-dashboard">
            <div className="page-header">
                <h2>Admin Dashboard</h2>
                <p>User analytics, feedback, and system metrics</p>
            </div>

            <Tabs defaultTab="overview">
                <TabList>
                    <Tab id="overview"><BarChart3 size={14} /> Overview</Tab>
                    <Tab id="users"><Users size={14} /> Users</Tab>
                    <Tab id="feedback"><MessageSquare size={14} /> Feedback</Tab>
                    <Tab id="metrics"><Activity size={14} /> Metrics</Tab>
                </TabList>

                <TabPanel id="overview">
                    <OverviewTab email={email} />
                </TabPanel>
                <TabPanel id="users">
                    <UsersTab email={email} />
                </TabPanel>
                <TabPanel id="feedback">
                    <FeedbackTab email={email} />
                </TabPanel>
                <TabPanel id="metrics">
                    <MetricsTab />
                </TabPanel>
            </Tabs>
        </div>
    );
}
