import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAuth } from './auth';
import { getProfile, type Role } from './profiles';

export function useRole(): { role: Role | null; loading: boolean } {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user) {
        setRole(null);
        setLoading(false);
        return () => {
          active = false;
        };
      }
      getProfile(user.id).then((profile) => {
        if (!active) return;
        const metaRole = user.user_metadata?.role as string | undefined;
        const resolved =
          (profile?.role as Role | undefined) ??
          (metaRole === 'admin' || metaRole === 'teacher' || metaRole === 'student'
            ? (metaRole as Role)
            : null);
        setRole(resolved);
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [user])
  );

  return { role, loading };
}