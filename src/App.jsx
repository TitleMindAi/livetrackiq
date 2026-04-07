import { useState, useEffect } from 'react';
import { useAuth } from './lib/AuthContext';
import { useTheme } from './lib/ThemeContext';
import ErrorBoundary from './lib/ErrorBoundary';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Intake from './pages/Intake';
import Goals from './pages/Goals';
import Admin from './pages/Admin';

/**
 * LiveTrackIQ — Main App
 *
 * Simple hash-based routing (no extra dependency).
 * Agent views = desktop-optimized (1200px+)
 * Admin views = mobile-first
 */
export default function App() {
  const { user, loading, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const [page, setPage] = useState(getPage());

  // Listen for hash changes
  useEffect(() => {
    const handler = () => setPage(getPage());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--text-muted)', fontSize: 16,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#9889;</div>
          Loading LiveTrackIQ...
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  const isAdmin = ['admin', 'team_leader'].includes(user.role);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation Bar */}
      <nav style={{
        background: 'var(--bg-nav)',
        borderBottom: '1px solid var(--border-separator)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(12px)',
        transition: 'background .25s, border-color .25s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{
            fontWeight: 800, fontSize: 18,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            cursor: 'pointer',
          }} onClick={() => navigate('')}>
            LiveTrackIQ
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <NavBtn active={page === ''} onClick={() => navigate('')}>Dashboard</NavBtn>
            <NavBtn active={page === 'intake'} onClick={() => navigate('intake')}>
              + Submit App
            </NavBtn>
            <NavBtn active={page === 'goals'} onClick={() => navigate('goals')}>Goals</NavBtn>
            {isAdmin && (
              <NavBtn active={page === 'admin'} onClick={() => navigate('admin')}>Admin</NavBtn>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Theme Toggle */}
          <button
            onClick={toggle}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              width: 34, height: 34, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 16,
              transition: 'all .25s',
            }}
          >
            {isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
          </button>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{user.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{user.officeName}</div>
          </div>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'var(--accent-text)',
            }}>
              {user.initials}
            </div>
          )}
          <button onClick={logout} style={{
            background: 'none', border: '1px solid var(--border)',
            color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 8,
            fontSize: 12, cursor: 'pointer',
          }}>
            Sign Out
          </button>
        </div>
      </nav>

      {/* Page Content */}
      <ErrorBoundary>
        <main style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column' }}>
          {page === '' && <Dashboard />}
          {page === 'intake' && <Intake />}
          {page === 'goals' && <Goals />}
          {page === 'admin' && isAdmin && <Admin />}
        </main>
      </ErrorBoundary>
    </div>
  );
}

function NavBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'var(--accent-bg)' : 'transparent',
      border: active ? '1px solid var(--accent-border)' : '1px solid transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      padding: '6px 14px',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all .15s',
    }}>
      {children}
    </button>
  );
}

function getPage() {
  return window.location.hash.replace('#/', '').replace('#', '') || '';
}

function navigate(page) {
  window.location.hash = `#/${page}`;
}
