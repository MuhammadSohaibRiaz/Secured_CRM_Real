import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type AppRole = 'admin' | 'agent';

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: AppRole | null;
  isActive: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  authUser: AuthUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  checkIsActive: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Check interval for active status (every 30 seconds)
const ACTIVE_CHECK_INTERVAL = 30000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeCheckInterval = useRef<NodeJS.Timeout | null>(null);

  const forceLogout = useCallback(async (message: string) => {
    // Clear interval
    if (activeCheckInterval.current) {
      clearInterval(activeCheckInterval.current);
      activeCheckInterval.current = null;
    }
    
    // Sign out
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setAuthUser(null);
    
    // Show message
    toast.error(message, { duration: 10000 });
  }, []);

  const checkActiveStatus = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const { data } = await supabase.rpc('is_user_active', { _user_id: userId });
      return data ?? false;
    } catch (error) {
      console.error('Error checking active status:', error);
      return false;
    }
  }, []);

  const fetchUserDetails = useCallback(async (userId: string, email: string) => {
    try {
      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, is_active')
        .eq('user_id', userId)
        .single();

      // If user is not active, force logout immediately
      if (profile && !profile.is_active) {
        await forceLogout('Your account has been deactivated. Please contact your administrator.');
        return null;
      }

      // Fetch role using RPC to avoid RLS issues
      const { data: role } = await supabase.rpc('get_user_role', { _user_id: userId });

      const authUserData: AuthUser = {
        id: userId,
        email: email,
        fullName: profile?.full_name || email,
        role: role as AppRole | null,
        isActive: profile?.is_active ?? false,
      };

      setAuthUser(authUserData);
      return authUserData;
    } catch (error) {
      console.error('Error fetching user details:', error);
      return null;
    }
  }, [forceLogout]);

  // Periodic active status check for agents
  useEffect(() => {
    if (!user || !authUser || authUser.role !== 'agent') {
      if (activeCheckInterval.current) {
        clearInterval(activeCheckInterval.current);
        activeCheckInterval.current = null;
      }
      return;
    }

    // Start periodic check
    activeCheckInterval.current = setInterval(async () => {
      const isActive = await checkActiveStatus(user.id);
      if (!isActive) {
        await forceLogout('Your account has been deactivated by an administrator.');
      }
    }, ACTIVE_CHECK_INTERVAL);

    return () => {
      if (activeCheckInterval.current) {
        clearInterval(activeCheckInterval.current);
        activeCheckInterval.current = null;
      }
    };
  }, [user, authUser, checkActiveStatus, forceLogout]);

  // Real-time listener for profile changes (instant logout)
  useEffect(() => {
    if (!user || !authUser || authUser.role !== 'agent') return;

    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const newProfile = payload.new as { is_active?: boolean };
          if (newProfile.is_active === false) {
            await forceLogout('Your account has been deactivated by an administrator.');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, authUser, forceLogout]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer user details fetch to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserDetails(session.user.id, session.user.email || '');
          }, 0);
        } else {
          setAuthUser(null);
        }

        if (event === 'SIGNED_OUT') {
          setAuthUser(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchUserDetails(session.user.id, session.user.email || '').finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserDetails]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      // Check if user is active before allowing login
      if (data.user) {
        const isActive = await checkActiveStatus(data.user.id);
        if (!isActive) {
          await supabase.auth.signOut();
          return { error: new Error('Your account has been deactivated. Please contact your administrator.') };
        }
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    if (activeCheckInterval.current) {
      clearInterval(activeCheckInterval.current);
      activeCheckInterval.current = null;
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setAuthUser(null);
  };

  const checkIsActive = async (): Promise<boolean> => {
    if (!user) return false;
    return checkActiveStatus(user.id);
  };

  const value: AuthContextType = {
    user,
    session,
    authUser,
    isLoading,
    isAdmin: authUser?.role === 'admin',
    isAgent: authUser?.role === 'agent',
    signIn,
    signOut,
    checkIsActive,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
