
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { supabase } from './lib_supabase';
import { initialisePushNotifications } from './pushNotifications';
import { setMyPresence } from './presence';
import { App } from '@capacitor/app';
import { ensureKonnektIdentity } from './services/konnektEncryption';

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
  recovery: false,
  setRecovery: () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  const currentUserId = useRef(null);

  const publishPresence = async (userId, isOnline) => {
    if (!userId) return;

    try {
      await setMyPresence(userId, isOnline);
    } catch (error) {
      console.error('KONNEKT presence update failed:', error);
    }
  };

  useEffect(() => {
    let alive = true;

    const handleSession = (nextSession) => {
      if (!alive) return;

      const nextUserId = nextSession?.user?.id || null;
      const previousUserId = currentUserId.current;

      if (previousUserId && previousUserId !== nextUserId) {
        publishPresence(previousUserId, false);
      }

      currentUserId.current = nextUserId;
      setSession(nextSession);

      if (nextUserId) {
        publishPresence(nextUserId, true);
      }

      if (nextUserId !== previousUserId) {
        void initialisePushNotifications(nextUserId);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!alive) return;

      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
      }

      if (event === 'SIGNED_OUT') {
        setRecovery(false);
      }

      handleSession(nextSession);
      setLoading(false);
    });

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;

        if (alive) {
          handleSession(data?.session || null);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error('KONNEKT session loading failed:', error);

        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;

    if (!userId || typeof document === 'undefined') return;

    // Prepare keys outside onAuthStateChange; awaited auth/client calls in that
    // callback can deadlock the Supabase auth lock.
    ensureKonnektIdentity(userId).catch(error => {
      console.warn('KONNEKT encryption identity:', error.message);
    });

    const updateBrowserPresence = () => {
      publishPresence(
        userId,
        document.visibilityState === 'visible'
      );
    };

    document.addEventListener(
      'visibilitychange',
      updateBrowserPresence
    );

    updateBrowserPresence();

    return () => {
      document.removeEventListener(
        'visibilitychange',
        updateBrowserPresence
      );
    };
  }, [session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;

    if (!userId) return;

    let active = true;
    let listener = null;

    const setupAppListener = async () => {
      try {
        const newListener = await App.addListener(
          'appStateChange',
          ({ isActive }) => {
            publishPresence(userId, !!isActive);
          }
        );

        if (!active) {
          await newListener.remove();
          return;
        }

        listener = newListener;
      } catch (error) {
        console.warn(
          'KONNEKT native lifecycle listener unavailable:',
          error
        );
      }
    };

    setupAppListener();

    return () => {
      active = false;

      if (listener) {
        listener.remove();
      }
    };
  }, [session?.user?.id]);

  const value = {
    session,
    user: session?.user || null,
    loading,
    recovery,
    setRecovery,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
