import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { FEATURE_FLAGS } from '../lib/constants';

/**
 * Admin Panel — Mobile-first layout (Hank checks on phone)
 *
 * Manage team members: add, deactivate, change roles
 */
export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', name: '', role: 'agent' });
  const [toast, setToast] = useState(null);
  // Sprint 4: filter active vs inactive
  const [showInactive, setShowInactive] = useState(false);

  // Holidays
  const [holidays, setHolidays] = useState([]);
  const [holidayYear, setHolidayYear] = useState(new Date().getFullYear());
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '' });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data.users);
    } catch (err) {
      console.error('Load users error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadHolidays = async (year) => {
    try {
      const data = await api.getHolidays(year);
      setHolidays(data.holidays);
    } catch (err) {
      console.error('Load holidays error:', err);
    }
  };

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { loadHolidays(holidayYear); }, [holidayYear]);

  const addUser = async () => {
    if (!newUser.email || !newUser.name) {
      setToast({ type: 'error', message: 'Email and name required' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    try {
      await api.createUser(newUser);
      setToast({ type: 'success', message: `${newUser.name} added` });
      setNewUser({ email: '', name: '', role: 'agent' });
      setShowAdd(false);
      loadUsers();
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 4000);
    }
  };

  // Sprint 4 fix: backend validator expects 0 or 1 (not bool).
  // Old code sent !u.is_active (boolean) → 400 "is_active must be 0 or 1".
  const toggleActive = async (u) => {
    try {
      const next = u.is_active ? 0 : 1;
      await api.updateUser(u.id, { is_active: next });
      setToast({ type: 'success', message: next ? `${u.name} activated` : `${u.name} deactivated` });
      setTimeout(() => setToast(null), 2500);
      loadUsers();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 4000);
    }
  };

  const changeRole = async (u, role) => {
    try {
      await api.updateUser(u.id, { role });
      loadUsers();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 4000);
    }
  };

  const addHoliday = async () => {
    if (!newHoliday.name || !newHoliday.date) {
      setToast({ type: 'error', message: 'Name and date required' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    try {
      await api.addHoliday(newHoliday);
      setToast({ type: 'success', message: `${newHoliday.name} added` });
      setNewHoliday({ name: '', date: '' });
      setShowAddHoliday(false);
      loadHolidays(holidayYear);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 4000);
    }
  };

  const deleteHoliday = async (id) => {
    try {
      await api.deleteHoliday(id);
      loadHolidays(holidayYear);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Team Management</h1>
          <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0 }}>
            Add team members by their work email (Google or @statefarm.com)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Sprint 4: inactive toggle */}
          <button
            onClick={() => setShowInactive(s => !s)}
            style={{
              background: showInactive ? 'var(--accent-bg)' : 'var(--bg-card)',
              border: `1px solid ${showInactive ? 'var(--accent-border)' : 'var(--border-input)'}`,
              color: showInactive ? 'var(--accent)' : 'var(--text-muted)',
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {showInactive ? 'Showing all' : 'Show inactive'}
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              color: 'var(--accent-text)', border: 'none', padding: '10px 18px',
              borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Add User Form */}
      {showAdd && (
        <div style={{
          ...cardStyle, marginBottom: 16,
          borderColor: 'var(--accent-border)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              placeholder="Full Name"
              value={newUser.name}
              onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))}
              style={inputStyle}
            />
            <input
              placeholder="Email (e.g. agent@statefarm.com)"
              value={newUser.email}
              onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
              style={inputStyle}
            />
            <select
              value={newUser.role}
              onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
              style={inputStyle}
            >
              <option value="agent">Agent</option>
              <option value="team_leader">Team Leader</option>
              <option value="sales_specialist">Sales Specialist</option>
              <option value="admin">Admin</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addUser} style={{
                flex: 1, background: 'var(--success)', color: '#fff', border: 'none',
                padding: '10px', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
              }}>
                Add Team Member
              </button>
              <button onClick={() => setShowAdd(false)} style={{
                background: 'none', border: '1px solid var(--border-input)',
                color: 'var(--text-muted)', padding: '10px 16px', borderRadius: 8,
                cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.filter(u => showInactive ? true : u.is_active).map(u => (
            <div key={u.id} style={{
              ...cardStyle,
              opacity: u.is_active ? 1 : 0.5,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--avatar-bg-a), var(--avatar-bg-b))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: 'var(--avatar-text)',
              }}>
                {u.initials}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{u.email}</div>
              </div>
              <select
                value={u.role}
                onChange={e => changeRole(u, e.target.value)}
                style={{
                  padding: '4px 8px', borderRadius: 6, fontSize: 11,
                  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
                  color: 'var(--text-muted)', outline: 'none',
                }}
              >
                <option value="agent">Agent</option>
                <option value="team_leader">Team Leader</option>
                <option value="sales_specialist">Sales Specialist</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={() => toggleActive(u)}
                style={{
                  background: u.is_active ? 'var(--error-bg)' : 'var(--success-bg)',
                  border: 'none', color: u.is_active ? 'var(--error-light)' : 'var(--success)',
                  padding: '6px 10px', borderRadius: 6, fontSize: 11,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                {u.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Holidays Section */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Holidays</h2>
            <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0 }}>
              Manage company holidays and working days
            </p>
          </div>
          <button
            onClick={() => setShowAddHoliday(!showAddHoliday)}
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              color: 'var(--accent-text)', border: 'none', padding: '10px 18px',
              borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>

        {/* Year Selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, marginRight: 8 }}>Year:</label>
          <select
            value={holidayYear}
            onChange={e => setHolidayYear(parseInt(e.target.value))}
            style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--bg-input)', border: '1px solid var(--border-input)',
              color: 'var(--text)', fontSize: 13, outline: 'none',
            }}
          >
            <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
            <option value={new Date().getFullYear() + 1}>{new Date().getFullYear() + 1}</option>
            <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
          </select>
        </div>

        {/* Add Holiday Form */}
        {showAddHoliday && (
          <div style={{
            ...cardStyle, marginBottom: 16,
            borderColor: 'var(--accent-border)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="date"
                placeholder="Date"
                value={newHoliday.date}
                onChange={e => setNewHoliday(p => ({ ...p, date: e.target.value }))}
                style={inputStyle}
              />
              <input
                placeholder="Holiday Name (e.g., Christmas)"
                value={newHoliday.name}
                onChange={e => setNewHoliday(p => ({ ...p, name: e.target.value }))}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addHoliday} style={{
                  flex: 1, background: 'var(--success)', color: '#fff', border: 'none',
                  padding: '10px', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
                }}>
                  Add Holiday
                </button>
                <button onClick={() => setShowAddHoliday(false)} style={{
                  background: 'none', border: '1px solid var(--border-input)',
                  color: 'var(--text-muted)', padding: '10px 16px', borderRadius: 8,
                  cursor: 'pointer',
                }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Holidays List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {holidays.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-faint)', ...cardStyle }}>
              No holidays for {holidayYear}
            </div>
          ) : (
            holidays.map(h => (
              <div key={h.id} style={{
                ...cardStyle,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{h.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                    {new Date(h.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <button
                  onClick={() => deleteHoliday(h.id)}
                  style={{
                    background: 'var(--error-bg)', border: 'none',
                    color: 'var(--error-light)', padding: '6px 10px', borderRadius: 6,
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  borderRadius: 12, padding: 14,
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  transition: 'background .25s, border-color .25s',
};

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
  color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
};
