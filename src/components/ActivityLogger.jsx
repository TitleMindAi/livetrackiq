import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { ACTIVITY_TYPES, LEAD_SOURCES, FEATURE_FLAGS } from '../lib/constants';

/**
 * ActivityLogger — Hank v2 expanded logger (all 8 trackables)
 * Behind FEATURE_FLAGS.ff_log_activities. Falls back to QuoteLogger on API error
 * (e.g., migration not yet applied → 503 MIGRATION_REQUIRED).
 *
 * Design notes (per Hank 2026-04-24):
 * - Customer name (no phone/email needed at this stage)
 * - Lead Source dropdown + free-text "Other"
 * - Lead Temperature (searchable field — planned enhancement)
 * - No premium at log time (premium collected on Submit App flow)
 */
export default function ActivityLogger({ onFallback }) {
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    activityType: '',
    activityTypes: [],          // ff_activity_multiselect: list of selected types
    count: 1,
    customerName: '',
    leadSource: '',
    leadSourceOther: '',
    leadTemperature: '',
  });
  const [migrationPending, setMigrationPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getTodayActivities()
      .then(d => {
        if (cancelled) return;
        setTotals(d.totals || {});
        if (d.migrationPending) setMigrationPending(true);
      })
      .catch(err => {
        console.error('Load activities error:', err);
        if (onFallback) onFallback(err);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [onFallback]);

  const resetForm = () => setForm(f => ({ ...f, activityType: '', activityTypes: [], count: 1, customerName: '', leadSource: '', leadSourceOther: '', leadTemperature: '' }));

  // ff_activity_multiselect: derive selected list (legacy fallback to single)
  const selectedTypes = FEATURE_FLAGS.ff_activity_multiselect
    ? (form.activityTypes.length > 0 ? form.activityTypes : (form.activityType ? [form.activityType] : []))
    : (form.activityType ? [form.activityType] : []);

  const toggleType = (key) => {
    if (!FEATURE_FLAGS.ff_activity_multiselect) {
      setForm(f => ({ ...f, activityType: key, activityTypes: [key] }));
      return;
    }
    setForm(f => {
      const set = new Set(f.activityTypes);
      if (set.has(key)) set.delete(key); else set.add(key);
      const arr = Array.from(set);
      return { ...f, activityTypes: arr, activityType: arr[0] || '' };
    });
  };

  const log = async () => {
    if (selectedTypes.length === 0) {
      setToast({ type: 'error', message: 'Pick at least one activity type' });
      setTimeout(() => setToast(null), 2500);
      return;
    }
    const resolvedSource = FEATURE_FLAGS.ff_lead_sources && form.leadSource
      ? (form.leadSource === 'other' ? (form.leadSourceOther.trim() || 'other') : form.leadSource)
      : undefined;
    const count = parseInt(form.count) || 1;

    setSubmitting(true);
    try {
      // Sequential to keep server-side validation simple; small N (1–8) so latency is fine
      const results = [];
      for (const type of selectedTypes) {
        const isSubmittedApp = type === 'submitted_app';
        // eslint-disable-next-line no-await-in-loop
        await api.logActivity({
          activityType: type,
          count,
          customerName: form.customerName.trim() || undefined,
          leadSource: resolvedSource,
          leadTemperature: !isSubmittedApp && form.leadTemperature ? form.leadTemperature : undefined,
        });
        results.push(type);
      }
      setTotals(prev => {
        const next = { ...prev };
        for (const type of results) next[type] = (next[type] || 0) + count;
        return next;
      });
      const labels = results.map(t => ACTIVITY_TYPES.find(a => a.key === t)?.label || t).join(', ');
      setToast({ type: 'success', message: `Logged ×${count}: ${labels}` });
      setTimeout(() => setToast(null), 2200);
      resetForm();
    } catch (err) {
      if (/MIGRATION_REQUIRED|not migrated/i.test(err.message || '')) {
        setMigrationPending(true);
        setToast({ type: 'error', message: 'Migration pending — ask admin to run migrations/001' });
      } else {
        setToast({ type: 'error', message: err.message });
      }
      setTimeout(() => setToast(null), 3500);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div style={{ marginBottom: 24 }}>
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

      <div style={{
        borderRadius: 12, padding: 16,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
        }}>
          <span style={{
            color: 'var(--text-faint)', fontSize: 11, fontWeight: 700,
            letterSpacing: '.1em', textTransform: 'uppercase',
          }}>
            Log Activities
          </span>
          {migrationPending && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: 'var(--error-bg)', color: 'var(--error)',
            }}>
              Migration pending
            </span>
          )}
        </div>

        {/* Totals strip — 8 mini counters */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 14,
        }}>
          {ACTIVITY_TYPES.map(a => {
            const count = totals[a.key] || 0;
            const isActive = selectedTypes.includes(a.key);
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => toggleType(a.key)}
                style={{
                  padding: '8px 6px', borderRadius: 10,
                  background: isActive ? `${a.color}22` : 'var(--bg-inner)',
                  border: `1.5px solid ${isActive ? a.color : 'var(--border-input)'}`,
                  color: 'var(--text)', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  fontSize: 11, fontWeight: 600, lineHeight: 1.2, textAlign: 'center',
                  transition: 'all .12s',
                }}
                title={a.label}
              >
                <span style={{ fontSize: 16 }}>{a.icon}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: a.color }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Quick entry row */}
        {selectedTypes.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 120px 80px auto',
            gap: 8, alignItems: 'center',
          }}>
            <input
              placeholder="Customer name"
              value={form.customerName}
              onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
              style={inputStyle}
            />
            <select
              value={form.leadSource}
              onChange={e => setForm(f => ({ ...f, leadSource: e.target.value }))}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Lead source…</option>
              {LEAD_SOURCES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            {form.leadSource === 'other' ? (
              <input
                placeholder="Specify"
                value={form.leadSourceOther}
                onChange={e => setForm(f => ({ ...f, leadSourceOther: e.target.value }))}
                style={inputStyle}
              />
            ) : (
              <select
                disabled={selectedTypes.length > 0 && selectedTypes.every(t => t === 'submitted_app')}
                value={form.leadTemperature}
                onChange={e => setForm(f => ({ ...f, leadTemperature: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer', opacity: (selectedTypes.length > 0 && selectedTypes.every(t => t === 'submitted_app')) ? 0.5 : 1 }}
              >
                <option value="">Lead temp…</option>
                <option value="hot">Hot</option>
                <option value="medium">Warm</option>
                <option value="cold">Cold</option>
              </select>
            )}
            <input
              type="number"
              min={1}
              value={form.count}
              onChange={e => setForm(f => ({ ...f, count: e.target.value }))}
              style={inputStyle}
            />
            <button
              onClick={log}
              disabled={submitting}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: submitting ? 'var(--border)' : 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
                color: 'var(--accent-text)', border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? '…' : 'Log'}
            </button>
            <button
              onClick={resetForm}
              disabled={submitting}
              style={{
                padding: '8px 10px', borderRadius: 8, fontSize: 12,
                background: 'var(--bg-input)', color: 'var(--text-muted)',
                border: '1px solid var(--border-input)', cursor: 'pointer',
              }}
              title="Cancel"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
  color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
};
