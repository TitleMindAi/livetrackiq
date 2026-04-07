import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

/**
 * Semantic color tokens for dark and light themes.
 * Every inline style references these via CSS custom properties (var(--xxx))
 * so toggling the theme updates the entire UI in one shot.
 */
const THEMES = {
  dark: {
    '--bg-primary':        '#020617',
    '--bg-nav':            'rgba(15,23,42,.95)',
    '--bg-card':           'rgba(30,41,59,.5)',
    '--bg-input':          'rgba(30,41,59,.8)',
    '--bg-inner':          'rgba(15,23,42,.5)',
    '--bg-inner-deep':     'rgba(15,23,42,.6)',
    '--bg-hover':          'rgba(30,41,59,.6)',
    '--border':            '#334155',
    '--border-input':      '#475569',
    '--border-separator':  '#1e293b',
    '--text':              '#f8fafc',
    '--text-secondary':    '#e2e8f0',
    '--text-muted':        '#94a3b8',
    '--text-faint':        '#64748b',
    '--text-disabled':     '#475569',
    '--accent':            '#fbbf24',
    '--accent-secondary':  '#f59e0b',
    '--accent-text':       '#020617',
    '--accent-bg':         'rgba(251,191,36,.15)',
    '--accent-border':     '#fbbf24',
    '--success':           '#10b981',
    '--success-bg':        'rgba(16,185,129,.15)',
    '--success-toast-a':   '#065f46',
    '--success-toast-b':   '#064e3b',
    '--error':             '#ef4444',
    '--error-light':       '#fca5a5',
    '--error-bg':          'rgba(239,68,68,.15)',
    '--error-toast-a':     '#7f1d1d',
    '--error-toast-b':     '#450a0a',
    '--avatar-bg-a':       '#334155',
    '--avatar-bg-b':       '#1e293b',
    '--avatar-text':       '#94a3b8',
    '--scrollbar-track':   'rgba(100,116,139,.1)',
    '--scrollbar-thumb':   '#334155',
    '--google-btn-bg':     '#ffffff',
    '--google-btn-text':   '#1f2937',
    '--login-card-bg':     'rgba(30,41,59,.6)',
  },
  light: {
    '--bg-primary':        '#f1f5f9',
    '--bg-nav':            'rgba(255,255,255,.95)',
    '--bg-card':           'rgba(255,255,255,.85)',
    '--bg-input':          '#f1f5f9',
    '--bg-inner':          '#e2e8f0',
    '--bg-inner-deep':     '#e2e8f0',
    '--bg-hover':          'rgba(241,245,249,.9)',
    '--border':            '#cbd5e1',
    '--border-input':      '#94a3b8',
    '--border-separator':  '#e2e8f0',
    '--text':              '#0f172a',
    '--text-secondary':    '#1e293b',
    '--text-muted':        '#475569',
    '--text-faint':        '#64748b',
    '--text-disabled':     '#94a3b8',
    '--accent':            '#d97706',
    '--accent-secondary':  '#b45309',
    '--accent-text':       '#ffffff',
    '--accent-bg':         'rgba(217,119,6,.12)',
    '--accent-border':     '#d97706',
    '--success':           '#059669',
    '--success-bg':        'rgba(5,150,105,.12)',
    '--success-toast-a':   '#d1fae5',
    '--success-toast-b':   '#a7f3d0',
    '--error':             '#dc2626',
    '--error-light':       '#dc2626',
    '--error-bg':          'rgba(220,38,38,.1)',
    '--error-toast-a':     '#fee2e2',
    '--error-toast-b':     '#fecaca',
    '--avatar-bg-a':       '#cbd5e1',
    '--avatar-bg-b':       '#e2e8f0',
    '--avatar-text':       '#475569',
    '--scrollbar-track':   'rgba(100,116,139,.08)',
    '--scrollbar-thumb':   '#94a3b8',
    '--google-btn-bg':     '#ffffff',
    '--google-btn-text':   '#1f2937',
    '--login-card-bg':     'rgba(255,255,255,.85)',
  },
};

function applyTheme(mode) {
  const tokens = THEMES[mode];
  const root = document.documentElement.style;
  for (const [prop, value] of Object.entries(tokens)) {
    root.setProperty(prop, value);
  }
  // Also set body background directly for instant paint
  document.body.style.background = tokens['--bg-primary'];
  document.body.style.color = tokens['--text'];
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem('ltiq_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    applyTheme(mode);
    try {
      localStorage.setItem('ltiq_theme', mode);
    } catch {}
  }, [mode]);

  const toggle = () => setMode(m => m === 'dark' ? 'light' : 'dark');
  const isDark = mode === 'dark';

  return (
    <ThemeContext.Provider value={{ mode, isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
