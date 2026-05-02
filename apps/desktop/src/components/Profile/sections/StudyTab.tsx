import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useProfileStore } from '../../../stores/profileStore';
import { Bell, Brain, Clock, GraduationCap, Plus, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, useToast, ToggleSwitch } from '../../UI';
import { useDecks, useUpdateDeck } from '../../../hooks/useDecks';
import { useExamProfile, useUpdateExamProfile, useDeleteExamProfile } from '../../../hooks/useExamProfile';
import { useActivePlan } from '../../../hooks/usePlan';
import { isExamDateSet, EXAM_DATE_SENTINEL } from '../../../lib/queries';
import { ExamOnboardingModal } from '../../ExamOnboarding/ExamOnboardingModal';

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

    // Exam profile state
    const { data: examProfile } = useExamProfile();
    const { data: activePlanResult } = useActivePlan();
    const updateExamProfile = useUpdateExamProfile();
    const deleteExamProfile = useDeleteExamProfile();
    const [showExamModal, setShowExamModal] = useState(false);
    const [confirmDeleteExam, setConfirmDeleteExam] = useState(false);
    const [localExamDate, setLocalExamDate] = useState('');
    const [localSessionMode, setLocalSessionMode] = useState<'auto' | 'mixed' | 'triage'>('auto');
    const [showDateConfirm, setShowDateConfirm] = useState(false);

    // Classify Cards state
    const [classifyDeckId, setClassifyDeckId] = useState('');
    const [classifyForce, setClassifyForce] = useState(false);
    const [classifyRunning, setClassifyRunning] = useState(false);
    const [classifyResult, setClassifyResult] = useState<{ classified: number; skipped: number; errors: number } | null>(null);

    useEffect(() => {
        if (examProfile) {
            setLocalExamDate(isExamDateSet(examProfile.exam_date) ? examProfile.exam_date : '');
            setLocalSessionMode(examProfile.session_mode);
        }
    }, [examProfile]);

    const persistedExamDate = isExamDateSet(examProfile?.exam_date) ? examProfile?.exam_date ?? '' : '';

    const saveExamDate = () => {
        updateExamProfile.mutate(
            { exam_date: localExamDate || EXAM_DATE_SENTINEL },
            { onSuccess: () => showToast(t('exam.date_saved'), 'success') }
        );
    };

    const handleExamDateBlur = () => {
        if (localExamDate === persistedExamDate) return;
        if (activePlanResult) {
            setShowDateConfirm(true);
        } else {
            saveExamDate();
        }
    };

    const handleConfirmDateChange = () => {
        saveExamDate();
        setShowDateConfirm(false);
    };

    const handleCancelDateChange = () => {
        setLocalExamDate(persistedExamDate);
        setShowDateConfirm(false);
    };

    const handleRemoveExam = () => {
        const hadPlan = !!activePlanResult?.plan.id;
        deleteExamProfile.mutate(undefined, {
            onSuccess: () => {
                setConfirmDeleteExam(false);
                showToast(hadPlan ? 'Exam removed and plan archived' : 'Exam configuration removed', 'success');
            },
            onError: () => showToast('Failed to remove exam configuration', 'error'),
        });
    };

    const handleSessionModeChange = (mode: 'auto' | 'mixed' | 'triage') => {
        setLocalSessionMode(mode);
        updateExamProfile.mutate(
            { session_mode: mode },
            { onSuccess: () => showToast(t('exam.mode_saved'), 'success') }
        );
    };

    const handleExamSwitchComplete = async () => {
        setShowExamModal(false);
    };

    const handleClassify = async () => {
        if (!classifyDeckId || !examProfile) return;
        setClassifyRunning(true);
        setClassifyResult(null);
        try {
            const cards = await window.electronAPI.db.fetchAllCardsForDeck(classifyDeckId);
            if (cards.length === 0) {
                setClassifyResult({ classified: 0, skipped: 0, errors: 0 });
                return;
            }
            const cardIds = cards.map((c: { id: string }) => c.id);
            const result = await window.electronAPI.yield.classifyBatch(
                cardIds,
                examProfile.exam_key,
                classifyForce
            );
            setClassifyResult(result);
        } catch {
            showToast(t('classify.error'), 'error');
        } finally {
            setClassifyRunning(false);
        }
    };

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
                {/* Exam Configuration */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div>
                            <label className="field-label">
                                <GraduationCap size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                {t('exam.settings_title')}
                            </label>
                            <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                {t('exam.settings_desc')}
                            </p>
                        </div>
                    </div>

                    {examProfile ? (
                        <div style={{ marginTop: '0.75rem' }}>
                            <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                                <strong>{examProfile.exam_label}</strong>
                            </div>

                            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                                <div>
                                    <label className="field-label" style={{ fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' }}>
                                        {t('exam.date_label')}
                                    </label>
                                    <input
                                        type="date"
                                        className="field-input"
                                        value={localExamDate}
                                        onChange={(e) => setLocalExamDate(e.target.value)}
                                        onBlur={handleExamDateBlur}
                                        min={new Date().toISOString().split('T')[0]}
                                        style={{ width: '170px' }}
                                    />
                                </div>

                                <div>
                                    <label className="field-label" style={{ fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' }}>
                                        {t('exam.session_mode_label')}
                                    </label>
                                    <select
                                        className="field-input"
                                        value={localSessionMode}
                                        onChange={(e) => handleSessionModeChange(e.target.value as 'auto' | 'mixed' | 'triage')}
                                        style={{ width: '290px' }}
                                    >
                                        <option value="auto">{t('exam.mode_auto')}</option>
                                        <option value="mixed">{t('exam.mode_mixed')}</option>
                                        <option value="triage">{t('exam.mode_triage')}</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Button variant="secondary" onClick={() => setShowExamModal(true)}>
                                    {t('exam.change_exam')}
                                </Button>
                                {confirmDeleteExam ? (
                                    <>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            {activePlanResult
                                                ? 'Remove exam? Your active study plan will be archived.'
                                                : 'Remove exam configuration?'}
                                        </span>
                                        <Button
                                            variant="danger"
                                            onClick={handleRemoveExam}
                                            isLoading={deleteExamProfile.isPending}
                                            disabled={deleteExamProfile.isPending}
                                        >
                                            Confirm
                                        </Button>
                                        <Button variant="ghost" onClick={() => setConfirmDeleteExam(false)}>
                                            Cancel
                                        </Button>
                                    </>
                                ) : (
                                    <Button variant="ghost" onClick={() => setConfirmDeleteExam(true)}>
                                        Remove
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ marginTop: '0.75rem' }}>
                            <Button variant="primary" onClick={() => setShowExamModal(true)}>
                                {t('exam.setup_exam')}
                            </Button>
                        </div>
                    )}

                    <ExamOnboardingModal
                        isOpen={showExamModal}
                        onClose={() => setShowExamModal(false)}
                        onComplete={handleExamSwitchComplete}
                    />

                    <Modal
                        isOpen={showDateConfirm}
                        onClose={handleCancelDateChange}
                        title="Update exam date?"
                        size="sm"
                        footer={
                            <>
                                <Button variant="ghost" onClick={handleCancelDateChange}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleConfirmDateChange}
                                    isLoading={updateExamProfile.isPending}
                                    disabled={updateExamProfile.isPending}
                                >
                                    Update date
                                </Button>
                            </>
                        }
                    >
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>
                            Your study plan will rebalance to fit the new exam date. Daily targets may change.
                        </p>
                    </Modal>
                </div>

                {/* Classify Cards */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="field-label">
                        <Brain size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        {t('classify.section_title')}
                    </label>
                    <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0.75rem' }}>
                        {examProfile
                            ? t('classify.section_desc', { examLabel: examProfile.exam_label })
                            : t('classify.no_exam_hint')}
                    </p>

                    {examProfile ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <select
                                className="field-input"
                                value={classifyDeckId}
                                onChange={(e) => { setClassifyDeckId(e.target.value); setClassifyResult(null); }}
                                style={{ width: '280px' }}
                                disabled={classifyRunning}
                            >
                                <option value="">{t('classify.select_deck_placeholder')}</option>
                                {decks.map(deck => (
                                    <option key={deck.id} value={deck.id}>{deck.name}</option>
                                ))}
                            </select>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={classifyForce}
                                    onChange={(e) => setClassifyForce(e.target.checked)}
                                    disabled={classifyRunning}
                                />
                                {t('classify.force_reclassify')}
                            </label>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <Button
                                    variant="primary"
                                    onClick={handleClassify}
                                    disabled={!classifyDeckId || classifyRunning}
                                    isLoading={classifyRunning}
                                >
                                    {classifyRunning ? t('classify.running') : t('classify.run_button')}
                                </Button>

                                {classifyResult && (
                                    classifyResult.classified === 0 && classifyResult.skipped === 0 && classifyResult.errors === 0
                                        ? <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            {t('classify.no_cards')}
                                          </span>
                                        : <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            {t('classify.success', {
                                                classified: classifyResult.classified,
                                                skipped: classifyResult.skipped,
                                            })}
                                          </span>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>

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

                {/* SEKEL Intelligence */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <label className="field-label">
                                <Sparkles size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                SEKEL Intelligence
                            </label>
                            <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                Personalized study insights based on your exam blueprint
                            </p>
                        </div>
                        <ToggleSwitch
                            checked={profile?.intelligence_enabled ?? true}
                            onChange={(next) => {
                                if (user?.id) {
                                    upsertProfile(user.id, { intelligence_enabled: next });
                                }
                            }}
                        />
                    </div>
                </div>

                {/* Study Timer */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <label className="field-label">
                                <Clock size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                {t('profile.show_timer')}
                            </label>
                            <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                {t('profile.show_timer_desc')}
                            </p>
                        </div>
                        <ToggleSwitch
                            checked={profile?.show_timer ?? true}
                            onChange={(next) => {
                                if (user?.id) {
                                    upsertProfile(user.id, { show_timer: next });
                                }
                            }}
                        />
                    </div>
                </div>

                {/* Daily Study Limits */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div>
                            <label className="field-label">{t('profile.daily_limits')}</label>
                            <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                {t('profile.daily_limits_desc')}
                            </p>
                        </div>
                        <ToggleSwitch
                            checked={profile?.daily_limits_enabled ?? true}
                            onChange={(next) => {
                                if (user?.id) {
                                    upsertProfile(user.id, { daily_limits_enabled: next });
                                }
                            }}
                        />
                    </div>

                    {(profile?.daily_limits_enabled ?? true) && (
                        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem' }}>
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
                    )}
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
