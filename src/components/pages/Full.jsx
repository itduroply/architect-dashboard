import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supbase';

export default function SupabaseArchitectDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArchitect, setSelectedArchitect] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  // Master lists for dropdown filters
  const [allArchitects, setAllArchitects] = useState([]);
  const [allStates, setAllStates] = useState([]);
  const [allStatuses, setAllStatuses] = useState([]);

  // Full master cache from leads_master (Excludes NULL rows)
  const [masterLeads, setMasterLeads] = useState([]);

  // Profile isolated ledger states
  const [leadsData, setLeadsData] = useState([]);
  const [commissionData, setCommissionData] = useState([]);
  const [remittanceTotal, setRemittanceTotal] = useState(0);

  // Layout Dropdown States
  const [filterState, setFilterState] = useState('');
  const [filterLeadStatus, setFilterLeadStatus] = useState('');

  // 1. Initial configuration mount - load all valid entries from leads_master
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const { data, error } = await supabase
          .from('leads_master')
          .select('lead_id, lead_status, linked_architect, state')
          .not('linked_architect', 'is', null);

        if (error) throw error;

        if (data) {
          const cleanLeads = data.filter(item => 
            item.linked_architect?.trim().length > 0 && 
            item.linked_architect.toLowerCase() !== 'null'
          );
          setMasterLeads(cleanLeads);

          const architects = [...new Set(cleanLeads.map(item => item.linked_architect.trim()))];
          setAllArchitects(architects);

          const states = [...new Set(cleanLeads.map(item => item.state?.trim()))].filter(Boolean);
          setAllStates(states);

          const statuses = [...new Set(cleanLeads.map(item => item.lead_status?.trim()))].filter(Boolean);
          setAllStatuses(statuses);
        }
      } catch (err) {
        console.error("Error compiling master tracking context indexes:", err.message);
      }
    };
    fetchMasterData();
  }, []);

  // 2. Query individual ledger records when an explicit profile selection locks in
  const fetchDashboardData = async (architectName) => {
    setLoading(true);
    try {
      const leads = masterLeads.filter(item => item.linked_architect?.trim() === architectName);
      setLeadsData(leads);

      const { data: remittanceData, error: remittancesErr } = await supabase
        .from('remittances')
        .select('amount')
        .ilike('architect_name', architectName)
        .eq('status', 'Paid');

      if (remittancesErr) throw remittancesErr;

      const totalPaidRemittance = (remittanceData || []).reduce((sum, item) => sum + (item.amount || 0), 0);
      setRemittanceTotal(totalPaidRemittance);

      if (leads.length > 0) {
        const leadIds = leads.map(l => l.lead_id);
        const { data: commissionRecords, error: commissionErr } = await supabase
          .from('commission_ledger')
          .select('lead_id, product_sku, total_eligible_sheets, total_payout_amount, state, claim_date')
          .in('lead_id', leadIds);

        if (commissionErr) throw commissionErr;
        setCommissionData(commissionRecords || []);
      } else {
        setCommissionData([]);
      }
    } catch (err) {
      console.error("Data pipeline processing failure:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Auto-predictive suggestions engine
  const suggestions = useMemo(() => {
    if (!searchQuery) return [];
    return allArchitects.filter(name =>
      name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, allArchitects]);

  const handleSelectArchitect = (name) => {
    setSelectedArchitect(name);
    setSearchQuery(name);
    setFilterState('');
    setFilterLeadStatus('');
    fetchDashboardData(name);
  };

  // 4. Unified Data Engine
  const compiledData = useMemo(() => {
    if (selectedArchitect) {
      const records = [];
      leadsData.forEach(lead => {
        const matchingCommissions = commissionData.filter(c => String(c.lead_id) === String(lead.lead_id));
        
        if (matchingCommissions.length > 0) {
          matchingCommissions.forEach(comm => {
            records.push({
              lead_id: lead.lead_id,
              lead_status: lead.lead_status || 'N/A',
              linked_architect: lead.linked_architect || selectedArchitect,
              product_sku: comm.product_sku || '—',
              total_eligible_sheets: comm.total_eligible_sheets || 0,
              total_payout_amount: comm.total_payout_amount || 0,
              state: lead.state || '—',
              claim_date: comm.claim_date || '—'
            });
          });
        } else {
          records.push({
            lead_id: lead.lead_id,
            lead_status: lead.lead_status || 'N/A',
            linked_architect: lead.linked_architect || selectedArchitect,
            product_sku: '—',
            total_eligible_sheets: 0,
            total_payout_amount: 0,
            state: lead.state || '—',
            claim_date: '—'
          });
        }
      });
      return records;
    } else {
      return masterLeads.filter(item => {
        const matchesSearch = searchQuery 
          ? item.linked_architect?.toLowerCase().includes(searchQuery.toLowerCase()) 
          : true;
        const matchesState = filterState ? item.state === filterState : true;
        const matchesStatus = filterLeadStatus ? item.lead_status === filterLeadStatus : true;
        return matchesSearch && matchesState && matchesStatus;
      });
    }
  }, [selectedArchitect, leadsData, commissionData, masterLeads, searchQuery, filterState, filterLeadStatus]);

  // 5. Total Calculation Accumulator
  const kpiTotals = useMemo(() => {
    if (!selectedArchitect) return { sheets: 0, payout: 0 };
    return compiledData.reduce((acc, curr) => {
      acc.sheets += (curr.total_eligible_sheets || 0);
      acc.payout += (curr.total_payout_amount || 0);
      return acc;
    }, { sheets: 0, payout: 0 });
  }, [compiledData, selectedArchitect]);

  const hasActiveFilters = filterState || filterLeadStatus || searchQuery.trim().length > 0;
  const shouldShowContent = selectedArchitect || hasActiveFilters;
  const shouldShowKPIs = selectedArchitect && commissionData.length > 0;

  return (
    <div style={styles.dashboardContainer}>
      {/* Top Header Card Controls Panel */}
      <div style={styles.controlPanelCard}>
        <div style={styles.headerTextGroup}>
          <h2 style={styles.title}>Live Architect Ledger Matrix</h2>
          <p style={styles.subtitle}>Directly synchronized with backend cloud relational data layers.</p>
        </div>

        <div style={styles.controlsLayoutGrid}>
          {/* Architect Input Field */}
          <div style={styles.searchWrapper}>
            <label style={styles.label}>Search Architect Name</label>
            <input
              type="text"
              placeholder="Type to filter architect profiles..."
              value={searchQuery}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 250)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                const trimmedValue = e.target.value.trim();
                if (allArchitects.includes(trimmedValue)) {
                  handleSelectArchitect(trimmedValue);
                } else if (e.target.value === '') {
                  setSelectedArchitect('');
                }
              }}
              style={styles.inputField}
            />

            {isFocused && suggestions.length > 0 && (
              <div style={styles.suggestionsDropdown}>
                {suggestions.map((name, idx) => (
                  <div
                    key={idx}
                    onMouseDown={() => handleSelectArchitect(name)}
                    style={styles.suggestionItem}
                  >
                    {name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Region State Filter Dropdown */}
          <div style={styles.filterItem}>
            <label style={styles.label}>Region State Filter</label>
            <select 
              value={filterState} 
              onChange={(e) => {
                setFilterState(e.target.value);
                setSelectedArchitect(''); 
              }} 
              style={styles.selectDropdown}
            >
              <option value="">All Regions</option>
              {allStates.map((st, i) => <option key={i} value={st}>{st}</option>)}
            </select>
          </div>

          {/* Context Status Filter Dropdown */}
          <div style={styles.filterItem}>
            <label style={styles.label}>Lead Context Status Filter</label>
            <select 
              value={filterLeadStatus} 
              onChange={(e) => {
                setFilterLeadStatus(e.target.value);
                setSelectedArchitect(''); 
              }} 
              style={styles.selectDropdown}
            >
              <option value="">All Contexts</option>
              {allStatuses.map((status, i) => <option key={i} value={status}>{status}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={styles.initialPlaceholder}>Assembling parallel relational queries...</div>
      ) : shouldShowContent ? (
        <>
          {/* Top Metric Grid Matrix */}
          {shouldShowKPIs && (
            <div style={styles.kpiGrid}>
              <div style={styles.kpiCard}>
                <span style={styles.kpiLabel}>Total Eligible Sheets</span>
                <span style={styles.kpiValue}>{kpiTotals.sheets.toLocaleString()}</span>
              </div>
              <div style={styles.kpiCard}>
                <span style={styles.kpiLabel}>Total Payout Amount</span>
                <span style={styles.kpiValue}>₹{kpiTotals.payout.toLocaleString()}</span>
              </div>
              <div style={styles.kpiCard}>
                <span style={styles.kpiLabel}>Total Remittance Settled (Paid)</span>
                <span style={{...styles.kpiValue, color: '#1B4D45' }}>
                  ₹{remittanceTotal.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Main Grid View Panel Layer */}
          <div style={styles.tableSection}>
            <div style={styles.tableHeaderControls}>
              <h3 style={styles.sectionTitle}>
                {selectedArchitect ? `Performance Ledger: ${selectedArchitect}` : 'Global Active Parameter Ledger Matrix'}
              </h3>
            </div>

            <div style={styles.tableWrapper}>
              {compiledData.length > 0 ? (
                <table style={styles.mainTable}>
                  <thead>
                    <tr style={styles.tableHeadRow}>
                      <th style={{...styles.th, width: '15%'}}>Lead ID</th>
                      <th style={{...styles.th, width: '25%'}}>Architect Reference</th>
                      <th style={{...styles.th, width: '15%'}}>Status</th>
                      {shouldShowKPIs && <th style={styles.th}>Product SKU</th>}
                      {shouldShowKPIs && <th style={styles.th}>Sheets Allocated</th>}
                      {shouldShowKPIs && <th style={styles.th}>Payout Target</th>}
                      <th style={{...styles.th, width: '20%'}}>State Location</th>
                      {shouldShowKPIs && <th style={styles.th}>Claim Date</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {compiledData.map((row, i) => (
                      <tr key={i} style={i % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}>
                        <td style={{...styles.td, fontWeight: '600', color: '#2D2822'}}>{row.lead_id}</td>
                        <td style={styles.td}>{row.linked_architect || '—'}</td>
                        <td style={styles.td}>
                          <span style={getBadgeStyle(row.lead_status)}>{row.lead_status}</span>
                        </td>
                        {shouldShowKPIs && <td style={{...styles.td, fontFamily: 'monospace'}}>{row.product_sku}</td>}
                        {shouldShowKPIs && <td style={styles.td}>{row.total_eligible_sheets}</td>}
                        {shouldShowKPIs && <td style={{...styles.td, fontWeight: '600', color: '#4A4238'}}>₹{row.total_payout_amount?.toLocaleString()}</td>}
                        <td style={styles.td}>{row.state || '—'}</td>
                        {shouldShowKPIs && <td style={styles.td}>{row.claim_date}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={styles.emptyStateContainer}>No cross-table ledger datasets match standard active constraints.</div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div style={styles.initialPlaceholder}>
          <div style={styles.placeholderIcon}>⚡</div>
          <h3>Architect Synchronized Index</h3>
          <p>Please enter an active architect profile name or choose dropdown parameters above to load data tables.</p>
        </div>
      )}
    </div>
  );
}

// FIX: Enhanced Dynamic Color Context System Matching the Light Brown Architecture Theme
const getBadgeStyle = (status) => {
  const base = { 
    padding: '4px 12px', 
    borderRadius: '20px', 
    fontSize: '0.75rem', 
    fontWeight: '600', 
    display: 'inline-block', 
    whiteSpace: 'nowrap' 
  };
  
  const normStatus = status?.toLowerCase().trim() || '';

  switch (normStatus) {
    case 'won':
    case 'paid':
      return { ...base, backgroundColor: '#DFEFE3', color: '#1B4D2C' }; // Soft Sage Green
    case 'lost':
    case 'cancelled':
      return { ...base, backgroundColor: '#F7E3DF', color: '#7A2F22' }; // Earthy Terracotta/Clay
    case 'hot':
    case 'open':
    case 'active':
      return { ...base, backgroundColor: '#DFEBF6', color: '#204466' }; // Slate Blue
    case 'cold':
    case 'pending':
    case 'contacted':
      return { ...base, backgroundColor: '#F6ECD5', color: '#6E511D' }; // Warm Ochre/Sand
    case 'warm':
    case 'follow up':
      return { ...base, backgroundColor: '#EFE4F2', color: '#54295E' }; // Muted Purple/Plum
    default:
      return { ...base, backgroundColor: '#ECE4DB', color: '#5C5143' }; // Coordinated Greige Fallback
  }
};

// Premium, Warm-Minimalist Architectural Design Palette
const styles = {
  dashboardContainer: { 
    padding: '32px', 
    backgroundColor: '#F5F0EA', 
    minHeight: '100vh', 
    color: '#4A4238', 
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxSizing: 'border-box',
    width: '99%',
    maxWidth: '120%',
    overflowX: 'hidden'
  },
  controlPanelCard: { 
    backgroundColor: '#FCFAF7', 
    borderRadius: '16px', 
    padding: '28px', 
    border: '1px solid #E4DDD3', 
    boxShadow: '0 4px 20px -2px rgba(106, 95, 82, 0.05)',
    marginBottom: '28px',
    boxSizing: 'border-box'
  },
  headerTextGroup: { marginBottom: '24px' },
  title: { margin: '0 0 6px 0', fontSize: '1.6rem', fontWeight: '700', color: '#2D2822' },
  subtitle: { margin: '0', color: '#8A7E72', fontSize: '0.9rem' },
  controlsLayoutGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr',
    gap: '20px',
    alignItems: 'end',
    boxSizing: 'border-box',
    width: '100%'
  },
  searchWrapper: { position: 'relative', display: 'flex', flexDirection: 'column', gap: '8px' },
  inputField: { 
    width: '100%', 
    padding: '12px 16px', 
    borderRadius: '10px', 
    border: '1px solid #DCD3C5', 
    backgroundColor: '#FFFFFF', 
    fontSize: '0.92rem', 
    outline: 'none',
    color: '#2D2822',
    boxShadow: 'inset 0 1px 3px rgba(106, 95, 82, 0.04)',
    boxSizing: 'border-box'
  },
  suggestionsDropdown: { 
    position: 'absolute', 
    top: '100%', 
    left: '0', 
    right: '0', 
    backgroundColor: '#FFFFFF', 
    borderRadius: '10px', 
    border: '1px solid #E4DDD3', 
    boxShadow: '0 12px 30px rgba(74, 66, 56, 0.1)',
    zIndex: 10, 
    marginTop: '8px', 
    maxHeight: '220px', 
    overflowY: 'auto' 
  },
  suggestionItem: { 
    padding: '12px 16px', 
    cursor: 'pointer', 
    fontSize: '0.92rem',
    color: '#4A4238',
    borderBottom: '1px solid #F5F0EA',
    backgroundColor: '#FFFFFF'
  },
  filterItem: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '0.75rem', fontWeight: '700', color: '#706557', textTransform: 'uppercase', letterSpacing: '0.05em' },
  selectDropdown: { 
    padding: '12px 16px', 
    borderRadius: '10px', 
    border: '1px solid #DCD3C5', 
    backgroundColor: '#FFFFFF', 
    fontSize: '0.92rem',
    color: '#2D2822',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%'
  },
  kpiGrid: { 
    display: 'grid', 
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', 
    gap: '24px', 
    marginBottom: '28px',
    boxSizing: 'border-box'
  },
  kpiCard: { 
    backgroundColor: '#FCFAF7', 
    borderRadius: '16px', 
    padding: '24px', 
    border: '1px solid #E4DDD3', 
    boxShadow: '0 4px 20px -2px rgba(106, 95, 82, 0.05)',
    display: 'flex', 
    flexDirection: 'column',
    boxSizing: 'border-box'
  },
  kpiLabel: { fontSize: '0.78rem', fontWeight: '700', color: '#8A7E72', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' },
  kpiValue: { fontSize: '1.85rem', fontWeight: '700', color: '#2D2822' },
  tableSection: { 
    backgroundColor: '#FCFAF7', 
    borderRadius: '16px', 
    border: '1px solid #E4DDD3', 
    boxShadow: '0 4px 20px -2px rgba(106, 95, 82, 0.05)',
    overflow: 'hidden',
    width: '100%',
    boxSizing: 'border-box'
  },
  tableHeaderControls: { padding: '20px 28px', borderBottom: '1px solid #E4DDD3', backgroundColor: '#FCFAF7' },
  sectionTitle: { margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#2D2822' },
  tableWrapper: { 
    overflowX: 'auto', 
    width: '100%',
    boxSizing: 'border-box'
  },
  mainTable: { 
    width: '100%', 
    borderCollapse: 'collapse', 
    textAlign: 'left', 
    fontSize: '0.92rem',
    boxSizing: 'border-box'
  },
  tableHeadRow: { backgroundColor: '#F1EBE2', borderBottom: '1px solid #E4DDD3' },
  th: { 
    padding: '14px 28px', 
    fontWeight: '700', 
    color: '#706557', 
    fontSize: '0.78rem', 
    textTransform: 'uppercase', 
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap'
  },
  td: { 
    padding: '16px 28px', 
    color: '#4A4238', 
    borderBottom: '1px solid #E4DDD3',
    wordBreak: 'break-word',
    whiteSpace: 'normal'
  },
  tableRowEven: { backgroundColor: '#FCFAF7' },
  tableRowOdd: { backgroundColor: '#F7F3ED' },
  initialPlaceholder: { 
    textAlign: 'center', 
    padding: '64px 24px', 
    backgroundColor: '#FCFAF7', 
    borderRadius: '16px', 
    border: '1px dashed #C4B9A8', 
    color: '#8A7E72',
    boxSizing: 'border-box'
  },
  placeholderIcon: { fontSize: '2.4rem', marginBottom: '10px' },
  emptyStateContainer: { padding: '36px', textAlign: 'center', color: '#8A7E72' }
};