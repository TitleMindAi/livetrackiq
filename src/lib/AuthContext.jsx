import { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initial auth check
  useEffect(() => {
    api.getMe()
      .then(data => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Periodic session check (every 5 minutes)
  useEffect(() => {
    if (!user) return; // Don't poll if not logged in

    const checkSession = async () => {
      try {
        const data = await api.getMe();
        if (data.user === null) {
          // Session expired
          setUser(null);
          window.location.href = '/login?session_expired=true';
        }
      } catch (err) {
        // Network error or 401 — session likely expired
        setUser(null);
        window.location.href = '/login?session_expired=true';
      }
    };

    const intervalId = setInterval(checkSession, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(intervalId);
  }, [user]);

  const logout = async () => {
    await api.logout();
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
