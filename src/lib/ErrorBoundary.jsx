import { Component } from 'react';

/**
 * ErrorBoundary — Catches React rendering errors
 *
 * Class component required for error boundary lifecycle.
 * Shows friendly error UI with reload/dashboard options.
 * Nav bar remains functional if page content crashes.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, expanded: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console for debugging
    console.error('ErrorBoundary caught error:', error);
    console.error('Error info:', info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          padding: '24px',
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--error-bg)',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '480px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}>
            {/* Error Icon */}
            <div style={{
              fontSize: '48px',
              marginBottom: '16px',
              textAlign: 'center',
            }}>
              ⚠️
            </div>

            {/* Headline */}
            <h2 style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--text)',
              textAlign: 'center',
            }}>
              Something went wrong
            </h2>

            {/* Subtitle */}
            <p style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}>
              We've logged this error. Try reloading or return to the dashboard.
            </p>

            {/* Error Details (Expandable) */}
            <div style={{
              marginBottom: '24px',
            }}>
              <button
                onClick={() => this.setState(s => ({ expanded: !s.expanded }))}
                style={{
                  background: 'var(--bg-inner)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'all .2s',
                }}
              >
                {this.state.expanded ? '▼' : '▶'} Error Details
              </button>

              {this.state.expanded && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: 'var(--bg-inner-deep)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: 'var(--text-faint)',
                  maxHeight: '200px',
                  overflow: 'auto',
                  wordBreak: 'break-word',
                }}>
                  {this.state.error?.toString()}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '12px',
              flexDirection: 'column',
            }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: 'var(--accent)',
                  color: 'var(--accent-text)',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all .2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.target.style.opacity = '1';
                }}
              >
                Reload Page
              </button>

              <button
                onClick={() => {
                  window.location.hash = '#/';
                }}
                style={{
                  background: 'transparent',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all .2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'var(--accent-bg)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'transparent';
                }}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
