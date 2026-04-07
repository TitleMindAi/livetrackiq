import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { APP_TYPES, LINES, DEFAULT_RATIOS } from '../lib/constants';

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
