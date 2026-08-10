import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supbase'; 
import * as XLSX from 'xlsx';

const ArchitectAccounts = () => {
  const location = useLocation();

  // Filters state management
  const [filters, setFilters] = useState({
    search: '',
    tier: '', 
    eligibility: '',
    status: '',
    pencilOnly: false,
    state: '',
  });

  // Operational state flags
  const [loading, setLoading] = useState(true);
  const [rawLedgerData, setRawLedgerData] = useState([]);
  const [rawRemittanceData, setRawRemittanceData] = useState([]);
  const [architectsList, setArchitectsList] = useState([]);
  const [decorativeMasterList, setDecorativeMasterList] = useState([]);

  // Conversion Percentage Tab State ('7%' for standard, '10%' for Exception)
  const [conversionTab, setConversionTab] = useState('7%');

  // Custom React Modal Confirmation State
  const [modal, setModal] = useState({ show: false, targetStatus: null, displayLabel: '' });

  // Architect Details Summary Modal State
  const [detailsModal, setDetailsModal] = useState({
    show: false,
    loading: false,
    architectName: '',
    summaryData: {} 
  });

  // SKU Transfer State (Nature's Signature to Other Decorative)
  const [transferState, setTransferState] = useState({
    show: false,
    loading: false,
    sourceSku: '',
    maxQty: 0,
    targetSku: '',
    transferQty: '',
  });

  // Searchable Dropdown State for Target SKU
  const [targetSkuSearch, setTargetSkuSearch] = useState('');
  const [targetDropdownOpen, setTargetDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Floating Notification Snackbar State
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setTargetDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helper utility to fire notifications
  const showToast = (message, type = 'info', autoDismiss = true) => {
    setToast({ show: true, message, type });
    if (autoDismiss && type !== 'loading') {
      setTimeout(() => {
        setToast((prev) => ({ ...prev, show: false }));
      }, 3000);
    }
  };

  // Local eligibility memory cache
  const [eligibilityMap, setEligibilityMap] = useState(() => {
    const saved = localStorage.getItem('architect_eligibility_registry_v2');
    return saved ? JSON.parse(saved) : {};
  });

  // Helper utility to safely parse out unique ID
  const extractArchitectId = (fullName) => {
    if (!fullName) return 'UNKNOWN';
    const str = String(fullName);
    return str.includes('|') ? str.split('|')[0].trim() : str.trim();
  };

  // Keep the full value for ledger lookups, but show only the architect's name in the table.
  const getArchitectDisplayName = (fullName) => {
    if (!fullName) return 'Unmapped Architect';

    let nameWithDetails = String(fullName).split('|').pop().trim();
    nameWithDetails = nameWithDetails
      .replace(/^(?:ar\.?|architect)\s+/i, '')
      .replace(/\s*@\s*architect\b/ig, '')
      .split(/\s+-\s+/)[0]
      .trim();

    const repeatedName = nameWithDetails.match(/^(.+?)\1$/i);
    if (repeatedName) nameWithDetails = repeatedName[1].trim();

    const onlyLetters = nameWithDetails.replace(/[^a-z]/ig, '');
    if (onlyLetters.length > 1 && onlyLetters === onlyLetters.toUpperCase()) {
      nameWithDetails = nameWithDetails.toLowerCase().replace(/(^|[\s.])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    }

    // Imported names are sometimes fully joined in lowercase (for example, "Rajusharma").
    nameWithDetails = nameWithDetails.replace(
      /\b([a-z]+?)(agarwal|bansal|bhatt|chopra|gupta|jain|kapoor|khanna|maddela|mali|mehta|murthy|nawal|patel|rathore|reddy|sharma|singh|verma)\b/ig,
      '$1 $2'
    );

    return nameWithDetails
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
      .replace(/\.(?=[A-Za-z])/g, '. ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/(^|[\s.])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`)
      .trim() || 'Unmapped Architect';
  };

  // Telemetry Logging Engine
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
      console.error("Telemetry error:", err.message);
    }
  };

  // Login Operator Detection
  const resolveOperatorName = async () => {
    let currentUserName = location.state?.userProfile?.name;
    if (!currentUserName) {
      currentUserName = localStorage.getItem('user_name');
    }

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

    return currentUserName || localStorage.getItem("user_role") || "Admin";
  };

  // Fetch Master Decorative Products
  const fetchMasterDecorativeProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('product_sku_master')
        .select('sku, size, price, percentage')
        .ilike('code', '%ecorative%');

      if (error) throw error;
      setDecorativeMasterList(data || []);
    } catch (err) {
      console.error("Failed to load decorative master list:", err.message);
    }
  };

  useEffect(() => {
    fetchMasterDecorativeProducts();
  }, []);

  // Helper to test if a product SKU item matches the active conversion tab percentage
  const matchesConversionTab = (item, tab) => {
    const percStr = String(item.percentage || '');
    const skuStr = (item.sku || '').toUpperCase();
    const sizeStr = (item.size || '').toUpperCase();

    if (tab === '10%') {
      return percStr.includes('10') || skuStr.includes('10%') || skuStr.includes('10 %') || sizeStr.includes('10%');
    } else {
      return percStr.includes('7') || skuStr.includes('7%') || skuStr.includes('7 %') || sizeStr.includes('7%') || (!percStr.includes('10') && !skuStr.includes('10%'));
    }
  };

  // Architect Detail Summary Fetch & Grouping
  const fetchArchitectSummary = async (architectName) => {
    setDetailsModal({ show: true, loading: true, architectName, summaryData: {} });

    try {
      const { data, error } = await supabase
        .from('commission_ledger')
        .select('product_sku, total_eligible_sheets')
        .eq('architect_name', architectName);
      if (error) throw error;

      const grouped = data.reduce((acc, row) => {
        const sku = row.product_sku || 'UNKNOWN';
        const sheetsCount = parseFloat(row.total_eligible_sheets || 0); 
        
        if (sheetsCount === 0) return acc;

        let category = 'Other';
        const upperSku = sku.toUpperCase();
        
        if (upperSku.startsWith('PW')) category = 'Plywood (PW)';
        else if (upperSku.startsWith('BB')) category = 'Blockboard (BB)';
        else if (upperSku.startsWith('FD')) category = 'Flush Door (FD)';
        else if (upperSku.includes('DEC') || upperSku.includes('DECORATIVE') || upperSku.includes('NATURES SIGNATURE') || upperSku.includes('NATURE SIGNATURE')) {
          category = 'Decorative';
        }

        if (!acc[category]) acc[category] = { categoryTotal: 0, skus: {} };

        acc[category].categoryTotal += sheetsCount;

        if (!acc[category].skus[sku]) {
          acc[category].skus[sku] = 0;
        }
        acc[category].skus[sku] += sheetsCount;

        return acc;
      }, {});

      setDetailsModal({ show: true, loading: false, architectName, summaryData: grouped });

    } catch (err) {
      console.error("Failed to fetch architect summary:", err.message);
      showToast(`❌ Failed to load details: ${err.message}`, 'error');
      setDetailsModal(prev => ({ ...prev, loading: false, show: false }));
    }
  };

 // Transfer Nature's Signature Logic with Percentage persistence
  const handleTransferSubmit = async () => {
    const qtyToTransfer = parseFloat(transferState.transferQty);
    if (!qtyToTransfer || qtyToTransfer <= 0) {
      return showToast("❌ Please enter a valid quantity.", "error");
    }
    if (qtyToTransfer > transferState.maxQty) {
      return showToast("❌ Please give correct quantity. Cannot exceed available sheets.", "error");
    }
    if (!transferState.targetSku) {
      return showToast("❌ Please select a target product.", "error");
    }

    setTransferState(prev => ({ ...prev, loading: true }));
    showToast("⏳ Processing database bifurcation...", "loading", false);

    try {
      const superNormalize = (sku) => {
        if (!sku) return '';
        let str = String(sku).toUpperCase();
        str = str.split('(')[0]; 
        str = str.replace(/ALLTHICKNESS/g, ''); 
        str = str.replace(/[^A-Z0-9]/g, ''); 
        return str;
      };

      const formatSkuForDB = (dropdownVal) => {
        let str = String(dropdownVal).toUpperCase().split('(')[0];
        str = str.replace(/ALLTHICKNESS/g, '').trim();
        str = str.replace(/^DECORATIVE-/, 'DECORATIVE_'); 
        str = str.replace(/-/g, ' ').trim(); 
        str = str.replace(/DUROTEAK/g, 'DURO TEAK'); 
        if (!str.endsWith('_')) str += '_'; 
        return str;
      };

      const sourceSkuNormalized = superNormalize(transferState.sourceSku);

      // Match target master product filtering by BOTH normalized SKU AND active conversion tab (10% vs 7%)
      const targetMasterProduct = decorativeMasterList.find(p => 
        superNormalize(p.sku) === superNormalize(transferState.targetSku) && matchesConversionTab(p, conversionTab)
      ) || decorativeMasterList.find(p => superNormalize(p.sku) === superNormalize(transferState.targetSku));

      // Extract target rate & percentage
      const targetRate = targetMasterProduct ? parseFloat(targetMasterProduct.price || 0) : 0;
      const targetPercentage = targetMasterProduct?.percentage || conversionTab; // e.g., '7%' or '10%'
      
      const exactTargetSku = formatSkuForDB(transferState.targetSku);

      const { data: allRows, error: fetchError } = await supabase
        .from('commission_ledger')
        .select('*')
        .eq('architect_name', detailsModal.architectName);

      if (fetchError) throw fetchError;

      const matchingRows = (allRows || []).filter(row =>
        superNormalize(row.product_sku) === sourceSkuNormalized
      );

      if (matchingRows.length === 0) {
        throw new Error("No matching source product SKU records found for this architect.");
      }

      const existingTargetRow = (allRows || []).find(row =>
        superNormalize(row.product_sku) === superNormalize(transferState.targetSku)
      );

      if (existingTargetRow) {
        const newTargetSheets = parseFloat(existingTargetRow.total_eligible_sheets || 0) + qtyToTransfer;
        const newTargetPayout = newTargetSheets * targetRate;

        // 1. UPDATE existing row in commission_ledger including percentage
        const { error: updateTargetErr } = await supabase
          .from('commission_ledger')
          .update({
            total_eligible_sheets: newTargetSheets,
            matrix_rate: targetRate,
            total_payout_amount: newTargetPayout,
            percentage: targetPercentage // 👈 Added percentage column update
          })
          .eq('architect_name', detailsModal.architectName)
          .eq('product_sku', existingTargetRow.product_sku); 

        if (updateTargetErr) throw updateTargetErr;
      } else {
        const templateRow = matchingRows[0];
        const rawClaimNo = templateRow.claim_no || "CLAIM";
        
        const claimParts = rawClaimNo.split('-');
        const rootClaimNo = claimParts[0]; 
        const currentSuffix = claimParts[1] || "1"; 
        
        let bifurcatedClaimNo = '';
        
        const isNaturesSig = /NATURE'?S?[\s_]*SIGNATURE/i.test(transferState.sourceSku || '');

        if (isNaturesSig) {
          const targetBasePattern = `${rootClaimNo}-${currentSuffix}-1`;
          
          const existingSubCount = (allRows || []).filter(row => 
            row.claim_no && row.claim_no.startsWith(targetBasePattern + '.')
          ).length;
          
          bifurcatedClaimNo = `${targetBasePattern}.${existingSubCount + 1}`;
        } else {
          const existingSuffixCount = (allRows || []).filter(row => 
            row.claim_no && row.claim_no.startsWith(rootClaimNo + '-')
          ).length;
          
          bifurcatedClaimNo = `${rootClaimNo}-${existingSuffixCount + 1}`;
        }

        const newTargetPayout = qtyToTransfer * targetRate;

        // 2. INSERT new row into commission_ledger including percentage
        const newRow = {
          ...templateRow, 
          claim_no: bifurcatedClaimNo, 
          product_sku: exactTargetSku, 
          total_eligible_sheets: qtyToTransfer,
          matrix_rate: targetRate,
          total_payout_amount: newTargetPayout,
          percentage: targetPercentage // 👈 Added percentage column insert
        };
        
        delete newRow.id; 
        delete newRow.created_at;
        delete newRow.transcation_timestamp;
        delete newRow.updated_at;

        const { error: insertTargetErr } = await supabase
          .from('commission_ledger')
          .insert([newRow]);

        if (insertTargetErr) throw insertTargetErr;
      }

      let remainingToDeduct = qtyToTransfer;

      for (const row of matchingRows) {
        if (remainingToDeduct <= 0) break;

        const currentSheets = parseFloat(row.total_eligible_sheets || 0);
        if (currentSheets <= 0) continue;

        const deduct = Math.min(currentSheets, remainingToDeduct);
        const newSheets = currentSheets - deduct;
        remainingToDeduct -= deduct;

        if (newSheets <= 0) {
          const { error: deleteErr } = await supabase
            .from('commission_ledger')
            .delete()
            .eq('architect_name', detailsModal.architectName)
            .eq('product_sku', row.product_sku)
            .eq('claim_no', row.claim_no);

          if (deleteErr) throw deleteErr;
        } else {
          const sourceRate = parseFloat(row.matrix_rate || 0);
          const newPayout = newSheets * sourceRate;

          const { error: updateSourceErr } = await supabase
            .from('commission_ledger')
            .update({
              total_eligible_sheets: newSheets,
              total_payout_amount: newPayout
            })
            .eq('architect_name', detailsModal.architectName)
            .eq('product_sku', row.product_sku)
            .eq('claim_no', row.claim_no);

          if (updateSourceErr) throw updateSourceErr;
        }
      }

      showToast(`✅ Successfully transferred ${qtyToTransfer} sheets with ${targetPercentage} commission!`, "success");
      setTransferState(prev => ({ ...prev, show: false, transferQty: '', targetSku: '', loading: false }));
      
      if (typeof fetchArchitectSummary === 'function') {
        await fetchArchitectSummary(detailsModal.architectName);
      }
      await fetchLedgerData();

    } catch (err) {
      console.error("Transfer failed:", err.message);
      showToast(`❌ Transfer Failed: ${err.message}`, "error");
      setTransferState(prev => ({ ...prev, loading: false }));
    }
  };

  const fetchLedgerData = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, remittanceRes] = await Promise.all([
        supabase.from('commission_ledger').select('*'),
        supabase.from('remittances').select('*')
      ]);

      if (ledgerRes.error) throw ledgerRes.error;
      if (remittanceRes.error) throw remittanceRes.error;
    
      const serverStatusMap = {};
      ledgerRes.data?.forEach(row => {
        const name = row.architect_name || row.architectName || '';
        const archId = extractArchitectId(name);
        const currentStatus = row.status || row.eligibilityStatus;

        if (currentStatus && archId) {
          serverStatusMap[archId] = currentStatus?.toLowerCase();
        }
      });
      
      setEligibilityMap(prev => {
        const merged = { ...prev, ...serverStatusMap };
        localStorage.setItem('architect_eligibility_registry_v2', JSON.stringify(merged));
        return merged;
      });

      setRawLedgerData(ledgerRes.data || []);
      setRawRemittanceData(remittanceRes.data || []);
    } catch (err) {
      console.error('Error compiling database rows from ledger datasets:', err.message);
      showToast(`❌ Database Fetch Error: ${err.message}`, 'error', false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLedgerData();
  }, [fetchLedgerData]);

  useEffect(() => {
    const aggregationMap = {};

    rawLedgerData.forEach((row) => {
      const rawName = row.architect_name || row.architectName || 'Unmapped Architect';
      const archId = extractArchitectId(rawName);
      
      const sheets = parseFloat(row.total_eligible_sheets || row.totalSheets || 0);
      const payout = parseFloat(row.total_payout_amount || row.payoutAmount || row.amount || 0);

      if (!aggregationMap[archId]) {
         aggregationMap[archId] = {
          uniqueKey: archId,
          architect_id: archId,
          architect_name: rawName, 
          state: row.state || 'Unknown',
          total_sheets: 0,
          raw_pool_payout: 0,
          credited_amount: 0, 
          hasNaturesSignature: false,
          associatedNames: new Set() 
        };
      }
  
      aggregationMap[archId].total_sheets += sheets;
      aggregationMap[archId].raw_pool_payout += payout;
      aggregationMap[archId].associatedNames.add(rawName);

      const upperSku = (row.product_sku || '').toUpperCase();
      if ((upperSku.includes('NATURES SIGNATURE') || upperSku.includes('NATURE SIGNATURE')) && sheets > 0) {
        aggregationMap[archId].hasNaturesSignature = true;
      }
    });

    rawRemittanceData.forEach((row) => {
      const rawName = row.architect_name || row.architectName || 'Unmapped Architect';
      const archId = extractArchitectId(rawName);
      const amount = parseFloat(row.amount || row.remittance_amount || row.total_payout_amount || 0);
      const rowStatus = row.status || '';

      if (aggregationMap[archId] && rowStatus?.toLowerCase() === 'paid') {
        aggregationMap[archId].credited_amount += amount;
      }
    });

    const compiledRows = Object.keys(aggregationMap).map((key) => {
      const record = aggregationMap[key];
      const isEligible = eligibilityMap[record.uniqueKey] !== 'ineligible';
      const actualPayoutAllowed = isEligible ? record.raw_pool_payout : 0;
      const calculatedOutstanding = Math.max(0, actualPayoutAllowed - record.credited_amount);

      return {
        ...record,
        isEligible,
        actualPayoutAllowed,
        balance_due: calculatedOutstanding,
      };
    });

    compiledRows.sort((a, b) => b.actualPayoutAllowed - a.actualPayoutAllowed);

    setArchitectsList(compiledRows);
  }, [rawLedgerData, rawRemittanceData, eligibilityMap]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleEligibilitySelect = async (rowItem, targetStatus) => {
    const operatorName = await resolveOperatorName();
    const displayLabel = `Architect ID: ${rowItem.architect_id}`;
    
    showToast(`⏳ Updating status for ${displayLabel}...`, 'loading', false);
    const updatedMap = { ...eligibilityMap, [rowItem.uniqueKey]: targetStatus };
    setEligibilityMap(updatedMap);
    localStorage.setItem('architect_eligibility_registry_v2', JSON.stringify(updatedMap));
    try {
      const nameTargetsArray = Array.from(rowItem.associatedNames);
      const { error } = await supabase
        .from('commission_ledger')
        .update({ status: targetStatus })
        .in('architect_name', nameTargetsArray);
      if (error) throw error;

      await logTelemetry(
        "UPDATE_ARCHITECT_ELIGIBILITY", 
        `${operatorName} changed status of ${displayLabel} to ${targetStatus}.`
      );
      showToast(`✅ ${displayLabel} marked as ${targetStatus} successfully!`, 'success');
    } catch (err) {
      console.error(`Failed updating status database row for code ${rowItem.uniqueKey}:`, err.message);
      showToast(`❌ Update failed: ${err.message}`, 'error');
    }
  };

  const triggerBulkConfirmationModal = (statusType) => {
    const label = statusType === 'yes' ? 'ELIGIBLE' : 'INELIGIBLE';
    setModal({
      show: true,
      targetStatus: statusType,
      displayLabel: label
    });
  };

  const handleConfirmedBulkEligibility = async () => {
    const operatorName = await resolveOperatorName();
    const stringLabel = modal.targetStatus === 'yes' ? 'eligible' : 'ineligible';
    const traceActionTag = modal.targetStatus === 'yes' ? 'BULK_SET_ELIGIBLE' : 'BULK_SET_INELIGIBLE';
    setModal({ show: false, targetStatus: null, displayLabel: '' });
    showToast('⏳ Performing batch database updates...', 'loading', false);

    const updatedMap = {};
    const globalNamesArray = [];

    architectsList.forEach((row) => {
      updatedMap[row.uniqueKey] = stringLabel;
      row.associatedNames.forEach(name => {
        globalNamesArray.push(name);
      });
    });
    setEligibilityMap(updatedMap);
    localStorage.setItem('architect_eligibility_registry_v2', JSON.stringify(updatedMap));

    try {
      if (globalNamesArray.length > 0) {
        const { error } = await supabase
          .from('commission_ledger')
          .update({ status: stringLabel })
          .in('architect_name', globalNamesArray);
        if (error) throw error;
      }

      await logTelemetry(
        traceActionTag, 
        `${operatorName} set all profiles (${architectsList.length} unique codes) to ${stringLabel} via unified text prefix mapping.`
      );
      await fetchLedgerData();
      showToast(`✅ Mass assigned all matching records to ${stringLabel}!`, 'success');
    } catch (err) {
      console.error('Failed executing backend ledger update batch operation:', err.message);
      showToast(`❌ Bulk operation failed: ${err.message}`, 'error');
    }
  };

  const handleExportExcel = () => {
    if (filteredArchitects.length === 0) {
      showToast('No architects match the active filters to export.', 'error');
      return;
    }

    const getProductCategory = (sku) => {
      const upperSku = String(sku || '').toUpperCase();
      if (upperSku.startsWith('PW')) return 'Plywood (PW)';
      if (upperSku.startsWith('BB')) return 'Blockboard (BB)';
      if (upperSku.startsWith('FD')) return 'Flush Door (FD)';
      if (upperSku.includes('DEC') || upperSku.includes('DECORATIVE') || upperSku.includes('NATURES SIGNATURE') || upperSku.includes('NATURE SIGNATURE')) return 'Decorative';
      return 'Other';
    };

    // Match against the same filtered rows rendered in the table, so every active UI filter is retained.
    const selectedArchitectsById = new Map(filteredArchitects.map((architect) => [architect.architect_id, architect]));
    // This is the same SKU-wise grouping shown after clicking an architect name in the UI.
    // Multiple ledger/claim rows for one SKU are combined into its total sold sheets.
    const productSummary = rawLedgerData.reduce((result, ledgerRow) => {
      const architectId = extractArchitectId(ledgerRow.architect_name || ledgerRow.architectName);
      const architect = selectedArchitectsById.get(architectId);
      const sheets = Number(ledgerRow.total_eligible_sheets || ledgerRow.totalSheets || 0);
      if (!architect || sheets === 0) return result;

      const sku = ledgerRow.product_sku || 'UNKNOWN';
      const key = `${architectId}__${sku}`;
      if (!result[key]) {
        result[key] = {
          'Architect Name': getArchitectDisplayName(architect.architect_name),
          'Account ID': architect.architect_id,
          State: architect.state || 'Unknown',
          Eligibility: architect.isEligible ? 'Eligible' : 'Ineligible',
          'Product Category': getProductCategory(sku),
          'Product SKU': sku,
          'Total Sheets Sold': 0,
          'Total Product Payout': 0,
        };
      }
      result[key]['Total Sheets Sold'] += sheets;
      result[key]['Total Product Payout'] += Number(ledgerRow.total_payout_amount || ledgerRow.payoutAmount || ledgerRow.amount || 0);
      return result;
    }, {});
    const productRows = Object.values(productSummary)
      .sort((a, b) => a['Architect Name'].localeCompare(b['Architect Name']) || a['Product SKU'].localeCompare(b['Product SKU']));

    const productDetailsByAccount = productRows.reduce((result, product) => {
      const accountId = product['Account ID'];
      const category = product['Product Category'];
      if (!result[accountId]) result[accountId] = {};
      if (!result[accountId][category]) result[accountId][category] = [];
      result[accountId][category].push(`${product['Product SKU']} - ${product['Total Sheets Sold'].toFixed(1)} Sheets`);
      return result;
    }, {});

    const summaryRows = filteredArchitects.map((architect, index) => ({
      Rank: index + 1,
      'Architect Name': getArchitectDisplayName(architect.architect_name),
      'Account Number': architect.architect_id,
      Sheets: Number(architect.total_sheets || 0),
      'Pool Payout': Number(architect.actualPayoutAllowed || 0),
      Paid: Number(architect.credited_amount || 0),
      State: architect.state || 'Unknown',
      Balance: Number(architect.balance_due || 0),
      'Eligibility Status': architect.isEligible ? 'Eligible' : 'Ineligible',
      // Same category and SKU totals shown in the architect-name click modal.
      'Product Details': Object.entries(productDetailsByAccount[architect.architect_id] || {})
        .map(([category, products]) => `${category}:\n${products.join('\n')}`)
        .join('\n\n') || 'No eligible sheets',
    }));

    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    summarySheet['!autofilter'] = { ref: summarySheet['!ref'] || 'A1' };
    summarySheet['!freeze'] = { xSplit: 0, ySplit: 1 };
    summarySheet['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 55 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Architect Accounts');
    XLSX.writeFile(workbook, `Architect_Accounts_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);

    logTelemetry('EXPORT_EXCEL_REPORT', `Exported ${summaryRows.length} filtered architect account rows with product details.`);
    showToast(`Exported ${summaryRows.length} architect rows with product details.`, 'success');
    return;

    /* Legacy CSV export retained below temporarily for reference.
    const globalSummary = {};
    
    rawLedgerData.forEach(row => {
      const archName = row.architect_name || row.architectName || 'UNKNOWN';
      const sku = row.product_sku || 'UNKNOWN';
      const sheetsCount = parseFloat(row.total_eligible_sheets || 0);
      if (sheetsCount === 0) return;

      let category = 'Other';
      const upperSku = sku.toUpperCase();
      if (upperSku.startsWith('PW')) category = 'Plywood (PW)';
      else if (upperSku.startsWith('BB')) category = 'Blockboard (BB)';
      else if (upperSku.startsWith('FD')) category = 'Flush Door (FD)';
      else if (upperSku.includes('DEC') || upperSku.includes('DECORATIVE') || upperSku.includes('NATURES SIGNATURE') || upperSku.includes('NATURE SIGNATURE')) {
        category = 'Decorative';
      }

      if (!globalSummary[archName]) globalSummary[archName] = {};
      if (!globalSummary[archName][category]) globalSummary[archName][category] = 0;
      globalSummary[archName][category] += sheetsCount;
    });

    let csvContent = "Architect Name,Account ID,Plywood (PW) Sheets,Blockboard (BB) Sheets,Flush Door (FD) Sheets,Decorative Sheets,Total Sheets,Allowed Payout,Balance Due\n";
    
    architectsList.forEach(arch => {
      const name = arch.architect_name;
      const cats = globalSummary[name] || {};
      const pw = (cats['Plywood (PW)'] || 0).toFixed(1);
      const bb = (cats['Blockboard (BB)'] || 0).toFixed(1);
      const fd = (cats['Flush Door (FD)'] || 0).toFixed(1);
      const dec = (cats['Decorative'] || 0).toFixed(1);
      const totalSheets = arch.total_sheets.toFixed(1);
      const payout = arch.actualPayoutAllowed.toFixed(0);
      const balance = arch.balance_due.toFixed(0);
      
      const safeName = name.includes(',') ? `"${name}"` : name;
      csvContent += `${safeName},${arch.architect_id},${pw},${bb},${fd},${dec},${totalSheets},₹${payout},₹${balance}\n`;
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Architects_Sales_Summary_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    logTelemetry("EXPORT_EXCEL_REPORT", "Generated comprehensive sales summary matrix report for Excel.");
    */
  };

  const filteredArchitects = architectsList.filter((row) => {
    const searchString = filters.search?.toLowerCase() || '';
    const nameMatch = (row.architect_name?.toLowerCase() || '').includes(searchString);
    const idMatch = (row.architect_id?.toLowerCase() || '').includes(searchString);
    const matchesSearch = nameMatch || idMatch;

    const matchesElig =
      filters.eligibility === '' ||
      (filters.eligibility === 'eligible' && row.isEligible) ||
      (filters.eligibility === 'ineligible' && !row.isEligible);
    
    const matchesStatus =
      filters.status === '' ||
      (filters.status === 'balance' && row.balance_due > 0) ||
      (filters.status === 'cleared' && row.balance_due === 0);

    const matchesPencil = !filters.pencilOnly || row.hasNaturesSignature;
    const matchesState = filters.state === '' || (row.state && row.state.toLowerCase() === filters.state.toLowerCase());

    return matchesSearch && matchesElig && matchesStatus && matchesPencil && matchesState;
  });

  const kpi = filteredArchitects.reduce((acc, row) => {
    acc.totalArchitects++;
    if (row.isEligible) {
      acc.eligible++;
      acc.totalSheets += row.total_sheets || 0;
    } else {
      acc.notEligible++;
    }
    
    acc.commissionPool += row.actualPayoutAllowed || 0;
    acc.totalCredited += row.credited_amount || 0;
    acc.balanceDue += row.balance_due || 0;
    return acc;
  }, {
    totalArchitects: 0,
    eligible: 0,
    notEligible: 0,
    commissionPool: 0,
    totalCredited: 0,
    balanceDue: 0,
    totalSheets: 0,
  });

  const uniqueStates = [...new Set(architectsList.map(item => item.state).filter(Boolean))];

  // Target SKUs filtered for Searchable Dropdown & Selected Rate Percentage Tab
  const filteredTargetSkus = decorativeMasterList
    .filter(item => {
      const upper = item.sku.toUpperCase();
      return !upper.includes('NATURES SIGNATURE') && !upper.includes('NATURE SIGNATURE');
    })
    .filter(item => matchesConversionTab(item, conversionTab))
    .filter(item => {
      if (!targetSkuSearch) return true;
      const search = targetSkuSearch.toLowerCase();
      const skuMatch = item.sku.toLowerCase().includes(search);
      const sizeMatch = item.size ? item.size.toLowerCase().includes(search) : false;
      return skuMatch || sizeMatch;
    });

  // Selected Target Product Rate (matches both SKU and active conversion tab percentage)
  const selectedTargetProduct = decorativeMasterList.find(p => 
    p.sku === transferState.targetSku && matchesConversionTab(p, conversionTab)
  ) || decorativeMasterList.find(p => p.sku === transferState.targetSku);

  const selectedRate = selectedTargetProduct ? parseFloat(selectedTargetProduct.price || 0) : 0;
  const estimatedPayout = (parseFloat(transferState.transferQty || 0) * selectedRate);

  const getToastStyles = () => {
    switch (toast.type) {
      case 'success': return { bg: '#10b981', color: '#fff' };
      case 'error': return { bg: '#ef4444', color: '#fff' };
      case 'loading': return { bg: '#1f2937', color: '#fff' };
      default: return { bg: '#2563eb', color: '#fff' };
    }
  };

  return (
    <div className="page" id="page-accounts" style={{ fontFamily: 'Inter, sans-serif', padding: '16px', maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden', position: 'relative' }}>
      
      {/* ── REACT MODAL CONFIRMATION OVERLAY ── */}
      {modal.show && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000,
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', width: '440px', maxWidth: '90%',
            padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                fontSize: '24px', padding: '8px', borderRadius: '50%',
                background: modal.targetStatus === 'yes' ? '#fef3c7' : '#fee2e2',
                color: modal.targetStatus === 'yes' ? '#d97706' : '#dc2626',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>⚠</div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                Confirm Bulk Database Rewrite
              </h3>
            </div>
            
            <p style={{ margin: '0 0 20px 0', fontSize: '13.5px', color: '#4b5563', lineHeight: '1.5' }}>
              Are you sure you want to change the active setup profiles?
              This action will overwrite the status column to <strong style={{ color: modal.targetStatus === 'yes' ? '#d97706' : '#dc2626' }}>{modal.displayLabel}</strong> based on matching name prefixes across the remote database ledger.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setModal({ show: false, targetStatus: null, displayLabel: '' })} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleConfirmedBulkEligibility} style={{ background: modal.targetStatus === 'yes' ? '#d97706' : '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                Yes, Update All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 🌟 ENHANCED WIDE ARCHITECT DETAILS SUMMARY MODAL ── */}
      {detailsModal.show && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(5px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10005,
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '16px', width: '780px', maxWidth: '92vw', maxHeight: '85vh',
            padding: '24px 28px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: '#0f172a' }}>Sales Summary Breakdown</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13.5px', color: '#64748b' }}>{detailsModal.architectName}</p>
              </div>
              <button 
                onClick={() => setDetailsModal({ show: false, loading: false, architectName: '', summaryData: {} })} 
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '16px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>

            <div style={{ overflowY: 'auto', flexGrow: 1, paddingRight: '6px' }}>
              {detailsModal.loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>⏳ Calculating SKU summaries...</div>
              ) : Object.keys(detailsModal.summaryData).length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>No eligible sheets found for this architect.</div>
              ) : (
                Object.entries(detailsModal.summaryData).map(([category, data]) => (
                  <div key={category} style={{ marginBottom: '20px', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ background: '#f8fafc', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
                      <strong style={{ fontSize: '14px', color: '#1e293b' }}>{category}</strong>
                      <strong style={{ fontSize: '14px', color: '#059669' }}>Total: {data.categoryTotal.toFixed(1)} Sheets</strong>
                    </div>
                    
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', tableLayout: 'fixed' }}>
                      <tbody>
                        {Object.entries(data.skus).map(([sku, total], idx) => {
                          const isNaturesSignature = /NATURE'?S?[\s_]*SIGNATURE/i.test(sku || '');
                          return (
                            <tr key={sku} style={{ borderBottom: idx === Object.keys(data.skus).length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                              <td colSpan={2} style={{ padding: '12px 18px' }}>
                                <div style={{
                                  display: 'flex',
                                  justify: 'space-between',
                                  alignItems: 'center',
                                  flexWrap: 'wrap',
                                  gap: '12px'
                                }}>
                                  
                                  {/* Product SKU Name */}
                                  <div 
                                    title={sku}
                                    style={{ 
                                      flex: '1 1 260px', 
                                      color: '#0f172a', 
                                      fontWeight: 500,
                                      lineHeight: '1.4',
                                      wordBreak: 'break-word',
                                      overflowWrap: 'anywhere'
                                    }}
                                  >
                                    {sku}
                                  </div>

                                  {/* Sheet Count & Convert Button Container */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, marginLeft: 'auto' }}>
                                    <span style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                                      {total.toFixed(1)} Sheets
                                    </span>
                                    
                                    {isNaturesSignature && (
                                      <button 
                                        onClick={() => {
                                          setTransferState({
                                            show: true,
                                            loading: false,
                                            sourceSku: sku,
                                            maxQty: total,
                                            targetSku: '',
                                            transferQty: total.toString()
                                          });
                                          setConversionTab('7%');
                                          setTargetSkuSearch('');
                                          setTargetDropdownOpen(false);
                                        }}
                                        style={{
                                          background: '#0284c7', color: '#ffffff', border: 'none',
                                          borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer',
                                          fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px',
                                          boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)', flexShrink: 0
                                        }}
                                      >
                                        ✏️ Convert Product
                                      </button>
                                    )}
                                  </div>

                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DEDICATED HIGH-CAPACITY NATURE'S SIGNATURE CONVERSION MODAL ── */}
      {transferState.show && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10020,
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '16px', width: '700px', maxWidth: '92%',
            padding: '28px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: '20px'
          }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                  🔄
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                    Convert Nature's Signature SKU
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                    Select target decorative product and sheet volume to update ledger.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setTransferState(prev => ({ ...prev, show: false }))}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '16px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>

            {/* Source Product Banner */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Source Product</span>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginTop: '2px', wordBreak: 'break-word' }}>
                  {transferState.sourceSku}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Available Volume</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0284c7', marginTop: '2px' }}>
                  {transferState.maxQty.toFixed(1)} Sheets
                </div>
              </div>
            </div>

            {/* Percentage Type Switcher Tabs (7% Standard vs 10% Exception) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                Conversion Rate Type <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setConversionTab('7%');
                    setTransferState(prev => ({ ...prev, targetSku: '' }));
                    setTargetSkuSearch('');
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1.5px solid',
                    borderColor: conversionTab === '7%' ? '#0284c7' : '#cbd5e1',
                    background: conversionTab === '7%' ? '#e0f2fe' : '#ffffff',
                    color: conversionTab === '7%' ? '#0369a1' : '#64748b',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Standard (7%)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConversionTab('10%');
                    setTransferState(prev => ({ ...prev, targetSku: '' }));
                    setTargetSkuSearch('');
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1.5px solid',
                    borderColor: conversionTab === '10%' ? '#d97706' : '#cbd5e1',
                    background: conversionTab === '10%' ? '#fef3c7' : '#ffffff',
                    color: conversionTab === '10%' ? '#b45309' : '#64748b',
                    transition: 'all 0.15s ease'
                  }}
                >
                  ⚠️ Exception (10%)
                </button>
              </div>
            </div>

            {/* Target SKU Selection with Searchable Combobox */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }} ref={dropdownRef}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                Search & Select Target Decorative SKU ({conversionTab === '10%' ? '10% Exception' : '7% Standard'}) <span style={{ color: '#ef4444' }}>*</span>
              </label>

              {/* Text Search Bar Input */}
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="🔍 Type product name, code, or thickness (e.g. Duro Teak, 1mm)..."
                  value={targetSkuSearch || transferState.targetSku}
                  onFocus={() => setTargetDropdownOpen(true)}
                  onChange={(e) => {
                    setTargetSkuSearch(e.target.value);
                    setTransferState(prev => ({ ...prev, targetSku: '' }));
                    setTargetDropdownOpen(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid',
                    borderColor: transferState.targetSku ? '#0284c7' : '#cbd5e1',
                    fontSize: '13.5px',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box',
                    background: transferState.targetSku ? '#f0f9ff' : '#ffffff'
                  }}
                />
                {transferState.targetSku && (
                  <button
                    onClick={() => {
                      setTransferState(prev => ({ ...prev, targetSku: '' }));
                      setTargetSkuSearch('');
                      setTargetDropdownOpen(true);
                    }}
                    style={{
                      position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Dynamic Filtered Dropdown Results List */}
              {targetDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                  zIndex: 10030
                }}>
                  {filteredTargetSkus.length === 0 ? (
                    <div style={{ padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      No matching decorative products found for {conversionTab === '10%' ? '10%' : '7%'}.
                    </div>
                  ) : (
                    filteredTargetSkus.map((item) => (
                      <div
                        key={`${item.sku}-${item.percentage || ''}`}
                        onClick={() => {
                          setTransferState(prev => ({ ...prev, targetSku: item.sku }));
                          setTargetSkuSearch(item.sku);
                          setTargetDropdownOpen(false);
                        }}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f1f5f9',
                          display: 'flex',
                          justify: 'space-between',
                          alignItems: 'center',
                          fontSize: '13px',
                          background: transferState.targetSku === item.sku ? '#e0f2fe' : '#ffffff'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '10px', wordBreak: 'break-word' }}>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{item.sku}</span>
                          {item.size && <span style={{ marginLeft: '8px', color: '#64748b', fontSize: '12px' }}>({item.size})</span>}
                        </div>
                        <span style={{ fontWeight: 600, color: '#059669', fontSize: '12.5px', flexShrink: 0 }}>
                          ₹{parseFloat(item.price || 0).toLocaleString('en-IN')}/sheet
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Quantity Input & Quick Fill */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    Sheets Quantity to Transfer <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <button
                    onClick={() => setTransferState(prev => ({ ...prev, transferQty: prev.maxQty.toString() }))}
                    style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Max
                  </button>
                </div>
                <input
                  type="number"
                  placeholder={`Max ${transferState.maxQty}`}
                  max={transferState.maxQty}
                  min="0.1"
                  step="0.1"
                  value={transferState.transferQty}
                  onChange={(e) => setTransferState(prev => ({ ...prev, transferQty: e.target.value }))}
                  style={{
                    padding: '11px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '13.5px',
                    color: '#0f172a',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Live Payout Summary Banner */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Target Rate & Estimated Payout ({conversionTab})
                </span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#15803d' }}>
                    Rate: ₹{selectedRate}/sheet
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#166534' }}>
                    ₹{estimatedPayout.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '4px' }}>
              <button
                onClick={() => setTransferState(prev => ({ ...prev, show: false }))}
                style={{
                  background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                  borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleTransferSubmit}
                disabled={transferState.loading || !transferState.targetSku || !transferState.transferQty}
                style={{
                  background: transferState.loading || !transferState.targetSku || !transferState.transferQty ? '#94a3b8' : '#0284c7',
                  color: '#ffffff', border: 'none', borderRadius: '8px',
                  padding: '10px 24px', fontSize: '13px', fontWeight: 600,
                  cursor: transferState.loading || !transferState.targetSku || !transferState.transferQty ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.3)'
                }}
              >
                {transferState.loading ? '⏳ Processing Transfer...' : 'Confirm Transfer & Update Ledger'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── FLOATING TOAST SNACKBAR ── */}
      {toast.show && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', 
          padding: '12px 20px', borderRadius: '8px',
          backgroundColor: getToastStyles().bg, color: getToastStyles().color, fontSize: '13px', fontWeight: '500',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
          zIndex: 20050, 
          display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease-in-out',
        }}>
          {toast.message}
          {toast.type !== 'loading' && (
            <span style={{ cursor: 'pointer', marginLeft: '10px', opacity: 0.7 }} 
            onClick={() => setToast(t => ({ ...t, show: false }))}>✕</span>
          )}
        </div>
      )}

      {/* ── ACTION PANEL Ribbon ── */}
      <div className="dl-strip" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ fontSize: '13px', color: '#6b7280', marginRight: '4px' }}>Actions:</span>
        <button className="btn-dl" style={{ fontSize: '12px', padding: '6px 12px', cursor: 'pointer', fontWeight: 500 }} onClick={fetchLedgerData}>🔄 Refresh Ledger Accounts</button>
        <button 
          className="btn-dl" 
          style={{ fontSize: '12px', padding: '6px 12px', cursor: 'pointer', fontWeight: 600, background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }} 
          onClick={handleExportExcel}
        >
          📊 Export Excel Report
        </button>
      </div>

      {/* ── RESPONSIVE COMPACT KPI COUNTERS ── */}
      <div className="kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '20px', maxWidth: '100%' }}>
        <div className="kpi" style={{ border: '1px solid #e5e7eb', padding: '12px 14px', borderRadius: '6px', background: '#fff' }}>
          <div className="kpi-lbl" style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 500 }}>Unique Architects Listed</div>
          <div className="kpi-val" style={{ fontSize: '18px', fontWeight: 700, margin: '4px 0', color: '#111827' }}>{kpi.totalArchitects}</div>
        </div>

        <div className="kpi" style={{ border: '1px solid #a8dcc0', padding: '12px 14px', borderRadius: '6px', background: '#f0fdf4' }}>
          <div className="kpi-lbl" style={{ fontSize: '11px', color: '#166534', textTransform: 'uppercase', fontWeight: 500 }}>✅ Eligible</div>
          <div className="kpi-val" style={{ fontSize: '18px', fontWeight: 700, color: '#16a34a', margin: '4px 0' }}>{kpi.eligible}</div>
        </div>

        <div className="kpi" style={{ border: '1px solid #e8b0b0', padding: '12px 14px', borderRadius: '6px', background: '#fef2f2' }}>
          <div className="kpi-lbl" style={{ fontSize: '11px', color: '#991b1b', textTransform: 'uppercase', fontWeight: 500 }}>❌ Not Eligible</div>
          <div className="kpi-val" style={{ fontSize: '18px', fontWeight:'700', color: '#dc2626', margin: '4px 0' }}>{kpi.notEligible}</div>
        </div>

        <div className="kpi" style={{ border: '1px solid #e5e7eb', padding: '12px 14px', borderRadius: '6px', background: '#fff' }}>
          <div className="kpi-lbl" style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 500 }}>Total Sheets</div>
          <div className="kpi-val" style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '4px 0' }}>
            {kpi.totalSheets?.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
          </div>
        </div>

        <div className="kpi" style={{ border: '1px solid #e5e7eb', padding: '12px 14px', borderRadius: '6px', background: '#fff' }}>
          <div className="kpi-lbl" style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 500 }}>Commission Pool</div>
          <div className="kpi-val" style={{ fontSize: '18px', fontWeight: 700, color: '#059669', margin: '4px 0' }}>₹{kpi.commissionPool.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        </div>

        <div className="kpi" style={{ border: '1px solid #e5e7eb', padding: '12px 14px', borderRadius: '6px', background: '#fff' }}>
          <div className="kpi-lbl" style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 500 }}>Total Paid</div>
          <div className="kpi-val" style={{ fontSize: '18px', fontWeight: 700, color: '#2563eb', margin: '4px 0' }}>₹{kpi.totalCredited.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        </div>

        <div className="kpi" style={{ border: '1px solid #fca5a5', padding: '12px 14px', borderRadius: '6px', background: '#fff5f5' }}>
          <div className="kpi-lbl" style={{ fontSize: '11px', color: '#b91c1c', textTransform: 'uppercase', fontWeight: 'bold' }}>Balance Due</div>
          <div className="kpi-val" style={{ fontSize: '18px', fontWeight: 700, color: '#b91c1c', margin: '4px 0' }}>₹{kpi.balanceDue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      {/* ── SELECTION CONTROL UTILITY STRIP BANNER ── */}
      <div className="card mt16" style={{ border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', marginBottom: '14px', maxWidth: '100%' }}>
        <div className="card-hd" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ fontSize: '18px' }}>⚖️</div>
            <div className="card-title" style={{ fontWeight: 600, fontSize: '14px' }}>Scheme Eligibility — Code Prefix Database Control Registry</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-gold" onClick={() => triggerBulkConfirmationModal('yes')} style={{ fontSize: '12px', background: '#d97706', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}>
               ✅ Database All Eligible
            </button>
            <button className="btn btn-red" onClick={() => triggerBulkConfirmationModal('no')} style={{ fontSize: '12px', background: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}>
              ❌ Database All Ineligible
            </button>
          </div>
        </div>
      </div>

      {/* ── LEADERBOARD ACCOUNTS GRID ── */}
      <div className="card mt16" style={{ border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', maxWidth: '100%', overflow: 'hidden' }}>
        <div className="card-hd" style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ fontSize: '18px' }}>👛</div>
            <div className="card-title" style={{ fontWeight: 600, fontSize: '14px' }}>Architect Ledger Leaderboard</div>
          </div>
          
          <div className="card-hd-right" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              className="inp"
              placeholder="Search Name or Code ID..."
              style={{ width: '180px', padding: '6px 10px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
            <select
              className="sel"
              style={{ width: '130px', padding: '6px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              value={filters.eligibility}
              onChange={(e) => handleFilterChange('eligibility', e.target.value)}
            >
              <option value="">All Eligibility</option>
              <option value="eligible">✅ Eligible Only</option>
              <option value="ineligible">❌ Not Eligible</option>
            </select>
            <select
              value={filters.state}
              onChange={(e) => handleFilterChange('state', e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
            >
              <option value="">All States</option>
              {uniqueStates.map((state, index) => (
                <option key={index} value={state}>{state}</option>
              ))}
            </select>
            <select
              className="sel"
              style={{ width: '120px', padding: '6px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="">All Status</option>
              <option value="balance">With Balance</option>
              <option value="cleared">Fully Paid</option>
            </select>
          </div>

          <button
            onClick={() => handleFilterChange('pencilOnly', !filters.pencilOnly)}
            style={{
              fontSize: '12px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontWeight: 500,
              borderRadius: '4px',
              border: '1px solid',
              borderColor: filters.pencilOnly ? '#2563eb' : '#d1d5db',
              background: filters.pencilOnly ? '#eff6ff' : '#fff',
              color: filters.pencilOnly ? '#2563eb' : '#374151',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            <span>✏️</span> 
            {filters.pencilOnly ? 'Showing Nature Signature' : 'Filter by Nature Signature'}
          </button>
        </div>

        {/* Dynamic Table Content Renderer */}
        <div style={{ padding: '0px', maxWidth: '100%', overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>⏳ Fetching records...</div>
          ) : filteredArchitects.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No matches found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '10px 12px', width: '50px', textAlign: 'center' }}>Rank</th>
                  <th style={{ padding: '10px 12px', width: '30%' }}>Architect Name</th>
                  <th style={{ padding: '10px 12px', width: '15%' }}>Account Number</th>
                  <th style={{ padding: '10px 12px', width: '10%', textAlign: 'right' }}>Sheets</th>
                  <th style={{ padding: '10px 12px', width: '13%', textAlign: 'right' }}>Pool Payout</th>
                  <th style={{ padding: '10px 12px', width: '13%', textAlign: 'right' }}>Paid</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', width: '16%' }}>State</th>
                  <th style={{ padding: '10px 12px', width: '13%', textAlign: 'right' }}>Balance</th>
                  <th style={{ padding: '10px 12px', width: '16%', textAlign: 'center' }}>Eligibility Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredArchitects.map((row, index) => (
                  <tr 
                    key={row.uniqueKey} 
                    onClick={() => fetchArchitectSummary(row.architect_name)}
                    style={{ 
                      borderBottom: '1px solid #e5e7eb', 
                      background: row.isEligible ? 'transparent' : '#fff5f5',
                      cursor: 'pointer'
                    }}
                    className="hover-row"
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'center', color: index === 0 ? '#d97706' : '#4b5563' }}>
                      {index + 1}
                    </td>
                    
                    <td 
                      style={{ 
                        padding: '10px 12px', 
                        fontWeight: 600, 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        color: '#111827',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }} 
                      title={`View sales summary for ${getArchitectDisplayName(row.architect_name)}`}
                    >
                      {row.hasNaturesSignature && (
                        <span 
                          style={{ 
                            color: '#2563eb', 
                            fontSize: '13px', 
                            background: '#eff6ff', 
                            padding: '2px 5px', 
                            borderRadius: '4px',
                            border: '1px solid #bfdbfe',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                          title="Contains active Nature's Signature products eligible for conversion"
                        >
                          ✏️
                        </span>
                      )}
                      <span>{getArchitectDisplayName(row.architect_name)}</span>
                    </td>
                    
                    <td style={{ padding: '10px 12px', color: '#4b5563', fontWeight: '500', fontSize: '12.5px' }}>
                      {row.architect_id}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>{row.total_sheets.toFixed(1)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: row.isEligible ? '#059669' : '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      ₹{row.actualPayoutAllowed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                      ₹{row.credited_amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#4b5563', fontSize: '13px' }}>
                      {row.state}
                    </td>
                    <td style={{ 
                      padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: row.balance_due > 0 ? '#b91c1c' : '#059669', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      ₹{row.balance_due.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <select
                        value={row.isEligible ? 'eligible' : 'ineligible'}
                        onChange={(e) => handleEligibilitySelect(row, e.target.value)}
                        onClick={(e) => e.stopPropagation()} 
                        style={{
                          padding: '4px 6px', fontSize: '12px', fontWeight: 500, borderRadius: '4px', cursor: 'pointer',
                          border: '1px solid', borderColor: row.isEligible ? '#10b981' : '#ef4444',
                          background: row.isEligible ? '#ecfdf5' : '#fef2f2', color: row.isEligible ? '#047857' : '#b91c1c', maxWidth: '100%'
                        }}
                      >
                        <option value="eligible">Eligible</option>
                        <option value="ineligible">Blocked</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArchitectAccounts;
