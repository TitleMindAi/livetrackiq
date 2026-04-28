import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import { APP_TYPES, LINES, LEAD_SOURCES, FEATURE_FLAGS } from '../lib/constants';

/**
 * App Intake — Customer-Name-First flow
 *
 * Desktop-optimized layout:
 * Left: customer info + selected lines summary
 * Right: product type selectors per line
 */
export default function Intake() {
  // Hank 2026-04-24 spec: Submit App screen collects ONLY customer name + lead source.
  // Phone/email/notes/lead-temp removed — submitted apps are "finished" (no temp), and
  // contact details belong elsewhere if needed (typeahead still pulls from prior customers).
  const [customerName, setCustomerName] = useState('');
  const [selectedLines, setSelectedLines] = useState([]); // [{line, productType, premium, id}]
  const [activeLine, setActiveLine] = useState(null); // which line category is expanded
  const [leadSource, setLeadSource] = useState('');          // Hank v2: required dropdown
  const [leadSourceOther, setLeadSourceOther] = useState(''); // Free-text if "other"
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchDebounceRef = useRef(null);

  const addLine = useCallback((line, productType) => {
    setSelectedLines(prev => [
      ...prev,
      { id: crypto.randomUUID(), line, productType, premium: '' },
    ]);
  }, []);

  const updatePremium = useCallback((id, premium) => {
    setSelectedLines(prev => prev.map(l =>
      l.id === id ? { ...l, premium } : l
    ));
  }, []);

  const removeLine = useCallback((id) => {
    setSelectedLines(prev => prev.filter(l => l.id !== id));
  }, []);

  const handleCustomerNameChange = useCallback((value) => {
    setCustomerName(value);

    // Clear previous debounce
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Only search if 2+ chars
    if (value.trim().length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    // Debounce search 300ms
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const data = await api.searchCustomers(value);
        setSearchResults(data.customers || []);
        setSearchOpen(true);
      } catch (err) {
        console.error('Customer search error:', err);
        setSearchResults([]);
      }
    }, 300);
  }, []);

  const selectCustomer = useCallback((customer) => {
    setCustomerName(customer.name);
    setSearchResults([]);
    setSearchOpen(false);
  }, []);

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      setToast({ type: 'error', message: 'Enter a customer name' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (selectedLines.length === 0) {
      setToast({ type: 'error', message: 'Add at least one product line' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setSubmitting(true);
    try {
      // Hank v2: resolve lead source (empty => legacy path, no source sent)
      const resolvedSource = FEATURE_FLAGS.ff_lead_sources && leadSource
        ? (leadSource === 'other' ? (leadSourceOther.trim() || 'other') : leadSource)
        : undefined;

      await api.submitApp({
        customerName: customerName.trim(),
        // No phone/email/notes/leadTemperature — Hank: submitted apps are finished
        leadSource: resolvedSource,
        lines: selectedLines.map(l => ({
          line: l.line,
          productType: l.productType,
          premium: parseFloat(l.premium) || 0,
        })),
      });

      setToast({ type: 'success', message: `${customerName} submitted! ${selectedLines.length} line(s)` });
      // Reset form
      setCustomerName('');
      setLeadSource('');
      setLeadSourceOther('');
      setSelectedLines([]);
      setActiveLine(null);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  // Group selected lines by category for summary
  const linesByCategory = {};
  for (const l of selectedLines) {
    if (!linesByCategory[l.line]) linesByCategory[l.line] = [];
    linesByCategory[l.line].push(l);
  }

  return (
    <div>
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

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>Submit App Info</h1>
        <p style={{ color: 'var(--text-faint)', fontSize: 14, marginBottom: 24 }}>
          Enter customer name first, then select products presented
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>
          {/* LEFT: Customer Info + Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Customer Name with Typeahead */}
            <div style={cardStyle}>
              <div style={sectionLabel}>Customer Info</div>
              <div style={{ position: 'relative' }}>
                <input
                  placeholder="Customer Name *"
                  value={customerName}
                  onChange={e => handleCustomerNameChange(e.target.value)}
                  onFocus={() => customerName.trim().length >= 2 && setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                  style={{ ...inputStyle, fontSize: 16, fontWeight: 600 }}
                  autoFocus
                />
                {searchOpen && searchResults.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '0 0 10px 10px', boxShadow: '0 4px 12px rgba(0,0,0,.15)',
                    maxHeight: 240, overflowY: 'auto', zIndex: 10,
                  }}>
                    {searchResults.map(cust => (
                      <div
                        key={cust.id}
                        onClick={() => selectCustomer(cust)}
                        style={{
                          padding: '10px 14px', borderBottom: '1px solid var(--border-separator)',
                          cursor: 'pointer', transition: 'background .15s',
                          background: 'var(--bg-card)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-inner)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                          {cust.name}
                        </div>
                        {cust.app_count > 0 && (
                          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
                            {cust.app_count} app{cust.app_count !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    ))}
                    <div style={{
                      padding: '10px 14px', cursor: 'pointer', textAlign: 'center',
                      color: 'var(--text-faint)', fontSize: 12, background: 'var(--bg-inner)',
                      borderTop: '1px solid var(--border-separator)',
                    }}>
                      New Customer
                    </div>
                  </div>
                )}
              </div>

              {/* Lead Source (Hank v2) — primary qualifier on Submit App */}
              {FEATURE_FLAGS.ff_lead_sources && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '.05em', marginBottom: 6 }}>
                    LEAD SOURCE
                  </div>
                  <select
                    value={leadSource}
                    onChange={e => setLeadSource(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">Select a source…</option>
                    {LEAD_SOURCES.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  {leadSource === 'other' && (
                    <input
                      placeholder="Specify source"
                      value={leadSourceOther}
                      onChange={e => setLeadSourceOther(e.target.value)}
                      style={{ ...inputStyle, marginTop: 6 }}
                    />
                  )}
                </div>
              )}

              {/* Lead Temperature removed per Hank — submitted apps are "finished" (lead temp lives on Activities) */}
            </div>

            {/* Selected Lines Summary */}
            <div style={cardStyle}>
              <div style={sectionLabel}>Selected Products ({selectedLines.length})</div>
              {selectedLines.length === 0 ? (
                <div style={{ color: 'var(--text-disabled)', fontSize: 13, padding: '12px 0' }}>
                  Select products from the right panel
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(linesByCategory).map(([line, items]) => (
                    <div key={line}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: APP_TYPES[line].color, marginBottom: 4 }}>
                        {APP_TYPES[line].icon} {APP_TYPES[line].label}
                      </div>
                      {items.map(item => (
                        <div key={item.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 10px', background: 'var(--bg-inner)',
                          borderRadius: 8, marginBottom: 4,
                        }}>
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{item.productType}</span>
                          <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>$</span>
                          <input
                            type="number"
                            placeholder="Premium"
                            value={item.premium}
                            onChange={e => updatePremium(item.id, e.target.value)}
                            style={{
                              width: 100, padding: '4px 8px', borderRadius: 6,
                              background: 'var(--bg-input)', border: '1px solid var(--border-input)',
                              color: 'var(--text)', fontSize: 13, outline: 'none',
                            }}
                          />
                          <button
                            onClick={() => removeLine(item.id)}
                            style={{
                              background: 'var(--error-bg)', border: 'none',
                              color: 'var(--error-light)', width: 24, height: 24, borderRadius: 6,
                              cursor: 'pointer', fontSize: 14, lineHeight: 1,
                            }}
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                background: submitting
                  ? 'var(--border-input)'
                  : 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
                color: 'var(--accent-text)',
                border: 'none',
                padding: '14px 24px',
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'transform .12s',
              }}
            >
              {submitting ? 'Submitting...' : `Submit ${selectedLines.length} Line(s)`}
            </button>
          </div>

          {/* RIGHT: Product Line Selectors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {LINES.map(line => {
              const info = APP_TYPES[line];
              const isOpen = activeLine === line;
              const count = (linesByCategory[line] || []).length;

              return (
                <div key={line} style={{
                  ...cardStyle,
                  borderColor: isOpen ? info.color : undefined,
                  transition: 'border-color .15s, background .25s',
                }}>
                  {/* Line Header */}
                  <div
                    onClick={() => setActiveLine(isOpen ? null : line)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      cursor: 'pointer', padding: '4px 0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{info.icon}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{info.label}</span>
                      {count > 0 && (
                        <span style={{
                          background: info.bgColor, color: info.color,
                          padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                        }}>
                          {count}
                        </span>
                      )}
                    </div>
                    <span style={{ color: 'var(--text-faint)', fontSize: 20, transition: 'transform .15s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
                      &#9662;
                    </span>
                  </div>

                  {/* Product Types Grid */}
                  {isOpen && (
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12,
                      paddingTop: 12, borderTop: '1px solid var(--border-separator)',
                    }}>
                      {info.types.map(type => {
                        const alreadyAdded = selectedLines.some(l => l.line === line && l.productType === type);
                        return (
                          <button
                            key={type}
                            onClick={() => addLine(line, type)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                              cursor: 'pointer', transition: 'all .15s',
                              border: `1.5px solid ${alreadyAdded ? info.color : 'var(--border-input)'}`,
                              background: alreadyAdded ? info.bgColor : 'var(--bg-card)',
                              color: alreadyAdded ? info.color : 'var(--text-muted)',
                            }}
                          >
                            {type}
                            <span style={{ fontSize: 15, opacity: 0.7 }}>+</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  borderRadius: 12, padding: 16,
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  transition: 'background .25s, border-color .25s',
};

const sectionLabel = {
  color: 'var(--text-faint)', fontSize: 11, fontWeight: 700,
  letterSpacing: '.1em', marginBottom: 10, textTransform: 'uppercase',
};

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
  color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
};
