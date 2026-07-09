import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';

/** True when the signed-in user's email is an app admin (drives the sidebar
 *  Diagnostics item). Extracted from AppLayout so the sidebar can reuse it. */
export function useIsAdmin(): boolean {
    const { user } = useAuthStore();
    const [isAdmin, setIsAdmin] = useState(false);
    useEffect(() => {
        let cancelled = false;
        if (user?.email) {
            window.electronAPI.obs.isAdmin(user.email).then((v) => {
                if (!cancelled) setIsAdmin(v);
            });
        } else {
            setIsAdmin(false);
        }
        return () => {
            cancelled = true;
        };
    }, [user?.email]);
    return isAdmin;
}
