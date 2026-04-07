import { useTheme } from '../lib/ThemeContext';

export default function Login() {
  const { isDark, toggle } = useTheme();
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');

  const errorMessages = {
    not_registered: 'Your email is not registered. Ask your office admin to add you.',
    account_disabled: 'Your account has been disabled. Contact your admin.',
    auth_failed: 'Authentication failed. Please try again.',
    token_failed: 'Unable to verify your Google account. Please try again.',
    server_error: 'Something went wrong. Please try again.',
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--login-card-bg)',
        backdropFilter: 'blur(12px)',
        borderRadius: 20,
        border: '1px solid var(--border)',
        padding: 40,
        maxWidth: 400,
        width: '100%',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{
          fontSize: 32, fontWeight: 800, marginBottom: 8,
          background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          LiveTrackIQ
        </div>
        <div style={{ color: 'var(--text-faint)', fontSize: 14, marginBottom: 32 }}>
          Sales Performance Platform
        </div>

        {error && (
          <div style={{
            background: 'var(--error-bg)',
            border: '1px solid rgba(239,68,68,.3)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 24,
            color: 'var(--error-light)',
            fontSize: 13,
          }}>
            {errorMessages[error] || 'An error occurred. Please try again.'}
          </div>
        )}

        <a href="/api/auth/login" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: 'var(--google-btn-bg)',
          color: 'var(--google-btn-text)',
          padding: '12px 24px',
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 600,
          textDecoration: 'none',
          transition: 'transform .12s',
          cursor: 'pointer',
          border: '1px solid var(--border)',
        }}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with Google
        </a>

        <div style={{ color: 'var(--text-disabled)', fontSize: 12, marginTop: 24 }}>
          Your admin must add your Google email before you can sign in.
        </div>

        {/* Theme toggle on login page too */}
        <button
          onClick={toggle}
          style={{
            marginTop: 20, background: 'none', border: '1px solid var(--border)',
            color: 'var(--text-muted)', padding: '6px 14px', borderRadius: 8,
            fontSize: 12, cursor: 'pointer',
          }}
        >
          {isDark ? '\u2600\uFE0F Light Mode' : '\uD83C\uDF19 Dark Mode'}
        </button>
      </div>
    </div>
  );
}
