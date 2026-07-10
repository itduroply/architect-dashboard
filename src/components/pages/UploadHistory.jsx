import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supbase'; // Ensure this matches your path instance

const UploadHistory = () => {
  const [activityRows, setActivityRows] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Custom Popup Modal Control State
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Floating Notification Snackbar State
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  // Helper utility to fire non-blocking toast notifications
  const showToast = (message, type = 'info', autoDismiss = true) => {
    setToast({ show: true, message, type });
    if (autoDismiss && type !== 'loading') {
      setTimeout(() => {
        setToast((prev) => ({ ...prev, show: false }));
      }, 3500);
    }
  };

  // 1. Fetch User Logs Activity Stream (Wrapped in useCallback to satisfy ESLint rule)
  const fetchActivityHistory = useCallback(async () => {
    setLoading(true);
    try {
      const publicUserId = localStorage.getItem('public_user_id');
      
      let query = supabase
        .from('user_activity_logs')
        .select('*')
        .order('created_at', { ascending: false });

      // If the user isn't an admin, filter to only show their own activity footprint
      const userRole = localStorage.getItem('user_role')?.toLowerCase();
      if (userRole !== 'admin' && userRole !== 'administrator' && publicUserId) {
        query = query.eq('user_id', publicUserId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setActivityRows(data || []);
    } catch (err) {
      console.error("Error fetching activity logs:", err.message);
      showToast(`❌ Failed to load activity trails: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivityHistory();
  }, [fetchActivityHistory]); // Dependency is now completely safe and compliant

  // 2. Helper to log dynamic actions directly on button clicks
  const logActionToDatabase = async (actionType, description) => {
    try {
      const publicUserId = localStorage.getItem('public_user_id');
      const cachedRole = localStorage.getItem('user_role') || 'User';

      await supabase.from('user_activity_logs').insert({
        user_id: publicUserId || null,
        user_role: cachedRole,
        action_type: actionType,
        description: description
      });
    } catch (err) {
      console.error("Telemetry failed to save:", err.message);
    }
  };

  // 3. Client Side Sheet Generator Framework
  const handleExportLogs = async () => {
    if (!activityRows.length) {
      showToast("⚠️ No activity log metrics available to export.", "info");
      return;
    }
    
    try {
      showToast("⏳ Synthesizing spreadsheet log report...", "loading", false);
      
      const worksheet = XLSX.utils.json_to_sheet(activityRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "User Audit Trails");
      XLSX.writeFile(workbook, `User_Activity_Logs_${Date.now()}.xlsx`);
      
      showToast("✅ Logs compiled and downloaded!", "success");
      
      // Track this download export action into the log history stream
      await logActionToDatabase('DOWNLOAD_USER_LOGS', 'User downloaded comprehensive activity history logs.');
      fetchActivityHistory();
    } catch (err) {
      showToast(`❌ Export broken: ${err.message}`, "error");
    }
  };

  // 4. Clear Logs Trigger
  const handleClearHistoryClick = () => {
    setIsModalOpen(true);
  };

  // 5. Destructive Flush Engine
  const handleConfirmDelete = async () => {
    setIsModalOpen(false); 
    showToast('⏳ Performing database log truncation...', 'loading', false);
    
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('user_activity_logs')
        .delete()
        .not('id', 'is', null); // Absolute clear condition rule alternate

      if (error) throw error;
      
      setActivityRows([]);
      showToast('🗑️ Platform history logs cleared completely!', 'success');
    } catch (err) {
      console.error('Error clearing history:', err.message);
      showToast(`❌ Admin cleanup failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getToastStyles = () => {
    switch (toast.type) {
      case 'success': return { bg: '#10b981', color: '#fff' };
      case 'error': return { bg: '#ef4444', color: '#fff' };
      case 'loading': return { bg: '#1f2937', color: '#fff' };
      default: return { bg: '#2563eb', color: '#fff' };
    }
  };

  return (
    <div className="page" id="page-history" style={{ position: 'relative' }}>
      
      {/* ── TOAST NOTIFICATION ── */}
      {toast.show && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', padding: '12px 20px', borderRadius: '8px',
          backgroundColor: getToastStyles().bg, color: getToastStyles().color, fontSize: '13px', fontWeight: '500',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          {toast.message}
        </div>
      )}

      {/* Action Download Center Ribbon */}
      <div className="dl-strip">
        <span style={{ fontSize: '11px', color: 'var(--dim)', marginRight: '4px' }}>Actions:</span>
        <button className="btn-dl btn-dl-primary" onClick={handleExportLogs}>⬇ Download User Logs</button>
      </div>

      {/* Main SaaS Card Dashboard Layout */}
      <div className="card">
        <div className="card-hd">
          <div className="card-icon">🗂️</div>
          <div>
            <div className="card-title">User Audit &amp; Activity Logs</div>
            <div className="card-sub">
              Tracking user actions, file interactions, and page operations across the environment.
            </div>
          </div>
          <div className="card-hd-right">
            <button className="btn btn-red btn-sm" onClick={handleClearHistoryClick} disabled={loading}>
              🗑 Clear Log Tracks
            </button>
          </div>
        </div>
        
        {/* Table Layer */}
        <div style={{ padding: '18px 22px' }}>
          <div className="tbl-wrap" id="histTbl" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {loading && activityRows.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--dim)' }}>
                🔄 Running database trace query scan...
              </div>
            ) : activityRows.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--dim)' }}>
                📭 No tracked operations found on your profile signature.
              </div>
            ) : (
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f4f6fa', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 10px', width: '25%' }}>Timestamp Event</th>
                    <th style={{ padding: '12px 10px', width: '20%' }}>Action Target</th>
                    <th style={{ padding: '12px 10px', width: '40%' }}>Audit Description</th>
                    <th style={{ padding: '12px 10px', width: '15%' }}>Role Key</th>
                  </tr>
                </thead>
                <tbody>
                  {activityRows.map((row, index) => (
                    <tr key={row.id || index} style={{ borderBottom: '1px solid #edf2f7', background: index % 2 === 0 ? '#fff' : '#fdfdfd' }}>
                      <td style={{ padding: '12px 10px', color: 'var(--dim)' }}>
                        {new Date(row.created_at).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          background: row.action_type?.includes('CLEAR') ? '#fee2e2' : '#e0f2fe',
                          color: row.action_type?.includes('CLEAR') ? '#991b1b' : '#0369a1',
                          padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600
                        }}>
                          {row.action_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', fontWeight: 500 }}>{row.description}</td>
                      <td style={{ padding: '12px 10px', textTransform: 'capitalize' }}>{row.user_role || 'User'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation React Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#ffffff', padding: '32px', borderRadius: '20px', width: '90%', maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', background: '#fef2f2', width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: '#ef4444' }}>
              ⚠️
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 10px 0' }}>Confirm Log Purge</h3>
            <p style={{ fontSize: '13.5px', color: '#64748b', margin: '0 0 28px 0', lineHeight: '1.6' }}>
              Are you absolute sure you want to drop the persistent platform user activity logs? This operation is permanent.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '11px 20px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleConfirmDelete} style={{ flex: 1, padding: '11px 20px', borderRadius: '10px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Yes, Purge Logs</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default UploadHistory;