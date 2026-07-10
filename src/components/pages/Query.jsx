import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supbase'; // Ensure this points to your actual supabase client path

const QueryManagementPage = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [updatingId, setUpdatingId] = useState(null);

  // =========================================================
  // 💾 DATA ENGINE: FETCHING LOGS FROM SUPABASE
  // =========================================================
  useEffect(() => {
    fetchGlobalQueries();
  }, []);

  const fetchGlobalQueries = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('query_support')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (err) {
      console.error("Database extraction error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // 🔄 LIVE DATABASE STATUS TRANSITION (INTERNAL ID COUPLING)
  // =========================================================
  const handleStatusChange = async (targetId, newStatus) => {
    setUpdatingId(targetId);
    try {
      const { error } = await supabase
        .from('query_support')
        .update({ status: newStatus })
        .eq('id', targetId); 

      if (error) throw error;

      setTickets(prevTickets =>
        prevTickets.map(ticket =>
          ticket.id === targetId ? { ...ticket, status: newStatus } : ticket
        )
      );
    } catch (err) {
      console.error("Failed to execute status update payload:", err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  // =========================================================
  // 🔍 DATA COMPRESSION LAYER: ADAPTIVE GLOBAL SEARCH
  // =========================================================
  const processedTickets = useMemo(() => {
    const cleanQuery = searchQuery.toLowerCase().trim();

    return tickets.filter(ticket => {
      if (cleanQuery !== '') {
        const individualTicket = ticket.ticket ? String(ticket.ticket).toLowerCase() : '';
        const corporateAccount = ticket.account_identity ? String(ticket.account_identity).toLowerCase() : '';
        const signatoryName = ticket.name ? String(ticket.name).toLowerCase() : '';

        return (
          individualTicket.includes(cleanQuery) ||
          corporateAccount.includes(cleanQuery) ||
          signatoryName.includes(cleanQuery)
        );
      }

      const normalizedStatus = ticket.status?.trim().toLowerCase() || 'pending';
      if (statusFilter === 'PENDING' && normalizedStatus !== 'pending') return false;
      if (statusFilter === 'RESOLVED' && normalizedStatus !== 'resolved') return false;

      return true;
    });
  }, [tickets, searchQuery, statusFilter]);

  const metrics = useMemo(() => {
    return {
      total: tickets.length,
      pending: tickets.filter(t => (t.status?.trim().toLowerCase() || 'pending') === 'pending').length,
      resolved: tickets.filter(t => t.status?.trim().toLowerCase() === 'resolved').length
    };
  }, [tickets]);

  // =========================================================
  // 🎨 STYLING DICTIONARIES (INTEGRATED LAYOUT MIXINS)
  // =========================================================
  const styles = {
    pageWrapper: {
      backgroundColor: 'transparent', // 👈 Fixed: Stripped muddy tan background to integrate natively
      width: '100%',
      padding: '16px 24px 48px 24px',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      color: '#332924', // Balanced deep warm charcoal text
      boxSizing: 'border-box'
    },
    container: {
      maxWidth: '1200px',
      margin: '0' // Left-aligned cleanly with your platform content headers
    },
    headerBlock: {
      borderBottom: '1px solid #EAE4D9',
      paddingBottom: '20px',
      marginBottom: '32px'
    },
    pageTitle: {
      fontSize: '2.4rem',
      fontWeight: '700',
      letterSpacing: '-0.02em',
      margin: '0 0 8px 0',
      fontFamily: "'Playfair Display', Georgia, serif",
      color: '#1A1310'
    },
    pageSubtitle: {
      fontSize: '0.88rem',
      color: '#7C7067',
      margin: 0,
      fontWeight: '400'
    },
    metricsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '20px',
      marginBottom: '36px',
      maxWidth: '900px'
    },
    metricCard: {
      backgroundColor: '#FFFFFF',
      border: '1px solid #EAE4D9',
      padding: '20px 24px',
      borderRadius: '2px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
    },
    metricLabel: {
      fontSize: '0.68rem',
      fontWeight: '700',
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
      color: '#8A7D73',
      marginBottom: '6px',
      display: 'block'
    },
    metricValue: {
      fontSize: '2.4rem',
      fontWeight: '600',
      margin: 0,
      fontFamily: '"Inter", sans-serif'
    },
    controlDeck: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      marginBottom: '28px',
      flexWrap: 'wrap'
    },
    searchField: {
      flex: '1',
      maxWidth: '460px',
      minWidth: '260px',
      height: '42px',
      padding: '0 16px',
      fontSize: '0.88rem',
      backgroundColor: '#FFFFFF',
      border: '1px solid #EAE4D9',
      borderRadius: '2px',
      color: '#2C221E',
      outline: 'none',
      boxSizing: 'border-box'
    },
    filterDropdown: {
      width: '180px',
      height: '42px',
      padding: '0 12px',
      fontSize: '0.88rem',
      fontWeight: '500',
      backgroundColor: '#FFFFFF',
      border: '1px solid #EAE4D9',
      borderRadius: '2px',
      color: '#2C221E',
      outline: 'none',
      cursor: 'pointer'
    },
    listFeed: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    },
    ticketCard: {
      backgroundColor: '#FFFFFF',
      border: '1px solid #EAE4D9',
      padding: '24px',
      borderRadius: '2px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.01)'
    },
    cardMetaRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '8px',
      flexWrap: 'wrap'
    },
    ticketBadge: {
      fontFamily: 'monospace',
      fontWeight: '700',
      fontSize: '0.78rem',
      color: '#8C7355',
      backgroundColor: '#F7F3EB',
      padding: '3px 8px',
      borderRadius: '2px',
      border: '1px solid #EAE4D9'
    },
    queryTypeTitle: {
      fontSize: '1.1rem',
      fontWeight: '600',
      margin: 0,
      fontFamily: "'Playfair Display', Georgia, serif",
      color: '#1A1310'
    },
    queryDetailText: {
      fontSize: '0.9rem',
      lineHeight: '1.5',
      margin: '0 0 12px 0',
      color: '#54473F'
    },
    cardFooterInfo: {
      fontSize: '0.78rem',
      color: '#8A7D73',
      margin: 0
    },
    statusControlsBox: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    inlineLoaderText: {
      fontSize: '0.72rem',
      fontWeight: '700',
      color: '#8C7355',
      textTransform: 'uppercase',
      letterSpacing: '0.8px'
    },
    actionSelect: (isResolved) => ({
      height: '34px',
      padding: '0 16px',
      fontSize: '0.72rem',
      fontWeight: '700',
      letterSpacing: '0.8px',
      textTransform: 'uppercase',
      borderRadius: '2px',
      textAlign: 'center',
      cursor: 'pointer',
      outline: 'none',
      backgroundColor: isResolved ? '#EBF3EC' : '#FDF6E2',
      color: isResolved ? '#2A6635' : '#B27D16',
      border: `1px solid ${isResolved ? '#D4E5D7' : '#F0E2BE'}`
    }),
    systemStateMessage: {
      padding: '48px 24px',
      textAlign: 'center',
      backgroundColor: '#FFFFFF',
      border: '1px dashed #D4C7B1',
      color: '#8A7D73',
      fontStyle: 'italic',
      fontSize: '0.88rem',
      borderRadius: '2px'
    }
  };

  return (
    <div style={styles.pageWrapper}>
      <div style={styles.container}>
        
        {/* =========================================================
            🏁 DASHBOARD ADMINISTRATIVE HEADER
        ========================================================= */}
        <header style={styles.headerBlock}>
          <h1 style={styles.pageTitle}>Queries Operations Desk</h1>
          <p style={styles.pageSubtitle}>
            Central administrative platform for monitoring, auditing, and processing client profile inquiries.
          </p>
        </header>

        {/* =========================================================
            📊 METRICS OVERVIEW CARDS
        ========================================================= */}
        <section style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <span style={styles.metricLabel}>Total Inquiries Mapped</span>
            <p style={{...styles.metricValue, color: '#1A1310'}}>{metrics.total}</p>
          </div>
          <div style={styles.metricCard}>
            <span style={styles.metricLabel}>Under Process Records</span>
            <p style={{...styles.metricValue, color: '#B27D16'}}>{metrics.pending}</p>
          </div>
          <div style={styles.metricCard}>
            <span style={styles.metricLabel}>Successfully Solved</span>
            <p style={{...styles.metricValue, color: '#2A6635'}}>{metrics.resolved}</p>
          </div>
        </section>

        {/* =========================================================
            🕹️ SEARCH AND CONTROL BAR
        ========================================================= */}
        <section style={styles.controlDeck}>
          <input
            type="text"
            placeholder="Search Ticket, Account, or Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchField}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterDropdown}
          >
            <option value="ALL">All Records</option>
            <option value="PENDING">Under Process</option>
            <option value="RESOLVED">Solved</option>
          </select>
        </section>

        {/* =========================================================
            📋 LIVE QUERY MATRIX FEED VIEWSTREAM
        ========================================================= */}
        {loading ? (
          <div style={{ padding: '40px 0' }}>
            <span style={styles.inlineLoaderText}>Connecting to core operations systems...</span>
          </div>
        ) : processedTickets.length === 0 ? (
          <div style={styles.systemStateMessage}>
            No core support listings match your active filtering context values.
          </div>
        ) : (
          <main style={styles.listFeed}>
            {processedTickets.map((ticket) => {
              const currentStatus = (ticket.status || 'Pending').trim();
              const isResolved = currentStatus.toLowerCase() === 'resolved';

              return (
                <div key={ticket.id} style={styles.ticketCard}>
                  
                  {/* Left Column Content Metadata Block */}
                  <div style={{ flex: '1', minWidth: '260px' }}>
                    <div style={styles.cardMetaRow}>
                      <span style={styles.ticketBadge}>Ref #{ticket.ticket || '00000'}</span>
                      <h2 style={styles.queryTypeTitle}>{ticket.query_type}</h2>
                    </div>

                    <p style={styles.queryDetailText}>
                      {ticket.query_detail || 'No administrative logs attached.'}
                    </p>

                    <p style={styles.cardFooterInfo}>
                      Raised by: <strong>{ticket.name || 'Unknown Signatory'}</strong> • 
                      Account: <code> {ticket.account_identity || 'Unspecified'}</code> • 
                      {(() => {
                        if (!ticket.created_at) return ' Just now';
                        const safeIsoString = ticket.created_at.replace(' ', 'T').replace(/\+00$/, 'Z');
                        const parsedDate = new Date(safeIsoString);
                        return isNaN(parsedDate.getTime())
                          ? ' Recently'
                          : ` ${parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${parsedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
                      })()} •
                      Mobile Number: <strong>{ticket.mobile_no || 'N/A'}</strong>
                    </p>
                  </div>

                  {/* Right Administrative Live Status Dropdown Input */}
                  <div style={styles.statusControlsBox}>
                    {updatingId === ticket.id && (
                      <span style={styles.inlineLoaderText}>Saving...</span>
                    )}
                    
                    <select
                      value={isResolved ? 'Resolved' : 'Pending'}
                      onChange={(e) => handleStatusChange(ticket.id, e.target.value)}
                      disabled={updatingId === ticket.id}
                      style={styles.actionSelect(isResolved)}
                    >
                      <option value="Pending">Under Process</option>
                      <option value="Resolved">Solved</option>
                    </select>
                  </div>

                </div>
              );
            })}
          </main>
        )}

      </div>
    </div>
  );
};

export default QueryManagementPage;