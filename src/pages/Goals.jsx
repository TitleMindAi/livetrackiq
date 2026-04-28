import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { APP_TYPES, LINES, DEFAULT_RATIOS, ACTIVITY_TYPES, FEATURE_FLAGS } from '../lib/constants';

/**
 * Goals Page — Set goals + view real-time calculator
 *
 * Desktop layout:
 * Left: Goal inputs per line
 * Right: Live calculator showing quotes needed
 */
export default function Goals() {
  const { user } = useAuth();
  const isLeader = ['admin', 'team_leader'].includes(user.role);

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [period, setPeriod] = useState(currentPeriod);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [team, setTeam] = useState([]);
  const [calcData, setCalcData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Editable goal inputs
  const [goalInputs, setGoalInputs] = useState({});
  const [ratioInputs, setRatioInputs] = useState({});

  // Sprint 5: custom + trackable goals
  const [customGoals, setCustomGoals] = useState([]);
  const [customMigrationPending, setCustomMigrationPending] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({
    trackerKey: 'referral_hh_quoted', label: '', countGoal: 0, premiumGoal: 0, closingRatio: 0,
  });

  useEffect(() => {
    if (isLeader) {
      api.getTeam().then(d => setTeam(d.team)).catch(() => {});
    }
  }, [isLeader]);

  const loadCalc = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period };
      if (selectedUserId) params.userId = selectedUserId;
      const data = await api.getGoalCalc(params);
      setCalcData(data);

      // Populate inputs from current goals
      const gi = {};
      const ri = {};
      for (const line of LINES) {
        gi[line] = {
          appGoal: data.lines[line]?.goal || '',
          premiumGoal: data.lines[line]?.premiumGoal || '',
        };
        ri[line] = data.ratios[line] || DEFAULT_RATIOS[line];
      }
      setGoalInputs(gi);
      setRatioInputs(ri);
    } catch (err) {
      console.error('Goal calc error:', err);
    } finally {
      setLoading(false);
    }
  }, [period, selectedUserId]);

  useEffect(() => { loadCalc(); }, [loadCalc]);

  // Sprint 5: load custom goals when period/user changes
  const loadCustomGoals = useCallback(async () => {
    if (!FEATURE_FLAGS.ff_goals_expand) return;
    try {
      const params = { period };
      if (selectedUserId) params.userId = selectedUserId;
      const data = await api.getCustomGoals(params);
      setCustomGoals(data.goals || []);
      setCustomMigrationPending(!!data.migrationPending);
    } catch (err) {
      console.error('Custom goals load error:', err);
    }
  }, [period, selectedUserId]);

  useEffect(() => { loadCustomGoals(); }, [loadCustomGoals]);

  const addCustomGoal = async () => {
    if (!newGoal.trackerKey || !newGoal.label) {
      setToast({ type: 'error', message: 'Tracker + label required' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    try {
      await api.createCustomGoal({
        userId: selectedUserId || undefined,
        period,
        trackerKey: newGoal.trackerKey,
        label: newGoal.label,
        countGoal: parseInt(newGoal.countGoal) || 0,
        premiumGoal: parseFloat(newGoal.premiumGoal) || 0,
        closingRatio: (parseFloat(newGoal.closingRatio) || 0) / 100,
      });
      setToast({ type: 'success', message: 'Goal added' });
      setTimeout(() => setToast(null), 2500);
      setShowAddGoal(false);
      setNewGoal({ trackerKey: 'referral_hh_quoted', label: '', countGoal: 0, premiumGoal: 0, closingRatio: 0 });
      loadCustomGoals();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 4000);
    }
  };

  const removeCustomGoal = async (id) => {
    try {
      await api.deleteCustomGoal(id);
      loadCustomGoals();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 4000);
    }
  };

  const saveGoals = async () => {
    setSaving(true);
    try {
      const goals = LINES.map(line => ({
        line,
        appGoal: parseInt(goalInputs[line]?.appGoal) || 0,
        premiumGoal: parseFloat(goalInputs[line]?.premiumGoal) || 0,
      }));

      const ratios = {};
      for (const line of LINES) {
        ratios[line] = parseFloat(ratioInputs[line]) || DEFAULT_RATIOS[line];
      }

      await Promise.all([
        api.setGoals({
          userId: selectedUserId || undefined,
          period,
          goals,
        }),
        api.setRatios({
          userId: selectedUserId || undefined,
          ratios,
        }),
      ]);

      setToast({ type: 'success', message: 'Goals saved' });
      setTimeout(() => setToast(null), 3000);
      loadCalc(); // Refresh calculator
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
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
        }}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Goal Calculator</h1>
          <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0 }}>
            Set monthly goals and see real-time pace tracking
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isLeader && team.length > 0 && (
            <select
              value={selectedUserId || ''}
              onChange={e => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
              style={selectStyle}
            >
              <option value="">My Goals</option>
              {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            style={selectStyle}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>Loading...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, alignItems: 'start' }}>
          {/* LEFT: Goal & Ratio Inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {LINES.map(line => {
              const info = APP_TYPES[line];
              return (
                <div key={line} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>{info.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{info.label}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label style={labelStyle}>App Goal (monthly)</label>
                      <input
                        type="number"
                        value={goalInputs[line]?.appGoal || ''}
                        onChange={e => setGoalInputs(prev => ({
                          ...prev,
                          [line]: { ...prev[line], appGoal: e.target.value },
                        }))}
                        placeholder="0"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Premium Goal ($)</label>
                      <input
                        type="number"
                        value={goalInputs[line]?.premiumGoal || ''}
                        onChange={e => setGoalInputs(prev => ({
                          ...prev,
                          [line]: { ...prev[line], premiumGoal: e.target.value },
                        }))}
                        placeholder="0"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Close Rate (%)</label>
                      <input
                        type="number"
                        step="1"
                        value={Math.round((ratioInputs[line] || DEFAULT_RATIOS[line]) * 100)}
                        onChange={e => setRatioInputs(prev => ({
                          ...prev,
                          [line]: (parseFloat(e.target.value) || 0) / 100,
                        }))}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              onClick={saveGoals}
              disabled={saving}
              style={{
                background: saving ? 'var(--border-input)' : 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
                color: 'var(--accent-text)', border: 'none', padding: '14px 24px', borderRadius: 12,
                fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : 'Save Goals & Ratios'}
            </button>

            {/* Sprint 5: Custom / Trackable Goals */}
            {FEATURE_FLAGS.ff_goals_expand && (
              <div style={{ ...cardStyle, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Custom & Trackable Goals</span>
                  <button
                    onClick={() => setShowAddGoal(s => !s)}
                    style={{
                      background: 'var(--accent-bg)', color: 'var(--accent)',
                      border: '1px solid var(--accent-border)', padding: '6px 12px', borderRadius: 8,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {showAddGoal ? 'Cancel' : '+ Add Goal'}
                  </button>
                </div>
                {customMigrationPending && (
                  <div style={{ fontSize: 11, color: 'var(--error)', marginBottom: 8 }}>
                    Migration 004 not yet applied — custom goals disabled.
                  </div>
                )}
                {showAddGoal && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    <select
                      value={newGoal.trackerKey}
                      onChange={e => {
                        const k = e.target.value;
                        const def = ACTIVITY_TYPES.find(t => t.key === k);
                        setNewGoal(g => ({ ...g, trackerKey: k, label: g.label || def?.label || '' }));
                      }}
                      style={inputStyle}
                    >
                      {ACTIVITY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label} (tracked)</option>)}
                      <option value="custom">— Custom (free-form) —</option>
                    </select>
                    {newGoal.trackerKey === 'custom' && (
                      <input
                        placeholder="Tracker slug (e.g. investment_statements)"
                        value={newGoal.customSlug || ''}
                        onChange={e => setNewGoal(g => ({ ...g, customSlug: e.target.value, trackerKey: e.target.value || 'custom' }))}
                        style={inputStyle}
                      />
                    )}
                    <input
                      placeholder="Display label (e.g. Investment Statements)"
                      value={newGoal.label}
                      onChange={e => setNewGoal(g => ({ ...g, label: e.target.value }))}
                      style={inputStyle}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      <input type="number" placeholder="# Goal" value={newGoal.countGoal}
                        onChange={e => setNewGoal(g => ({ ...g, countGoal: e.target.value }))} style={inputStyle} />
                      <input type="number" placeholder="Premium" value={newGoal.premiumGoal}
                        onChange={e => setNewGoal(g => ({ ...g, premiumGoal: e.target.value }))} style={inputStyle} />
                      <input type="number" placeholder="Close %" value={newGoal.closingRatio}
                        onChange={e => setNewGoal(g => ({ ...g, closingRatio: e.target.value }))} style={inputStyle} />
                    </div>
                    <button
                      onClick={addCustomGoal}
                      style={{
                        background: 'var(--success)', color: '#fff', border: 'none',
                        padding: '8px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      Save Goal
                    </button>
                  </div>
                )}
                {customGoals.length === 0 && !showAddGoal && !customMigrationPending && (
                  <div style={{ fontSize: 12, color: 'var(--text-disabled)', padding: '8px 0' }}>
                    No custom goals yet. Use <strong>+ Add Goal</strong> to track Referrals, Reviews, or anything else.
                  </div>
                )}
                {customGoals.map(g => (
                  <div key={g.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                    gap: 8, alignItems: 'center', padding: '6px 0',
                    borderTop: '1px solid var(--border-separator)',
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{g.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{g.trackerKey}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.actual}/{g.countGoal}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {g.closingRatio ? `${(g.closingRatio*100).toFixed(0)}%` : ''}
                    </span>
                    <button
                      onClick={() => removeCustomGoal(g.id)}
                      style={{
                        background: 'var(--error-bg)', border: 'none', color: 'var(--error-light)',
                        width: 22, height: 22, borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      }}
                      title="Remove"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Live Calculator Results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Period summary */}
            <div style={{
              ...cardStyle,
              background: 'var(--accent-bg)',
              borderColor: 'var(--accent-border)',
              opacity: 0.9,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>
                    {calcData?.totalWorkDays || 0} Total Working Days
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                    {calcData?.remainingWorkDays || 0} remaining (holidays excluded)
                  </div>
                </div>
                <div style={{
                  fontSize: 28, fontWeight: 800, color: 'var(--accent)',
                }}>
                  {calcData?.remainingWorkDays || 0}
                  <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-faint)' }}> days left</span>
                </div>
              </div>
            </div>

            {/* Per-line calculator cards */}
            {LINES.map(line => {
              const info = APP_TYPES[line];
              const g = calcData?.lines[line];
              if (!g || g.goal === 0) return null;

              return (
                <div key={line} style={{
                  ...cardStyle,
                  borderColor: g.onTrack ? 'var(--success)' : 'var(--error)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{info.icon}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{info.label}</span>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
                      background: g.onTrack ? 'var(--success-bg)' : 'var(--error-bg)',
                      color: g.onTrack ? 'var(--success)' : 'var(--error)',
                    }}>
                      {g.onTrack ? 'On Track' : `Behind by ${g.expectedPace - g.pacePercent}%`}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ position: 'relative', height: 8, background: 'var(--border-separator)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      width: `${Math.min(g.pacePercent, 100)}%`,
                      background: g.onTrack
                        ? `linear-gradient(90deg, ${info.color}, ${info.color}aa)`
                        : 'linear-gradient(90deg, #ef4444, #fca5a5)',
                      transition: 'width .5s',
                    }} />
                    {/* Expected pace marker */}
                    <div style={{
                      position: 'absolute', top: -2, bottom: -2,
                      left: `${g.expectedPace}%`, width: 2,
                      background: 'var(--accent)',
                    }} />
                  </div>

                  {/* Stats grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    <MiniStat label="Done" value={g.actual} color={info.color} />
                    <MiniStat label="Goal" value={g.goal} color="var(--text-muted)" />
                    <MiniStat label="Remaining" value={g.remaining} color={g.remaining > 0 ? 'var(--accent)' : 'var(--success)'} />
                    <MiniStat label="Quotes/Day" value={g.quotesPerDay} color="var(--text-secondary)" />
                  </div>

                  {/* Detailed calculation */}
                  {g.remaining > 0 && (
                    <div style={{
                      marginTop: 12, padding: '10px 14px',
                      background: 'var(--bg-inner-deep)', borderRadius: 10,
                      fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6,
                    }}>
                      Need <strong style={{ color: 'var(--text-secondary)' }}>{g.quotesNeeded} quotes</strong> total
                      at <strong style={{ color: info.color }}>{(g.closeRate * 100).toFixed(0)}%</strong> close rate
                      = <strong style={{ color: 'var(--text-secondary)' }}>{g.remaining} apps</strong>
                      <br />
                      Over {calcData.remainingWorkDays} working days
                      = <strong style={{ color: 'var(--accent)' }}>{g.quotesPerDay} quotes/day</strong>

                      {line === 'auto' && g.hhNeeded !== null && (
                        <>
                          <br />
                          &#8776; <strong style={{ color: 'var(--text-secondary)' }}>{g.hhNeeded} households</strong> &times; 2 cars/HH
                          = <strong style={{ color: info.color }}>{g.carsFromHH} autos</strong>
                        </>
                      )}
                    </div>
                  )}

                  {g.remaining === 0 && (
                    <div style={{
                      marginTop: 12, padding: '10px 14px',
                      background: 'var(--success-bg)', borderRadius: 10,
                      fontSize: 14, color: 'var(--success)', fontWeight: 600, textAlign: 'center',
                    }}>
                      Goal reached!
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const cardStyle = {
  borderRadius: 12, padding: 16,
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  transition: 'background .25s, border-color .25s',
};

const labelStyle = {
  display: 'block', fontSize: 11, color: 'var(--text-faint)', fontWeight: 600,
  letterSpacing: '.05em', marginBottom: 4,
};

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
  color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
};

const selectStyle = {
  padding: '8px 12px', borderRadius: 8,
  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
  color: 'var(--text)', fontSize: 13, outline: 'none',
};
