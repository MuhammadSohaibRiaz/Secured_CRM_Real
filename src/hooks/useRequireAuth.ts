import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

type RequiredRole = 'admin' | 'agent' | 'any';

export function useRequireAuth(requiredRole: RequiredRole = 'any') {
  const { user, authUser, isLoading, isAdmin, isAgent } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    // Not logged in - redirect to login
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    // User is not active - sign out and redirect
    if (authUser && !authUser.isActive) {
      navigate('/login', { replace: true, state: { error: 'Your account has been deactivated.' } });
      return;
    }

    // Check role requirements
    if (requiredRole === 'admin' && !isAdmin) {
      navigate('/unauthorized', { replace: true });
      return;
    }

    if (requiredRole === 'agent' && !isAgent) {
      navigate('/unauthorized', { replace: true });
      return;
    }
  }, [user, authUser, isLoading, isAdmin, isAgent, requiredRole, navigate]);

  return {
    isLoading,
    isAuthenticated: !!user && (authUser?.isActive ?? false),
    user: authUser,
  };
}
