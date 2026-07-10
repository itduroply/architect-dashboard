import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supbase'; 
import * as XLSX from 'xlsx'; 
import { 
  Calendar, 
  Download, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  FileSpreadsheet,
  Layers,
  Table,
  ArrowRight
} from 'lucide-react';

const monthsList = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

export default function RemittanceReportingManager() {
  const [activeTab, setActiveTab] = useState('export'); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ show: false, message: '' });

  const [selectedMonth, setSelectedMonth] = useState('07'); 
  const [exportPreviewData, setExportPreviewData] = useState([]);

  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importing, setImporting] = useState(false);

  // --- Pipeline 1: Fetch and Sync Month Preview (Year Independent) ---
  useEffect(() => {
    const syncExportPreview = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('remittances')
          .select('id, architect_name, account_number, amount, created_payment_date, status, payment_mode, remark, utr, done_payment_date')
          .eq('status', 'Pending');

        if (fetchError) throw fetchError;

        const filteredRecords = (data || []).filter(row => {
          if (!row.created_payment_date) return false;
          const parts = row.created_payment_date.split('-');
          return parts[1] === selectedMonth;
        });

        setExportPreviewData(filteredRecords);
      } catch (err) {
        setError(`Failed to retrieve live preview data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (activeTab === 'export') {
      syncExportPreview();
    }
  }, [selectedMonth, activeTab]);

  // --- Action 1: Compile & Export Excel Workbook Binary ---
  const handleExportToExcel = () => {
    if (exportPreviewData.length === 0) return;

    try {
      const formattedRows = exportPreviewData.map(row => ({
        'Unique ID': row.id,
        'Architect Partner Name': row.architect_name || '',
        'Destination Account Identity': row.account_number || '',
        'Allocation Amount (INR)': row.amount || 0,
        'Payment Generation Date': row.created_payment_date || '',
        'Current Status': row.status || '',
        'Preferred Payment Mode': row.payment_mode || 'NEFT',
        'Transaction Ledger Remark': row.remark || '',
        'UTR Number': row.utr || '',
        'Payment Done Date': row.done_payment_date || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pending Remittances');

      const cols = Object.keys(formattedRows[0]).map(key => {
        let maxLen = key.length;
        formattedRows.forEach(row => {
          const valLen = row[key] ? String(row[key]).length : 0;
          if (valLen > maxLen) maxLen = valLen;
        });
        return { wch: maxLen + 3 }; 
      });
      worksheet['!cols'] = cols;

      const monthLabel = monthsList.find(m => m.value === selectedMonth)?.label || 'Report';
      XLSX.writeFile(workbook, `Pending_Remittances_Report_${monthLabel}.xlsx`);
      
      setSnackbar({ show: true, message: `Successfully exported ${exportPreviewData.length} rows to Excel.` });
      setTimeout(() => setSnackbar({ show: false, message: '' }), 4000);
    } catch (err) {
      setError(`Excel composition sequence failed: ${err.message}`);
    }
  };

  // --- Action 2: Process Local File Parsing via Reader Array Buffers ---
  const handleExcelImportParsing = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setImportFile(file);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const currentSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[currentSheetName];
      
      const rawJsonRows = XLSX.utils.sheet_to_json(worksheet);

      if (rawJsonRows.length === 0) {
        throw new Error('The selected spreadsheet contains no data rows to import.');
      }

      // ✅ FIX: Formatter utility to convert serial numbers (46251) or DD-MM-YYYY strings to YYYY-MM-DD
      const parseToSqlDate = (val) => {
        if (!val) return null;

        // If it is an Excel numeric serial date (e.g., 46251)
        if (!isNaN(val) && Number(val) > 40000) {
          const date = new Date((Number(val) - 25569) * 86400 * 1000);
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }

        // If it is a string representation (e.g., "17-08-2026" or "17/08/2026")
        const strVal = String(val).trim();
        const parts = strVal.split(/[-/]/);
        if (parts.length === 3) {
          // If format is DD-MM-YYYY (Year is 4 digits at the end)
          if (parts[2].length === 4) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
          // If format is already YYYY-MM-DD (Year is 4 digits at the front)
          if (parts[0].length === 4) {
            return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          }
        }
        return strVal;
      };

      const normalizedPayload = rawJsonRows.map((row, index) => {
        const idVal = row['id'] || row['Unique ID'] || row['id_column'];
        const amountVal = row['amount'] || row['Allocation Amount (INR)'] || row['payout_amount'];
        const dateVal = row['created_payment_date'] || row['Payment Generation Date'] || row['payment_date'];
        const nameVal = row['architect_name'] || row['Architect Partner Name'] || row['architect'];
        const accVal = row['account_number'] || row['Destination Account Identity'] || row['account_identity'];
        const modeVal = row['payment_mode'] || row['Preferred Payment Mode'] || row['payment_mode'];
        const statusVal = row['status'] || row['Current Status'] || row['status'];
        const remarkVal = row['remark'] || row['Transaction Ledger Remark'] || row['remark'];
        const utrVal = row['utr'] || row['UTR Number'] || row['UTR'];
        const doneDateVal = row['done_payment_date'] || row['Payment Done Date'] || row['done_date'];

        if (!idVal) {
          throw new Error(`Row parsing exception at row #${index + 2}: Missing unique 'id' reference constraint.`);
        }

        return {
          id: isNaN(idVal) ? idVal : Number(idVal),
          architect_name: nameVal || null,
          account_number: accVal ? String(accVal) : null,
          amount: amountVal ? Number(amountVal) : 0,
          created_payment_date: parseToSqlDate(dateVal), // Process conversion here
          status: statusVal || 'Pending',
          payment_mode: modeVal || 'NEFT',
          remark: remarkVal || null,
          utr: utrVal || null,
          done_payment_date: parseToSqlDate(doneDateVal) // Process conversion here
        };
      }).filter(row => row.utr !== null || row.done_payment_date !== null);

      setImportPreview(normalizedPayload);
    } catch (err) {
      setError(`File mapping processing aborted: ${err.message}`);
      setImportPreview([]);
      setImportFile(null);
    }
  };

  const handleCommitImportToDatabase = async () => {
    if (importPreview.length === 0) return;
    try {
      setImporting(true);
      setError(null);

      const { error: upsertError } = await supabase
        .from('remittances')
        .upsert(importPreview, { onConflict: 'id' });

      if (upsertError) throw upsertError;

      setSnackbar({
        show: true,
        message: `Successfully integrated ${importPreview.length} records into the ledger table!`
      });
      
      setImportFile(null);
      setImportPreview([]);
      
      setTimeout(() => setSnackbar({ show: false, message: '' }), 4000);
    } catch (err) {
      setError(`Database Batch Upload Failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const formatAmountINR = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="centered-reporting-wrapper">
      <style>{`
        .centered-reporting-wrapper {
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
          display: flex;
          align-items: center;
          gap: 0.5rem;
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
        .config-dashboard-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #fdfaf5;
          border: 1px solid #eaddcc;
          padding: 1.25rem;
          border-radius: 10px;
          margin-bottom: 1.5rem;
          gap: 1.5rem;
        }
        .control-element-group {
          display: flex;
          align-items: center;
          gap: 0.85rem;
        }
        .control-element-group label {
          font-size: 0.85rem;
          font-weight: 700;
          color: #5c4632;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .dropdown-field-select {
          padding: 0.55rem 2.25rem 0.55rem 0.75rem;
          border: 1px solid #eaddcc;
          border-radius: 6px;
          background: #ffffff;
          color: #2a1a0f;
          font-size: 0.85rem;
          font-weight: 700;
          outline: none;
          cursor: pointer;
        }
        .btn-action-trigger-primary {
          background: #8a683e;
          color: #ffffff;
          border: 1px solid #735430;
          padding: 0.55rem 1.25rem;
          font-size: 0.85rem;
          font-weight: 700;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          transition: all 0.2s;
        }
        .btn-action-trigger-primary:hover {
          background: #735430;
        }
        .btn-action-trigger-primary:disabled {
          background: #c2b4a6;
          border-color: #c2b4a6;
          cursor: not-allowed;
        }
        .btn-action-trigger-dark {
          background: #2a1a0f;
          color: #fdfaf5;
          border: 1px solid #2a1a0f;
        }
        .file-upload-interactive-wrapper {
          position: relative;
          display: inline-block;
        }
        .file-hidden-system-input {
          position: absolute;
          left: 0;
          top: 0;
          opacity: 0;
          width: 100%;
          height: 100%;
          cursor: pointer;
        }
        .mock-upload-display-btn {
          background: #ffffff;
          border: 1px dashed #b8956c;
          color: #8a683e;
          padding: 0.55rem 1.25rem;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }
        .table-view-scroller {
          overflow-x: auto;
          width: 100%;
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid #eaddcc;
        }
        table.clean-ledger-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.875rem;
          min-width: 950px;
          background: #ffffff;
        }
        .clean-ledger-table th {
          padding: 0.85rem 1rem;
          font-size: 0.75rem;
          font-weight: 700;
          color: #b8956c;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 2px solid #f2ebd9;
          background: #fdfbf9;
        }
        .clean-ledger-table td {
          padding: 1.1rem 1rem;
          border-bottom: 1px solid #faf7f2;
          color: #4a311d;
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
          color: #2a1a0f;
        }
        .status-badge-chip {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        .status-badge-chip.pending {
          background: #fef3c7;
          color: #d97706;
          border: 1px solid #fcd34d;
        }
        .status-center {
          padding: 4.5rem 2rem;
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
          z-index: 1100;
        }
        .spin-icon {
          animation: rotateLoop 1s linear infinite;
        }
        @keyframes rotateLoop {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="ledger-content-box">
        <header className="ledger-header">
          <div className="header-main">
            <h1>Reporting & Auditing Central</h1>
            <p>Compile pending month-isolated datasets or dispatch additive transaction row spreadsheet modifications.</p>
          </div>
        </header>

        {error && (
          <div className="error-toast">
            <AlertCircle size={18} />
            <span><strong>Processing Error:</strong> {error}</span>
          </div>
        )}

        <div className="table-controls-bar">
          <div className="filter-tabs-container">
            <button 
              className={`filter-tab-btn ${activeTab === 'export' ? 'active' : ''}`}
              onClick={() => setActiveTab('export')}
            >
              <Calendar size={15} />
              Export Date-wise Report
            </button>
            <button 
              className={`filter-tab-btn ${activeTab === 'import' ? 'active' : ''}`}
              onClick={() => setActiveTab('import')}
            >
              <Layers size={15} />
              Import Table Report
            </button>
          </div>
        </div>

        {activeTab === 'export' && (
          <>
            <div className="config-dashboard-card">
              <div className="control-element-group">
                <label>Filter Target Month:</label>
                <select 
                  className="dropdown-field-select"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                >
                  {monthsList.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.8rem', color: '#8c7662', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  Year Parameters: <ArrowRight size={12} /> <strong style={{ color: '#2a1a0f' }}>All Years</strong>
                </span>
              </div>
              
              <button 
                className="btn-action-trigger-primary"
                onClick={handleExportToExcel}
                disabled={exportPreviewData.length === 0 || loading}
              >
                <Download size={15} />
                Generate & Download Excel
              </button>
            </div>

            {loading ? (
              <div className="status-center">
                <Loader2 className="spin-icon" size={24} style={{ marginBottom: '0.5rem' }} />
                <div>Sifting pending records...</div>
              </div>
            ) : (
              <div className="table-view-scroller">
                <table className="clean-ledger-table">
                  <thead>
                    <tr>
                      <th style={{ width: '10%' }}>Unique ID</th>
                      <th style={{ width: '24%' }}>Architect Partner</th>
                      <th style={{ width: '20%' }}>Account Destination</th>
                      <th style={{ width: '15%' }}>Allocation</th>
                      <th style={{ width: '16%' }}>Payment Date</th>
                      <th style={{ width: '15%' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exportPreviewData.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="status-center">
                          No pending remittance records found corresponding to the selected target calendar month.
                        </td>
                      </tr>
                    ) : (
                      exportPreviewData.map((row) => (
                        <tr key={row.id}>
                          <td><span className="identity-badge" style={{ background: '#f0ede6', fontWeight: 700 }}>#{row.id}</span></td>
                          <td style={{ fontWeight: 600 }}>{row.architect_name}</td>
                          <td><span className="identity-badge">{row.account_number || 'N/A'}</span></td>
                          <td><span className="amount-display">{formatAmountINR(row.amount)}</span></td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#5c4632' }}>{row.created_payment_date}</td>
                          <td><span className="status-badge-chip pending">{row.status}</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === 'import' && (
          <>
            <div className="config-dashboard-card">
              <div className="control-element-group">
                <div className="file-upload-interactive-wrapper">
                  <button type="button" className="mock-upload-display-btn">
                    <FileSpreadsheet size={15} />
                    {importFile ? importFile.name : 'Select Excel Spreadsheet (.xlsx, .xls)'}
                  </button>
                  <input 
                    type="file" 
                    className="file-hidden-system-input" 
                    accept=".xlsx, .xls" 
                    onChange={handleExcelImportParsing} 
                  />
                </div>
                {importPreview.length > 0 && (
                  <span style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 700 }}>
                    ✓ Ready to upsert {importPreview.length} lines
                  </span>
                )}
              </div>

              <button 
                className="btn-action-trigger-primary btn-action-trigger-dark"
                onClick={handleCommitImportToDatabase}
                disabled={importPreview.length === 0 || importing}
              >
                {importing ? (
                  <>
                    <Loader2 className="spin-icon" size={15} /> Uploading Packages...
                  </>
                ) : (
                  <>
                    <Table size={15} /> Process Additive Update
                  </>
                )}
              </button>
            </div>

            {importPreview.length > 0 ? (
              <div>
                <h3 style={{ fontSize: '0.85rem', color: '#8c7662', marginBottom: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Staging Mapping Grid Preview:
                </h3>
                <div className="table-view-scroller">
                  <table className="clean-ledger-table">
                    <thead>
                      <tr>
                        <th style={{ width: '10%' }}>Unique ID</th>
                        <th style={{ width: '24%' }}>Architect Partner Name</th>
                        <th style={{ width: '20%' }}>Account Number</th>
                        <th style={{ width: '15%' }}>Amount</th>
                        <th style={{ width: '16%' }}>Payment Date</th>
                        <th style={{ width: '15%' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((row, idx) => (
                        <tr key={row.id || idx}>
                          <td><span className="identity-badge" style={{ background: '#eaddcc', color: '#2a1a0f', fontWeight: 700 }}>#{row.id}</span></td>
                          <td style={{ fontWeight: 600 }}>{row.architect_name || '—'}</td>
                          <td><span className="identity-badge">{row.account_number || '—'}</span></td>
                          <td><span className="amount-display">{formatAmountINR(row.amount)}</span></td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{row.created_payment_date || '—'}</td>
                          <td>
                            <span className={`status-badge-chip ${row.status?.toLowerCase() === 'paid' ? 'paid' : 'pending'}`}>
                              {row.status || 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="status-center" style={{ border: '1px dashed #eaddcc', borderRadius: '8px', background: '#fdfaf5' }}>
                <FileSpreadsheet size={32} style={{ opacity: 0.3, color: '#8a683e', marginBottom: '0.5rem' }} />
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#2a1a0f' }}>No Worksheet Active</div>
                <div style={{ fontSize: '0.8rem', color: '#a68b72', marginTop: '0.2rem' }}>
                  Upload an Excel worksheet matching your structures. Row changes on pre-existing IDs will execute updates, while unique IDs cleanly expand your table data without duplicate collisions.
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {snackbar.show && (
        <div className="toast-snackbar">
          <CheckCircle size={18} style={{ color: '#34d399' }} />
          <span>{snackbar.message}</span>
        </div>
      )}
    </div>
  );
}