/**
 * API client — wraps fetch with auth error handling
 */
const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (res.status === 401) {
    // Session expired — redirect to login
    window.location.href = '/login';
    throw new Error('Not authenticated');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth
  getMe: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // Applications
  submitApp: (data) => request('/apps', { method: 'POST', body: JSON.stringify(data) }),
  getApps: (params) => request(`/apps?${new URLSearchParams(params)}`),
  getAppStats: (params) => request(`/apps/stats?${new URLSearchParams(params)}`),
  editApp: (id, data) => request(`/apps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  voidApp: (id) => request(`/apps/${id}/void`, { method: 'PUT' }),
  searchCustomers: (query) => request(`/apps/customers/search?q=${encodeURIComponent(query)}`),

  // Goals
  getGoalCalc: (params) => request(`/goals/calculator?${new URLSearchParams(params)}`),
  setGoals: (data) => request('/goals', { method: 'PUT', body: JSON.stringify(data) }),
  setRatios: (data) => request('/goals/ratios', { method: 'PUT', body: JSON.stringify(data) }),
  // Sprint 5: custom + trackable goals
  getCustomGoals: (params) => request(`/goals/custom?${new URLSearchParams(params)}`),
  createCustomGoal: (data) => request('/goals/custom', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomGoal: (id, data) => request(`/goals/custom/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomGoal: (id) => request(`/goals/custom/${id}`, { method: 'DELETE' }),

  // Dashboard
  getDashboard: (params) => request(`/dashboard?${new URLSearchParams(params)}`),
  getTeam: () => request('/dashboard/team'),

  // Users
  getUsers: () => request('/users'),
  createUser: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Quotes (legacy)
  logQuotes: (data) => request('/quotes', { method: 'POST', body: JSON.stringify(data) }),
  getTodayQuotes: () => request('/quotes/today'),
  getQuoteSummary: (params) => request(`/quotes/summary?${new URLSearchParams(params)}`),

  // Hank v2 — Activities (unified trackables)
  logActivity: (data) => request('/activities', { method: 'POST', body: JSON.stringify(data) }),
  getTodayActivities: () => request('/activities/today'),
  getActivitySummary: (params) => request(`/activities/summary?${new URLSearchParams(params)}`),
  // Sprint 2: open quotes + convert to app
  getOpenQuotes: (params) => request(`/activities/open-quotes${params ? `?${new URLSearchParams(params)}` : ''}`),
  submitAppFromActivity: (id, data) => request(`/activities/${id}/submit-app`, { method: 'POST', body: JSON.stringify(data) }),

  // Holidays
  getHolidays: (year) => request(`/holidays${year ? `?year=${year}` : ''}`),
  addHoliday: (data) => request('/holidays', { method: 'POST', body: JSON.stringify(data) }),
  deleteHoliday: (id) => request(`/holidays/${id}`, { method: 'DELETE' }),
};
