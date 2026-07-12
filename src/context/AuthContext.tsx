'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { dbService, UserProfile } from '@/lib/db';
import { GuestDataService } from '@/lib/guestDataService';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isMockMode: boolean;
  isGuest: boolean;
  login: (email: string, password_plain: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, display_name: string, password_plain: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Keep a ref so the stable onAuthStateChange closure can read the latest pathname
  const pathnameRef = React.useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  // Refresh user profile from DB and update state
  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    try {
      const profile = await dbService.getCurrentUser();
      setUser(profile);
      if (profile) setIsGuest(false);
      return profile;
    } catch (e) {
      console.error('Error refreshing profile:', e);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Wait for the user_profiles row to be created by the DB trigger after signup.
  // Supabase fires SIGNED_IN before the trigger commits, so we retry with backoff.
  const waitForProfile = useCallback(async (maxAttempts = 8): Promise<UserProfile | null> => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const profile = await dbService.getCurrentUser();
        if (profile) return profile;
      } catch (_) {
        // profile row not ready yet — keep retrying
      }
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
    return null;
  }, []);

  useEffect(() => {
    // Initial session check on mount
    refreshProfile().then((profile) => {
      if (!profile) setIsGuest(true);
    });

    if (isSupabaseConfigured && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          // Wait for the user_profiles trigger to commit before proceeding
          const profile = await waitForProfile();
          if (profile) {
            setUser(profile);
            setIsGuest(false);
            setLoading(false);

            // Merge pending guest data now that the profile row is guaranteed to exist
            const guestData = GuestDataService.read();
            console.log('[auth-merge] event:', event, '| completions:', guestData ? Object.keys(guestData.completions).length : 0);
            if (guestData && Object.keys(guestData.completions).length > 0) {
              try {
                const mergeResult = await dbService.mergeGuestData(profile.id, guestData);
                console.log('[auth-merge] result:', mergeResult);
                if (mergeResult.success) {
                  GuestDataService.clear();
                  await refreshProfile();
                } else {
                  console.error('[auth-merge] error:', mergeResult.error);
                }
              } catch (err) {
                console.error('[auth-merge] exception:', err);
              }
            }

            if (pathnameRef.current === '/auth') {
              router.push('/');
            }
          } else {
            console.error('[auth-merge] profile never appeared after retries');
            setLoading(false);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsGuest(true);
          setLoading(false);
          router.push('/');
        }
      });

      return () => { subscription.unsubscribe(); };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — pathnameRef keeps pathname current without re-subscribing

  const login = async (email: string, password_plain: string) => {
    setLoading(true);
    try {
      const res = await dbService.signIn(email, password_plain);
      if (res.success) {
        if (!isSupabaseConfigured) {
          // Mock mode: no onAuthStateChange, handle merge manually
          const profile = await refreshProfile();
          if (profile) {
            const guestData = GuestDataService.read();
            if (guestData && Object.keys(guestData.completions).length > 0) {
              try {
                await dbService.mergeGuestData(profile.id, guestData);
                GuestDataService.clear();
                await refreshProfile();
              } catch (err) {
                console.error('[guest-merge] merge failed, guest data preserved:', err);
              }
            }
            router.push('/');
          }
        } else {
          // Supabase mode: onAuthStateChange handles everything,
          // but reset loading so the UI isn't stuck if confirm-email is enabled
          setLoading(false);
        }
        return { success: true };
      } else {
        setLoading(false);
        return { success: false, error: res.error };
      }
    } catch (err: any) {
      setLoading(false);
      return { success: false, error: err.message || 'An unexpected error occurred.' };
    }
  };

  const signup = async (email: string, display_name: string, password_plain: string) => {
    setLoading(true);
    try {
      const res = await dbService.signUp(email, display_name, password_plain);
      if (res.success) {
        if (!isSupabaseConfigured) {
          // Mock mode: no onAuthStateChange, handle merge manually
          const profile = await refreshProfile();
          if (profile) {
            const guestData = GuestDataService.read();
            if (guestData && Object.keys(guestData.completions).length > 0) {
              try {
                await dbService.mergeGuestData(profile.id, guestData);
                GuestDataService.clear();
                await refreshProfile();
              } catch (err) {
                console.error('[guest-merge] merge failed, guest data preserved:', err);
              }
            }
            router.push('/');
          }
        } else {
          // Supabase mode: reset loading — onAuthStateChange fires when session exists
          setLoading(false);
        }
        return res;
      }
      setLoading(false);
      return res;
    } catch (err: any) {
      setLoading(false);
      return { success: false, error: err.message || 'An unexpected error occurred.' };
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await dbService.signOut();
      setUser(null);
      setIsGuest(true);
      // Clear any leftover guest data so a subsequent user on this device
      // doesn't accidentally inherit it
      GuestDataService.clear();
      router.push('/');
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = user?.role === 'admin';
  const isMockMode = !isSupabaseConfigured;

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isMockMode, isGuest, login, signup, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
