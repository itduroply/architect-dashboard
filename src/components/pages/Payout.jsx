import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supbase'; // Keeping your custom path
import { 
  User, 
  AlertCircle, 
  Loader2,
  Plus,
  X,
  CheckCircle,
  Trash2 
} from 'lucide-react';

export default function PayoutRequestsTable() {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('Pending'); // Filter state tracking: 'Pending' or 'Paid'
  
  // Selection States for Batch Actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBulkMode, setIsBulkMode] = useState(false);

  // Modal & Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    architect: '',
    accountIdentity: '',
    amount: '',
    generatingDate: '',
    paymentMode: 'NEFT',
    remark: ''
  });

  // Custom Popup Modals State (Replacing native browser confirm/alerts)
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, targetId: null });
  const [warningModal, setWarningModal] = useState({ isOpen: false, title: '', message: '' });

  // Notification State
  const [snackbar, setSnackbar] = useState({ show: false, message: '' });

  // Consolidated function to fetch payouts and cross-reference their remittance status uniquely
  const fetchPayoutRequests = async () => {
    try {
      setLoading(true);
      setSelectedIds([]); // Clear selections on refresh pipeline
      
      // 1. Fetch payout requests including the database status column
      const { data: requestData, error: requestError } = await supabase
        .from('payout_request')
        .select('id, account_identity, architect_name, payout_amount, created_at, status,mobile_no')
        .order('created_at', { ascending: false });

      if (requestError) throw requestError;

      // 2. Fetch corresponding entries from remittances including their auto-generated IDs
      const { data: remittanceData, error: remittanceError } = await supabase
        .from('remittances')
        .select('id, architect_name, status')
        .order('id', { ascending: true });

      if (remittanceError) throw remittanceError;

      // 3. Map rows together safely using a sequential occurrence tracker to isolate duplicates
      const nameCounts = {};
      let structuredPayouts = (requestData || []).map(row => {
        const matchingKey = `${row.account_identity || ''} | ${row.architect_name || ''}`;
        
        if (nameCounts[matchingKey] === undefined) {
          nameCounts[matchingKey] = 0;
        } else {
          nameCounts[matchingKey]++;
        }
        const occurrenceIndex = nameCounts[matchingKey];

        const matchingRemittances = (remittanceData || []).filter(
          rem => rem.architect_name === matchingKey
        );

        const linkedRemittance = matchingRemittances[occurrenceIndex];

        // Preservation priority check for already processed ledgers
       // FIX: Prioritize the live status from the remittances table over the static 'Made' status
let finalStatus = linkedRemittance 
  ? linkedRemittance.status 
  : (row.status === 'Made' ? 'Made' : 'Queue');
        return {
          ...row,
          status: finalStatus
        };
      });

      // Maintain sorting to drop 'Made' items systematically to the bottom
      structuredPayouts.sort((a, b) => {
        if (a.status === 'Made' && b.status !== 'Made') return 1;
        if (a.status !== 'Made' && b.status === 'Made') return -1;
        return 0;
      });

      setPayouts(structuredPayouts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayoutRequests();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [activeFilter]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const filteredPayouts = payouts.filter(row => {
    const isRowPaid = row.status.toLowerCase() === 'paid';
    return activeFilter === 'Paid' ? isRowPaid : !isRowPaid;
  });

  const handleSelectAllToggle = () => {
    if (selectedIds.length === filteredPayouts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPayouts.map(row => row.id));
    }
  };

  const handleRowSelectToggle = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleOpenLedgerModal = (row) => {
    // Single click guard fallback check
    if (row.status === 'Made') {
      setWarningModal({
        isOpen: true,
        title: "Action Blocked",
        message: "This specific ledger has already been created. Operation is permanently terminated to prevent double allocation."
      });
      return;
    }

    setIsBulkMode(false);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const formattedCurrentDate = `${yyyy}-${mm}-${dd}`; 

    setFormData({
      id: row.id || '',
      architect: `${row.account_identity || ''} | ${row.architect_name || ''}`,
      accountIdentity: row.account_identity || '',
      amount: row.payout_amount || '',
      generatingDate: formattedCurrentDate,
      paymentMode: 'NEFT',
      remark: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenBulkLedgerModal = () => {
    const selectedRows = payouts.filter(p => selectedIds.includes(p.id));
    const containsMade = selectedRows.some(row => row.status === 'Made');
    
    // Strict Guardrail Check: Block right at the bulk generation click event
    if (containsMade) {
      setWarningModal({
        isOpen: true,
        title: "Ledger Group Blocked",
        message: "One or more of your checked items have already had their ledgers generated. To ensure zero extra funding leakages, double generation is blocked at any cost."
      });
      return;
    }

    setIsBulkMode(true);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const formattedCurrentDate = `${yyyy}-${mm}-${dd}`;

    const cumulativeSum = selectedRows.reduce((sum, item) => sum + (item.payout_amount || 0), 0);
    setFormData({
      id: 'BULK_SELECTION',
      architect: `Multiple Records (${selectedIds.length} Rows Highlighted)`,
      accountIdentity: 'Batch Multi-Routing Active',
      amount: cumulativeSum,
      generatingDate: formattedCurrentDate,
      paymentMode: 'NEFT',
      remark: ''
    });
    setIsModalOpen(true);
  };

  const handleCreateLedgerSubmit = async (e) => {
    e.preventDefault();
    
    // Absolute Final Pre-Flight Validation Check Layer
    if (isBulkMode) {
      const selectedRows = payouts.filter(p => selectedIds.includes(p.id));
      if (selectedRows.some(row => row.status === 'Made')) {
        setIsModalOpen(false);
        setWarningModal({
          isOpen: true,
          title: "Critical Security Refusal",
          message: "Transaction Aborted! Duplicate ledger generation detected for processed rows at the execution millisecond. No extra money will be allocated."
        });
        return;
      }
    } else {
      const currentBlock = payouts.find(p => p.id === formData.id);
      if (currentBlock && currentBlock.status === 'Made') {
        setIsModalOpen(false);
        setWarningModal({
          isOpen: true,
          title: "Transaction Refused",
          message: "This payout item is already linked to an existing ledger profile. Action stopped permanently."
        });
        return;
      }
    }

    try {
      setSubmitting(true);
      let recordsToInsert = [];
      let idsToUpdate = [];

      if (isBulkMode) {
        const selectedRows = payouts.filter(p => selectedIds.includes(p.id));
        recordsToInsert = selectedRows.map(row => ({
          architect_name: `${row.account_identity || ''} | ${row.architect_name || ''}`,
          account_number: row.account_identity,
          amount: Number(row.payout_amount),
          created_payment_date: formData.generatingDate,
          status: 'Pending',
          payment_mode: formData.paymentMode,
          remark: formData.remark
        }));
        idsToUpdate = selectedRows.map(row => row.id);
      } else {
        recordsToInsert = [
          {
            architect_name: formData.architect,
            account_number: formData.accountIdentity,
            amount: Number(formData.amount),
            created_payment_date: formData.generatingDate,
            status: 'Pending', 
            payment_mode: formData.paymentMode,
            remark: formData.remark
          }
        ];
        idsToUpdate = [formData.id];
      }

      // 1. Insert into remittances table
      const { error: remittanceError } = await supabase
        .from('remittances')
        .insert(recordsToInsert);
      if (remittanceError) throw remittanceError;

      // 2. Update status to 'Made'
      const { error: updateError } = await supabase
        .from('payout_request')
        .update({ status: 'Made' })
        .in('id', idsToUpdate);
      if (updateError) throw updateError;

      setIsModalOpen(false);
      setSnackbar({ 
        show: true, 
        message: isBulkMode 
          ? `Successfully generated ledger records and updated status for ${selectedIds.length} items!` 
          : 'Ledger creation completed and status updated to Made!' 
      });
      setSelectedIds([]);
      await fetchPayoutRequests();

      setTimeout(() => {
        setSnackbar({ show: false, message: '' });
      }, 4000);
    } catch (err) {
      setWarningModal({
        isOpen: true,
        title: "Database Action Failed",
        message: err.message
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Trigger custom confirmation react pop-up modal setup
  const triggerDeletePayout = (id) => {
    setDeleteModal({ isOpen: true, targetId: id });
  };

  // Realize execution pipeline safely post-modal validation
  const handleConfirmDeletePayout = async () => {
    const id = deleteModal.targetId;
    setDeleteModal({ isOpen: false, targetId: null });

    try {
      setLoading(true);
      const { error: deleteError } = await supabase
        .from('payout_request')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      setSnackbar({ show: true, message: 'Record successfully deleted from database!' });
      setSelectedIds(prev => prev.filter(item => item !== id));
      await fetchPayoutRequests();

      setTimeout(() => {
        setSnackbar({ show: false, message: '' });
      }, 4000);
    } catch (err) {
      setWarningModal({
        isOpen: true,
        title: "Database Deletion Error",
        message: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const totalVolume = payouts.reduce((sum, item) => sum + (item.payout_amount || 0), 0);

  return (
    <div className="centered-ledger-wrapper">
      <style>{`
        .centered-ledger-wrapper {
          width: 140%;
          max-width: 1150px;
          margin: 2rem auto;
          padding: 0 1.5rem;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .ledger-content-box {
          background: #f3f0ed;
          border: 1px solid #eaddcc;
          border-radius: 16px;
          padding: 2.25rem;
          box-shadow: 0 4px 24px rgba(58, 35, 18, 0.04);
        }
        .ledger-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-bottom: 1.5rem;
          margin-bottom: 2rem;
          border-bottom: 1px solid #f2ebd9;
        }
        .header-main h1 {
          font-size: 1.6rem;
          font-weight: 700;
          color: #2a1a0f;
          margin: 0 0 0.35rem 0;
          letter-spacing: -0.01em;
        }
        .header-main p {
          font-size: 0.875rem;
          color: #8c7662;
          margin: 0;
        }
        .live-pulse-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          font-weight: 700;
          color: #8a683e;
          padding: 0.4rem 0.8rem;
          border-radius: 8px;
          background: #fdfaf5;
          border: 1px solid #eaddcc;
        }
        .pulse-core {
          height: 7px;
          width: 7px;
          background: #f59e0b;
          border-radius: 50%;
        }
        .table-controls-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          border-bottom: 2px solid #eaddcc;
          padding-bottom: 0.4rem;
          gap: 1rem;
        }
        .filter-tabs-container {
          display: flex;
          gap: 0.5rem;
        }
        .filter-tab-btn {
          background: none;
          border: none;
          padding: 0.55rem 1.35rem;
          font-size: 0.85rem;
          font-weight: 700;
          color: #8c7662;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s ease-in-out;
        }
        .filter-tab-btn:hover {
          background: #eaddcc;
          color: #2a1a0f;
        }
        .filter-tab-btn.active {
          background: #8a683e;
          color: #ffffff;
        }
        .btn-bulk-execute {
          background: #2a1a0f;
          color: #fdfaf5;
          border: 1px solid #2a1a0f;
          padding: 0.5rem 1.1rem;
          font-size: 0.8rem;
          font-weight: 700;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          transition: all 0.2s ease-in-out;
          animation: slideInFast 0.2s ease-out;
        }
        .btn-bulk-execute:hover {
          background: #4a311d;
          border-color: #4a311d;
          box-shadow: 0 4px 12px rgba(42, 26, 15, 0.15);
        }
        @keyframes slideInFast {
          from { transform: translateY(5px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .quick-metrics {
          display: flex;
          gap: 3.5rem;
          margin-bottom: 2.5rem;
        }
        .metric-tile {
          display: flex;
          flex-direction: column;
        }
        .metric-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: #a68b72;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin: 0 0 0.4rem 0;
        }
        .metric-stat {
          font-size: 1.85rem;
          font-weight: 800;
          color: #2a1a0f;
          margin: 0;
        }
        .table-view-scroller {
          overflow-x: auto;
          width: 100%;
          border-radius: 8px;
        }
        table.clean-ledger-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.875rem;
          min-width: 950px;
        }
        .clean-ledger-table th {
          padding: 0.75rem 1rem;
          font-size: 0.75rem;
          font-weight: 700;
          color: #b8956c;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 2px solid #f2ebd9;
        }
        .clean-ledger-table td {
          padding: 1.1rem 1rem;
          border-bottom: 1px solid #faf7f2;
          color: #4a311d;
          vertical-align: middle;
        }
        .clean-ledger-table tr:hover td {
          background: #fdfbf7;
        }
        .ledger-checkbox-input {
          cursor: pointer;
          accent-color: #8a683e;
          width: 15px;
          height: 15px;
          vertical-align: middle;
        }
        .architect-profile {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          font-weight: 600;
          color: #2a1a0f;
        }
        .identity-badge {
          font-family: ui-monospace, monospace;
          background: #fbf9f5;
          border: 1px solid #eaddcc;
          color: #5c4632;
          padding: 0.25rem 0.5rem;
          border-radius: 6px;
          font-size: 0.75rem;
        }
        .amount-display {
          font-weight: 700;
          font-size: 1rem;
          color: #2a1a0f;
        }
        .timestamp-group {
          display: flex;
          flex-direction: column;
        }
        .timestamp-time {
          font-size: 0.75rem;
          color: #a68b72;
          margin-top: 0.15rem;
        }
        .status-badge-chip {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .status-badge-chip.pending {
          background: #fef3c7;
          color: #d97706;
          border: 1px solid #fcd34d;
        }
        .status-badge-chip.paid {
          background: #d1fae5;
          color: #059669;
          border: 1px solid #6ee7b7;
        }
        .btn-action-trigger {
          background: #fdfaf5;
          border: 1px solid #eaddcc;
          color: #8a683e;
          padding: 0.45rem 0.8rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          transition: all 0.2s ease-in-out;
        }
        .btn-action-trigger:hover {
          background: #8a683e;
          color: #ffffff;
          border-color: #8a683e;
          box-shadow: 0 2px 8px rgba(138, 104, 62, 0.15);
        }
        .popup-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(42, 26, 15, 0.45);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }
        .popup-modal-box {
          background: #fdfaf5;
          border: 1px solid #eaddcc;
          border-radius: 14px;
          width: 100%;
          max-width: 520px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 12px 36px rgba(58, 35, 18, 0.16);
          animation: scaleReveal 0.2s ease-out;
        }
        @keyframes scaleReveal {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .modal-header-section {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          background: #f3f0ed;
          border-bottom: 1px solid #eaddcc;
        }
        .modal-header-section h2 {
          font-size: 1.1rem;
          font-weight: 700;
          color: #2a1a0f;
          margin: 0;
        }
        .modal-close-icon {
          background: none;
          border: none;
          color: #8c7662;
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          border-radius: 4px;
          transition: all 0.2s;
        }
        .modal-close-icon:hover {
          background: #eaddcc;
          color: #2a1a0f;
        }
        .modal-body-form {
          padding: 1.25rem;
        }
        .modal-grid-form {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .input-block {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .input-block label {
          font-size: 0.72rem;
          font-weight: 700;
          color: #8c7662;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .input-field-element {
          padding: 0.55rem 0.75rem;
          border: 1px solid #eaddcc;
          border-radius: 6px;
          background: #ffffff;
          color: #2a1a0f;
          font-size: 0.85rem;
          font-family: inherit;
          transition: border-color 0.2s;
          box-sizing: border-box;
          width: 100%;
          cursor: text;
        }
        .input-field-element:focus {
          outline: none;
          border-color: #8a683e;
          box-shadow: 0 0 0 3px rgba(138, 104, 62, 0.08);
        }
        .input-field-element:read-only {
          background: #f5f1ec;
          color: #7a6552;
          cursor: not-allowed;
          border-color: #e3d3c1;
        }
        .form-footer-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 0.4rem;
          padding-top: 0.5rem;
        }
        .action-button {
          padding: 0.55rem 1.15rem;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .action-button-cancel {
          background: #f3f0ed;
          border: 1px solid #eaddcc;
          color: #5c4632;
        }
        .action-button-cancel:hover {
          background: #eaddcc;
        }
        .action-button-save {
          background: #8a683e;
          border: 1px solid #735430;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }
        .action-button-save:hover {
          background: #735430;
        }
        .action-button-save:disabled {
          background: #c2b4a6;
          border-color: #c2b4a6;
          cursor: not-allowed;
        }
        .toast-snackbar {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          background: #2a1a0f;
          color: #fdfaf5;
          padding: 0.85rem 1.35rem;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.875rem;
          font-weight: 500;
          z-index: 1100;
          animation: slideFromBottom 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideFromBottom {
          from { transform: translateY(1.5rem); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .status-center {
          padding: 5rem 2rem;
          text-align: center;
          color: #8c7662;
        }
        .error-toast {
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #dc2626;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.875rem;
        }
        .spin-icon {
          animation: rotateLoop 1s linear infinite;
        }
        @keyframes rotateLoop {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .table-controls-bar { flex-direction: column; align-items: flex-start; }
          .ledger-header { flex-direction: column; align-items: flex-start; gap: 1rem; }
          .quick-metrics { gap: 1.5rem; flex-direction: column; }
        }
        .btn-delete-trigger {
          background: none;
          border: none;
          color: #dc2626;
          padding: 0.45rem;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease-in-out;
        }
        .btn-delete-trigger:hover {
          background: #fef2f2;
          color: #991b1b;
        }
        .actions-cell-wrapper {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          justify-content: flex-end;
        }
        .modal-warning-header {
          background: #fef2f2 !important;
          border-bottom: 1px solid #fee2e2 !important;
        }
        .modal-warning-title {
          color: #991b1b !important;
        }
        .btn-action-danger {
          background: #dc2626 !important;
          border: 1px solid #dc2626 !important;
          color: #ffffff !important;
        }
        .btn-action-danger:hover {
          background: #991b1b !important;
          border-color: #991b1b !important;
        }
      `}</style>

      <div className="ledger-content-box">
        <header className="ledger-header">
          <div className="header-main">
            <h1>Payout Requests</h1>
            <p>Real-time accounting clearance data overview ledger stream.</p>
          </div>
          <div className="live-pulse-badge">
            <span className="pulse-core" /> Live Connection
          </div>
        </header>

        {error && (
          <div className="error-toast">
            <AlertCircle size={18} />
            <span><strong>Sync Error:</strong> {error}</span>
          </div>
        )}

        {!loading && !error && (
          <section className="quick-metrics">
            <div className="metric-tile">
              <p className="metric-title">Aggregate Transferred</p>
              <h3 className="metric-stat">{formatAmount(totalVolume)}</h3>
            </div>
            <div className="metric-tile">
              <p className="metric-title">Payout Requests</p>
              <h3 className="metric-stat">{payouts.length}</h3>
            </div>
          </section>
        )}

        {!loading && !error && (
          <div className="table-controls-bar">
            <div className="filter-tabs-container">
              <button 
                className={`filter-tab-btn ${activeFilter === 'Pending' ? 'active' : ''}`} 
                onClick={() => setActiveFilter('Pending')}
              >
                Pending Settlements
              </button>
              <button 
                className={`filter-tab-btn ${activeFilter === 'Paid' ? 'active' : ''}`} 
                onClick={() => setActiveFilter('Paid')}
              >
                Paid Remittances
              </button>
            </div>
            {activeFilter === 'Pending' && selectedIds.length > 0 && (
              <button className="btn-bulk-execute" onClick={handleOpenBulkLedgerModal}>
                <Plus size={14} />
                Bulk Create Ledger ({selectedIds.length} Items Selected)
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="status-center">
            <Loader2 className="spin-icon" size={24} style={{ marginBottom: '0.5rem' }} />
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>Syncing with upstream database...</div>
          </div>
        ) : !error && (
          <div className="table-view-scroller">
            <table className="clean-ledger-table">
              <thead>
                <tr>
                  {activeFilter === 'Pending' && (
                    <th style={{ width: '4%', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        className="ledger-checkbox-input" 
                        checked={filteredPayouts.length > 0 && selectedIds.length === filteredPayouts.length} 
                        onChange={handleSelectAllToggle} 
                      />
                    </th>
                  )}
                  <th style={{ width: '22%' }}>Architect Partner</th>
                  <th style={{ width: '22%' }}>Remittance Destination</th>
                  <th style={{ width: '15%' }}>Allocation</th>
                  <th style={{ width: '15%' }}>Payout Request Date</th>
                  <th style={{ width: '11%' }}>Status</th>
                    <th style={{ width: '11%' }}>Mobile Number</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayouts.length === 0 ? (
                  <tr>
                    <td colSpan={activeFilter === 'Pending' ? 7 : 6} className="status-center">
                      No matching {activeFilter.toLowerCase()} settlement records found in the ledger system.
                    </td>
                  </tr>
                ) : (
                  filteredPayouts.map((row, index) => (
                    <tr key={row.id || index}>
                      {activeFilter === 'Pending' && (
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            className="ledger-checkbox-input" 
                            checked={selectedIds.includes(row.id)} 
                            onChange={() => handleRowSelectToggle(row.id)} 
                          />
                        </td>
                      )}
                      <td>
                        <div className="architect-profile">
                          <User size={15} style={{ opacity: 0.5, color: '#8c7662' }} />
                          <span>{row.architect_name || 'System Unassigned'}</span>
                        </div>
                      </td>
                      <td>
                        <span className="identity-badge">{row.account_identity}</span>
                      </td>
                      <td>
                        <span className="amount-display">{formatAmount(row.payout_amount)}</span>
                      </td>
                      
                     
                      <td>
                        <div className="timestamp-group">
                          <span>{formatDate(row.created_at)}</span>
                          <span className="timestamp-time">{formatTime(row.created_at)}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge-chip ${row.status.toLowerCase() === 'paid' ? 'paid' : 'pending'}`}>
                          {row.status}
                        </span>
                      </td>
                       <td>
                        <span className="mobile-number">{row.mobile_no || 'N/A'}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="actions-cell-wrapper">
                          {activeFilter === 'Pending' && (
                            row.status === 'Made' ? (
                              <span style={{ fontSize: '0.8rem', color: '#8c7662', fontWeight: 600 }}>
                                Ledger Generated
                              </span>
                            ) : (
                              <button className="btn-action-trigger" onClick={() => handleOpenLedgerModal(row)}>
                                <Plus size={14} />
                                Create Ledger
                              </button>
                            )
                          )}
                          <button 
                            className="btn-delete-trigger"
                            onClick={() => triggerDeletePayout(row.id)}
                            title="Delete Record"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= PRIMARY TRANS-LOG LEDGER FORM MODAL ================= */}
      {isModalOpen && (
        <div className="popup-modal-overlay">
          <div className="popup-modal-box">
            <div className="modal-header-section">
              <h2>{isBulkMode ? "Generate Bulk Remittance Records" : "Compile Single Remittance Profile"}</h2>
              <button className="modal-close-icon" onClick={() => setIsModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body-form">
              <form onSubmit={handleCreateLedgerSubmit} className="modal-grid-form">
                <div className="input-block">
                  <label>Architect Profile Target</label>
                  <input type="text" className="input-field-element" value={formData.architect} readOnly />
                </div>
                <div className="input-block">
                  <label>Destination Account Assignment</label>
                  <input type="text" className="input-field-element" value={formData.accountIdentity} readOnly />
                </div>
                <div className="input-block">
                  <label>Consolidated Allocation Sum (INR)</label>
                  <input type="text" className="input-field-element" value={formData.amount} readOnly />
                </div>
                <div className="input-block">
                  <label>Remittance Clearance Date</label>
                  <input type="date" className="input-field-element" value={formData.generatingDate} onChange={(e) => setFormData({ ...formData, generatingDate: e.target.value })} required />
                </div>
                <div className="input-block">
                  <label>Payment Routing Mode</label>
                  <select className="input-field-element" style={{ cursor: 'pointer' }} value={formData.paymentMode} onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}>
                    <option value="NEFT">NEFT Clearance Routing</option>
                    <option value="RTGS">RTGS Immediate Routing</option>
                    <option value="IMPS">IMPS Instant Core Settlement</option>
                    <option value="UPI">UPI Mobile Routing Gateway</option>
                  </select>
                </div>
                <div className="input-block">
                  <label>Internal Audit Remarks / Logs</label>
                  <textarea rows="2" className="input-field-element" style={{ resize: 'vertical' }} value={formData.remark} onChange={(e) => setFormData({ ...formData, remark: e.target.value })} placeholder={isBulkMode ? "Enter global transaction logs remark for all entries..." : "Enter transaction logs remark info..."} />
                </div>
                <div className="form-footer-actions">
                  <button type="button" className="action-button action-button-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button type="submit" className="action-button action-button-save" disabled={submitting}>
                    {submitting ? <><Loader2 size={16} className="spin-icon" /> Processing...</> : 'Confirm & Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ================= REACT POPUP MODAL: BEAUTIFUL DELETE CONFIRMATION ================= */}
      {deleteModal.isOpen && (
        <div className="popup-modal-overlay">
          <div className="popup-modal-box" style={{ maxWidth: '440px' }}>
            <div className="modal-header-section modal-warning-header">
              <h2 className="modal-warning-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={18} /> Permanent Deletion
              </h2>
              <button className="modal-close-icon" onClick={() => setDeleteModal({ isOpen: false, targetId: null })}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body-form" style={{ padding: '1.5rem' }}>
              <p style={{ margin: '0 0 1.5rem 0', color: '#4a311d', fontSize: '0.9rem', lineHeight: '1.5' }}>
                Are you absolutely sure you want to permanently delete this payout request record from the database? This action cannot be undone.
              </p>
              <div className="form-footer-actions" style={{ margin: 0, paddingTop: 0 }}>
                <button type="button" className="action-button action-button-cancel" onClick={() => setDeleteModal({ isOpen: false, targetId: null })}>Cancel</button>
                <button type="button" className="action-button btn-action-danger" onClick={handleConfirmDeletePayout}>Confirm & Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= REACT POPUP MODAL: ABSOLUTE DOUBLE-SPEND PREVENT WARNING ================= */}
      {warningModal.isOpen && (
        <div className="popup-modal-overlay">
          <div className="popup-modal-box" style={{ maxWidth: '460px' }}>
            <div className="modal-header-section" style={{ background: '#fffbeb', borderBottom: '1px solid #fef3c7' }}>
              <h2 style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem' }}>
                <AlertCircle size={18} /> {warningModal.title}
              </h2>
              <button className="modal-close-icon" onClick={() => setWarningModal({ isOpen: false, title: '', message: '' })}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body-form" style={{ padding: '1.5rem' }}>
              <p style={{ margin: '0 0 1.5rem 0', color: '#78350f', fontSize: '0.9rem', lineHeight: '1.5', fontWeight: 500 }}>
                {warningModal.message}
              </p>
              <div className="form-footer-actions" style={{ margin: 0, paddingTop: 0 }}>
                <button 
                  type="button" 
                  className="action-button" 
                  style={{ background: '#b45309', color: '#ffffff', border: '1px solid #b45309' }}
                  onClick={() => setWarningModal({ isOpen: false, title: '', message: '' })}
                >
                  Understood
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast Snackbar Feedback Notification */}
      {snackbar.show && (
        <div className="toast-snackbar">
          <CheckCircle size={18} style={{ color: '#34d399' }} />
          <span>{snackbar.message}</span>
        </div>
      )}
    </div>
  );
}