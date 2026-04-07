/**
 * Product line definitions — single source of truth
 * Matches Hank's exact categories from the requirements
 */
export const APP_TYPES = {
  auto: {
    label: 'Auto',
    icon: '\u{1F697}',
    color: '#3b82f6',
    bgColor: 'rgba(59,130,246,.15)',
    types: ['Personal', 'Commercial', 'RV', 'ATV', 'Golf Cart', 'Travel Trailer', 'Trailer'],
  },
  fire: {
    label: 'Fire',
    icon: '\u{1F525}',
    color: '#f97316',
    bgColor: 'rgba(249,115,22,.15)',
    types: ['Home', 'RDP', 'Renters', 'PLUP', 'BOP', 'CLUP', 'Work Comp', 'Condo', 'PAP', 'Contractor', 'Flood'],
  },
  life: {
    label: 'Life',
    icon: '\u2764\uFE0F',
    color: '#ef4444',
    bgColor: 'rgba(239,68,68,.15)',
    types: ['Term 10', 'Term 20', 'Term 30', 'Whole Life', '10 Pay', '15 Pay', '20 Pay', 'UL', 'IA', 'GIFE', 'ROP-20', 'ROP-30'],
  },
  disability: {
    label: 'Disability',
    icon: '\u{1F6E1}\uFE0F',
    color: '#8b5cf6',
    bgColor: 'rgba(139,92,246,.15)',
    types: ['STDI', 'LTD'],
  },
};

export const LINES = Object.keys(APP_TYPES);

export const DEFAULT_RATIOS = {
  auto: 0.18,
  fire: 0.25,
  life: 0.15,
  disability: 0.15,
};

export const TIME_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'year', label: 'This Year' },
];
