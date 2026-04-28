import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { ACTIVITY_TYPES, APP_TYPES, FEATURE_FLAGS } from '../lib/constants';

/**
 * OpenQuotes — Hank Sprint 2
 * Lists logged quote/presentation activities awaiting Submit App.
 * Each row: agent finds quote → clicks Submit → premium modal → app created.
 *
 * Premium label per Hank:
 *   Auto = 6-month premium
 *   Fire = 12-month premium
 *   Life = monthly premium
 *   Disability = monthly premium
 *
 * Behind FEATURE_FLAGS.ff_quote_to_app — falls back gracefully if not migrated.
 */

const PREMIUM_LABELS = {
  auto: '6-month premium',
  fire: '12-month premium',
  life: 'Monthly premium',
  disability: 'Monthly premium',
};

const ACTIVITY_TYPE_TO_LINE = {
  auto_quote: 'auto',
  fire_quote: 'fire',
  life_presentation: 'life',
  disability_presentation: 'disability',
};

export default function OpenQuotes({ refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [activeRow, setActiveRow] = useState(null); // the quote being converted
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ premium: '', premiums: [''], productType: '', customerName: '', notes: '' });
  // ff_open_quotes_filters
  const [filters, setFilters] = useState({ q: '', leadTemp: '', activityType: '', agentId: '', productType: '' });

  const load = useCallback(() => {
    setLoading(true);
    api.getOpenQuotes({ days: 14 })
      .then(d => {
        setRows(d.openQuotes || []);
        if (d.migrationPending) setMigrationPending(true);
      })
      .catch(err => console.error('Open quotes load error:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const openModal = (row) => {
    const line = ACTIVITY_TYPE_TO_LINE[row.activity_type];
    const firstType = APP_TYPES[line]?.types?.[0] || '';
    const n = Math.max(1, parseInt(row.count) || 1);
    setActiveRow(row);
    setForm({
      premium: '',
      // Hank 2026-04-28: one premium input per app when count > 1
      premiums: Array.from({ length: n }, () => ''),
      productType: firstType,
      customerName: row.customer_name || '',
      notes: '',
    });
  };

  const closeModal = () => { setActiveRow(null); setSubmitting(false); };

  const submit = async () => {
    if (!activeRow) return;
    if (!form.productType) {
      setToast({ type: 'error', message: 'Pick a product type' });
      setTimeout(() => setToast(null), 2500);
      return;
    }

    // ff_premium_per_app: collect array if multiple inputs are present
    const useArray = FEATURE_FLAGS.ff_premium_per_app && form.premiums.length > 1;
    let payload;
    if (useArray) {
      const parsed = form.premiums.map(v => parseFloat(v));
      if (parsed.some(p => isNaN(p) || p < 0)) {
        setToast({ type: 'error', message: 'Enter a valid premium for each app' });
        setTimeout(() => setToast(null), 2500);
        return;
      }
      payload = {
        premiums: parsed,
        productType: form.productType,
        customerName: form.customerName.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
    } else {
      const single = parseFloat(form.premiums[0] || form.premium);
      if (isNaN(single) || single < 0) {
        setToast({ type: 'error', message: 'Enter a valid premium' });
        setTimeout(() => setToast(null), 2500);
        return;
      }
      payload = {
        premium: single,
        productType: form.productType,
        customerName: form.customerName.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
    }

    setSubmitting(true);
    try {
      const res = await api.submitAppFromActivity(activeRow.id, payload);
      const n = res?.applicationIds?.length || 1;
      setToast({ type: 'success', message: `${n} app${n > 1 ? 's' : ''} submitted for ${form.customerName || 'quote'}` });
      setTimeout(() => setToast(null), 2500);
      closeModal();
      load();
    } catch (err) {
      if (/MIGRATION_REQUIRED|Migration 002/i.test(err.message || '')) {
        setMigrationPending(true);
        setToast({ type: 'error', message: 'Migration 002 required' });
      } else {
        setToast({ type: 'error', message: err.message });
      }
      setTimeout(() => setToast(null), 3500);
    } finally {
      setSubmitting(false);
    }
  };

  if (!FEATURE_FLAGS.ff_quote_to_app) return null;
  if (loading) return null;

  // Hank 2026-04-28: temperature → color
  const tempColor = (t) => {
    if (t === 'hot') return { bg: 'rgba(239,68,68,.18)', fg: '#ef4444', label: 'Hot' };
    if (t === 'medium' || t === 'warm') return { bg: 'rgba(245,158,11,.18)', fg: '#f59e0b', label: 'Warm' };
    if (t === 'cold') return { bg: 'rgba(59,130,246,.18)', fg: '#3b82f6', label: 'Cold' };
    return null;
  };

  // ff_open_quotes_filters: client-side filter pipeline
  const filtered = FEATURE_FLAGS.ff_open_quotes_filters
    ? rows.filter(r => {
        if (filters.q) {
          const q = filters.q.toLowerCase();
          const hay = [
            r.customer_name, r.lead_source, r.lead_temperature,
            r.activity_type, r.agent_name,
          ].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (filters.leadTemp && r.lead_temperature !== filters.leadTemp) return false;
        if (filters.activityType && r.activity_type !== filters.activityType) return false;
        if (filters.agentId && String(r.agent_id) !== String(filters.agentId)) return false;
        // Product type isn't on the activity yet (only resolved at submit) — keep slot
        // for parity once column lands; today it's a no-op until then.
        return true;
      })
    : rows;
  // Distinct values for dropdowns
  const distinctAgents = Array.from(new Map(rows.map(r => [r.agent_id, r.agent_name])).entries());
  const distinctTypes = Array.from(new Set(rows.map(r => r.activity_type)));

  return (
    <div style={{ marginBottom: 24 }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'success'
            ? 'linear-gradient(135deg, var(--success-toast-a), var(--success-toast-b))'
            : 'linear-gradient(135deg, var(--error-toast-a), var(--error-toast-b))',
          border: `1px solid ${toast.type === 'success' ? 'var(--success)' : 'var(--error)'}`,
          borderRadius: 12, padding: '10px 20px', zIndex: 300,
          color: '#fff', fontWeight: 600, fontSize: 13,
          boxShadow: '0 8px 32px rgba(0,0,0,.5)',
        }}>
          {toast.message}
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{
            color: 'var(--text-faint)', fontSize: 11, fontWeight: 700,
            letterSpacing: '.1em', textTransform: 'uppercase',
          }}>
            Open Quotes — Submit App
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>
            {filtered.length}/{rows.length} · last 14 days
          </span>
        </div>

        {/* Hank 2026-04-28: searchable filter bar */}
        {FEATURE_FLAGS.ff_open_quotes_filters && rows.length > 0 && (
          <div style={{
            display: 'grid', gap: 6, marginBottom: 10,
            gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr auto',
          }}>
            <input
              placeholder="Search customer, source, agent…"
              value={filters.q}
              onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
              style={filterInput}
            />
            <select
              value={filters.leadTemp}
              onChange={e => setFilters(f => ({ ...f, leadTemp: e.target.value }))}
              style={filterInput}
            >
              <option value="">Any temp</option>
              <option value="hot">🔥 Hot</option>
              <option value="medium">🟡 Warm</option>
              <option value="cold">❄️ Cold</option>
            </select>
            <select
              value={filters.activityType}
              onChange={e => setFilters(f => ({ ...f, activityType: e.target.value }))}
              style={filterInput}
            >
              <option value="">Any quote type</option>
              {distinctTypes.map(t => {
                const def = ACTIVITY_TYPES.find(a => a.key === t);
                return <option key={t} value={t}>{def?.label || t}</option>;
              })}
            </select>
            <select
              value={filters.agentId}
              onChange={e => setFilters(f => ({ ...f, agentId: e.target.value }))}
              style={filterInput}
            >
              <option value="">Any salesperson</option>
              {distinctAgents.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <select
              value={filters.productType}
              onChange={e => setFilters(f => ({ ...f, productType: e.target.value }))}
              style={filterInput}
              title="Product type is captured at Submit; placeholder for parity"
              disabled
            >
              <option value="">Any product</option>
            </select>
            <button
              type="button"
              onClick={() => setFilters({ q: '', leadTemp: '', activityType: '', agentId: '', productType: '' })}
              style={{
                padding: '6px 10px', borderRadius: 6, fontSize: 11,
                background: 'var(--bg-input)', color: 'var(--text-muted)',
                border: '1px solid var(--border-input)', cursor: 'pointer',
              }}
              title="Clear filters"
            >
              Clear
            </button>
          </div>
        )}

        {migrationPending && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 10,
            background: 'var(--error-bg)', color: 'var(--error)', fontSize: 12,
          }}>
            Migration 002 not applied — Submit App from quote disabled until DB updated.
          </div>
        )}

        {rows.length === 0 ? (
          <div style={{ color: 'var(--text-disabled)', fontSize: 13, padding: 20, textAlign: 'center' }}>
            No open quotes. Log an Auto/Fire quote or Life/Disability presentation in Activities above.
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--text-disabled)', fontSize: 13, padding: 20, textAlign: 'center' }}>
            No quotes match your filters. <button
              onClick={() => setFilters({ q: '', leadTemp: '', activityType: '', agentId: '', productType: '' })}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}
            >Clear</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(row => {
              const line = ACTIVITY_TYPE_TO_LINE[row.activity_type];
              const info = APP_TYPES[line];
              const def = ACTIVITY_TYPES.find(a => a.key === row.activity_type);
              const tc = tempColor(row.lead_temperature);
              return (
                <div key={row.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr 1fr auto auto auto auto',
                  gap: 10, alignItems: 'center',
                  padding: '8px 10px', borderRadius: 8,
                  background: 'var(--bg-inner)',
                  borderLeft: `3px solid ${info?.color || 'var(--accent)'}`,
                }}>
                  <span style={{ fontSize: 16 }}>{def?.icon || info?.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {row.customer_name || <em style={{ color: 'var(--text-disabled)' }}>No name</em>}
                      {row.count > 1 && (
                        <span style={{
                          marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 6,
                          background: 'var(--accent-bg)', color: 'var(--accent)', fontWeight: 700,
                        }}>×{row.count}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {def?.label} · {row.activity_date} · {row.agent_name}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {row.lead_source || ''}
                  </div>
                  {/* Hank 2026-04-28: hot/med/cold pill */}
                  {tc ? (
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 8,
                      background: tc.bg, color: tc.fg, fontWeight: 700,
                    }}>
                      {tc.label}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 8,
                    background: info?.bgColor, color: info?.color, fontWeight: 700,
                  }}>
                    {info?.label}
                  </span>
                  <button
                    onClick={() => openModal(row)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: `linear-gradient(135deg, ${info?.color}, ${info?.color}cc)`,
                      color: '#fff', border: 'none', cursor: 'pointer',
                    }}
                  >
                    Submit App
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Premium Modal */}
      {activeRow && (() => {
        const line = ACTIVITY_TYPE_TO_LINE[activeRow.activity_type];
        const info = APP_TYPES[line];
        const premiumLabel = PREMIUM_LABELS[line] || 'Premium';
        return (
          <div style={modalOverlay} onClick={closeModal}>
            <div style={modalBody} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>{info?.icon}</span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Submit {info?.label} App</div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                    Quote logged {activeRow.activity_date} · {activeRow.agent_name}
                  </div>
                </div>
              </div>

              <label style={fieldLabel}>Customer Name</label>
              <input
                value={form.customerName}
                onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                style={inputStyle}
                placeholder="Customer Name"
              />

              <label style={fieldLabel}>Product Type</label>
              <select
                value={form.productType}
                onChange={e => setForm(f => ({ ...f, productType: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {(info?.types || []).map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <label style={fieldLabel}>
                {premiumLabel} <span style={{ color: 'var(--text-disabled)' }}>($)</span>
                {form.premiums.length > 1 && (
                  <span style={{ marginLeft: 6, color: 'var(--accent)', fontSize: 10 }}>
                    × {form.premiums.length} apps
                  </span>
                )}
              </label>
              {/* Hank 2026-04-28: N premium inputs when source quote count > 1 */}
              {form.premiums.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  {form.premiums.length > 1 && (
                    <span style={{
                      fontSize: 10, color: 'var(--text-faint)', fontWeight: 700,
                      minWidth: 24, textAlign: 'right',
                    }}>
                      #{idx + 1}
                    </span>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    value={p}
                    onChange={e => {
                      const next = form.premiums.slice();
                      next[idx] = e.target.value;
                      setForm(f => ({ ...f, premiums: next }));
                    }}
                    style={inputStyle}
                    placeholder={premiumLabel}
                    autoFocus={idx === 0}
                  />
                  {form.premiums.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, premiums: f.premiums.filter((_, i) => i !== idx) }))}
                      style={{
                        padding: '6px 8px', borderRadius: 6, fontSize: 11,
                        background: 'var(--bg-input)', color: 'var(--text-muted)',
                        border: '1px solid var(--border-input)', cursor: 'pointer',
                      }}
                      title="Remove this app"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {FEATURE_FLAGS.ff_premium_per_app && (
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, premiums: [...f.premiums, ''] }))}
                  style={{
                    marginTop: 4, padding: '4px 10px', borderRadius: 6, fontSize: 11,
                    background: 'var(--bg-inner)', color: 'var(--accent)',
                    border: '1px dashed var(--accent-border)', cursor: 'pointer',
                  }}
                >
                  + Add another app
                </button>
              )}

              <label style={fieldLabel}>Notes (optional)</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                style={{ ...inputStyle, resize: 'vertical' }}
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                <button
                  onClick={closeModal}
                  disabled={submitting}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    background: 'var(--bg-input)', color: 'var(--text-muted)',
                    border: '1px solid var(--border-input)', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={submitting}
                  style={{
                    padding: '8px 18px', borderRadius: 8, fontWeight: 700,
                    background: submitting ? 'var(--border)' : `linear-gradient(135deg, ${info?.color}, ${info?.color}cc)`,
                    color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Submitting…' : 'Submit App'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const cardStyle = {
  borderRadius: 12, padding: 16,
  background: 'var(--bg-card)', border: '1px solid var(--border)',
};

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
  color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const fieldLabel = {
  display: 'block',
  fontSize: 11, fontWeight: 700, color: 'var(--text-faint)',
  letterSpacing: '.05em', textTransform: 'uppercase',
  marginTop: 10, marginBottom: 4,
};

const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 250,
};

const modalBody = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 16, padding: 24, width: 'min(460px, 92vw)',
  maxHeight: '88vh', overflowY: 'auto',
  boxShadow: '0 12px 48px rgba(0,0,0,.5)',
};

const filterInput = {
  width: '100%', padding: '6px 10px', borderRadius: 6,
  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
  color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box',
};
