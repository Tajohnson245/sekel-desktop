import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore, UserProfile } from '../../stores/profileStore';
import { useTheme } from '../ThemeProvider';
import { User, MapPin, Edit2, Lock, Trash2, Upload, Bell, Plus, X } from 'lucide-react';
import ImportAnkiButton from '../Deck/ImportAnkiButton';

import { useTranslation } from 'react-i18next';
import { Modal, Button, Input, useToast } from '../UI';
import { useDecks, useUpdateDeck } from '../../hooks/useDecks';
import './UserProfilePage.css';

export const UserProfilePage: React.FC = () => {
    const { user } = useAuthStore();
    const { profile, fetchProfile, upsertProfile } = useProfileStore();
    const { setTheme } = useTheme();
    const { t, i18n } = useTranslation();
    const { showToast } = useToast();

    // Edit mode states
    const [isEditingPersonal, setIsEditingPersonal] = useState(false);
    const [isEditingCareer, setIsEditingCareer] = useState(false);

    // Form states
    const [formData, setFormData] = useState<Partial<UserProfile>>({});

    // Danger Zone states
    const [isEditingPassword, setIsEditingPassword] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // FSRS settings state
    const { data: decks = [] } = useDecks();
    const updateDeck = useUpdateDeck();
    const [fsrsDropdownOpen, setFsrsDropdownOpen] = useState(false);
    const [fsrsEnabledDeckIds, setFsrsEnabledDeckIds] = useState<Set<string>>(new Set());
    const [fsrsSaving, setFsrsSaving] = useState(false);

    const handleChangePassword = async () => {
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            showToast(t('auth.passwords_mismatch'), 'error');
            return;
        }
        try {
            await useAuthStore.getState().updatePassword(passwordForm.newPassword);
            setIsEditingPassword(false);
            setPasswordForm({ newPassword: '', confirmPassword: '' });
            showToast(t('profile.password_updated'), 'success');
        } catch (_error) {
            showToast(t('common.error'), 'error');
        }
    };

    const handleDeleteAccount = async () => {
        try {
            await useAuthStore.getState().deleteAccount();
            setIsDeleteModalOpen(false);
        } catch (_error) {
            showToast(t('common.error'), 'error');
        }
    };

    useEffect(() => {
        if (user?.id) {
            fetchProfile(user.id);
        }
    }, [user?.id, fetchProfile]);

    useEffect(() => {
        if (profile) {
            setFormData(profile);
            // Sync i18n language with profile language
            if (profile.language && i18n.language !== profile.language) {
                i18n.changeLanguage(profile.language);
            }
        }
    }, [profile, i18n]);

    // Initialize FSRS enabled decks from loaded decks data
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
            if (next.has(deckId)) {
                next.delete(deckId);
            } else {
                next.add(deckId);
            }
            return next;
        });
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

    const handleInputChange = (field: keyof UserProfile, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveDate = (section: 'personal' | 'career') => {
        if (!user?.id) return;

        upsertProfile(user.id, formData).then(() => {
            if (section === 'personal') setIsEditingPersonal(false);
            if (section === 'career') setIsEditingCareer(false);
        });
    };

    const handleCancel = (section: 'personal' | 'career') => {
        if (profile) {
            setFormData(profile);
        } else {
            // If no profile yet, clear relevant fields or keep basics
            setFormData({});
        }

        if (section === 'personal') setIsEditingPersonal(false);
        if (section === 'career') setIsEditingCareer(false);
    };

    if (!user) return <div className="user-profile-page">{t('errors.login_required')}</div>;

    const fullName = `${profile?.first_name || t('common.user')} ${profile?.last_name || ''}`.trim();

    return (
        <div className="user-profile-page">
            {/* Header Section */}
            <div className="profile-header-section">
                <div className="profile-avatar-large-wrapper">
                    <div
                        className="profile-avatar-large"
                        onClick={() => document.getElementById('avatar-upload')?.click()}
                        title={t('profile.change_photo')}
                        style={{ cursor: 'pointer', position: 'relative' }}
                    >
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="Profile" className="profile-avatar-img" />
                        ) : (
                            <User size={48} />
                        )}
                        <div className="profile-avatar-overlay">
                            <Edit2 size={16} />
                        </div>
                    </div>
                    <input
                        type="file"
                        id="avatar-upload"
                        style={{ display: 'none' }}
                        accept="image/*"
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0] && user?.id) {
                                const file = e.target.files[0];
                                // Check file size (e.g. 5MB limit)
                                if (file.size > 5 * 1024 * 1024) {
                                    showToast(t('common.error_file_size'), 'error');
                                    return;
                                }
                                useProfileStore.getState().uploadAvatar(user.id, file);
                            }
                        }}
                    />
                </div>
                <div className="profile-header-info">
                    <h2>{fullName}</h2>
                    <div className="profile-header-role">{profile?.role || t('profile.role')}</div>
                    <div className="profile-header-location">
                        <MapPin size={14} style={{ display: 'inline', marginRight: '4px' }} />
                        {profile?.location || t('profile.no_location')}
                    </div>
                </div>
            </div>

            {/* Profile Section — Personal + Career */}
            <section className="profile-section">
                <div className="section-header">
                    <h3>{t('profile.profile_info')}</h3>
                </div>

                {/* Personal Data */}
                <div className="subsection-header">
                    <h4>{t('profile.personal_data')}</h4>
                    {!isEditingPersonal && (
                        <button className="edit-btn" onClick={() => setIsEditingPersonal(true)}>
                            {t('profile.edit')}
                        </button>
                    )}
                </div>

                <div className="profile-grid">
                    {isEditingPersonal ? (
                        <Input
                            className="field-input"
                            containerClassName="profile-field"
                            labelClassName="field-label"
                            label={t('profile.first_name') + ' *'}
                            value={formData.first_name || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('first_name', e.target.value)}
                        />
                    ) : (
                        <div className="profile-field">
                            <label className="field-label">{t('profile.first_name')} <span className="required-mark">*</span></label>
                            <div className="field-value">{profile?.first_name || '-'}</div>
                        </div>
                    )}

                    {isEditingPersonal ? (
                        <Input
                            className="field-input"
                            containerClassName="profile-field"
                            labelClassName="field-label"
                            label={t('profile.last_name') + ' *'}
                            value={formData.last_name || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('last_name', e.target.value)}
                        />
                    ) : (
                        <div className="profile-field">
                            <label className="field-label">{t('profile.last_name')} <span className="required-mark">*</span></label>
                            <div className="field-value">{profile?.last_name || '-'}</div>
                        </div>
                    )}

                    {isEditingPersonal ? (
                        <Input
                            className="field-input"
                            containerClassName="profile-field"
                            labelClassName="field-label"
                            label={t('profile.location')}
                            value={formData.location || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('location', e.target.value)}
                            placeholder={t('profile.location_placeholder')}
                        />
                    ) : (
                        <div className="profile-field">
                            <label className="field-label">{t('profile.location')}</label>
                            <div className="field-value">{profile?.location || '-'}</div>
                        </div>
                    )}

                    <div className="profile-field">
                        <label className="field-label">{t('profile.email')} <span className="required-mark">*</span></label>
                        <div className="field-value" style={{ color: 'var(--text-muted)' }}>{user.email}</div>
                    </div>
                </div>

                {isEditingPersonal && (
                    <div className="section-actions">
                        <button className="btn btn-cancel" onClick={() => handleCancel('personal')}>{t('profile.cancel')}</button>
                        <button className="btn btn-save" onClick={() => handleSaveDate('personal')}>{t('profile.save')}</button>
                    </div>
                )}

                {/* Career Profile */}
                <div className="subsection-header">
                    <h4>{t('profile.career_profile')}</h4>
                    {!isEditingCareer && (
                        <button className="edit-btn" onClick={() => setIsEditingCareer(true)}>
                            {t('profile.edit')}
                        </button>
                    )}
                </div>

                <div className="profile-grid">
                    {isEditingCareer ? (
                        <Input
                            className="field-input"
                            containerClassName="profile-field"
                            labelClassName="field-label"
                            label={t('profile.role')}
                            value={formData.role || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('role', e.target.value)}
                            placeholder={t('profile.role_placeholder')}
                        />
                    ) : (
                        <div className="profile-field">
                            <label className="field-label">{t('profile.role')}</label>
                            <div className="field-value">{profile?.role || '-'}</div>
                        </div>
                    )}

                    {isEditingCareer ? (
                        <Input
                            className="field-input"
                            containerClassName="profile-field"
                            labelClassName="field-label"
                            label={t('profile.medical_school')}
                            value={formData.medical_school || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('medical_school', e.target.value)}
                            placeholder={t('profile.school_placeholder')}
                        />
                    ) : (
                        <div className="profile-field">
                            <label className="field-label">{t('profile.medical_school')}</label>
                            <div className="field-value">{profile?.medical_school || '-'}</div>
                        </div>
                    )}

                    {isEditingCareer ? (
                        <Input
                            className="field-input"
                            containerClassName="profile-field"
                            labelClassName="field-label"
                            label={t('profile.degree_track')}
                            value={formData.degree_track || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('degree_track', e.target.value)}
                            placeholder={t('profile.degree_placeholder')}
                        />
                    ) : (
                        <div className="profile-field">
                            <label className="field-label">{t('profile.degree_track')}</label>
                            <div className="field-value">{profile?.degree_track || '-'}</div>
                        </div>
                    )}

                    {isEditingCareer ? (
                        <Input
                            className="field-input"
                            containerClassName="profile-field"
                            labelClassName="field-label"
                            label={t('profile.exam')}
                            value={formData.exam || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('exam', e.target.value)}
                            placeholder={t('profile.exam_placeholder')}
                        />
                    ) : (
                        <div className="profile-field">
                            <label className="field-label">{t('profile.exam')}</label>
                            <div className="field-value">{profile?.exam || '-'}</div>
                        </div>
                    )}

                    {isEditingCareer ? (
                        <Input
                            className="field-input"
                            containerClassName="profile-field"
                            labelClassName="field-label"
                            label={t('profile.target_date')}
                            value={formData.target_date || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('target_date', e.target.value)}
                            placeholder="e.g. May, 2027"
                        />
                    ) : (
                        <div className="profile-field">
                            <label className="field-label">{t('profile.target_date')}</label>
                            <div className="field-value">{profile?.target_date || '-'}</div>
                        </div>
                    )}
                </div>

                {isEditingCareer && (
                    <div className="section-actions">
                        <button className="btn btn-cancel" onClick={() => handleCancel('career')}>{t('profile.cancel')}</button>
                        <button className="btn btn-save" onClick={() => handleSaveDate('career')}>{t('profile.save')}</button>
                    </div>
                )}
            </section>

            <section className="profile-section">
                <div className="section-header">
                    <h3>{t('profile.settings')}</h3>
                </div>

                <div className="profile-grid">
                    <div className="profile-field">
                        <label className="field-label">{t('profile.language')}</label>
                        <div className="select-container">
                            <select
                                className="field-input custom-select"
                                value={i18n.language}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                    const newLang = e.target.value;
                                    handleInputChange('language', newLang);
                                    i18n.changeLanguage(newLang);
                                    if (user?.id) {
                                        upsertProfile(user.id, { language: newLang });
                                    }
                                }}
                            >
                                <option value="en">English</option>
                                <option value="es">Spanish</option>
                                <option value="fr">French</option>
                                <option value="de">German</option>
                                <option value="zh">Chinese</option>
                            </select>
                        </div>
                    </div>

                    <div className="profile-field">
                        <label className="field-label">{t('profile.theme')}</label>
                        <div className="select-container">
                            <select
                                className="field-input custom-select"
                                value={profile?.theme_preference || 'system'}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                    const newTheme = e.target.value as 'light' | 'dark' | 'system';
                                    handleInputChange('theme_preference', newTheme);
                                    setTheme(newTheme);
                                    if (user?.id) {
                                        upsertProfile(user.id, { theme_preference: newTheme });
                                    }
                                }}
                            >
                                <option value="system">{t('profile.theme_system')}</option>
                                <option value="light">{t('profile.theme_light')}</option>
                                <option value="dark">{t('profile.theme_dark')}</option>
                            </select>
                        </div>
                    </div>

                    {/* Card Style toggle */}
                    <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <label className="field-label">{t('profile.card_style')}</label>
                                <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                    {t('profile.card_style_desc')}
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={profile?.card_style ?? true}
                                onClick={() => {
                                    const next = !(profile?.card_style ?? true);
                                    if (user?.id) {
                                        upsertProfile(user.id, { card_style: next });
                                    }
                                }}
                                style={{
                                    flexShrink: 0,
                                    width: '44px',
                                    height: '24px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: (profile?.card_style ?? true) ? 'var(--primary)' : 'var(--border)',
                                    position: 'relative',
                                    transition: 'background 0.2s ease',
                                    padding: 0,
                                }}
                            >
                                <span style={{
                                    position: 'absolute',
                                    top: '3px',
                                    left: (profile?.card_style ?? true) ? '23px' : '3px',
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: '#fff',
                                    transition: 'left 0.2s ease',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                }} />
                            </button>
                        </div>
                    </div>

                    {/* Card Flip Animation toggle — disabled when card style is off */}
                    <div className="profile-field" style={{ gridColumn: '1 / -1', opacity: (profile?.card_style ?? true) ? 1 : 0.4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <label className="field-label">{t('profile.flip_animation')}</label>
                                <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                    {t('profile.flip_animation_desc')}
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={profile?.flip_animation ?? true}
                                disabled={!(profile?.card_style ?? true)}
                                onClick={() => {
                                    const next = !(profile?.flip_animation ?? true);
                                    if (user?.id) {
                                        upsertProfile(user.id, { flip_animation: next });
                                    }
                                }}
                                style={{
                                    flexShrink: 0,
                                    width: '44px',
                                    height: '24px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    cursor: (profile?.card_style ?? true) ? 'pointer' : 'not-allowed',
                                    background: (profile?.flip_animation ?? true) && (profile?.card_style ?? true) ? 'var(--primary)' : 'var(--border)',
                                    position: 'relative',
                                    transition: 'background 0.2s ease',
                                    padding: 0,
                                }}
                            >
                                <span style={{
                                    position: 'absolute',
                                    top: '3px',
                                    left: (profile?.flip_animation ?? true) && (profile?.card_style ?? true) ? '23px' : '3px',
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: '#fff',
                                    transition: 'left 0.2s ease',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                }} />
                            </button>
                        </div>
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
                            <button
                                type="button"
                                role="switch"
                                aria-checked={profile?.notifications_enabled ?? false}
                                onClick={() => {
                                    const next = !(profile?.notifications_enabled ?? false);
                                    if (user?.id) {
                                        upsertProfile(user.id, { notifications_enabled: next });
                                        window.electronAPI?.notify.configure({
                                            userId: user.id,
                                            enabled: next,
                                            reminderTimes: profile?.reminder_times ?? [],
                                        });
                                    }
                                }}
                                style={{
                                    flexShrink: 0,
                                    width: '44px',
                                    height: '24px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: (profile?.notifications_enabled ?? false) ? 'var(--primary)' : 'var(--border)',
                                    position: 'relative',
                                    transition: 'background 0.2s ease',
                                    padding: 0,
                                }}
                            >
                                <span style={{
                                    position: 'absolute',
                                    top: '3px',
                                    left: (profile?.notifications_enabled ?? false) ? '23px' : '3px',
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: '#fff',
                                    transition: 'left 0.2s ease',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                }} />
                            </button>
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
                </div>
            </section>

            {/* Data Management Section */}
            <section className="profile-section">
                <div className="section-header">
                    <h3><Upload size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />{t('profile.data_management')}</h3>
                </div>
                <div className="profile-grid">
                    <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <label className="field-label">{t('import.importAnkiDeck')}</label>
                                <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                    {t('profile.import_anki_desc')}
                                </p>
                            </div>
                            <ImportAnkiButton
                                onSuccess={() => {}}
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Account Management (Password + Delete) */}
            <section className="profile-section">
                <div className="section-header">
                    <h3>{t('profile.account_management')}</h3>
                </div>
                <div className="profile-grid">
                    <div className="profile-field">
                        <label className="field-label">{t('profile.password')}</label>
                        {isEditingPassword ? (
                            <div className="password-change-form">
                                <Input
                                    className="field-input"
                                    type="password"
                                    placeholder={t('profile.new_password')}
                                    value={passwordForm.newPassword}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                                    style={{ marginBottom: '0.5rem' }}
                                />
                                <Input
                                    className="field-input"
                                    type="password"
                                    placeholder={t('profile.confirm_password')}
                                    value={passwordForm.confirmPassword}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                />
                                <div className="section-actions">
                                    <Button variant="secondary" onClick={() => setIsEditingPassword(false)}>{t('profile.cancel')}</Button>
                                    <Button
                                        variant="primary"
                                        onClick={handleChangePassword}
                                        disabled={!passwordForm.newPassword || passwordForm.newPassword !== passwordForm.confirmPassword}
                                    >
                                        {t('profile.save')}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <div className="field-value">••••••••</div>
                                <Button variant="secondary" onClick={() => setIsEditingPassword(true)} icon={<Lock size={14} />}>
                                    {t('profile.change_password')}
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                        <label className="field-label text-danger">{t('profile.delete_account')}</label>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p className="text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
                                {t('profile.delete_account_warning')}
                            </p>
                            <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)} icon={<Trash2 size={14} />}>
                                {t('profile.delete_account_btn')}
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title={t('profile.delete_account_confirm_title')}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="danger" onClick={handleDeleteAccount}>
                            {t('profile.confirm_delete')}
                        </Button>
                    </>
                }
            >
                <div className="text-muted">
                    <p>{t('profile.delete_account_confirm_body')}</p>
                    <p style={{ marginTop: '1rem', fontWeight: 500, color: 'var(--danger)' }}>
                        {t('profile.delete_account_confirm_warning')}
                    </p>
                </div>
            </Modal>
        </div >
    );
};
