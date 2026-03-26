import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useProfileStore } from '../../../stores/profileStore';
import { Bell, Clock, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, useToast, ToggleSwitch } from '../../UI';
import { useDecks, useUpdateDeck } from '../../../hooks/useDecks';

export function StudyTab() {
    const { user } = useAuthStore();
    const { profile, upsertProfile } = useProfileStore();
    const { t } = useTranslation();
    const { showToast } = useToast();

    // Daily limits local state
    const [dailyNew, setDailyNew] = useState(profile?.daily_new_limit ?? 20);
    const [dailyReview, setDailyReview] = useState(profile?.daily_review_limit ?? 200);

    useEffect(() => {
        if (profile) {
            setDailyNew(profile.daily_new_limit ?? 20);
            setDailyReview(profile.daily_review_limit ?? 200);
        }
    }, [profile]);

    // FSRS state
    const { data: decks = [] } = useDecks();
    const updateDeck = useUpdateDeck();
    const [fsrsDropdownOpen, setFsrsDropdownOpen] = useState(false);
    const [fsrsEnabledDeckIds, setFsrsEnabledDeckIds] = useState<Set<string>>(new Set());
    const [fsrsSaving, setFsrsSaving] = useState(false);

    // Time Travel state
    const [ttDaysBack, setTtDaysBack] = useState(7);
    const [ttPreview, setTtPreview] = useState<{ overdueCount: number; windowDays: number; dailyTarget: number; distribution: { date: string; count: number }[] } | null>(null);
    const [ttLoading, setTtLoading] = useState(false);
    const [ttExecuting, setTtExecuting] = useState(false);

    useEffect(() => {
        if (decks.length > 0) {
            const enabledIds = new Set(
                decks.filter(d => d.algorithm === 'fsrs').map(d => d.id)
            );
            setFsrsEnabledDeckIds(enabledIds);
        }
    }, [decks]);

    const handleToggleDeckFSRS = (deckId: string) => {
        setFsrsEnabledDeckIds(prev => {
            const next = new Set(prev);
            if (next.has(deckId)) next.delete(deckId);
            else next.add(deckId);
            return next;
        });
    };

    const handleTimeTravelCheck = async () => {
        setTtLoading(true);
        setTtPreview(null);
        try {
            const preview = await window.electronAPI.db.timeTravelPreview(ttDaysBack);
            setTtPreview(preview);
        } catch (_error) {
            showToast(t('time_travel.error'), 'error');
        } finally {
            setTtLoading(false);
        }
    };

    const handleTimeTravelExecute = async () => {
        setTtExecuting(true);
        try {
            await window.electronAPI.db.timeTravelExecute(ttDaysBack);
            showToast(t('time_travel.success'), 'success');
            setTtPreview(null);
        } catch (_error) {
            showToast(t('time_travel.error'), 'error');
        } finally {
            setTtExecuting(false);
        }
    };

    const handleSaveFSRS = async () => {
        setFsrsSaving(true);
        try {
            await Promise.all(
                decks.map(deck =>
                    updateDeck.mutateAsync({
                        id: deck.id,
                        updates: { algorithm: fsrsEnabledDeckIds.has(deck.id) ? 'fsrs' : 'sm2' },
                    })
                )
            );
            setFsrsDropdownOpen(false);
        } catch (_error) {
            showToast(t('errors.save_fsrs'), 'error');
        } finally {
            setFsrsSaving(false);
        }
    };

    return (
        <section className="profile-section">
            <div className="section-header">
                <h3>{t('profile.tab_study')}</h3>
            </div>

            <div className="profile-grid">
                {/* Notification Reminders */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div>
                            <label className="field-label">
                                <Bell size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                {t('profile.notifications')}
                            </label>
                            <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                {t('profile.notifications_desc')}
                            </p>
                        </div>
                        <ToggleSwitch
                            checked={profile?.notifications_enabled ?? false}
                            onChange={(next) => {
                                if (user?.id) {
                                    upsertProfile(user.id, { notifications_enabled: next });
                                    window.electronAPI?.notify.configure({
                                        userId: user.id,
                                        enabled: next,
                                        reminderTimes: profile?.reminder_times ?? [],
                                    });
                                }
                            }}
                        />
                    </div>

                    {(profile?.notifications_enabled ?? false) && (
                        <div style={{ marginTop: '0.75rem' }}>
                            <label className="field-label" style={{ fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>
                                {t('profile.reminder_times')}
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {(profile?.reminder_times ?? []).map((time, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="time"
                                            value={time}
                                            onChange={(e) => {
                                                const times = [...(profile?.reminder_times ?? [])];
                                                times[idx] = e.target.value;
                                                if (user?.id) {
                                                    upsertProfile(user.id, { reminder_times: times });
                                                    window.electronAPI?.notify.configure({
                                                        userId: user.id,
                                                        enabled: true,
                                                        reminderTimes: times,
                                                    });
                                                }
                                            }}
                                            className="field-input"
                                            style={{ width: '140px' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const times = (profile?.reminder_times ?? []).filter((_, i) => i !== idx);
                                                if (user?.id) {
                                                    upsertProfile(user.id, { reminder_times: times });
                                                    window.electronAPI?.notify.configure({
                                                        userId: user.id,
                                                        enabled: true,
                                                        reminderTimes: times,
                                                    });
                                                }
                                            }}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: 'var(--text-muted)',
                                                padding: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                            }}
                                            aria-label={t('common.remove')}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                                {(profile?.reminder_times ?? []).length < 5 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const times = [...(profile?.reminder_times ?? []), '09:00'];
                                            if (user?.id) {
                                                upsertProfile(user.id, { reminder_times: times });
                                                window.electronAPI?.notify.configure({
                                                    userId: user.id,
                                                    enabled: true,
                                                    reminderTimes: times,
                                                });
                                            }
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            background: 'none',
                                            border: '1px dashed var(--border)',
                                            borderRadius: '6px',
                                            padding: '6px 12px',
                                            cursor: 'pointer',
                                            color: 'var(--text-muted)',
                                            fontSize: '0.85rem',
                                            width: 'fit-content',
                                        }}
                                    >
                                        <Plus size={14} />
                                        {t('profile.add_reminder')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Daily Study Limits */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="field-label">{t('profile.daily_limits')}</label>
                    <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0.75rem' }}>
                        {t('profile.daily_limits_desc')}
                    </p>
                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                        <div>
                            <label className="field-label" style={{ fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' }}>
                                {t('profile.new_cards_per_day')}
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={9999}
                                className="field-input"
                                value={dailyNew}
                                onChange={(e) => setDailyNew(Number(e.target.value))}
                                onBlur={() => {
                                    if (user?.id) {
                                        upsertProfile(user.id, { daily_new_limit: dailyNew });
                                    }
                                }}
                                style={{ width: '90px' }}
                            />
                        </div>
                        <div>
                            <label className="field-label" style={{ fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' }}>
                                {t('profile.reviews_per_day')}
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={9999}
                                className="field-input"
                                value={dailyReview}
                                onChange={(e) => setDailyReview(Number(e.target.value))}
                                onBlur={() => {
                                    if (user?.id) {
                                        upsertProfile(user.id, { daily_review_limit: dailyReview });
                                    }
                                }}
                                style={{ width: '90px' }}
                            />
                        </div>
                    </div>
                </div>

                {/* FSRS Scheduling */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="field-label">{t('fsrs.enable_fsrs_for_decks')}</label>
                    <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                        {t('fsrs.description')}
                    </p>

                    <div className="fsrs-deck-selector">
                        <button
                            className="fsrs-dropdown-trigger"
                            onClick={() => setFsrsDropdownOpen(prev => !prev)}
                            type="button"
                        >
                            <span>
                                {fsrsEnabledDeckIds.size === 0
                                    ? t('fsrs.no_decks_selected')
                                    : fsrsEnabledDeckIds.size === decks.length
                                        ? t('fsrs.all_decks')
                                        : t('fsrs.decks_selected', { count: fsrsEnabledDeckIds.size, total: decks.length })}
                            </span>
                            <span className={`fsrs-chevron ${fsrsDropdownOpen ? 'open' : ''}`}>▾</span>
                        </button>

                        {fsrsDropdownOpen && (
                            <div className="fsrs-dropdown-panel">
                                {decks.length === 0 ? (
                                    <div className="fsrs-empty">{t('fsrs.empty')}</div>
                                ) : (
                                    <>
                                        <div className="fsrs-select-all">
                                            <button
                                                type="button"
                                                className="fsrs-select-btn"
                                                onClick={() => setFsrsEnabledDeckIds(new Set(decks.map(d => d.id)))}
                                            >
                                                {t('fsrs.select_all')}
                                            </button>
                                            <button
                                                type="button"
                                                className="fsrs-select-btn"
                                                onClick={() => setFsrsEnabledDeckIds(new Set())}
                                            >
                                                {t('fsrs.select_none')}
                                            </button>
                                        </div>

                                        <ul className="fsrs-deck-list">
                                            {decks.map(deck => (
                                                <li key={deck.id} className="fsrs-deck-item">
                                                    <label className="fsrs-deck-label">
                                                        <input
                                                            type="checkbox"
                                                            className="fsrs-deck-checkbox"
                                                            checked={fsrsEnabledDeckIds.has(deck.id)}
                                                            onChange={() => handleToggleDeckFSRS(deck.id)}
                                                        />
                                                        <span className="fsrs-deck-name">{deck.name === 'Testing Deck' ? t('decks.demo_deck_name') : deck.name}</span>
                                                        <span className={`fsrs-deck-badge ${fsrsEnabledDeckIds.has(deck.id) ? 'on' : 'off'}`}>
                                                            {fsrsEnabledDeckIds.has(deck.id) ? t('fsrs.deck_badge_fsrs') : t('fsrs.deck_badge_flashcard')}
                                                        </span>
                                                    </label>
                                                </li>
                                            ))}
                                        </ul>

                                        <div className="fsrs-dropdown-footer">
                                            <Button
                                                variant="primary"
                                                onClick={handleSaveFSRS}
                                                isLoading={fsrsSaving}
                                                disabled={fsrsSaving}
                                            >
                                                {t('fsrs.save_settings')}
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Time Travel */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="field-label">
                        <Clock size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        {t('time_travel.title')}
                    </label>
                    <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0.75rem' }}>
                        {t('time_travel.description')}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem' }}>
                        <div>
                            <label className="field-label" style={{ fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' }}>
                                {t('time_travel.days_back')}
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={7}
                                className="field-input"
                                value={ttDaysBack}
                                onChange={(e) => {
                                    setTtDaysBack(Math.max(1, Math.min(7, Number(e.target.value))));
                                    setTtPreview(null);
                                }}
                                style={{ width: '60px' }}
                            />
                        </div>
                        <Button
                            variant="secondary"
                            onClick={handleTimeTravelCheck}
                            isLoading={ttLoading}
                            disabled={ttLoading}
                        >
                            {t('time_travel.check')}
                        </Button>
                    </div>

                    {ttPreview && (
                        <div style={{
                            marginTop: '1rem',
                            padding: '1rem',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius, 8px)',
                            background: 'var(--bg-secondary)',
                        }}>
                            {ttPreview.overdueCount === 0 ? (
                                <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                                    {t('time_travel.no_overdue')}
                                </p>
                            ) : (
                                <>
                                    <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>
                                        {t('time_travel.overdue_found', { count: ttPreview.overdueCount })}
                                    </p>
                                    <p className="text-muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
                                        {t('time_travel.spread_across', {
                                            days: ttPreview.windowDays,
                                            perDay: Math.ceil(ttPreview.overdueCount / ttPreview.windowDays),
                                        })}
                                    </p>

                                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem', fontSize: '0.85rem' }}>
                                        {ttPreview.distribution.map((d) => (
                                            <li key={d.date} style={{ padding: '0.2rem 0', color: 'var(--text-secondary)' }}>
                                                {t('time_travel.date_count', { date: d.date, count: d.count })}
                                            </li>
                                        ))}
                                    </ul>

                                    <Button
                                        variant="primary"
                                        onClick={handleTimeTravelExecute}
                                        isLoading={ttExecuting}
                                        disabled={ttExecuting}
                                    >
                                        {t('time_travel.redistribute')}
                                    </Button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
