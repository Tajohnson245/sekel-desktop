import React, { useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { User, MapPin, Edit2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabList, Tab, TabPanel, useToast } from '../UI';
import { ProfileTab } from './sections/ProfileTab';
import { PreferencesTab } from './sections/PreferencesTab';
import { StudyTab } from './sections/StudyTab';
import { AccountTab } from './sections/AccountTab';
import { BackupTab } from './sections/BackupTab';
import './UserProfilePage.css';

export const UserProfilePage: React.FC = () => {
    const { user } = useAuthStore();
    const { profile, fetchProfile } = useProfileStore();
    const { t, i18n } = useTranslation();
    const { showToast } = useToast();

    useEffect(() => {
        if (user?.id) {
            fetchProfile(user.id);
        }
    }, [user?.id, fetchProfile]);

    useEffect(() => {
        if (profile?.language && i18n.language !== profile.language) {
            i18n.changeLanguage(profile.language);
        }
    }, [profile, i18n]);

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

            <Tabs defaultTab="profile">
                <TabList>
                    <Tab id="profile">{t('profile.tab_profile')}</Tab>
                    <Tab id="preferences">{t('profile.tab_preferences')}</Tab>
                    <Tab id="study">{t('profile.tab_study')}</Tab>
                    <Tab id="backup">{t('profile.tab_backup')}</Tab>
                    <Tab id="account">{t('profile.tab_account')}</Tab>
                </TabList>

                <TabPanel id="profile"><ProfileTab /></TabPanel>
                <TabPanel id="preferences"><PreferencesTab /></TabPanel>
                <TabPanel id="study"><StudyTab /></TabPanel>
                <TabPanel id="backup"><BackupTab /></TabPanel>
                <TabPanel id="account"><AccountTab /></TabPanel>
            </Tabs>
        </div>
    );
};
