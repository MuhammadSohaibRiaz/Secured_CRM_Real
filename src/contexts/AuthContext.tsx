import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserDetails = useCallback(async (userId: string, email: string) => {
    try {
      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, is_active')
        .eq('user_id', userId)
        .single();

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
  }, []);

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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setAuthUser(null);
  };

  const checkIsActive = async (): Promise<boolean> => {
    if (!user) return false;

    const { data } = await supabase.rpc('is_user_active', { _user_id: user.id });
    return data ?? false;
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
