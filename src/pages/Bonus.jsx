import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { FEATURE_FLAGS } from '../lib/constants';
import {
  BONUS_SCHEDULE as INIT_SCHEDULE, BONUS_CATEGORIES, LINE_ITEM_BONUSES as INIT_LINE_ITEMS,
  loadSchedule, saveSchedule, loadLineItems, saveLineItems, resetSchedule,
  computeTierBonus,
} from '../lib/bonus';

/**
 * Hank Sprint 6 — Bonus Tab
 *
 * Shows:
 *   1. Total bonus earned to-date based on real production
 *   2. On-pace projection — what bonus will be if current pace holds through end of month
 *   3. What-if sliders — staff can simulate boosts to any category
 *   4. Line-item bonus section (per-event flat bonuses)
 *
 * Uses the placeholder BONUS_SCHEDULE in src/lib/bonus.js until Hank's PDF lands.
 */
export default function Bonus() {
  const { user } = useAuth();
  const isLeader = ['admin', 'team_leader'].includes(user.role);
  const isAdmin = user.role === 'admin' || user.isOwner === true;
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [period, setPeriod] = useState(currentPeriod);
  const [team, setTeam] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [delta, setDelta] = useState({}); // what-if additive deltas per category key
  const [lineItemDelta, setLineItemDelta] = useState({}); // counts for line-items
  // Hank 2026-04-28: editable bonus schedule (admin only)
  const [schedule, setSchedule] = useState(INIT_SCHEDULE);
  const [lineItems, setLineItems] = useState(INIT_LINE_ITEMS);
  const [showEditor, setShowEditor] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    if (isLeader) api.getTeam().then(d => setTeam(d.team)).catch(() => {});
  }, [isLeader]);

  useEffect(() => {
    setLoading(true);
    const params = { period };
    if (selectedUserId) params.userId = selectedUserId;
    fetch(`/api/bonus/projection?${new URLSearchParams(params)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { console.error('Bonus load error:', err); setLoading(false); });
  }, [period, selectedUserId]);

  const earned = useMemo(() => {
    if (!data?.actuals) return { total: 0, byCat: {} };
    const byCat = {};
    let total = 0;
    for (const cat of BONUS_CATEGORIES) {
      const v = cat.fromActuals(data.actuals);
      const r = computeTierBonus(v, schedule[cat.key]);
      byCat[cat.key] = { value: v, bonus: r.bonus, nextTier: r.nextTier };
      total += r.bonus;
    }
    return { total, byCat };
  }, [data, schedule]);

  const projected = useMemo(() => {
    if (!data?.projection) return { total: 0, byCat: {} };
    const projActuals = {
      lines: {
        auto: { apps: data.projection.auto.apps, premium: data.projection.auto.premium },
        fire: { apps: data.projection.fire.apps, premium: data.projection.fire.premium },
        life: { apps: data.projection.life.apps, premium: data.projection.life.premium },
        disability: { apps: data.projection.disability.apps, premium: data.projection.disability.premium },
      },
    };
    let total = 0;
    const byCat = {};
    for (const cat of BONUS_CATEGORIES) {
      const v = cat.fromActuals(projActuals);
      const r = computeTierBonus(v, schedule[cat.key]);
      byCat[cat.key] = { value: v, bonus: r.bonus };
      total += r.bonus;
    }
    return { total, byCat };
  }, [data, schedule]);

  const whatIf = useMemo(() => {
    if (!data?.actuals) return { total: 0, byCat: {} };
    const wfActuals = {
      lines: {
        auto: {
          apps: data.actuals.lines.auto.apps + (parseInt(delta.autoApplications) || 0),
          premium: data.actuals.lines.auto.premium + (parseFloat(delta.autoPremium) || 0),
        },
        fire: {
          apps: data.actuals.lines.fire.apps + (parseInt(delta.fireApplications) || 0),
          premium: data.actuals.lines.fire.premium + (parseFloat(delta.firePremium) || 0),
        },
        life: {
          apps: data.actuals.lines.life.apps + (parseInt(delta.lifeApplications) || 0),
          premium: data.actuals.lines.life.premium + (parseFloat(delta.lifePremium) || 0),
        },
        disability: {
          apps: data.actuals.lines.disability.apps,
          premium: data.actuals.lines.disability.premium + (parseFloat(delta.disabilityPremium) || 0),
        },
      },
    };
    let total = 0;
    const byCat = {};
    for (const cat of BONUS_CATEGORIES) {
      const v = cat.fromActuals(wfActuals);
      const r = computeTierBonus(v, schedule[cat.key]);
      byCat[cat.key] = { value: v, bonus: r.bonus };
      total += r.bonus;
    }
    return { total, byCat };
  }, [data, delta, schedule]);

  const lineItemEarned = useMemo(() => {
    if (!data?.actuals?.counters) return { total: 0 };
    let total = 0;
    const map = {
      autoSubmitted:         data.actuals.lines.auto.apps,
      fireSubmitted:         data.actuals.lines.fire.apps,
      lifeSubmitted:         data.actuals.lines.life.apps,
      googleReviewCompleted: data.actuals.counters.google_review_completed || 0,
      referralQuoted:        data.actuals.counters.referral_hh_quoted || 0,
      // retirement statements not yet a tracked event — staff can simulate via delta
      retirementStatement:    parseInt(lineItemDelta.retirementStatement) || 0,
      retirementStmtAndAppt:  parseInt(lineItemDelta.retirementStmtAndAppt) || 0,
    };
    for (const [key, count] of Object.entries(map)) {
      total += count * (lineItems[key]?.perEvent || 0);
    }
    return { total, map };
  }, [data, lineItemDelta, lineItems]);

  if (!FEATURE_FLAGS.ff_bonus_tab) return null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Bonus</h1>
          <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0 }}>
            Earnings + what-if scenarios · placeholder schedule (replace with Hank's PDF tiers)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isLeader && team.length > 0 && (
            <select
              value={selectedUserId || ''}
              onChange={e => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
              style={selectStyle}
            >
              <option value="">My Bonus</option>
              {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            style={selectStyle}
          />
          {/* Hank 2026-04-28: admin editor toggle */}
          {FEATURE_FLAGS.ff_bonus_admin_edit && isAdmin && (
            <button
              onClick={() => setShowEditor(s => !s)}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: showEditor ? 'var(--accent-bg)' : 'var(--bg-card)',
                border: `1px solid ${showEditor ? 'var(--accent-border)' : 'var(--border-input)'}`,
                color: showEditor ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {showEditor ? 'Close Editor' : 'Edit Bonus Inputs'}
            </button>
          )}
        </div>
      </div>

      {/* Hank 2026-04-28: Bonus tier editor (admin only, localStorage-backed) */}
      {FEATURE_FLAGS.ff_bonus_admin_edit && isAdmin && showEditor && (
        <BonusEditor
          schedule={schedule}
          lineItems={lineItems}
          onChangeSchedule={setSchedule}
          onChangeLineItems={setLineItems}
          onSave={() => {
            const ok1 = saveSchedule(schedule);
            const ok2 = saveLineItems(lineItems);
            setSaveStatus(ok1 && ok2 ? 'saved' : 'error');
            setTimeout(() => setSaveStatus(null), 2200);
          }}
          onReset={() => {
            resetSchedule();
            const fresh = loadSchedule();
            const freshItems = loadLineItems();
            setSchedule(fresh);
            setLineItems(freshItems);
            setSaveStatus('reset');
            setTimeout(() => setSaveStatus(null), 2200);
          }}
          status={saveStatus}
        />
      )}

      {/* P1: prominent placeholder warning at top */}
      <div style={{
        marginBottom: 16, padding: '12px 16px', borderRadius: 10,
        background: 'rgba(245, 158, 11, .15)', border: '1px solid rgba(245, 158, 11, .5)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 22 }}>⚠️</span>
        <div style={{ flex: 1, fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
          <strong style={{ color: '#f59e0b' }}>PLACEHOLDER NUMBERS</strong> — Bonus tier amounts shown below are
          stand-ins, not your actual office schedule. Math + UI are correct; only the dollar values are made up.
          Will be replaced once Hank delivers the official bonus structure PDF. Do not make decisions on these figures.
        </div>
      </div>

      {loading || !data ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>Loading bonus data…</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <SummaryCard label="Earned to-date" value={earned.total} accent="var(--success)" subtitle={`Day ${data.daysElapsed}/${data.totalDays}`} />
            <SummaryCard label="On-pace projection" value={projected.total} accent="var(--accent)" subtitle={`If current pace holds`} />
            <SummaryCard label="What-if total" value={whatIf.total} accent="#a855f7" subtitle="Drag sliders below" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Tier categories */}
            <div style={cardStyle}>
              <h2 style={sectionTitle}>Volume Bonuses</h2>
              {BONUS_CATEGORIES.map(cat => {
                const e = earned.byCat[cat.key] || { value: 0, bonus: 0 };
                const w = whatIf.byCat[cat.key] || { value: 0, bonus: 0 };
                const p = projected.byCat[cat.key] || { value: 0, bonus: 0 };
                return (
                  <div key={cat.key} style={{
                    padding: '10px 0', borderBottom: '1px solid var(--border-separator)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{cat.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {fmt(e.value, cat.unit)} · proj {fmt(p.value, cat.unit)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                      <span style={{ color: 'var(--success)' }}>${e.bonus}</span>
                      <span style={{ color: 'var(--accent)' }}>+${p.bonus - e.bonus} (pace)</span>
                      <span style={{ color: '#a855f7' }}>+${w.bonus - e.bonus} (what-if)</span>
                      {e.nextTier && (
                        <span style={{ color: 'var(--text-faint)', marginLeft: 'auto' }}>
                          Next: {fmt(e.nextTier.threshold, cat.unit)} → ${e.nextTier.bonus}
                        </span>
                      )}
                    </div>
                    {/* What-if delta input */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Δ {cat.unit === '$' ? '$' : '#'}</span>
                      <input
                        type="number"
                        min={0}
                        value={delta[cat.key] || ''}
                        onChange={ev => setDelta(d => ({ ...d, [cat.key]: ev.target.value }))}
                        placeholder="0"
                        style={smallInput}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Line items */}
            <div style={cardStyle}>
              <h2 style={sectionTitle}>Line-Item Bonuses</h2>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>
                Total earned: <strong style={{ color: 'var(--success)' }}>${lineItemEarned.total}</strong>
              </div>
              {Object.entries(lineItems).map(([k, def]) => {
                const cnt = lineItemEarned.map?.[k] ?? (parseInt(lineItemDelta[k]) || 0);
                const isManual = k === 'retirementStatement' || k === 'retirementStmtAndAppt';
                return (
                  <div key={k} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                    gap: 8, alignItems: 'center', padding: '6px 0',
                    borderBottom: '1px solid var(--border-separator)',
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>
                      {def.label}
                      {def.note && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-disabled)', fontStyle: 'italic' }}>
                          ({def.note})
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>${def.perEvent}/ea</span>
                    {isManual ? (
                      <input
                        type="number"
                        min={0}
                        value={lineItemDelta[k] || ''}
                        onChange={ev => setLineItemDelta(d => ({ ...d, [k]: ev.target.value }))}
                        placeholder="0"
                        style={smallInput}
                      />
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cnt}×</span>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>
                      ${cnt * def.perEvent}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 10,
            background: 'var(--bg-inner)', color: 'var(--text-disabled)', fontSize: 11,
          }}>
            Edit <code>src/lib/bonus.js</code> → <code>BONUS_SCHEDULE</code> + <code>lineItems</code> to swap in real tiers.
          </div>
        </>
      )}
    </div>
  );
}

function fmt(v, unit) {
  if (unit === '$') return `$${(v || 0).toLocaleString()}`;
  return `${v || 0}`;
}

function SummaryCard({ label, value, accent, subtitle }) {
  return (
    <div style={{ ...cardStyle, borderLeft: `4px solid ${accent}` }}>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent, marginTop: 4 }}>${(value || 0).toLocaleString()}</div>
      <div style={{ fontSize: 12, color: 'var(--text-disabled)' }}>{subtitle}</div>
    </div>
  );
}

const cardStyle = {
  borderRadius: 12, padding: 16,
  background: 'var(--bg-card)', border: '1px solid var(--border)',
};
const sectionTitle = {
  fontSize: 13, fontWeight: 700, color: 'var(--text)',
  margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '.08em',
};
const selectStyle = {
  padding: '8px 12px', borderRadius: 8,
  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
  color: 'var(--text)', fontSize: 13, outline: 'none',
};
const smallInput = {
  width: 60, padding: '4px 8px', borderRadius: 6,
  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
  color: 'var(--text)', fontSize: 12, outline: 'none',
};

/**
 * BonusEditor — Hank 2026-04-28
 * Admin-only inline editor for tier thresholds + line-item per-event $.
 * Persists to localStorage (graceful — survives reloads, no server roundtrip).
 * Edit live; values flow through state into all bonus calcs immediately.
 */
function BonusEditor({ schedule, lineItems, onChangeSchedule, onChangeLineItems, onSave, onReset, status }) {
  const updateTier = (catKey, idx, field, value) => {
    const next = { ...schedule };
    next[catKey] = next[catKey].map((tier, i) => i === idx ? { ...tier, [field]: parseFloat(value) || 0 } : tier);
    onChangeSchedule(next);
  };
  const addTier = (catKey) => {
    const next = { ...schedule };
    next[catKey] = [...(next[catKey] || []), { threshold: 0, bonus: 0 }];
    onChangeSchedule(next);
  };
  const removeTier = (catKey, idx) => {
    const next = { ...schedule };
    next[catKey] = next[catKey].filter((_, i) => i !== idx);
    onChangeSchedule(next);
  };
  const updateLineItem = (key, value) => {
    onChangeLineItems({ ...lineItems, [key]: { ...lineItems[key], perEvent: parseFloat(value) || 0 } });
  };

  return (
    <div style={{
      ...cardStyle, marginBottom: 16,
      borderColor: 'var(--accent-border)', borderWidth: 2,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ ...sectionTitle, margin: 0 }}>Bonus Inputs Editor</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {status === 'saved' && <span style={{ color: 'var(--success)', fontSize: 12 }}>Saved ✓</span>}
          {status === 'reset' && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Reset to defaults</span>}
          {status === 'error' && <span style={{ color: 'var(--error)', fontSize: 12 }}>Save failed</span>}
          <button
            onClick={onReset}
            style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12,
              background: 'var(--bg-input)', color: 'var(--text-muted)',
              border: '1px solid var(--border-input)', cursor: 'pointer',
            }}
          >
            Reset to defaults
          </button>
          <button
            onClick={onSave}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              color: 'var(--accent-text)', border: 'none', cursor: 'pointer',
            }}
          >
            Save Inputs
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>
        Edits are saved per-browser (localStorage). Backend persistence will follow once Hank's PDF lands.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Tier categories editor */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
            Volume Tiers
          </div>
          {Object.keys(schedule).map(catKey => {
            const cat = BONUS_CATEGORIES.find(c => c.key === catKey);
            if (!cat) return null;
            return (
              <div key={catKey} style={{
                padding: '8px 10px', marginBottom: 8, borderRadius: 8,
                background: 'var(--bg-inner)', border: '1px solid var(--border-separator)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    {cat.label} <span style={{ color: 'var(--text-faint)' }}>({cat.unit})</span>
                  </span>
                  <button
                    onClick={() => addTier(catKey)}
                    style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 11,
                      background: 'var(--accent-bg)', color: 'var(--accent)',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    + Tier
                  </button>
                </div>
                {schedule[catKey].map((tier, idx) => (
                  <div key={idx} style={{
                    display: 'grid', gridTemplateColumns: '50px 1fr 1fr 24px',
                    gap: 6, alignItems: 'center', marginBottom: 4,
                  }}>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>T{idx + 1}</span>
                    <input
                      type="number"
                      min={0}
                      value={tier.threshold}
                      onChange={e => updateTier(catKey, idx, 'threshold', e.target.value)}
                      style={smallInput}
                      placeholder="threshold"
                      title="Threshold"
                    />
                    <input
                      type="number"
                      min={0}
                      value={tier.bonus}
                      onChange={e => updateTier(catKey, idx, 'bonus', e.target.value)}
                      style={smallInput}
                      placeholder="bonus $"
                      title="Bonus $"
                    />
                    <button
                      onClick={() => removeTier(catKey, idx)}
                      style={{
                        padding: '2px', fontSize: 10, color: 'var(--text-faint)',
                        background: 'none', border: 'none', cursor: 'pointer',
                      }}
                      title="Remove tier"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Line-item per-event editor */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
            Line-Item per-event $
          </div>
          {Object.entries(lineItems).map(([key, def]) => (
            <div key={key} style={{
              display: 'grid', gridTemplateColumns: '1fr 80px',
              gap: 8, alignItems: 'center', padding: '6px 0',
              borderBottom: '1px solid var(--border-separator)',
            }}>
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{def.label}</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={def.perEvent}
                onChange={e => updateLineItem(key, e.target.value)}
                style={smallInput}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
