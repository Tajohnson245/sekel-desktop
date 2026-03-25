import React from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useProfileStore } from '../../../stores/profileStore';
import { useTheme } from '../../ThemeProvider';
import { Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast, ToggleSwitch } from '../../UI';

export function PreferencesTab() {
    const { user } = useAuthStore();
    const { profile, upsertProfile } = useProfileStore();
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
                    <div className="select-container">
                        <select
                            className="field-input custom-select"
                            value={i18n.language}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                const newLang = e.target.value;
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

                {/* Theme */}
                <div className="profile-field">
                    <label className="field-label">{t('profile.theme')}</label>
                    <div className="select-container">
                        <select
                            className="field-input custom-select"
                            value={profile?.theme_preference || 'system'}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                const newTheme = e.target.value as 'light' | 'dark' | 'system';
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
