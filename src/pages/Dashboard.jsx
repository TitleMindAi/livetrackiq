import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { APP_TYPES, LINES, TIME_FILTERS } from '../lib/constants';
import QuoteLogger from '../components/QuoteLogger';

/**
 * Dashboard — Desktop-optimized agent view
 *
 * Layout: Stats cards (top) -> Leaderboard + Recent Activity (bottom grid)
 * Team leaders get a member filter dropdown
 */
export default function Dashboard() {
  const { user } = useAuth();
  const [view, setView] = useState('today');
  const [data, setData] = useState(null);
  const [goalData, setGoalData] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showTeamFilter, setShowTeamFilter] = useState(false);

  const isLeader = ['admin', 'team_leader'].includes(user.role);

  // Load team members for leaders
  useEffect(() => {
    if (isLeader) {
      api.getTeam().then(d => setTeam(d.team)).catch(() => {});
    }
  }, [isLeader]);

  // Load dashboard data
  const loadData = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setLoading(true);
    if (isBackgroundRefresh) setIsRefreshing(true);
    try {
      const params = { view };
      // Support both single user and multi-select
      if (selectedUserIds.size > 0) {
        params.userIds = Array.from(selectedUserIds).join(',');
      } else if (selectedUserId) {
        params.userId = selectedUserId;
      }

      const goalParams = {};
      if (selectedUserIds.size === 1) {
        goalParams.userId = Array.from(selectedUserIds)[0];
      } else if (selectedUserId) {
        goalParams.userId = selectedUserId;
      }

      const [dash, goals] = await Promise.all([
        api.getDashboard(params),
        api.getGoalCalc(goalParams),
      ]);
      setData(dash);
      setGoalData(goals);
      setLastUpdated(Date.now());
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [view, selectedUserId, selectedUserIds]);

  // Initial load
  useEffect(() => { loadData(); }, [loadData]);

  // Auto-polling (30-second refresh with visibility pause)
  useEffect(() => {
    let intervalId = null;
    let timeoutId = null;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        loadData(true);
      }, 30000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Pause polling when tab is hidden
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } else {
        // Resume polling when tab becomes visible
        startPolling();
      }
    };

    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadData]);

  // Reset polling timer when filters change
  useEffect(() => {
    // This effect is implicit: changing view or selectedUserId will trigger
    // the dependency change in the auto-polling effect above, which clears
    // and restarts the interval.
  }, [view, selectedUserId, selectedUserIds]);

  // Build summary map
  const summaryMap = {};
  if (data?.summary) {
    for (const s of data.summary) {
      summaryMap[s.line] = s;
    }
  }

  const totalApps = data?.summary?.reduce((a, s) => a + s.total_apps, 0) || 0;
  const totalPremium = data?.summary?.reduce((a, s) => a + (s.total_premium || 0), 0) || 0;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', position: 'relative' }}>
      {/* Last Updated Indicator */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 11, color: 'var(--text-muted)',
      }}>
        {isRefreshing && (
          <span style={{
            display: 'inline-block', width: 6, height: 6,
            borderRadius: '50%', background: 'var(--accent)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        )}
        {lastUpdated && (
          <span>Last updated: <LastUpdatedTime timestamp={lastUpdated} /></span>
        )}
      </div>

      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Dashboard</h1>
          <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0 }}>
            {selectedUserIds.size > 0
              ? `${selectedUserIds.size} team member${selectedUserIds.size > 1 ? 's' : ''} selected`
              : (selectedUserId ? team.find(t => t.id === selectedUserId)?.name : (isLeader ? 'Entire Team' : user.name))}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
          {/* Team Filter (leaders only) — multi-select */}
          {isLeader && team.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowTeamFilter(!showTeamFilter)}
                style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
                  color: 'var(--text)', fontSize: 13, outline: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedUserIds.size === 0
                  ? 'Entire Team'
                  : `${selectedUserIds.size} of ${team.length} selected`}
              </button>

              {/* Multi-select Dropdown */}
              {showTeamFilter && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 100,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 8, marginTop: 4, minWidth: 200,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>
                  <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Select All / Clear buttons */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border-separator)' }}>
                      <button
                        onClick={() => setSelectedUserIds(new Set(team.map(t => t.id)))}
                        style={{
                          flex: 1, padding: '6px', fontSize: 11, fontWeight: 600,
                          background: 'var(--accent-bg)', color: 'var(--accent)',
                          border: 'none', borderRadius: 4, cursor: 'pointer',
                        }}
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => setSelectedUserIds(new Set())}
                        style={{
                          flex: 1, padding: '6px', fontSize: 11, fontWeight: 600,
                          background: 'var(--bg-input)', color: 'var(--text-muted)',
                          border: '1px solid var(--border-input)', borderRadius: 4, cursor: 'pointer',
                        }}
                      >
                        Clear
                      </button>
                    </div>

                    {/* Checkboxes */}
                    {team.map(t => (
                      <label
                        key={t.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 8px', borderRadius: 4, cursor: 'pointer',
                          hover: { background: 'var(--bg-input)' },
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedUserIds.has(t.id)}
                          onChange={e => {
                            const newSet = new Set(selectedUserIds);
                            if (e.target.checked) {
                              newSet.add(t.id);
                            } else {
                              newSet.delete(t.id);
                            }
                            setSelectedUserIds(newSet);
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 13, color: 'var(--text)' }}>{t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Time Filters */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TIME_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setView(f.key)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', transition: 'all .15s',
                  border: view === f.key ? '1px solid var(--accent-border)' : '1px solid var(--border-input)',
                  background: view === f.key ? 'var(--accent-bg)' : 'var(--bg-card)',
                  color: view === f.key ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>Loading...</div>
      ) : (
        <>
          {/* Stats Cards Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
            {/* Total */}
            <StatCard
              label="Total Apps"
              value={totalApps}
              sub={`$${totalPremium.toLocaleString()} premium`}
              color="var(--accent)"
            />
            {/* Per line */}
            {LINES.map(line => {
              const info = APP_TYPES[line];
              const s = summaryMap[line];
              return (
                <StatCard
                  key={line}
                  label={`${info.icon} ${info.label}`}
                  value={s?.total_apps || 0}
                  sub={`$${(s?.total_premium || 0).toLocaleString()}`}
                  color={info.color}
                />
              );
            })}
          </div>

          {/* Quote Logger — Quick Entry */}
          <QuoteLogger />

          {/* Goal Pace Cards */}
          {goalData && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                color: 'var(--text-faint)', fontSize: 11, fontWeight: 700,
                letterSpacing: '.1em', marginBottom: 10, textTransform: 'uppercase',
              }}>
                Monthly Goal Pace — {goalData.remainingWorkDays} working days remaining
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {LINES.map(line => {
                  const info = APP_TYPES[line];
                  const g = goalData.lines[line];
                  if (!g || g.goal === 0) return (
                    <div key={line} style={{
                      ...cardStyle, opacity: 0.5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-disabled)', fontSize: 13,
                    }}>
                      No {info.label} goal set
                    </div>
                  );

                  return (
                    <div key={line} style={{
                      ...cardStyle,
                      borderColor: g.onTrack ? 'var(--success)' : 'var(--error)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                          {info.icon} {info.label}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                          background: g.onTrack ? 'var(--success-bg)' : 'var(--error-bg)',
                          color: g.onTrack ? 'var(--success)' : 'var(--error)',
                        }}>
                          {g.onTrack ? 'On Track' : 'Behind'}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{ height: 6, background: 'var(--border-separator)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                        <div style={{
                          height: '100%', borderRadius: 4,
                          width: `${Math.min(g.pacePercent, 100)}%`,
                          background: g.onTrack
                            ? 'linear-gradient(90deg, #10b981, #6ee7b7)'
                            : 'linear-gradient(90deg, #ef4444, #fca5a5)',
                          transition: 'width .5s',
                        }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                        <span>{g.actual} / {g.goal} apps</span>
                        <span>{g.pacePercent}%</span>
                      </div>

                      {g.remaining > 0 && (
                        <div style={{
                          marginTop: 8, padding: '8px 10px', background: 'var(--bg-inner)',
                          borderRadius: 8, fontSize: 12,
                        }}>
                          <div style={{ color: 'var(--text-secondary)' }}>
                            Need <strong style={{ color: info.color }}>{g.quotesPerDay}</strong> quotes/day
                          </div>
                          <div style={{ color: 'var(--text-faint)', marginTop: 2 }}>
                            {g.quotesNeeded} total quotes at {(g.closeRate * 100).toFixed(0)}% close rate
                          </div>
                          {line === 'auto' && g.hhNeeded !== null && (
                            <div style={{ color: 'var(--text-faint)', marginTop: 2 }}>
                              ≈ {g.hhNeeded} HH &times; 2 cars = {g.carsFromHH} autos
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom Grid: Leaderboard + Recent Activity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Leaderboard */}
            <div style={cardStyle}>
              <div style={{
                color: 'var(--text-faint)', fontSize: 11, fontWeight: 700,
                letterSpacing: '.1em', marginBottom: 12, textTransform: 'uppercase',
              }}>
                Leaderboard
              </div>
              {(data?.leaderboard || []).map((agent, i) => (
                <div key={agent.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0',
                  borderBottom: i < (data.leaderboard.length - 1) ? '1px solid var(--border-separator)' : 'none',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                    background: i === 0 ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' :
                      i === 1 ? 'linear-gradient(135deg, #94a3b8, #64748b)' :
                      i === 2 ? 'linear-gradient(135deg, #cd7f32, #b87333)' : 'var(--border)',
                    color: i < 3 ? '#020617' : 'var(--text-muted)',
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{agent.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{agent.total_apps || 0}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>${(agent.total_premium || 0).toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {(!data?.leaderboard || data.leaderboard.length === 0) && (
                <div style={{ color: 'var(--text-disabled)', fontSize: 13, padding: 20, textAlign: 'center' }}>
                  No activity yet for this period
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div style={cardStyle}>
              <div style={{
                color: 'var(--text-faint)', fontSize: 11, fontWeight: 700,
                letterSpacing: '.1em', marginBottom: 12, textTransform: 'uppercase',
              }}>
                Recent Activity
              </div>
              {(data?.recentActivity || []).map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border-separator)',
                }}>
                  <span style={{ fontSize: 16 }}>{APP_TYPES[a.line]?.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>
                      <strong>{a.customer_name}</strong>
                      <span style={{ color: 'var(--text-faint)' }}> — {a.product_type}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-disabled)' }}>
                      {a.agent_name} &middot; {formatTime(a.submitted_at)}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>
                    ${(a.premium || 0).toLocaleString()}
                  </div>
                </div>
              ))}
              {(!data?.recentActivity || data.recentActivity.length === 0) && (
                <div style={{ color: 'var(--text-disabled)', fontSize: 13, padding: 20, textAlign: 'center' }}>
                  No recent activity
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      ...cardStyle,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-disabled)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

const cardStyle = {
  borderRadius: 12, padding: 16,
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  transition: 'background .25s, border-color .25s',
};

// Component: Show seconds since last update, live-updating
function LastUpdatedTime({ timestamp }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => {
      setElapsed(Math.floor((Date.now() - timestamp) / 1000));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timestamp]);

  return <span>{elapsed}s ago</span>;
}

// CSS animation for pulse dot
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
}
