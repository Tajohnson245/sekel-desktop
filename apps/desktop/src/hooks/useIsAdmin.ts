import { useAuthStore } from '../stores/authStore';
import { isAdminUser } from '../lib/adminApi';

/** True when the signed-in user has the admin role (drives the sidebar
 *  Diagnostics item). Only decides what UI to show: the admin edge function
 *  checks the role again on every call. */
export function useIsAdmin(): boolean {
    const user = useAuthStore((s) => s.user);
    return isAdminUser(user);
}
