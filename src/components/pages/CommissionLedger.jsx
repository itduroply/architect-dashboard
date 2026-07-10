import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supbase'; // Adjust path based on your setup

import './CommissionLedger.css';

const MONTH_NAMES = {
  '01': 'January', '02': 'February', '03': 'March', '04': 'April',
  '05': 'May', '06': 'June', '07': 'July', '08': 'August',
  '09': 'September', '10': 'October', '11': 'November', '12': 'December'
};

export default function CommissionLedger() {
  const [ledgerData, setLedgerData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter States
  const [selectedArchitect, setSelectedArchitect] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedState, setSelectedState] = useState(''); // Added State Filter
  
  // Unique Options lists extracted from full records
  const [uniqueArchitects, setUniqueArchitects] = useState([]);
  const [uniqueStates, setUniqueStates] = useState([]); // Added Unique States List
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 40;

  useEffect(() => {
    fetchLedgerData();
  }, []);

  const fetchLedgerData = async () => {
    try {
      setLoading(true);
      // Included 'state' column explicitly in the Supabase projection
      const { data, error } = await supabase
        .from('commission_ledger')
        .select('architect_name, claim_no, lead_id, product_sku, total_eligible_sheets, claim_date, lead_status, state')
        .order('claim_date', { ascending: false });

      if (error) throw error;

      setLedgerData(data || []);

      // Extract unique list of architects and drop blank/null entries
      const archs = data
        .map(item => item.architect_name)
        .filter((name, index, self) => name && self.indexOf(name) === index)
        .sort();
      setUniqueArchitects(archs);

      // Extract unique list of geographic states and drop blank/null entries
      const statesList = data
        .map(item => item.state)
        .filter((stateName, index, self) => stateName && self.indexOf(stateName) === index)
        .sort();
      setUniqueStates(statesList);

    } catch (err) {
      console.error("Error loading master commission ledger record entries:", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper logic to isolate the numeric month string from "YYYY-MM-DD..." format
  const extractMonthToken = (dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('-');
    return parts.length >= 2 ? parts[1] : null;
  };

  // Reset page position to 1 when filters are altered
  const handleFilterChange = (filterSetter, value) => {
    filterSetter(value);
    setCurrentPage(1);
  };

  // Evaluate Multi-Criteria Combinational Filters
  const filteredRecords = ledgerData.filter(row => {
    const matchArchitect = !selectedArchitect || row.architect_name === selectedArchitect;
    
    const cleanRowStatus = (row.lead_status || '').toString().trim().toUpperCase();
    const matchStatus = !selectedStatus || cleanRowStatus === selectedStatus.toUpperCase();
    
    const monthToken = extractMonthToken(row.claim_date);
    const matchMonth = !selectedMonth || monthToken === selectedMonth;

    // Condition mapping for the new geographic state filter
    const matchState = !selectedState || row.state === selectedState;

    return matchArchitect && matchStatus && matchMonth && matchState;
  });

  // Handler to export whatever dataset matches the currently selected criteria
  const handleExportToExcel = () => {
    if (filteredRecords.length === 0) return;

    // 1. Define Column Headers matching your UI layout
    const headers = ['Claim ID', 'Architect Reference', 'State', 'Lead Reference ID', 'Product SKU', 'Sheets Vol.', 'Claim Date', 'Pipeline Status'];
    
    // 2. Map dataset rows into formatted arrays
    const csvRows = filteredRecords.map(row => [
      `"${row.claim_no || ''}"`,
      `"${row.architect_name || 'Unmapped / Unknown'}"`,
      `"${row.state || 'N/A'}"`,
      `"${row.lead_id || ''}"`,
      `"${row.product_sku || ''}"`,
      row.total_eligible_sheets || 0,
      `"${row.claim_date ? row.claim_date.split('T')[0] : 'N/A'}"`,
      `"${row.lead_status || 'Unknown'}"`
    ]);

    // Combine headers and structured data using standard newline breaks
    const csvContent = [headers.join(','), ...csvRows.map(e => e.join(','))].join('\n');
    
    // Create safe download blob to open directly within spreadsheet viewers
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Dynamically update the output file naming configuration string
    const monthLabel = selectedMonth ? `_${MONTH_NAMES[selectedMonth]}` : '_All_Months';
    const stateLabel = selectedState ? `_${selectedState.replace(/\s+/g, '_')}` : '_All_States';
    
    link.setAttribute('href', url);
    link.setAttribute('download', `Commission_Ledger_Report${monthLabel}${stateLabel}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Slice Segment Calculations for Pagination Array Layouts (40 rows per window segment)
  const totalRecordsCount = filteredRecords.length;
  const totalPagesCount = Math.ceil(totalRecordsCount / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentPagedRows = filteredRecords.slice(startIndex, endIndex);

  return (
    <div className="ledger-container">
      <header className="ledger-header">
        <h1>Commission Settlement Ledger</h1>
        <p>Analyze performance metrics, filter pipelines, and check synchronized operational statements.</p>
      </header>

      {/* Filter Management Section */}
      <section className="filter-card">
        <div className="filter-grid">
          {/* Architect Filter Dropdown */}
          <div className="filter-group">
            <label htmlFor="architect-select">Filter by Architect</label>
            <select 
              id="architect-select"
              className="filter-select"
              value={selectedArchitect}
              onChange={(e) => handleFilterChange(setSelectedArchitect, e.target.value)}
            >
              <option value="">All Dynamic Architects</option>
              {uniqueArchitects.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* State Filter Dropdown */}
          <div className="filter-group">
            <label htmlFor="state-select">Filter by Region / State</label>
            <select 
              id="state-select"
              className="filter-select"
              value={selectedState}
              onChange={(e) => handleFilterChange(setSelectedState, e.target.value)}
            >
              <option value="">All Operational States</option>
              {uniqueStates.map(stateName => (
                <option key={stateName} value={stateName}>{stateName}</option>
              ))}
            </select>
          </div>

          {/* Lead Status Dropdown - Preserved structural filter layout exactly */}
          <div className="filter-group">
            <label htmlFor="status-select">Lead Status Pipeline</label>
            <select 
              id="status-select"
              className="filter-select"
              value={selectedStatus}
              onChange={(e) => handleFilterChange(setSelectedStatus, e.target.value)}
            >
              <option value="">All Status Enclosures</option>
              <option value="Cold">Cold</option>
              <option value="Won">Won</option>
              <option value="Hot">Hot</option>
              <option value="Warm">Warm</option>
            </select>
          </div>

          {/* Month Dropdown Parsing Extract Segment */}
          <div className="filter-group">
            <label htmlFor="month-select">Statement Settlement Month</label>
            <select 
              id="month-select"
              className="filter-select"
              value={selectedMonth}
              onChange={(e) => handleFilterChange(setSelectedMonth, e.target.value)}
            >
              <option value="">All Calendar Months</option>
              {Object.entries(MONTH_NAMES).map(([token, name]) => (
                <option key={token} value={token}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Panel Layout with dynamic inline styles */}
        <div className="export-action-container" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleExportToExcel}
            className="btn-download"
            disabled={filteredRecords.length === 0}
            style={{
              padding: '0.6rem 1.2rem',
              backgroundColor: filteredRecords.length > 0 ? '#107c41' : '#a0a0a0',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: '600',
              cursor: filteredRecords.length > 0 ? 'pointer' : 'not-allowed',
              opacity: filteredRecords.length > 0 ? 1 : 0.6
            }}
          >
            Download Excel Report
          </button>
        </div>
      </section>

      {/* Data Visualization Grid Window Container */}
      <div className="table-container">
        {loading ? (
          <div className="status-message">Pulling latest records securely from database storage clusters...</div>
        ) : currentPagedRows.length === 0 ? (
          <div className="status-message">No transaction ledger matches discovered matching this filtering criteria.</div>
        ) : (
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Claim ID</th>
                <th>Architect Reference</th>
                <th>State</th>
                <th>Lead Reference ID</th>
                <th>Product SKU</th>
                <th>Sheets Vol.</th>
                <th>Claim Date</th>
                <th>Pipeline Status</th>
              </tr>
            </thead>
            <tbody>
              {currentPagedRows.map((row) => {
                const displayStatus = row.lead_status ? row.lead_status.toString().trim() : 'Unknown';
                const badgeClass = `badge ${displayStatus.toLowerCase()}`;
                const simpleDate = row.claim_date ? row.claim_date.split('T')[0] : 'N/A';

                return (
                  <tr key={row.claim_no}>
                    <td style={{ fontWeight: '600' }}>{row.claim_no}</td>
                    <td>{row.architect_name || 'Unmapped / Unknown'}</td>
                    <td>{row.state || 'N/A'}</td>
                    <td>{row.lead_id}</td>
                    <td><code>{row.product_sku}</code></td>
                    <td>{parseFloat(row.total_eligible_sheets || 0).toLocaleString()}</td>
                    <td>{simpleDate}</td>
                    <td>
                      <span className={badgeClass}>{displayStatus}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Command Footer Block Elements */}
      {!loading && totalRecordsCount > 0 && (
        <footer className="pagination-container">
          <div className="pagination-info">
            Showing <b>{startIndex + 1}</b> to <b>{Math.min(endIndex, totalRecordsCount)}</b> of <b>{totalRecordsCount}</b> processed rows
          </div>
          <div className="pagination-buttons">
            <button 
              className="btn-pagination"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            >
              Previous
            </button>
            
            {Array.from({ length: totalPagesCount }, (_, idx) => idx + 1).map(pageNum => (
              <button
                key={pageNum}
                className={`btn-pagination ${currentPage === pageNum ? 'active' : ''}`}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            ))}

            <button 
              className="btn-pagination"
              disabled={currentPage === totalPagesCount}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPagesCount))}
            >
              Next
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}