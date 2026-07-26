import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Box,
  Package,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  CheckSquare,
  Eye,
  ListFilter,
  Check,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supbase'; // Adjust path if needed

export default function ProductEligibilityPage() {
  // Main Tab State: 'make-eligible' | 'see-eligibility'
  const [activeTab, setActiveTab] = useState('make-eligible');

  // Common Data States
  const [allMasterSkus, setAllMasterSkus] = useState([]);
  const [productNames, setProductNames] = useState([]);
  const [architectNames, setArchitectNames] = useState([]);

  // Tab 1 States: Make Product Eligible
  const [selectedArchitect, setSelectedArchitect] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [matchingLedgerItems, setMatchingLedgerItems] = useState([]);
  const [checkedSkus, setCheckedSkus] = useState([]);

  // Tab 2 States: See Architect Eligibility
  const [viewArchitect, setViewArchitect] = useState('');
  const [architectLedgerItems, setArchitectLedgerItems] = useState([]);
  const [eligibilitySubTab, setEligibilitySubTab] = useState('all'); // 'all' | 'eligible' | 'pending'
  const [loadingArchitectLedger, setLoadingArchitectLedger] = useState(false);

  // Loading & Saving States
  const [loadingMaster, setLoadingMaster] = useState(true);
  const [loadingArchitects, setLoadingArchitects] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  // Extract base product name from SKU (e.g., decorative-DUROTEAK-ALLTHICKNESS -> DUROTEAK)
  const extractProductName = (sku) => {
    if (!sku) return '';
    const parts = String(sku).trim().split('-');
    if (parts.length >= 3) {
      return parts.slice(1, -1).join('-').trim();
    } else if (parts.length === 2) {
      return parts[1].trim();
    }
    return sku.trim();
  };

  // Normalizes strings: removes hyphens (-), underscores (_), spaces ( ), and converts to uppercase
  const normalizeSku = (str) => {
    if (!str) return '';
    return String(str).toUpperCase().replace(/[-_\s]/g, '');
  };

  // --- 1. Fetch SKUs from product_sku_master ---
  useEffect(() => {
    const fetchMasterSkus = async () => {
      try {
        setLoadingMaster(true);
        const { data, error } = await supabase
          .from('product_sku_master')
          .select('sku');

        if (error) throw error;

        if (data) {
          const rawSkus = data.map((row) => row.sku).filter(Boolean);
          setAllMasterSkus(rawSkus);

          const extractedNames = rawSkus
            .map((sku) => extractProductName(sku))
            .filter((name) => name && name.trim() !== '');

          const uniqueNames = [...new Set(extractedNames)].sort((a, b) =>
            a.localeCompare(b)
          );

          setProductNames(uniqueNames);
        }
      } catch (err) {
        console.error('Error fetching master SKUs:', err);
      } finally {
        setLoadingMaster(false);
      }
    };

    fetchMasterSkus();
  }, []);

  // --- 2. Fetch Unique Architect Names from commission_ledger ---
  useEffect(() => {
    const fetchArchitects = async () => {
      try {
        setLoadingArchitects(true);
        const { data, error } = await supabase
          .from('commission_ledger')
          .select('architect_name');

        if (error) throw error;

        if (data) {
          const names = data
            .map((row) => row.architect_name)
            .filter((name) => name && name.trim() !== '');

          const uniqueArchitects = [...new Set(names)].sort((a, b) =>
            a.localeCompare(b)
          );

          setArchitectNames(uniqueArchitects);
        }
      } catch (err) {
        console.error('Error fetching architect names:', err);
      } finally {
        setLoadingArchitects(false);
      }
    };

    fetchArchitects();
  }, []);

  // --- 3. [TAB 1] Substring matching using Normalized Product Name against Ledger SKUs ---
  useEffect(() => {
    const fetchAndMatchLedgerRows = async () => {
      if (!selectedArchitect || !selectedProductName) {
        setMatchingLedgerItems([]);
        setCheckedSkus([]);
        return;
      }

      try {
        setLoadingLedger(true);
        setStatusMessage({ type: '', text: '' });

        const normalizedTargetProduct = normalizeSku(selectedProductName);

        const { data, error } = await supabase
          .from('commission_ledger')
          .select('product_sku, product_status_eligibility')
          .eq('architect_name', selectedArchitect);

        if (error) throw error;

        if (data) {
          const matched = data.filter((row) => {
            const normalizedLedgerSku = normalizeSku(row.product_sku);
            return (
              normalizedLedgerSku.length > 0 &&
              normalizedLedgerSku.includes(normalizedTargetProduct)
            );
          });

          setMatchingLedgerItems(matched);

          // By default, check all unique matching product SKUs
          const uniqueMatchedSkus = [
            ...new Set(matched.map((item) => item.product_sku)),
          ];
          setCheckedSkus(uniqueMatchedSkus);
        }
      } catch (err) {
        console.error('Error matching ledger SKUs:', err);
      } finally {
        setLoadingLedger(false);
      }
    };

    fetchAndMatchLedgerRows();
  }, [selectedArchitect, selectedProductName]);

  // --- 4. [TAB 2] Fetch All SKUs for Selected Architect in "See Architect Eligibility" ---
  useEffect(() => {
    const fetchArchitectOverview = async () => {
      if (!viewArchitect) {
        setArchitectLedgerItems([]);
        return;
      }

      try {
        setLoadingArchitectLedger(true);
        const { data, error } = await supabase
          .from('commission_ledger')
          .select('product_sku, product_status_eligibility')
          .eq('architect_name', viewArchitect);

        if (error) throw error;

        if (data) {
          setArchitectLedgerItems(data);
        }
      } catch (err) {
        console.error('Error fetching architect overview:', err);
      } finally {
        setLoadingArchitectLedger(false);
      }
    };

    fetchArchitectOverview();
  }, [viewArchitect]);

  // [TAB 1] Deduplicate matching ledger items for Tab 1 UI
  const uniqueLedgerItems = useMemo(() => {
    const map = new Map();
    matchingLedgerItems.forEach((item) => {
      if (!map.has(item.product_sku)) {
        map.set(item.product_sku, item);
      } else if (item.product_status_eligibility === 'eligible') {
        map.set(item.product_sku, item);
      }
    });
    return Array.from(map.values());
  }, [matchingLedgerItems]);

  // [TAB 2] Process & Deduplicate SKUs for Tab 2 Architect Viewer
  const uniqueArchitectProducts = useMemo(() => {
    const map = new Map();
    architectLedgerItems.forEach((item) => {
      const sku = item.product_sku;
      if (!sku) return;
      const isEligible = item.product_status_eligibility === 'eligible';

      if (!map.has(sku)) {
        map.set(sku, {
          product_sku: sku,
          status: isEligible ? 'eligible' : 'pending',
        });
      } else {
        if (isEligible) {
          map.get(sku).status = 'eligible';
        }
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.product_sku.localeCompare(b.product_sku)
    );
  }, [architectLedgerItems]);

  // [TAB 2] Filter products based on Sub-Tabs (All / Eligible / Pending)
  const filteredArchitectProducts = useMemo(() => {
    if (eligibilitySubTab === 'eligible') {
      return uniqueArchitectProducts.filter((p) => p.status === 'eligible');
    }
    if (eligibilitySubTab === 'pending') {
      return uniqueArchitectProducts.filter((p) => p.status !== 'eligible');
    }
    return uniqueArchitectProducts;
  }, [uniqueArchitectProducts, eligibilitySubTab]);

  // Tab 1: Checkbox handlers
  const handleToggleSku = (sku) => {
    setCheckedSkus((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]
    );
  };

  const handleToggleSelectAll = (e) => {
    if (e.target.checked) {
      const allSkus = uniqueLedgerItems.map((item) => item.product_sku);
      setCheckedSkus(allSkus);
    } else {
      setCheckedSkus([]);
    }
  };

  // Tab 1: Action Options
  const handleMakeSelectedEligible = async () => {
    if (!selectedArchitect || checkedSkus.length === 0) return;

    try {
      setIsSaving(true);
      setStatusMessage({ type: '', text: '' });

      const { error } = await supabase
        .from('commission_ledger')
        .update({ product_status_eligibility: 'eligible' })
        .eq('architect_name', selectedArchitect)
        .in('product_sku', checkedSkus);

      if (error) throw error;

      setMatchingLedgerItems((prev) =>
        prev.map((item) =>
          checkedSkus.includes(item.product_sku)
            ? { ...item, product_status_eligibility: 'eligible' }
            : item
        )
      );

      setStatusMessage({
        type: 'success',
        text: `Successfully updated selected product SKU(s) to Eligible for ${selectedArchitect}!`,
      });
    } catch (err) {
      console.error('Error updating eligibility:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to update eligibility status.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMakeAllEligible = async () => {
    if (!selectedArchitect || matchingLedgerItems.length === 0) return;

    try {
      setIsSaving(true);
      setStatusMessage({ type: '', text: '' });

      const allSkus = uniqueLedgerItems.map((item) => item.product_sku);

      const { error } = await supabase
        .from('commission_ledger')
        .update({ product_status_eligibility: 'eligible' })
        .eq('architect_name', selectedArchitect)
        .in('product_sku', allSkus);

      if (error) throw error;

      setCheckedSkus(allSkus);
      setMatchingLedgerItems((prev) =>
        prev.map((item) => ({
          ...item,
          product_status_eligibility: 'eligible',
        }))
      );

      setStatusMessage({
        type: 'success',
        text: `Successfully updated ALL matched product SKU(s) to Eligible for ${selectedArchitect}!`,
      });
    } catch (err) {
      console.error('Error updating eligibility:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to update eligibility status.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isInitialLoading = loadingMaster || loadingArchitects;
  const isAllChecked =
    uniqueLedgerItems.length > 0 &&
    checkedSkus.length === uniqueLedgerItems.length;

  // Counts for Tab 2 Sub-tabs
  const countEligible = uniqueArchitectProducts.filter(
    (p) => p.status === 'eligible'
  ).length;
  const countPending = uniqueArchitectProducts.filter(
    (p) => p.status !== 'eligible'
  ).length;

  return (
    <div className="eligibility-page-container">
      <style>{`
        .eligibility-page-container { min-height: 100vh; width: 120%; flex: 1; background-color: #faf6f0; display: flex; justify-content: center; align-items: flex-start; padding: 3rem 2rem; box-sizing: border-box;margin-left: 4%; }
        .eligibility-card { background: #ffffff; border: 1px solid #eee4da; border-radius: 16px; width: 100%; max-width: 820px; margin: 0 auto; padding: 2.5rem; box-shadow: 0 10px 30px rgba(60, 40, 25, 0.04); box-sizing: border-box; }
        
        .header-section { margin-bottom: 1.5rem; padding-bottom: 1.25rem; border-bottom: 1px solid #f3ece4; }
        .header-section h1 { font-size: 1.65rem; font-weight: 700; color: #2a1f18; margin: 0 0 0.4rem 0; display: flex; align-items: center; gap: 0.5rem; }
        .header-section p { font-size: 0.9rem; color: #8c786a; margin: 0; }

        /* MAIN NAVIGATION TABS */
        .main-tabs { display: flex; gap: 0.5rem; border-bottom: 2px solid #f0e8df; margin-bottom: 1.75rem; }
        .tab-btn { background: transparent; border: none; padding: 0.8rem 1.2rem; font-size: 0.95rem; font-weight: 600; color: #8c786a; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: all 0.2s ease; }
        .tab-btn:hover { color: #2a1f18; }
        .tab-btn.active { color: #2d5a3e; border-bottom-color: #2d5a3e; }

        /* SUB TABS FOR ARCHITECT VIEWER */
        .sub-tab-bar { display: flex; gap: 0.5rem; background: #fdfcf9; padding: 0.4rem; border-radius: 10px; border: 1px solid #f0e8df; margin-bottom: 1rem; }
        .sub-tab-btn { flex: 1; border: none; background: transparent; padding: 0.55rem; font-size: 0.85rem; font-weight: 600; color: #705846; border-radius: 6px; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; justify-content: center; gap: 0.4rem; }
        .sub-tab-btn:hover { background: #f7f1eb; }
        .sub-tab-btn.active { background: #ffffff; color: #2a1f18; box-shadow: 0 2px 6px rgba(0,0,0,0.06); }

        .field-group { display: flex; flex-direction: column; gap: 1.5rem; }
        .field-card { background: #fdfcf9; border: 1px solid #f0e8df; border-radius: 12px; padding: 1.5rem; }
        .field-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .field-label { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9e8a7c; }

        .input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .input-wrapper { display: flex; align-items: center; gap: 0.75rem; background: #ffffff; border: 1px solid #e2d7cc; border-radius: 10px; padding: 0.65rem 0.85rem; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .input-wrapper:focus-within { border-color: #705846; box-shadow: 0 0 0 3px rgba(112, 88, 70, 0.1); }
        .name-select { border: none; outline: none; width: 100%; font-size: 0.92rem; font-weight: 500; color: #2a1f18; background: transparent; cursor: pointer; }

        .select-all-bar { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 600; color: #705846; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px dashed #e2d7cc; }
        .products-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; max-height: 280px; overflow-y: auto; }
        .product-item { display: flex; align-items: center; justify-content: space-between; background: #ffffff; border: 1px solid #e2d7cc; padding: 0.85rem 1rem; border-radius: 8px; transition: background 0.15s ease; }
        .product-item.selected { background-color: #faf5f0; border-color: #c8b9ab; }
        .product-left { display: flex; align-items: center; gap: 0.85rem; }
        .product-info { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; color: #2a1f18; font-weight: 600; font-family: monospace; }

        .custom-checkbox { width: 18px; height: 18px; accent-color: #2d5a3e; cursor: pointer; }

        .status-badge { font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.65rem; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 0.3rem; }
        .status-badge.eligible { background-color: #c6f6d5; color: #22543d; }
        .status-badge.pending { background-color: #f3ece4; color: #705846; }

        .action-button-group { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem; }
        .btn-action { border: none; padding: 0.9rem; border-radius: 10px; font-size: 0.9rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: background-color 0.2s ease, opacity 0.2s ease; }
        .btn-primary { background-color: #2d5a3e; color: #ffffff; }
        .btn-primary:hover:not(:disabled) { background-color: #21442e; }
        .btn-secondary { background-color: #705846; color: #ffffff; }
        .btn-secondary:hover:not(:disabled) { background-color: #534133; }
        .btn-action:disabled { opacity: 0.55; cursor: not-allowed; }

        .status-banner { padding: 0.85rem 1rem; border-radius: 8px; font-size: 0.88rem; font-weight: 500; display: flex; align-items: center; gap: 0.5rem; }
        .status-banner.error { background-color: #fdf2f2; border: 1px solid #f8cece; color: #9b2c2c; }
        .status-banner.success { background-color: #f0fff4; border: 1px solid #c6f6d5; color: #22543d; }

        .info-note { font-size: 0.85rem; color: #8c786a; background: #f7f1eb; padding: 0.85rem 1rem; border-radius: 8px; border-left: 3px solid #705846; margin: 0; }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>

      <div className="eligibility-card">
        {/* PAGE HEADER */}
        <header className="header-section">
          <h1>
            Product Eligibility Manager (
            {isInitialLoading ? '...' : allMasterSkus.length})
          </h1>
          <p>
            Manage commission eligibility status and audit architect catalog permissions.
          </p>
        </header>

        {/* MAIN TABS */}
        <nav className="main-tabs">
          <button
            className={`tab-btn ${
              activeTab === 'make-eligible' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('make-eligible')}
          >
            <ShieldCheck size={18} /> Make Product Eligible
          </button>
          <button
            className={`tab-btn ${
              activeTab === 'see-eligibility' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('see-eligibility')}
          >
            <Eye size={18} /> See Architect Eligibility
          </button>
        </nav>

        {/* ================= TAB 1: MAKE PRODUCT ELIGIBLE ================= */}
        {activeTab === 'make-eligible' && (
          <div className="field-group">
            {statusMessage.text && (
              <div className={`status-banner ${statusMessage.type}`}>
                {statusMessage.type === 'success' && <CheckCircle2 size={18} />}
                {statusMessage.text}
              </div>
            )}

            {/* SELECTION GRID */}
            <div className="field-card">
              <div className="field-header">
                <span className="field-label">Target Selection</span>
              </div>

              {isInitialLoading ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: '#8c786a',
                    fontSize: '0.9rem',
                  }}
                >
                  <Loader2 size={18} className="animate-spin" /> Loading setup parameters...
                </div>
              ) : (
                <div className="input-grid">
                  {/* ARCHITECT DROPDOWN */}
                  <div className="input-wrapper">
                    <User size={18} style={{ color: '#705846', flexShrink: 0 }} />
                    <select
                      className="name-select"
                      value={selectedArchitect}
                      onChange={(e) => setSelectedArchitect(e.target.value)}
                      disabled={isSaving}
                    >
                      <option value="" disabled>Select Architect...</option>
                      {architectNames.map((arch, i) => (
                        <option key={`arch-t1-${i}`} value={arch}>
                          {arch}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* PRODUCT NAME DROPDOWN */}
                  <div className="input-wrapper">
                    <Box size={18} style={{ color: '#705846', flexShrink: 0 }} />
                    <select
                      className="name-select"
                      value={selectedProductName}
                      onChange={(e) => setSelectedProductName(e.target.value)}
                      disabled={isSaving}
                    >
                      <option value="" disabled>Select Product Name...</option>
                      {productNames.map((name, i) => (
                        <option key={`prod-t1-${i}`} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* MATCHING RESULTS WITH CHECKBOXES */}
            {selectedArchitect && selectedProductName && (
              <div className="field-card">
                <div className="field-header">
                  <span className="field-label">Matching Ledger Products</span>
                </div>

                {loadingLedger ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      color: '#8c786a',
                      fontSize: '0.9rem',
                    }}
                  >
                    <Loader2 size={16} className="animate-spin" /> Matching ledger SKUs...
                  </div>
                ) : uniqueLedgerItems.length > 0 ? (
                  <>
                    <div className="select-all-bar">
                      <input
                        type="checkbox"
                        className="custom-checkbox"
                        checked={isAllChecked}
                        onChange={handleToggleSelectAll}
                        disabled={isSaving}
                      />
                      <span>Select All Matching Products</span>
                    </div>

                    <ul className="products-list">
                      {uniqueLedgerItems.map((item, index) => {
                        const isChecked = checkedSkus.includes(item.product_sku);
                        return (
                          <li
                            key={`ledger-t1-${index}`}
                            className={`product-item ${isChecked ? 'selected' : ''}`}
                          >
                            <div className="product-left">
                              <input
                                type="checkbox"
                                className="custom-checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleSku(item.product_sku)}
                                disabled={isSaving}
                              />
                              <div className="product-info">
                                <Package size={16} color="#9e8a7c" />
                                {item.product_sku || 'Unknown SKU'}
                              </div>
                            </div>
                            <span
                              className={`status-badge ${
                                item.product_status_eligibility === 'eligible'
                                  ? 'eligible'
                                  : 'pending'
                              }`}
                            >
                              {item.product_status_eligibility || 'Pending'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <p style={{ margin: 0, color: '#8c786a', fontSize: '0.9rem' }}>
                    No matching SKUs found in <code>commission_ledger</code> for{' '}
                    <strong>{selectedArchitect}</strong> under product line{' '}
                    <strong>{selectedProductName}</strong>.
                  </p>
                )}
              </div>
            )}

            <p className="info-note">
              Select individual checkboxes or click <strong>Make All Eligible</strong> to convert all matching records simultaneously.
            </p>

            <div className="action-button-group">
              <button
                className="btn-action btn-primary"
                onClick={handleMakeSelectedEligible}
                disabled={
                  isSaving ||
                  !selectedArchitect ||
                  !selectedProductName ||
                  checkedSkus.length === 0
                }
              >
                {isSaving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <CheckSquare size={18} />
                )}
                Make Selected Eligible
              </button>

              <button
                className="btn-action btn-secondary"
                onClick={handleMakeAllEligible}
                disabled={
                  isSaving ||
                  !selectedArchitect ||
                  !selectedProductName ||
                  matchingLedgerItems.length === 0
                }
              >
                {isSaving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <ShieldCheck size={18} />
                )}
                Make All Eligible
              </button>
            </div>
          </div>
        )}

        {/* ================= TAB 2: SEE ARCHITECT ELIGIBILITY ================= */}
        {activeTab === 'see-eligibility' && (
          <div className="field-group">
            <div className="field-card">
              <div className="field-header">
                <span className="field-label">Select Architect to Audit</span>
              </div>

              <div className="input-wrapper" style={{ maxWidth: '380px' }}>
                <User size={18} style={{ color: '#705846', flexShrink: 0 }} />
                <select
                  className="name-select"
                  value={viewArchitect}
                  onChange={(e) => setViewArchitect(e.target.value)}
                >
                  <option value="" disabled>Select Architect...</option>
                  {architectNames.map((arch, i) => (
                    <option key={`arch-t2-${i}`} value={arch}>
                      {arch}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {viewArchitect && (
              <div className="field-card">
                <div className="field-header">
                  <span className="field-label">
                    Products for {viewArchitect}
                  </span>
                </div>

                {/* SUB TABS FILTER */}
                <div className="sub-tab-bar">
                  <button
                    className={`sub-tab-btn ${
                      eligibilitySubTab === 'all' ? 'active' : ''
                    }`}
                    onClick={() => setEligibilitySubTab('all')}
                  >
                    <ListFilter size={15} /> All ({uniqueArchitectProducts.length})
                  </button>
                  <button
                    className={`sub-tab-btn ${
                      eligibilitySubTab === 'eligible' ? 'active' : ''
                    }`}
                    onClick={() => setEligibilitySubTab('eligible')}
                  >
                    <Check size={15} color="#22543d" /> Eligible ({countEligible})
                  </button>
                  <button
                    className={`sub-tab-btn ${
                      eligibilitySubTab === 'pending' ? 'active' : ''
                    }`}
                    onClick={() => setEligibilitySubTab('pending')}
                  >
                    <XCircle size={15} color="#705846" /> Not Eligible ({countPending})
                  </button>
                </div>

                {/* PRODUCT LIST VIEW */}
                {loadingArchitectLedger ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      color: '#8c786a',
                      fontSize: '0.9rem',
                    }}
                  >
                    <Loader2 size={16} className="animate-spin" /> Loading architect products...
                  </div>
                ) : filteredArchitectProducts.length > 0 ? (
                  <ul className="products-list">
                    {filteredArchitectProducts.map((item, index) => (
                      <li key={`ledger-t2-${index}`} className="product-item">
                        <div className="product-info">
                          <Package size={16} color="#9e8a7c" />
                          {item.product_sku}
                        </div>
                        <span
                          className={`status-badge ${
                            item.status === 'eligible' ? 'eligible' : 'pending'
                          }`}
                        >
                          {item.status === 'eligible' ? 'Eligible' : 'Not Eligible'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: '#8c786a', fontSize: '0.9rem' }}>
                    No products found under filter "<strong>{eligibilitySubTab}</strong>" for{' '}
                    <strong>{viewArchitect}</strong>.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}