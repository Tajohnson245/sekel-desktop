import React, { useState } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { useProfileStore, UserProfile } from '../../../stores/profileStore';
import { useTranslation } from 'react-i18next';
import { Input } from '../../UI';

export function ProfileTab() {
    const { user } = useAuthStore();
    const { profile, upsertProfile } = useProfileStore();
    const { t } = useTranslation();

    const [isEditingPersonal, setIsEditingPersonal] = useState(false);
    const [isEditingCareer, setIsEditingCareer] = useState(false);
    const [formData, setFormData] = useState<Partial<UserProfile>>(() => profile ?? {});

    // Keep formData in sync when profile loads/changes
    React.useEffect(() => {
        if (profile) setFormData(profile);
    }, [profile]);

    const handleInputChange = (field: keyof UserProfile, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = (section: 'personal' | 'career') => {
        if (!user?.id) return;
        upsertProfile(user.id, formData).then(() => {
            if (section === 'personal') setIsEditingPersonal(false);
            if (section === 'career') setIsEditingCareer(false);
        });
    };

    const handleCancel = (section: 'personal' | 'career') => {
        if (profile) setFormData(profile);
        else setFormData({});
        if (section === 'personal') setIsEditingPersonal(false);
        if (section === 'career') setIsEditingCareer(false);
    };

    return (
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
                    <div className="field-value" style={{ color: 'var(--text-muted)' }}>{user?.email}</div>
                </div>
            </div>

            {isEditingPersonal && (
                <div className="section-actions">
                    <button className="btn btn-cancel" onClick={() => handleCancel('personal')}>{t('profile.cancel')}</button>
                    <button className="btn btn-save" onClick={() => handleSave('personal')}>{t('profile.save')}</button>
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
                    <button className="btn btn-save" onClick={() => handleSave('career')}>{t('profile.save')}</button>
                </div>
            )}
        </section>
    );
}
