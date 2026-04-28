import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { APP_TYPES, LINES, FEATURE_FLAGS } from '../lib/constants';

/**
 * QuoteLogger — Quick-entry quote logging card
 * Compact inline inputs for 4 lines with real-time totals
 */
export default function QuoteLogger() {
  const [inputs, setInputs] = useState({
    auto: '',
    fire: '',
    life: '',
    disability: '',
  });
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // Load today's quotes
  useEffect(() => {
    api.getTodayQuotes()
      .then(data => {
        setTotals(data.quotes || {});
      })
      .catch(err => console.error('Load quotes error:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleInputChange = (line, value) => {
    setInputs(prev => ({ ...prev, [line]: value }));
  };

  const handleLog = async (line) => {
    const count = parseInt(inputs[line]) || 0;
    if (count === 0) {
      setToast({ type: 'error', message: 'Enter a count > 0' });
      setTimeout(() => setToast(null), 2500);
      return;
    }

    setSubmitting(true);
    try {
      await api.logQuotes({ line, count });
      setTotals(prev => ({
        ...prev,
        [line]: (prev[line] || 0) + count,
      }));
      setInputs(prev => ({ ...prev, [line]: '' }));
      setToast({ type: 'success', message: `+${count} ${line} quote(s)` });
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'success'
            ? 'linear-gradient(135deg, var(--success-toast-a), var(--success-toast-b))'
            : 'linear-gradient(135deg, var(--error-toast-a), var(--error-toast-b))',
          border: `1px solid ${toast.type === 'success' ? 'var(--success)' : 'var(--error)'}`,
          borderRadius: 12, padding: '10px 20px', zIndex: 200,
          color: '#fff', fontWeight: 600, fontSize: 13,
          boxShadow: '0 8px 32px rgba(0,0,0,.5)',
        }}>
          {toast.message}
        </div>
      )}

      {/* Card */}
      <div style={{
        borderRadius: 12, padding: 16,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        transition: 'background .25s, border-color .25s',
      }}>
        <div style={{
          color: 'var(--text-faint)', fontSize: 11, fontWeight: 700,
          letterSpacing: '.1em', marginBottom: 12, textTransform: 'uppercase',
        }}>
          {FEATURE_FLAGS.ff_log_activities ? 'Log Activities' : 'Log Quotes'}
        </div>

        {/* Grid: 4 columns for 4 lines */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {LINES.map(line => {
            const info = APP_TYPES[line];
            const count = totals[line] || 0;

            return (
              <div key={line} style={{
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                {/* Line Label + Today's Total */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: info.color }}>
                    {info.icon} {info.shortLabel || info.label.split(' ')[0]}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--text-disabled)',
                  }}>
                    {count}
                  </span>
                </div>

                {/* Input + Button */}
                <div style={{
                  display: 'flex', gap: 6, alignItems: 'stretch',
                }}>
                  <input
                    type="number"
                    placeholder="0"
                    value={inputs[line]}
                    onChange={e => handleInputChange(line, e.target.value)}
                    min="0"
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-input)',
                      color: 'var(--text)',
                      fontSize: 13,
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={() => handleLog(line)}
                    disabled={submitting || !inputs[line]}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: inputs[line] ? info.color : 'var(--border)',
                      border: 'none',
                      color: inputs[line] ? '#fff' : 'var(--text-disabled)',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: inputs[line] && !submitting ? 'pointer' : 'not-allowed',
                      transition: 'all .12s',
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
