import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // On app load — validate stored token against server
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    // Attach token to all future requests
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    api.get('/auth/me')
      .then(res => {
        setUser(res.data.data);
      })
      .catch((err) => {
        // Token is invalid or expired — clear everything
        console.warn('Session expired or invalid token:', err?.response?.status);
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
        setUser(null);
        // Redirect to login only if currently on a protected page
        if (!window.location.pathname.includes('/login') && window.location.pathname !== '/') {
          window.location.href = '/login';
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user: userData } = res.data;

    // Store token
    localStorage.setItem('token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    // 1. Notify backend (best-effort; ignore errors so logout still completes
    //    even if backend is unreachable or token already invalid)
    try {
      await api.post('/auth/logout');
    } catch (_) { /* swallow — local cleanup is what matters */ }

    // 2. Wipe all client-side session data. We clear known keys explicitly
    //    AND wipe the rest, in case future code adds more.
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('role');
      // Wipe everything — safest in shared-device contexts (school office)
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) { /* private mode etc. — swallow */ }

    // 3. Drop the auth header from the axios client
    delete api.defaults.headers.common['Authorization'];

    // 4. Clear React state
    setUser(null);

    // 5. Hard reload to /login. Crucial for shared-device safety:
    //    - Wipes React state in memory (no cached protected pages).
    //    - Clears the in-memory React Router history so Back button can't
    //      return to a previously-rendered protected page.
    //    - Forces a fresh JS bundle so any in-memory tokens/data are gone.
    window.location.replace('/login');
  }, []);

  const updateUser = useCallback((updatedUser) => {
    setUser(prev => ({ ...prev, ...updatedUser }));
  }, []);

  // Role helpers
  const isAdmin   = user?.role === 'superAdmin' || user?.role === 'schoolAdmin';
  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';
  const isParent  = user?.role === 'parent';

  const can = (roles) => roles.includes(user?.role);

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, updateUser,
      isAdmin, isTeacher, isStudent, isParent, can,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

export default AuthContext;