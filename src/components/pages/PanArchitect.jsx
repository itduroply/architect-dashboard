import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supbase'; // Adjust path if needed
import * as XLSX from 'xlsx';
import { useLocation } from 'react-router-dom'; 

export default function UploadExcel() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [uploadedData, setUploadedData] = useState([]);
  const fileInputRef = useRef(null);

  // Pagination Configuration Engine
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Modal State Control Engines
  const [modal, setModal] = useState({ show: false, type: '', data: null });
  const [editForm, setEditForm] = useState({});
  const location = useLocation();

  // ─── 👤 OPERATOR IDENTITY RESOLVER FALLBACK MATRIX ───
  const resolveOperatorName = async () => {
    let currentUserName = location.state?.userProfile?.name;
    const activeId = localStorage.getItem("auth_uid");

    if (!currentUserName && activeId) {
      try {
        const { data: userProfile, error: userError } = await supabase
          .from("users")
          .select("name")
          .eq("id", activeId)
          .maybeSingle();

        if (!userError && userProfile?.name) {
          currentUserName = userProfile.name;
        }
      } catch (err) {
        console.error("Error fetching operator profile name fallback:", err.message);
      }
    }
    return currentUserName || localStorage.getItem("user_role") || "Admin/Staff";
  };

  // ─── 📝 TRANSLATION TELEMETRY LOGGING ENGINE ───
  const logTelemetry = async (actionType, description) => {
    try {
      const activeId = localStorage.getItem('auth_uid'); 
      const activeRole = localStorage.getItem('user_role') || 'User';

      const { error } = await supabase.from('user_activity_logs').insert({
        user_id: activeId, 
        user_role: activeRole,
        action_type: actionType,
        description: description
      });

      if (error) console.error("❌ Telemetry Log Failed:", error.message);
    } catch (err) {
      console.error("Telemetry logging runtime crash error:", err.message);
    }
  };

  const convertExcelDate = (excelDateValue) => {
    if (!excelDateValue) return new Date().toISOString();
    
    if (typeof excelDateValue === 'string' && isNaN(excelDateValue)) {
      return new Date(excelDateValue).toISOString();
    }

    const serial = Number(excelDateValue);
    if (!isNaN(serial)) {
      const utc_days  = Math.floor(serial - 25569);
      const utc_value = utc_days * 86400;
      const date_info = new Date(utc_value * 1000);
      
      const fractional_day = serial - Math.floor(serial) + 0.0000001;
      let total_seconds = Math.floor(86400 * fractional_day);
      
      const seconds = total_seconds % 60;
      total_seconds = Math.floor(total_seconds / 60);
      const minutes = total_seconds % 60;
      const hours = Math.floor(total_seconds / 60);
      
      const fixedDate = new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
      return fixedDate.toISOString();
    }
    
    return new Date().toISOString();
  };

  // ─── 🔄 BYPASS 1000 LIMIT: BATCH FETCHING ENGINE ───
  const fetchCurrentRecords = async () => {
    try {
      let allRecords = [];
      let fetchMore = true;
      let from = 0;
      const step = 1000;

      while (fetchMore) {
        const { data, error } = await supabase
          .from('master_architect')
          .select('*')
          .order('id', { ascending: true })
          .range(from, from + step - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allRecords = [...allRecords, ...data];
          from += step;
          
          // If we got exactly 1000, there MIGHT be more. If less, we are definitely done.
          if (data.length < step) {
            fetchMore = false;
          }
        } else {
          fetchMore = false;
        }
      }
      setUploadedData(allRecords);
    } catch (err) {
      console.error("Error loading records:", err.message);
    }
  };

  useEffect(() => {
    fetchCurrentRecords();
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setStatus({ type: '', message: '' });
      setProgress(0);
    }
  };

  // ─── 📥 ACTION 1: COMMIT EXCEL UPLOAD ───
  const handleUpload = async () => {
    if (!file) {
      setStatus({ type: 'error', message: 'Please select an Excel file first.' });
      return;
    }

    setUploading(true);
    setProgress(5); 
    const operatorName = await resolveOperatorName();
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          throw new Error("The selected Excel file is empty.");
        }

        setStatus({ type: 'loading', message: `Processing layout records...` });
        setProgress(25); 
        const batchSize = 50; 
        const totalRows = jsonData.length;
        let processedRows = 0;
        let totalValidRecordsImported = 0;

        for (let i = 0; i < totalRows; i += batchSize) {
          const chunk = jsonData.slice(i, i + batchSize);
          
          const mappedData = chunk.map(row => {
            const rawEnrollmentDate = row['Enrollment Date'] || row['enrollment_date'];
            
            return {
              influencer_name: row['Influencer Name'] || row['influencer_name'],
              account_number: String(row['Account Number'] || row['account_number'] || '').trim(), 
              enrollment_date: convertExcelDate(rawEnrollmentDate),
              mobile_number: String(row['Mobile Number'] || row['mobile_number'] || '').trim(),
              is_active: row['Is Active'] || row['is_active'] || 'active',
              dealer: row['Dealer'] || row['dealer'] || row['Dealer Name'] || row['dealer_name'] || row['DEALER'] || row['Main Dealer'] || null, 
              market_city: row['Market City'] || row['market_city'],
              linked_architect: row['Linked Architect'] ? parseInt(row['Linked Architect'], 10) : null
            };
          });

          const filteredFields = mappedData.filter(item => item.influencer_name && item.account_number && item.mobile_number && item.market_city);

          const uniqueMap = new Map();
          filteredFields.forEach(item => {
            uniqueMap.set(item.account_number, item);
          });
          const validData = Array.from(uniqueMap.values());

          if (i === 0 && validData.length === 0) {
            throw new Error("Column mismatch error! Please verify your Excel file has matching header schemas.");
          }

          if (validData.length > 0) {
            const { error } = await supabase
              .from('master_architect')
              .upsert(validData, { onConflict: 'account_number' });
            if (error) throw error;
            totalValidRecordsImported += validData.length;
          }

          processedRows += chunk.length;
          setProgress(Math.min(25 + Math.round((processedRows / totalRows) * 75), 100));
        }

        if (totalValidRecordsImported === 0) {
          throw new Error("No valid data rows could be extracted from your sheet file layout.");
        }

        await logTelemetry(
          "EXCEL_BULK_UPSERT",
          `${operatorName} processed Master architect importing ${totalValidRecordsImported} records`
        );

        setStatus({ type: 'success', message: `Successfully synchronized ${totalValidRecordsImported} records securely to the cloud database.` });
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setCurrentPage(1);
        fetchCurrentRecords(); 

        setTimeout(() => {
          setStatus({ type: '', message: '' });
        }, 3000);

      } catch (err) {
        setStatus({ type: 'error', message: err.message || 'Failed to process data.' });
        setProgress(0);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const openResetDatabaseModal = () => setModal({ show: true, type: 'purge_all', data: null });
  const openDeleteModal = (row) => setModal({ show: true, type: 'delete', data: row });
  const openEditModal = (row) => {
    setEditForm({ ...row });
    setModal({ show: true, type: 'edit', data: row });
  };
  const openUpdateConfirmationModal = () => setModal(prev => ({ ...prev, type: 'confirm_update' }));
  const cancelUpdateConfirmation = () => setModal(prev => ({ ...prev, type: 'edit' }));

  // ─── 🗑️ ACTION 2: COMPLETE TABLE WIPE/RESET ───
  const confirmPurgeAllDatabase = async () => {
    setUploading(true);
    const operatorName = await resolveOperatorName();
    try {
      const { error } = await supabase
        .from('master_architect')
        .delete()
        .gt('id', 0); 

      if (error) throw error;

      await logTelemetry(
        "DATABASE_TABLE_PURGE",
        `${operatorName} deleted entire data from database `
      );

      setUploadedData([]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setModal({ show: false, type: '', data: null });
      setCurrentPage(1);

      setStatus({ type: 'success', message: 'All rows wiped successfully. Table structure intact.' });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      alert("Database flush failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  // ─── 🗑️ ACTION 3: ROW DISPOSAL DUSTBIN ───
  const confirmDelete = async () => {
    const operatorName = await resolveOperatorName();
    const targetName = modal.data?.influencer_name;
    const targetAcc = modal.data?.account_number;
    
    try {
      const { error } = await supabase
        .from('master_architect')
        .delete()
        .eq('id', modal.data.id);
      if (error) throw error;
      
      await logTelemetry(
        "ARCHITECT_RECORD_DELETE",
        `${operatorName} deleted architect record '${targetName}' (Acc num: ${targetAcc}) from database`
      );

      setUploadedData(prev => prev.filter(item => item.id !== modal.data.id));
      setModal({ show: false, type: '', data: null });
      
      setStatus({ type: 'success', message: 'Record deleted successfully.' });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      alert("Failed to delete record: " + err.message);
    }
  };

  // ─── ✏️ ACTION 4: SAVE CHANGES MODAL ───
  const confirmEdit = async () => {
    const operatorName = await resolveOperatorName();
    try {
      const { error } = await supabase
        .from('master_architect')
        .update({
          influencer_name: editForm.influencer_name,
          mobile_number: editForm.mobile_number,
          market_city: editForm.market_city,
          dealer: editForm.dealer,
          is_active: editForm.is_active,
          linked_architect: editForm.linked_architect ? parseInt(editForm.linked_architect, 10) : null
        })
        .eq('id', editForm.id);

      if (error) throw error;

      await logTelemetry(
        "ARCHITECT_RECORD_UPDATE",
        `${operatorName} Modified architect profile for account number #${editForm.account_number}.`
      );

      setUploadedData(prev => prev.map(item => item.id === editForm.id ? { ...editForm } : item));
      setModal({ show: false, type: '', data: null });

      setStatus({ type: 'success', message: `Successfully updated architect information.` });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      alert("Failed to update record: " + err.message);
    }
  };

  // ─── 📊 PAGINATION CALCULATION MATRIX ───
  const totalPages = Math.ceil(uploadedData.length / itemsPerPage);
  const derivedCurrentPage = Math.min(currentPage, totalPages || 1);
  const indexOfLastItem = derivedCurrentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentPagedItems = uploadedData.slice(indexOfFirstItem, indexOfLastItem);

  const styles = {
    container: { maxWidth: '1000px', margin: '16px auto', padding: '20px', backgroundColor: '#fdfbf7', borderRadius: '8px', border: '1px solid #e6dfd5', boxShadow: '0 10px 25px -10px rgba(165, 150, 135, 0.12)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
    headerTitle: { fontSize: '18px', fontWeight: '600', color: '#4a3f35', margin: '0 0 2px 0' },
    headerSubtitle: { fontSize: '12px', color: '#8c7e70', margin: '0 0 16px 0' },
    dropzone: { border: file ? '2px dashed #b5926e' : '2px dashed #c4b9ac', backgroundColor: file ? '#f7f3ed' : '#faf8f5', borderRadius: '6px', padding: '16px', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1, transition: 'all 0.2s ease' },
    icon: { width: '32px', height: '32px', color: '#b5926e', marginBottom: '6px' },
    fileName: { fontSize: '13px', fontWeight: '500', color: '#4a3f35', marginBottom: '2px' },
    fileMeta: { fontSize: '11px', color: '#a19385', margin: 0 },
    progressContainer: { marginTop: '14px' },
    progressMeta: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '600', color: '#b5926e', marginBottom: '4px' },
    progressBarOuter: { width: '100%', backgroundColor: '#eae5dd', height: '6px', borderRadius: '9999px', overflow: 'hidden', border: '1px solid #dfd8ce' },
    progressBarInner: { width: `${progress}%`, backgroundColor: '#b5926e', height: '100%', transition: 'width 0.2s ease-out' },
    statusBadge: { marginTop: '14px', padding: '10px 14px', borderRadius: '6px', border: '1px solid', fontSize: '12px', backgroundColor: status.type === 'success' ? '#edf7ed' : status.type === 'loading' ? '#f3f4f6' : '#fdeded', borderColor: status.type === 'success' ? '#c3e6cb' : status.type === 'loading' ? '#d1d5db' : '#f5c6cb', color: status.type === 'success' ? '#1e4620' : status.type === 'loading' ? '#374151' : '#721c24' },
    actionRow: { marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' },
    btnResetActive: { padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '500', color: '#736557', backgroundColor: 'transparent', border: '1px solid #c4b9ac', cursor: uploading ? 'not-allowed' : 'pointer' },
    btnSubmitActive: { padding: '6px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: '#ffffff', backgroundColor: '#a6825e', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer' },
    btnFormAction: { padding: '8px 18px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: '#ffffff', backgroundColor: '#a6825e', border: 'none', cursor: 'pointer' },
    tableWrapper: { marginTop: '24px', overflowX: 'auto', border: '1px solid #eae5dd', borderRadius: '6px', boxShadow: '0 2px 4px -2px rgba(0,0,0,0.02)' },
    table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px', color: '#4a3f35' },
    th: { backgroundColor: '#f5f0e9', padding: '10px 12px', color: '#6b5c4c', fontWeight: '600', borderBottom: '1px solid #eae5dd', whiteSpace: 'nowrap' },
    td: { padding: '10px 12px', borderBottom: '1px solid #eae5dd', backgroundColor: '#ffffff', whiteSpace: 'nowrap' },
    actionBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px 4px', margin: '0 2px' },
    backdrop: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(74, 63, 53, 0.3)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(1px)' },
    modalBox: { backgroundColor: '#ffffff', border: '1px solid #dfd8ce', borderRadius: '8px', padding: '20px', width: '90%', maxWidth: '420px', boxShadow: '0 15px 30px -10px rgba(74,63,53,0.12)' },
    formGroup: { marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' },
    input: { backgroundColor: '#faf8f5', border: '1px solid #c4b9ac', borderRadius: '4px', padding: '7px 10px', color: '#4a3f35', fontSize: '12px', outline: 'none' },
    
    // Dynamic Pagination Styled Extensions
    paginationRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', padding: '0 2px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
    paginationInfo: { fontSize: '12px', color: '#8c7e70', fontWeight: '500' },
    paginationControls: { display: 'flex', alignItems: 'center', gap: '6px' },
    paginationButton: { padding: '5px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '500', color: '#736557', backgroundColor: '#ffffff', border: '1px solid #c4b9ac', cursor: 'pointer', transition: 'all 0.15s ease' }
  };

  return (
    <div style={styles.container}>
      <div>
        <h2 style={styles.headerTitle}>Master Architect Data Hub</h2>
        <p style={styles.headerSubtitle}>Upload excel configurations here. Auto-sync overrides records instantly via unique account numbers.</p>
      </div>

      <div onClick={() => !uploading && fileInputRef.current.click()} style={styles.dropzone}>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls" style={{ display: 'none' }} disabled={uploading} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <svg style={styles.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <div style={styles.fileName}>{file ? file.name : "Click to select your spreadsheet file"}</div>
          <p style={styles.fileMeta}>Supports standard .xlsx and .xls file packages</p>
        </div>
      </div>

      {uploading && (
        <div style={styles.progressContainer}>
          <div style={styles.progressMeta}><span>Syncing Records Database...</span><span>{progress}%</span></div>
          <div style={styles.progressBarOuter}><div style={styles.progressBarInner} /></div>
        </div>
      )}

      {status.message && <div style={styles.statusBadge}>{status.message}</div>}

      <div style={styles.actionRow}>
        <button onClick={openResetDatabaseModal} disabled={uploading} style={styles.btnResetActive}>Reset Database</button>
        <button onClick={handleUpload} disabled={uploading} style={styles.btnSubmitActive}>{uploading ? 'Processing Matrix...' : 'Commit Upload'}</button>
      </div>

      {uploadedData.length > 0 && (
        <div>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Architect Name</th>
                  <th style={styles.th}>Account #</th>
                  <th style={styles.th}>Mobile Number</th>
                  <th style={styles.th}>Market City</th>
                  <th style={styles.th}>Dealer State</th>
                  <th style={styles.th}>Last Login</th>
                  <th style={styles.th}>Status</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentPagedItems.map((row) => (
                  <tr key={row.id}>
                    <td style={styles.td}>{row.influencer_name}</td>
                    <td style={{ ...styles.td, fontFamily: 'monospace', color: '#736557', fontWeight: '600' }}>{row.account_number}</td>
                    <td style={styles.td}>{row.mobile_number}</td>
                    <td style={styles.td}>{row.market_city}</td>
                    <td style={styles.td}>{row.dealer || '-'}</td>
      <td style={styles.td}>
  {row.last_login 
    ? new Date(
        row.last_login.replace(' ', 'T') + (row.last_login.endsWith('Z') ? '' : 'Z')
      ).toLocaleString('en-US', { 
        timeZone: 'Asia/Kolkata', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
      }) 
    : '-'}
</td>
                    <td style={styles.td}>
                      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '500', backgroundColor: row.is_active === 'Yes' || row.is_active === 'active' ? '#e6f4ea' : '#fce8e6', color: row.is_active === 'Yes' || row.is_active === 'active' ? '#137333' : '#c5221f' }}>
                        {row.is_active}
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <button title="Modify Field" onClick={() => openEditModal(row)} style={styles.actionBtn}>✏️</button>
                      <button title="Purge Record" onClick={() => openDeleteModal(row)} style={styles.actionBtn}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Core Table Control Pagination Panel */}
          <div style={styles.paginationRow}>
            <div style={styles.paginationInfo}>
              Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, uploadedData.length)} of {uploadedData.length} entries
            </div>
            <div style={styles.paginationControls}>
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                disabled={derivedCurrentPage === 1}
                style={{ ...styles.paginationButton, opacity: derivedCurrentPage === 1 ? 0.5 : 1, cursor: derivedCurrentPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              <span style={{ fontSize: '12px', color: '#4a3f35', fontWeight: '600', padding: '0 8px' }}>
                {derivedCurrentPage} / {totalPages || 1}
              </span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                disabled={derivedCurrentPage === totalPages}
                style={{ ...styles.paginationButton, opacity: derivedCurrentPage === totalPages ? 0.5 : 1, cursor: derivedCurrentPage === totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {modal.show && (
        <div style={styles.backdrop}>
          <div style={styles.modalBox}>
            {modal.type === 'purge_all' ? (
              <div>
                <h3 style={{ color: '#c5221f', fontSize: '15px', margin: '0 0 8px 0', fontWeight: '600' }}>⚠️ Clear Table Rows?</h3>
                <p style={{ color: '#6b5c4c', fontSize: '12px', lineHeight: '1.4', margin: '0 0 16px 0' }}>
                  Are you sure you want to delete all entries? This keeps your empty table architecture and column formats ready for clean spreadsheet imports.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button onClick={() => setModal({ show: false, type: '', data: null })} style={styles.btnResetActive}>Cancel</button>
                  <button onClick={confirmPurgeAllDatabase} style={{ ...styles.btnResetActive, backgroundColor: '#d93025', color: '#ffffff', border: 'none' }}>Yes, Empty Table</button>
                </div>
              </div>
            ) : modal.type === 'delete' ? (
              <div>
                <h3 style={{ color: '#c5221f', fontSize: '15px', margin: '0 0 8px 0', fontWeight: '600' }}>Confirm Data Purge</h3>
                <p style={{ color: '#6b5c4c', fontSize: '12px', lineHeight: '1.4', margin: '0 0 16px 0' }}>
                  Are you sure you want to delete <strong>{modal.data?.influencer_name}</strong> (Acc: {modal.data?.account_number})? This action is permanent.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button onClick={() => setModal({ show: false, type: '', data: null })} style={styles.btnResetActive}>Cancel</button>
                  <button onClick={confirmDelete} style={{ ...styles.btnResetActive, backgroundColor: '#d93025', color: '#ffffff', border: 'none' }}>Delete Row</button>
                </div>
              </div>
            ) : modal.type === 'confirm_update' ? (
              <div>
                <h3 style={{ color: '#a6825e', fontSize: '15px', margin: '0 0 8px 0', fontWeight: '600' }}>Confirm Changes</h3>
                <p style={{ color: '#6b5c4c', fontSize: '12px', lineHeight: '1.4', margin: '0 0 16px 0' }}>
                  Are you sure you want to update this row record with the newly configured modifications?
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button onClick={cancelUpdateConfirmation} style={styles.btnResetActive}>Go Back</button>
                  <button onClick={confirmEdit} style={styles.btnFormAction}>Yes, Update</button>
                </div>
              </div>
            ) : (
              <div>
                <h3 style={{ color: '#4a3f35', fontSize: '15px', margin: '0 0 12px 0', fontWeight: '600' }}>Modify Architect Information</h3>
                
                <div style={styles.formGroup}>
                  <label style={{ color: '#736557', fontSize: '11px', fontWeight: '600' }}>Influencer Name</label>
                  <input type="text" value={editForm.influencer_name || ''} onChange={e => setEditForm({...editForm, influencer_name: e.target.value})} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={{ color: '#736557', fontSize: '11px', fontWeight: '600' }}>Mobile Number</label>
                  <input type="text" value={editForm.mobile_number || ''} onChange={e => setEditForm({...editForm, mobile_number: e.target.value})} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={{ color: '#736557', fontSize: '11px', fontWeight: '600' }}>Market City</label>
                  <input type="text" value={editForm.market_city || ''} onChange={e => setEditForm({...editForm, market_city: e.target.value})} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={{ color: '#736557', fontSize: '11px', fontWeight: '600' }}>Dealer</label>
                  <input type="text" value={editForm.dealer || ''} onChange={e => setEditForm({...editForm, dealer: e.target.value})} style={styles.input} />
                </div>
                <div style={styles.formGroup}>
                  <label style={{ color: '#736557', fontSize: '11px', fontWeight: '600' }}>Status Matrix</label>
                  <select value={editForm.is_active || 'active'} onChange={e => setEditForm({...editForm, is_active: e.target.value})} style={styles.input}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div style={{ ...styles.actionRow, marginTop: '18px' }}>
                  <button onClick={() => setModal({ show: false, type: '', data: null })} style={styles.btnResetActive}>Cancel</button>
                  <button onClick={openUpdateConfirmationModal} style={styles.btnFormAction}>Save Changes</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}