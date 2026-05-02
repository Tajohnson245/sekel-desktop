import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useProfileStore } from '../stores/profileStore';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { LogOut, User as UserIcon } from 'lucide-react';

export const UserProfile: React.FC = () => {
    const { user, signOut } = useAuthStore();
    const { profile, fetchProfile } = useProfileStore();
    const { t } = useTranslation();
    const { goToProfile } = useAppNavigation();

    useEffect(() => {
        if (user?.id && !profile) {
            fetchProfile(user.id);
        }
    }, [user?.id, profile, fetchProfile]);

    if (!user) return null;

    return (
        <div className="user-profile-compact">
            <div
                className="user-icon-badge clickable"
                title={user.email || t('auth.profile')}
                onClick={() => goToProfile()}
                style={{ cursor: 'pointer', overflow: 'hidden' }}
            >
                {profile?.avatar_url ? (
                    <img
                        src={profile.avatar_url}
                        alt="Avatar"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                ) : (
                    <UserIcon size={18} />
                )}
            </div>
            <button className="btn-icon sign-out-btn" onClick={signOut} title={t('auth.logout')}>
                <LogOut size={18} />
            </button>
        </div>
    );
};
