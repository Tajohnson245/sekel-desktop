import React from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useProfileStore } from '../../../stores/profileStore';
import { useUiPrefsStore } from '../../../stores/uiPrefsStore';
import { useTheme } from '../../ThemeProvider';
import { Upload, X, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast, ToggleSwitch, Select } from '../../UI';
import type { UserProfile } from '@sekel/db';

const THEME_OPTIONS: { value: UserProfile['theme_preference']; color: string; }[] = [
    { value: 'system',    color: 'linear-gradient(135deg, #0F1117 50%, #FFFFFF 50%)' },
    { value: 'dark',      color: '#0F1117' },
    { value: 'light',     color: '#FFFFFF' },
    { value: 'red',       color: '#E05252' },
    { value: 'purple',    color: '#8B5CF6' },
    { value: 'pink',      color: '#EC4899' },
    { value: 'turquoise', color: '#06B6D4' },
];

export function PreferencesTab() {
    const { user } = useAuthStore();
    const { profile, upsertProfile } = useProfileStore();
    const minimalStudyView = useUiPrefsStore((s) => s.minimalStudyView);
    const setMinimalStudyView = useUiPrefsStore((s) => s.setMinimalStudyView);
    const { setTheme } = useTheme();
    const { t, i18n } = useTranslation();
    const { showToast } = useToast();

    return (
        <section className="profile-section">
            <div className="section-header">
                <h3>{t('profile.settings')}</h3>
            </div>

            <div className="profile-grid">
                {/* Language */}
                <div className="profile-field">
                    <label className="field-label">{t('profile.language')}</label>
                    <Select
                        value={i18n.language}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const newLang = e.target.value;
                            i18n.changeLanguage(newLang);
                            if (user?.id) {
                                upsertProfile(user.id, { language: newLang });
                            }
                        }}
                        options={[
                            { value: 'en', label: 'English' },
                            { value: 'es', label: 'Spanish' },
                            { value: 'fr', label: 'French' },
                            { value: 'de', label: 'German' },
                            { value: 'zh', label: 'Chinese' },
                        ]}
                    />
                </div>

                {/* Theme */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="field-label">{t('profile.theme')}</label>
                    <div className="theme-swatches">
                        {THEME_OPTIONS.map((opt) => {
                            const active = (profile?.theme_preference || 'system') === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={`theme-swatch ${active ? 'theme-swatch--active' : ''}`}
                                    onClick={() => {
                                        setTheme(opt.value);
                                        if (user?.id) {
                                            upsertProfile(user.id, { theme_preference: opt.value });
                                        }
                                    }}
                                    title={t(`profile.theme_${opt.value}`)}
                                >
                                    <span
                                        className="theme-swatch-color"
                                        style={{ background: opt.color }}
                                    >
                                        {opt.value === 'system' && <Monitor size={14} style={{ color: 'var(--slate)' }} />}
                                    </span>
                                    <span className="theme-swatch-label">
                                        {t(`profile.theme_${opt.value}`)}
                                    </span>
                                </button>
                            );
                        })}
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
                        <ToggleSwitch
                            checked={profile?.card_style ?? true}
                            onChange={(next) => {
                                if (user?.id) upsertProfile(user.id, { card_style: next });
                            }}
                        />
                    </div>
                </div>

                {/* Card Flip Animation toggle */}
                <div className="profile-field" style={{ gridColumn: '1 / -1', opacity: (profile?.card_style ?? true) ? 1 : 0.4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <label className="field-label">{t('profile.flip_animation')}</label>
                            <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                {t('profile.flip_animation_desc')}
                            </p>
                        </div>
                        <ToggleSwitch
                            checked={(profile?.flip_animation ?? true) && (profile?.card_style ?? true)}
                            onChange={(next) => {
                                if (user?.id) upsertProfile(user.id, { flip_animation: next });
                            }}
                            disabled={!(profile?.card_style ?? true)}
                        />
                    </div>
                </div>

                {/* Minimal study view — hide the study-session chrome */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <label className="field-label">{t('profile.minimal_study_view', { defaultValue: 'Minimal study view' })}</label>
                            <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                {t('profile.minimal_study_view_desc', { defaultValue: 'Hide the session stats, shortcut hints, and the timer/status chips during study for a distraction-free view.' })}
                            </p>
                        </div>
                        <ToggleSwitch
                            checked={minimalStudyView}
                            onChange={setMinimalStudyView}
                        />
                    </div>
                </div>

                {/* Visual (image-occlusion) card size */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <label className="field-label">{t('profile.visual_card_size')}</label>
                            <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                {t('profile.visual_card_size_desc')}
                            </p>
                        </div>
                        <div style={{ minWidth: 180 }}>
                            <Select
                                value={profile?.visual_card_size ?? 'default'}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                    if (user?.id) {
                                        upsertProfile(user.id, { visual_card_size: e.target.value as UserProfile['visual_card_size'] });
                                    }
                                }}
                                options={[
                                    { value: 'compact', label: t('profile.visual_card_size_compact') },
                                    { value: 'default', label: t('profile.visual_card_size_default') },
                                    { value: 'large',   label: t('profile.visual_card_size_large') },
                                    { value: 'full',    label: t('profile.visual_card_size_full') },
                                ]}
                            />
                        </div>
                    </div>
                </div>

                {/* Background Image */}
                <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div>
                            <label className="field-label">{t('profile.background_image')}</label>
                            <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                {t('profile.background_image_desc')}
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                        {profile?.background_url && (
                            <div style={{
                                width: 80,
                                height: 50,
                                borderRadius: 'var(--radius)',
                                overflow: 'hidden',
                                border: '1px solid var(--border)',
                                flexShrink: 0,
                            }}>
                                <img
                                    src={profile.background_url}
                                    alt="Background preview"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>
                        )}
                        <label style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.4rem 0.75rem',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            color: 'var(--text-muted)',
                        }}>
                            <Upload size={14} />
                            {profile?.background_url ? t('profile.change_background') : t('profile.upload_background')}
                            <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file && user?.id) {
                                        const url = await useProfileStore.getState().uploadBackground(user.id, file);
                                        if (url) showToast(t('profile.background_updated'), 'success');
                                        else showToast(t('profile.background_error'), 'error');
                                    }
                                    e.target.value = '';
                                }}
                            />
                        </label>
                        {profile?.background_url && (
                            <button
                                type="button"
                                onClick={async () => {
                                    if (user?.id) {
                                        await useProfileStore.getState().removeBackground(user.id);
                                        showToast(t('profile.background_removed'), 'success');
                                    }
                                }}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: 'var(--radius)',
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    color: 'var(--rose)',
                                }}
                            >
                                <X size={14} />
                                {t('profile.remove_background')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
