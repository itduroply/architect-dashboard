import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  X,
  UserPlus,
  Building2,
  Mail,
  Lock,
  User,
  AlertCircle,
  CheckCircle,
  Users,
  AlertTriangle,
  MapPin,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

// Imported standard Supabase client configuration
import { supabase } from '../../lib/supbase';

export default function BranchFinanceManager() {
  // Main Data State
  const [branches, setBranches] = useState([]);

  // Active Tab Filter State ('Active' | 'Inactive' | 'All')
  const [activeTab, setActiveTab] = useState('All');

  // Loading States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  // Create / Edit Modal Control
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);

  // Branch Delete Modal Control
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState(null);

  // Salesperson Delete Modal Control
  const [isSpDeleteModalOpen, setIsSpDeleteModalOpen] = useState(false);
  const [spToDelete, setSpToDelete] = useState(null);

  // Form State
  const [branchName, setBranchName] = useState('');
  const [branchState, setBranchState] = useState('');
  const [financeEmail, setFinanceEmail] = useState('');
  const [financePassword, setFinancePassword] = useState('');
  const [status, setStatus] = useState('Active');
  const [salesPeople, setSalesPeople] = useState([]);

  // Snackbar State
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    type: 'error',
  });

  const showSnackbar = (message, type = 'error') => {
    setSnackbar({ open: true, message, type });
    setTimeout(() => {
      setSnackbar({ open: false, message: '', type: 'error' });
    }, 4000);
  };

  // Fetch all branches and sales team records from database
  const fetchBranches = useCallback(async () => {
    setIsFetching(true);
    try {
      const { data: bwData, error: bwErr } = await supabase
        .from('branch_wise')
        .select('*');
      if (bwErr) throw bwErr;

      const { data: bsData, error: bsErr } = await supabase
        .from('branch_sales')
        .select('*');
      if (bsErr) throw bsErr;

      const structuredBranches = (bwData || []).map((b) => ({
        id: b.id,
        userId: b.user_id,
        branchName: b.branch_name,
        branchState: b.branch_state,
        financeEmail: b.finance_email,
        financePassword: '', 
        status: b.status || 'Active',
        salesPeople: (bsData || [])
          .filter((s) => s.branch_id === b.id)
          .map((s) => ({
            id: s.id,
            userId: s.user_id,
            name: s.salesperson_name,
            email: s.salesperson_email,
            password: '',
          })),
      }));

      setBranches(structuredBranches);
    } catch (err) {
      showSnackbar(`Failed to load branches: ${err.message}`, 'error');
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  // Open Modal for Create
  const handleOpenCreateModal = () => {
    setEditingBranch(null);
    setBranchName('');
    setBranchState('');
    setFinanceEmail('');
    setFinancePassword('');
    setStatus('Active');
    setSalesPeople([]);
    setIsModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEditModal = (branch) => {
    setEditingBranch(branch);
    setBranchName(branch.branchName || '');
    setBranchState(branch.branchState || '');
    setFinanceEmail(branch.financeEmail || '');
    setFinancePassword('');
    setStatus(branch.status || 'Active');
    setSalesPeople(branch.salesPeople ? branch.salesPeople.map(sp => ({ ...sp, password: '' })) : []);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Branch Delete Handlers
  const handleOpenDeleteModal = (branch) => {
    setBranchToDelete(branch);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setBranchToDelete(null);
  };

  // Delete Entire Branch (Removes from branch_wise, branch_sales, and auth.users)
  const handleConfirmDelete = async () => {
    if (!branchToDelete) return;
    setIsSubmitting(true);

    try {
      // 1. Collect all auth user_ids (Finance user + Salespeople)
      const userIdsToDelete = [];
      if (branchToDelete.userId) userIdsToDelete.push(branchToDelete.userId);
      (branchToDelete.salesPeople || []).forEach((sp) => {
        if (sp.userId) userIdsToDelete.push(sp.userId);
      });

      // 2. Delete Auth users via Edge Function
      if (userIdsToDelete.length > 0) {
        const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke('smart-function', {
          body: {
            action: 'DELETE_USERS_BULK',
            authUserIds: userIdsToDelete,
          },
        });
        if (edgeErr || edgeRes?.error) {
          throw new Error(edgeErr?.message || edgeRes?.error);
        }
      }

      // 3. Delete database records (branch_sales & branch_wise)
      const { error: salesDbErr } = await supabase
        .from('branch_sales')
        .delete()
        .eq('branch_id', branchToDelete.id);
      if (salesDbErr) throw salesDbErr;

      const { error: branchDbErr } = await supabase
        .from('branch_wise')
        .delete()
        .eq('id', branchToDelete.id);
      if (branchDbErr) throw branchDbErr;

      showSnackbar('Branch and all associated Auth users purged successfully.', 'success');
      if (editingBranch?.id === branchToDelete.id) {
        setIsModalOpen(false);
      }
      fetchBranches();
    } catch (err) {
      console.error('Delete error:', err);
      showSnackbar(`Delete failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
      handleCloseDeleteModal();
    }
  };

  // Salesperson Delete Handlers
  const handleOpenSpDeleteModal = (sp) => {
    setSpToDelete(sp);
    setIsSpDeleteModalOpen(true);
  };

  const handleCloseSpDeleteModal = () => {
    setIsSpDeleteModalOpen(false);
    setSpToDelete(null);
  };

  // Delete Salesperson inside update/edit view
  const handleConfirmSpDelete = async () => {
    if (!spToDelete) return;
    setIsSubmitting(true);

    try {
      // If salesperson exists in database and auth
      if (spToDelete.userId) {
        // Delete from auth.users via Edge Function
        const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke('smart-function', {
          body: {
            action: 'DELETE_USER',
            authUserId: spToDelete.userId,
          },
        });
        if (edgeErr || edgeRes?.error) throw new Error(edgeErr?.message || edgeRes?.error);

        // Delete from branch_sales table
        const { error: dbErr } = await supabase
          .from('branch_sales')
          .delete()
          .eq('id', spToDelete.id);
        if (dbErr) throw dbErr;
      }

      setSalesPeople((prev) => prev.filter((sp) => sp.id !== spToDelete.id));
      showSnackbar('Salesperson removed from profile and Auth repository.', 'success');
      fetchBranches();
    } catch (err) {
      console.error('Salesperson delete error:', err);
      showSnackbar(`Removal failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
      handleCloseSpDeleteModal();
    }
  };

  // Salesperson Handlers
  const handleAddSalesPerson = () => {
    setSalesPeople((prev) => [
      ...prev,
      { id: `temp_${Date.now()}`, name: '', email: '', password: '' },
    ]);
  };

  const handleSalesPersonChange = (id, field, value) => {
    setSalesPeople((prev) =>
      prev.map((sp) => (sp.id === id ? { ...sp, [field]: value } : sp))
    );
  };

 const handleSaveBranch = async (e) => {
  e.preventDefault();

  // 1. Basic validation
  if (!branchName.trim() || !branchState.trim() || !financeEmail.trim()) {
    showSnackbar('Please fill in all required branch and finance fields.', 'error');
    return;
  }

  if (!editingBranch && !financePassword.trim()) {
    showSnackbar('Finance account password is required for new accounts.', 'error');
    return;
  }

  for (const sp of salesPeople) {
    if (!sp.name.trim() || !sp.email.trim()) {
      showSnackbar('Please complete name and email for all salespersons.', 'error');
      return;
    }
    if (!editingBranch && String(sp.id).startsWith('temp_') && !sp.password.trim()) {
      showSnackbar('Password required for new salesperson accounts.', 'error');
      return;
    }
  }

  setIsSubmitting(true);

  try {
    const cleanFinanceEmail = financeEmail.trim();
    const allFormEmails = [
      cleanFinanceEmail.toLowerCase(),
      ...salesPeople.map((sp) => sp.email.trim().toLowerCase()),
    ];

    // Check for duplicate emails inside current form inputs
    const uniqueEmailsSet = new Set(allFormEmails);
    if (uniqueEmailsSet.size !== allFormEmails.length) {
      showSnackbar('Duplicate email addresses detected within your form entries.', 'error');
      setIsSubmitting(false);
      return;
    }

    // Check DB duplicates
    let branchCheckQuery = supabase
      .from('branch_wise')
      .select('finance_email')
      .in('finance_email', allFormEmails);
    if (editingBranch) branchCheckQuery = branchCheckQuery.neq('id', editingBranch.id);

    const { data: existingFinanceEmails, error: branchCheckError } = await branchCheckQuery;
    if (branchCheckError) throw branchCheckError;

    let salesCheckQuery = supabase
      .from('branch_sales')
      .select('salesperson_email')
      .in('salesperson_email', allFormEmails);
    if (editingBranch) salesCheckQuery = salesCheckQuery.neq('branch_id', editingBranch.id);

    const { data: existingSalesEmails, error: salesCheckError } = await salesCheckQuery;
    if (salesCheckError) throw salesCheckError;

    const foundDuplicates = [
      ...(existingFinanceEmails?.map((item) => item.finance_email) || []),
      ...(existingSalesEmails?.map((item) => item.salesperson_email) || []),
    ];

    if (foundDuplicates.length > 0) {
      showSnackbar(`Warning: Email "${foundDuplicates[0]}" already exists in the system.`, 'error');
      setIsSubmitting(false);
      return;
    }

    // ==========================================
    // CREATE MODE
    // ==========================================
    if (!editingBranch) {
      // 1. Create Finance Auth Account
      const { data: financeAuth, error: financeAuthError } = await supabase.auth.signUp({
        email: cleanFinanceEmail,
        password: financePassword,
      });

      if (financeAuthError) throw financeAuthError;
      const financeUserId = financeAuth.user?.id;

      // 2. Insert into branch_wise
      const { data: insertedBranch, error: branchError } = await supabase
        .from('branch_wise')
        .insert([
          {
            user_id: financeUserId,
            branch_name: branchName.trim(),
            branch_state: branchState.trim(),
            finance_email: cleanFinanceEmail,
            status: status,
          },
        ])
        .select()
        .single();

      if (branchError) throw branchError;

      // 3. Create Salespeople Auth Accounts & DB entries
      if (salesPeople.length > 0 && insertedBranch) {
        const salesPayload = [];

        for (const sp of salesPeople) {
          const { data: spAuth, error: spAuthError } = await supabase.auth.signUp({
            email: sp.email.trim(),
            password: sp.password,
          });

          if (spAuthError) throw spAuthError;

          salesPayload.push({
            user_id: spAuth.user?.id,
            branch_id: insertedBranch.id,
            branch_name: branchName.trim(),
            branch_state: branchState.trim(),
            finance_email: cleanFinanceEmail,
            salesperson_name: sp.name.trim(),
            salesperson_email: sp.email.trim(),
            status: status,
          });
        }

        const { error: salesError } = await supabase
          .from('branch_sales')
          .insert(salesPayload);

        if (salesError) throw salesError;
      }

      showSnackbar('Branch and Auth users created successfully!', 'success');
    } 

    // ==========================================
    // EDIT MODE
    // ==========================================
    else {
      // 1. Update Finance credentials in Auth & cascade to architect_registrations
      if (editingBranch.userId) {
        if (cleanFinanceEmail !== editingBranch.financeEmail) {
          // Update Auth Email
          const { error: emailErr } = await supabase.functions.invoke('smart-function', {
            body: { action: 'UPDATE_EMAIL', authUserId: editingBranch.userId, email: cleanFinanceEmail },
          });
          if (emailErr) throw emailErr;

          // Cascade to architect_registrations
          const { error: archFinErr } = await supabase
            .from('architect_registrations')
            .update({ finance_email: cleanFinanceEmail })
            .eq('finance_email', editingBranch.financeEmail);

          if (archFinErr) throw archFinErr;
        }

        if (financePassword && financePassword.trim() !== '') {
          const { error: passErr } = await supabase.functions.invoke('smart-function', {
            body: { action: 'UPDATE_PASSWORD', authUserId: editingBranch.userId, password: financePassword },
          });
          if (passErr) throw passErr;
        }
      }

      // 2. Update branch_wise database record
      const { error: branchUpdateErr } = await supabase
        .from('branch_wise')
        .update({
          branch_name: branchName.trim(),
          branch_state: branchState.trim(),
          finance_email: cleanFinanceEmail,
          status: status,
        })
        .eq('id', editingBranch.id);

      if (branchUpdateErr) throw branchUpdateErr;

      // 3. Update or Insert Salespeople & cascade to architect_registrations
      for (const sp of salesPeople) {
        const cleanSpEmail = sp.email.trim();

        // Existing Salesperson
        if (sp.userId && !String(sp.id).startsWith('temp_')) {
          const origSp = editingBranch.salesPeople?.find((s) => s.id === sp.id);

          if (origSp && cleanSpEmail !== origSp.email) {
            // Update Auth Email
            const { error: spEmailErr } = await supabase.functions.invoke('smart-function', {
              body: { action: 'UPDATE_EMAIL', authUserId: sp.userId, email: cleanSpEmail },
            });
            if (spEmailErr) throw spEmailErr;

            // Cascade to architect_registrations
            const { error: archSpErr } = await supabase
              .from('architect_registrations')
              .update({ salesperson_email: cleanSpEmail })
              .eq('salesperson_email', origSp.email);

            if (archSpErr) throw archSpErr;
          }

          if (sp.password && sp.password.trim() !== '') {
            const { error: spPassErr } = await supabase.functions.invoke('smart-function', {
              body: { action: 'UPDATE_PASSWORD', authUserId: sp.userId, password: sp.password },
            });
            if (spPassErr) throw spPassErr;
          }

          // Update branch_sales record
          const { error: spDbErr } = await supabase
            .from('branch_sales')
            .update({
              branch_name: branchName.trim(),
              branch_state: branchState.trim(),
              finance_email: cleanFinanceEmail,
              salesperson_name: sp.name.trim(),
              salesperson_email: cleanSpEmail,
              status: status,
            })
            .eq('id', sp.id);

          if (spDbErr) throw spDbErr;
        } 
        // New Salesperson added during edit mode
        else {
          const { data: newSpAuth, error: newSpAuthErr } = await supabase.auth.signUp({
            email: cleanSpEmail,
            password: sp.password,
          });

          if (newSpAuthErr) throw newSpAuthErr;

          const { error: newSpDbErr } = await supabase.from('branch_sales').insert([
            {
              user_id: newSpAuth.user?.id,
              branch_id: editingBranch.id,
              branch_name: branchName.trim(),
              branch_state: branchState.trim(),
              finance_email: cleanFinanceEmail,
              salesperson_name: sp.name.trim(),
              salesperson_email: cleanSpEmail,
              status: status,
            },
          ]);

          if (newSpDbErr) throw newSpDbErr;
        }
      }

      showSnackbar('Branch, Auth accounts, and Architect registrations updated successfully!', 'success');
    }

    fetchBranches();
    handleCloseModal();
  } catch (err) {
    console.error('Supabase Error:', err);
    showSnackbar(err.message || 'Error processing request.', 'error');
  } finally {
    setIsSubmitting(false);
  }
};

  // Filter branches based on Active Tab
  const filteredBranches = branches.filter((branch) => {
    if (activeTab === 'Active') return branch.status === 'Active';
    if (activeTab === 'Inactive') return branch.status === 'Inactive';
    return true;
  });

  return (
    <div className="main-container">
      <style>{`
        .main-container {
          min-height: 100vh;
          width: 100%;
          background: #faf6f0;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 2.5rem 1.5rem;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .header-wrapper {
          width: 100%;
          max-width: 900px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          background: #ffffff;
          padding: 1.5rem 2rem;
          border-radius: 16px;
          border: 1px solid #eee4da;
          box-shadow: 0 4px 20px rgba(60, 40, 25, 0.03);
        }

        .header-title h1 {
          margin: 0;
          font-size: 1.5rem;
          color: #2a1f18;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .header-title p {
          margin: 0.25rem 0 0 0;
          font-size: 0.88rem;
          color: #8c786a;
        }

        .btn-top-create {
          background-color: #2d5a3e;
          color: #ffffff;
          border: none;
          padding: 0.75rem 1.25rem;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: background-color 0.2s ease, transform 0.1s ease;
        }

        .btn-top-create:hover { background-color: #21442e; }
        .btn-top-create:active { transform: scale(0.98); }

        .tabs-container {
          width: 100%;
          max-width: 900px;
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.25rem;
        }

        .tab-btn {
          padding: 0.5rem 1rem;
          border-radius: 8px;
          border: 1px solid #e2d7cc;
          background: #ffffff;
          color: #705846;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab-btn.active {
          background: #2d5a3e;
          color: #ffffff;
          border-color: #2d5a3e;
        }

        .middle-content {
          width: 100%;
          max-width: 900px;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .branch-card {
          background: #ffffff;
          border: 1px solid #eee4da;
          border-radius: 14px;
          padding: 1.5rem;
          box-shadow: 0 4px 15px rgba(60, 40, 25, 0.02);
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .branch-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #f3ece4;
          padding-bottom: 0.85rem;
        }

        .branch-title-group {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .branch-name {
          font-size: 1.25rem;
          font-weight: 700;
          color: #2a1f18;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .state-tag {
          font-size: 0.82rem;
          font-weight: 600;
          color: #2d5a3e;
          background: #eaf4ed;
          padding: 0.2rem 0.6rem;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
        }

        .status-tag {
          font-size: 0.78rem;
          font-weight: 700;
          padding: 0.2rem 0.6rem;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
        }

        .status-tag.active {
          background: #f0fff4;
          color: #22543d;
          border: 1px solid #9ae6b4;
        }

        .status-tag.inactive {
          background: #fff5f5;
          color: #c53030;
          border: 1px solid #feb2b2;
        }

        .card-actions {
          display: flex;
          gap: 0.5rem;
        }

        .btn-icon {
          border: none;
          background: transparent;
          padding: 0.5rem;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
        }

        .btn-edit { color: #705846; }
        .btn-edit:hover { background: #f7f1eb; }

        .btn-delete { color: #c53030; }
        .btn-delete:hover { background: #fff5f5; }

        .finance-details {
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
          background: #fdfcf9;
          padding: 1rem;
          border-radius: 10px;
          border: 1px solid #f0e8df;
        }

        .detail-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9rem;
          color: #534133;
        }

        .sales-section {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .sales-title {
          font-size: 0.82rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #9e8a7c;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .sales-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 0.75rem;
        }

        .sales-card {
          background: #ffffff;
          border: 1px solid #e2d7cc;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          font-size: 0.85rem;
        }

        .sales-card p { margin: 0.2rem 0; color: #2a1f18; }
        .sales-card span { color: #8c786a; font-size: 0.8rem; }

        .empty-state {
          text-align: center;
          padding: 3rem;
          background: #ffffff;
          border: 2px dashed #e2d7cc;
          border-radius: 16px;
          color: #8c786a;
        }

        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(42, 31, 24, 0.45);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .modal-container {
          background: #ffffff;
          border-radius: 16px;
          width: 100%;
          max-width: 620px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
          border: 1px solid #eee4da;
          animation: modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .delete-modal-container { max-width: 460px; z-index: 1100; }

        @keyframes modalFadeIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .modal-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #f3ece4;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #fdfcf9;
          border-radius: 16px 16px 0 0;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.2rem;
          color: #2a1f18;
          font-weight: 700;
        }

        .modal-header-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .modal-body {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .form-label {
          font-size: 0.85rem;
          font-weight: 600;
          color: #534133;
        }

        .form-label span { color: #c53030; }

        .input-wrapper {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background: #ffffff;
          border: 1px solid #e2d7cc;
          border-radius: 8px;
          padding: 0.65rem 0.85rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-wrapper:focus-within {
          border-color: #2d5a3e;
          box-shadow: 0 0 0 3px rgba(45, 90, 62, 0.1);
        }

        .input-wrapper input, .input-wrapper select {
          border: none;
          outline: none;
          width: 100%;
          font-size: 0.9rem;
          color: #2a1f18;
          background: transparent;
        }

        .salespeople-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.5rem;
          padding-top: 0.75rem;
          border-top: 1px dashed #e2d7cc;
        }

        .btn-add-sp {
          background-color: #f7f1eb;
          color: #705846;
          border: 1px solid #e2d7cc;
          padding: 0.5rem 0.85rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.82rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          transition: all 0.2s ease;
        }

        .btn-add-sp:hover {
          background-color: #705846;
          color: #ffffff;
        }

        .sp-item-card {
          background: #fdfcf9;
          border: 1px solid #f0e8df;
          border-radius: 10px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .sp-item-title {
          font-size: 0.8rem;
          font-weight: 700;
          color: #9e8a7c;
          text-transform: uppercase;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-footer {
          padding: 1rem 1.5rem;
          border-top: 1px solid #f3ece4;
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          background: #fdfcf9;
          border-radius: 0 0 16px 16px;
        }

        .btn-cancel {
          background: #ffffff;
          border: 1px solid #e2d7cc;
          color: #534133;
          padding: 0.65rem 1.25rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
        }

        .btn-save {
          background: #2d5a3e;
          border: none;
          color: #ffffff;
          padding: 0.65rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .btn-save:hover { background: #21442e; }

        .btn-delete-confirm {
          background: #c53030;
          border: none;
          color: #ffffff;
          padding: 0.65rem 1.25rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .btn-delete-confirm:hover { background: #9b2c2c; }

        .snackbar {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.85rem 1.25rem;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 600;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          z-index: 2000;
          animation: snackbarIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes snackbarIn {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }

        .snackbar.error {
          background-color: #fff5f5;
          border: 1px solid #feb2b2;
          color: #c53030;
        }

        .snackbar.success {
          background-color: #f0fff4;
          border: 1px solid #9ae6b4;
          color: #22543d;
        }
      `}</style>

      {/* TOP HEADER SECTION */}
      <div className="header-wrapper">
        <div className="header-title">
          <h1>
            <Building2 color="#2d5a3e" size={26} /> Branch Finance Management
          </h1>
          <p>Create and manage branch financial profiles and sales team credentials.</p>
        </div>

        <button className="btn-top-create" onClick={handleOpenCreateModal}>
          <Plus size={18} /> Create Branches & Sales
        </button>
      </div>

      {/* STATUS TABS FILTER */}
      <div className="tabs-container">
        <button
          className={`tab-btn ${activeTab === 'All' ? 'active' : ''}`}
          onClick={() => setActiveTab('All')}
        >
          All Branches ({branches.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'Active' ? 'active' : ''}`}
          onClick={() => setActiveTab('Active')}
        >
          Active ({branches.filter((b) => b.status === 'Active').length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'Inactive' ? 'active' : ''}`}
          onClick={() => setActiveTab('Inactive')}
        >
          Inactive ({branches.filter((b) => b.status === 'Inactive').length})
        </button>
      </div>

      {/* MIDDLE SECTION */}
      <div className="middle-content">
        {isFetching ? (
          <div className="empty-state">
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Loading branch profiles...</p>
          </div>
        ) : filteredBranches.length === 0 ? (
          <div className="empty-state">
            <Building2 size={42} style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>No branches found.</p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
              Click "Create Branches & Sales" button above to add a new branch.
            </p>
          </div>
        ) : (
          filteredBranches.map((branch) => (
            <div key={branch.id} className="branch-card">
              <div className="branch-card-header">
                <div className="branch-title-group">
                  <div className="branch-name">
                    <Building2 size={20} color="#705846" />
                    {branch.branchName}
                  </div>
                  <span className="state-tag">
                    <MapPin size={12} /> {branch.branchState}
                  </span>
                  <span
                    className={`status-tag ${
                      branch.status === 'Active' ? 'active' : 'inactive'
                    }`}
                  >
                    {branch.status === 'Active' ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <XCircle size={12} />
                    )}
                    {branch.status || 'Inactive'}
                  </span>
                </div>

                <div className="card-actions">
                  <button
                    className="btn-icon btn-edit"
                    title="Edit Branch"
                    onClick={() => handleOpenEditModal(branch)}
                  >
                    <Edit3 size={18} />
                  </button>
                  <button
                    className="btn-icon btn-delete"
                    title="Delete Branch"
                    onClick={() => handleOpenDeleteModal(branch)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="finance-details">
                <div className="detail-item">
                  <MapPin size={16} color="#8c786a" />
                  <strong>State:</strong> {branch.branchState}
                </div>
                <div className="detail-item">
                  <Mail size={16} color="#8c786a" />
                  <strong>Finance Email:</strong> {branch.financeEmail}
                </div>
                
              </div>

              <div className="sales-section">
                <div className="sales-title">
                  <Users size={15} /> Assigned Salespersons ({branch.salesPeople?.length || 0})
                </div>
                {branch.salesPeople && branch.salesPeople.length > 0 ? (
                  <div className="sales-grid">
                    {branch.salesPeople.map((sp) => (
                      <div key={sp.id} className="sales-card">
                        <p style={{ fontWeight: 600 }}>{sp.name}</p>
                        <p><span>Email:</span> {sp.email}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.85rem', color: '#8c786a' }}>
                    No salesperson added to this branch yet.
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* CREATE / EDIT POPUP MODAL */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h2>{editingBranch ? 'Update Branch & Sales' : 'Create Branch & Sales'}</h2>
              <div className="modal-header-actions">
                {editingBranch && (
                  <button
                    type="button"
                    className="btn-icon btn-delete"
                    title="Delete Branch"
                    onClick={() => handleOpenDeleteModal(editingBranch)}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button type="button" className="btn-icon" onClick={handleCloseModal}>
                  <X size={20} color="#705846" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveBranch}>
              <div className="modal-body">
                {/* Branch Name Input */}
                <div className="form-group">
                  <label className="form-label">
                    Branch Name <span>*</span>
                  </label>
                  <div className="input-wrapper">
                    <Building2 size={18} color="#705846" />
                    <input
                      type="text"
                      placeholder="e.g. Downtown Branch"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                    />
                  </div>
                </div>

                {/* Mandatory State Input */}
                <div className="form-group">
                  <label className="form-label">
                    State <span>*</span>
                  </label>
                  <div className="input-wrapper">
                    <MapPin size={18} color="#705846" />
                    <input
                      type="text"
                      placeholder="e.g. California / Maharashtra"
                      value={branchState}
                      onChange={(e) => setBranchState(e.target.value)}
                    />
                  </div>
                </div>

                {/* Status Dropdown */}
                <div className="form-group">
                  <label className="form-label">
                    Status <span>*</span>
                  </label>
                  <div className="input-wrapper">
                    <Activity size={18} color="#705846" />
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Finance Email */}
                <div className="form-group">
                  <label className="form-label">
                    Finance Email <span>*</span>
                  </label>
                  <div className="input-wrapper">
                    <Mail size={18} color="#705846" />
                    <input
                      type="email"
                      placeholder="finance@branch.com"
                      value={financeEmail}
                      onChange={(e) => setFinanceEmail(e.target.value)}
                    />
                  </div>
                </div>

                {/* Finance Password */}
                <div className="form-group">
                  <label className="form-label">
                    Finance Password {editingBranch ? '' : <span>*</span>}
                  </label>
                  <div className="input-wrapper">
                    <Lock size={18} color="#705846" />
                    <input
                      type="password"
                      placeholder={editingBranch ? 'New Password (leave blank to keep)' : 'Enter finance account password'}
                      value={financePassword}
                      onChange={(e) => setFinancePassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="salespeople-header">
                  <span className="form-label">Sales Team Members</span>
                  <button
                    type="button"
                    className="btn-add-sp"
                    onClick={handleAddSalesPerson}
                  >
                    <UserPlus size={16} /> Add Sales Person
                  </button>
                </div>

                {salesPeople.map((sp, idx) => (
                  <div key={sp.id} className="sp-item-card">
                    <div className="sp-item-title">
                      <span>Sales Person #{idx + 1}</span>
                      <button
                        type="button"
                        className="btn-icon btn-delete"
                        title="Remove Salesperson"
                        onClick={() => {
                          if (String(sp.id).startsWith('temp_')) {
                            setSalesPeople((prev) => prev.filter((item) => item.id !== sp.id));
                          } else {
                            handleOpenSpDeleteModal(sp);
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Name <span>*</span>
                      </label>
                      <div className="input-wrapper">
                        <User size={16} color="#705846" />
                        <input
                          type="text"
                          placeholder="Salesperson full name"
                          value={sp.name}
                          onChange={(e) =>
                            handleSalesPersonChange(sp.id, 'name', e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Email <span>*</span>
                      </label>
                      <div className="input-wrapper">
                        <Mail size={16} color="#705846" />
                        <input
                          type="email"
                          placeholder="salesperson@branch.com"
                          value={sp.email}
                          onChange={(e) =>
                            handleSalesPersonChange(sp.id, 'email', e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Password {!sp.userId || String(sp.id).startsWith('temp_') ? <span>*</span> : ''}
                      </label>
                      <div className="input-wrapper">
                        <Lock size={16} color="#705846" />
                        <input
                          type="password"
                          placeholder={
                            !sp.userId || String(sp.id).startsWith('temp_')
                              ? 'Salesperson password'
                              : 'New Password (leave blank to keep)'
                          }
                          value={sp.password || ''}
                          onChange={(e) =>
                            handleSalesPersonChange(sp.id, 'password', e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-save" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Saving...
                    </>
                  ) : editingBranch ? (
                    'Update Branch'
                  ) : (
                    'Save Branch'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BRANCH DELETE CONFIRMATION POPUP MODAL */}
      {isDeleteModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-container delete-modal-container">
            <div className="modal-header">
              <h2 style={{ color: '#c53030', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} /> Delete Branch
              </h2>
              <button className="btn-icon" onClick={handleCloseDeleteModal}>
                <X size={20} color="#705846" />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem', color: '#2a1f18', fontWeight: 500 }}>
                Are you sure you want to delete <strong>{branchToDelete?.branchName}</strong>?
              </p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#8c786a' }}>
                This action will permanently remove this branch, all assigned salesperson records, and their corresponding accounts from auth.users.
              </p>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-cancel" onClick={handleCloseDeleteModal}>
                Cancel
              </button>
              <button type="button" className="btn-delete-confirm" onClick={handleConfirmDelete} disabled={isSubmitting}>
                {isSubmitting ? 'Deleting...' : 'Delete Branch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SALESPERSON DELETE CONFIRMATION POPUP MODAL */}
      {isSpDeleteModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-container delete-modal-container">
            <div className="modal-header">
              <h2 style={{ color: '#c53030', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} /> Delete Salesperson
              </h2>
              <button className="btn-icon" onClick={handleCloseSpDeleteModal}>
                <X size={20} color="#705846" />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem', color: '#2a1f18', fontWeight: 500 }}>
                Are you sure you want to remove {spToDelete?.name ? <strong>{spToDelete.name}</strong> : 'this salesperson'}?
              </p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#8c786a' }}>
                This will purge their account from both the branch profile and auth.users table.
              </p>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-cancel" onClick={handleCloseSpDeleteModal}>
                Cancel
              </button>
              <button type="button" className="btn-delete-confirm" onClick={handleConfirmSpDelete} disabled={isSubmitting}>
                {isSubmitting ? 'Removing...' : 'Delete Salesperson'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SNACKBAR NOTIFICATION */}
      {snackbar.open && (
        <div className={`snackbar ${snackbar.type}`}>
          {snackbar.type === 'error' ? (
            <AlertCircle size={18} />
          ) : (
            <CheckCircle size={18} />
          )}
          {snackbar.message}
        </div>
      )}
    </div>
  );
}