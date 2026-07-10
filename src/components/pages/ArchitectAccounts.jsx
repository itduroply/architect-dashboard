import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supbase'; 

const ArchitectAccounts = () => {
  const location = useLocation();

  // Filters state management
// Filters state management
  const [filters, setFilters] = useState({
    search: '',
    tier: '', 
    eligibility: '',
    status: '',
    pencilOnly: false,
    state: '', // <-- Add this line
  });

  // Operational state flags
  const [loading, setLoading] = useState(true);
  const [rawLedgerData, setRawLedgerData] = useState([]);
  const [rawRemittanceData, setRawRemittanceData] = useState([]);
  const [architectsList, setArchitectsList] = useState([]);
  const [decorativeMasterList, setDecorativeMasterList] = useState([]);

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

  // Floating Notification Snackbar State
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  // Helper utility to fire notifications
  const showToast = (message, type = 'info', autoDismiss = true) => {
    setToast({ show: true, message, type });
    if (autoDismiss && type !== 'loading') {
      setTimeout(() => {
        setToast((prev) => ({ ...prev, show: false }));
      }, 3000);
    }
  };

  // Local eligibility memory cache - bound to Unique Architect ID Strings
  const [eligibilityMap, setEligibilityMap] = useState(() => {
    const saved = localStorage.getItem('architect_eligibility_registry_v2');
    return saved ? JSON.parse(saved) : {};
  });

 

  // Helper utility to safely parse out the unique ID code from full name strings
  const extractArchitectId = (fullName) => {
    if (!fullName) return 'UNKNOWN';
    const str = String(fullName);
    return str.includes('|') ? str.split('|')[0].trim() : str.trim();
  };

  // ─── 📝 Simplified Telemetry Logging Engine ───
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

  // ─── 👤 EXACT MATCH LOGIN DETECTION ───
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

  // ─── 📊 FETCH MASTER DECORATIVE PRODUCTS ───
  const fetchMasterDecorativeProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('product_sku_master')
        .select('sku, size, price')
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

  // ─── 📊 ARCHITECT DETAIL SUMMARY FETCH & GROUPING ───
  const fetchArchitectSummary = async (architectName) => {
    setDetailsModal({ show: true, loading: true, architectName, summaryData: {} });
    setTransferState(prev => ({ ...prev, show: false })); 

    try {
      const { data, error } = await supabase
        .from('commission_ledger')
        .select('product_sku, total_eligible_sheets')
        .eq('architect_name', architectName);
      if (error) throw error;

      // Grouping Logic
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

// ─── 🔄 TRANSFER NATURES SIGNATURE LOGIC ───
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
      // 1. Aggressive Normalization for Matching
      // This turns "decorative-DUROTEAK-ALLTHICKNESS (All Thickness)" AND "DECORATIVE_DURO TEAK_" 
      // into exactly "DECORATIVEDUROTEAK" so they match 100% of the time.
      const superNormalize = (sku) => {
        if (!sku) return '';
        let str = String(sku).toUpperCase();
        str = str.split('(')[0]; // Remove "(All Thickness)"
        str = str.replace(/ALLTHICKNESS/g, ''); // Remove "ALLTHICKNESS"
        str = str.replace(/[^A-Z0-9]/g, ''); // Remove all spaces, hyphens, and underscores
        return str;
      };

      // 2. Format Fallback for New Database Rows
   // 2. Format Fallback for New Database Rows
      // Forces any selected dropdown value to become strictly "DECORATIVE_..._" for inserting
      const formatSkuForDB = (dropdownVal) => {
        let str = String(dropdownVal).toUpperCase().split('(')[0];
        str = str.replace(/ALLTHICKNESS/g, '').trim();
        str = str.replace(/^DECORATIVE-/, 'DECORATIVE_'); // Fix prefix
        str = str.replace(/-/g, ' ').trim(); // Replace other hyphens with spaces
        str = str.replace(/DUROTEAK/g, 'DURO TEAK'); // Add space in Duro Teak
        if (!str.endsWith('_')) str += '_'; // Ensure trailing underscore
        return str;
      };

      const sourceSkuNormalized = superNormalize(transferState.sourceSku);

      // Match against master list to find rate (price)
      const targetMasterProduct = decorativeMasterList.find(p => superNormalize(p.sku) === superNormalize(transferState.targetSku));
      const targetRate = targetMasterProduct ? parseFloat(targetMasterProduct.price || 0) : 0;
      
      // 🚨 FIX: Always force formatting before saving to the DB! Never use the messy master list string.
      const exactTargetSku = formatSkuForDB(transferState.targetSku);

      // Fetch all rows for this specific architect
      const { data: allRows, error: fetchError } = await supabase
        .from('commission_ledger')
        .select('*')
        .eq('architect_name', detailsModal.architectName);

      if (fetchError) throw fetchError;

      // Find source rows matching the source SKU (Nature's Signature)
      const matchingRows = (allRows || []).filter(row =>
        superNormalize(row.product_sku) === sourceSkuNormalized
      );

      if (matchingRows.length === 0) {
        throw new Error("No matching source product SKU records found for this architect.");
      }

      // Check if target row already exists for this architect using aggressive match
      const existingTargetRow = (allRows || []).find(row =>
        superNormalize(row.product_sku) === superNormalize(transferState.targetSku)
      );

      // ─── 🔄 HANDLE TARGET ROW (UPDATE OR INSERT) ───
      if (existingTargetRow) {
        // CASE A: Target EXISTS -> Update total sheets and calculate fresh payout amount
        const newTargetSheets = parseFloat(existingTargetRow.total_eligible_sheets || 0) + qtyToTransfer;
        const newTargetPayout = newTargetSheets * targetRate;

        const { error: updateTargetErr } = await supabase
          .from('commission_ledger')
          .update({
            total_eligible_sheets: newTargetSheets,
            matrix_rate: targetRate,
            total_payout_amount: newTargetPayout
          })
          .eq('architect_name', detailsModal.architectName)
          .eq('product_sku', existingTargetRow.product_sku); 

        if (updateTargetErr) throw updateTargetErr;
     } else {
        // CASE B: Target DOES NOT EXIST -> Create new bifurcated row with dynamic suffix
        const templateRow = matchingRows[0];
        const rawClaimNo = templateRow.claim_no || "CLAIM";
        
        // 1. Parse the incoming claim structure to preserve its specific parent branch hierarchy
        const claimParts = rawClaimNo.split('-');
        const rootClaimNo = claimParts[0]; 
        const currentSuffix = claimParts[1] || "1"; // Default to 1 if it's an un-hyphenated root base claim
        
        let bifurcatedClaimNo = '';
        
        // 2. Check if the current processed item is a Nature's Signature SKU
       const isNaturesSig = /NATURE'?S?[\s_]*SIGNATURE/i.test(transferState.sourceSku || '');

        if (isNaturesSig) {
          // 💡 Deep Sub-Bifurcation Rule (e.g., "C268145-2" becomes "C268145-2-1.1", then "C268145-2-1.2")
          const targetBasePattern = `${rootClaimNo}-${currentSuffix}-1`;
          
          const existingSubCount = (allRows || []).filter(row => 
            row.claim_no && row.claim_no.startsWith(targetBasePattern + '.')
          ).length;
          
          bifurcatedClaimNo = `${targetBasePattern}.${existingSubCount + 1}`;
        } else {
          // Standard integer tracking for non-Nature Signature SKUs (e.g., "C268145-2" splits to "C268145-3")
          const existingSuffixCount = (allRows || []).filter(row => 
            row.claim_no && row.claim_no.startsWith(rootClaimNo + '-')
          ).length;
          
          bifurcatedClaimNo = `${rootClaimNo}-${existingSuffixCount + 1}`;
        }

        const newTargetPayout = qtyToTransfer * targetRate;

        const newRow = {
          ...templateRow, 
          claim_no: bifurcatedClaimNo, // Outputs clean hierarchical dot formatting or flat sequential hyphens
          product_sku: exactTargetSku, 
          total_eligible_sheets: qtyToTransfer,
          matrix_rate: targetRate,
          total_payout_amount: newTargetPayout
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

      // ─── 🗑️ DEDUCT OR DELETE NATURES SIGNATURE RECORDS (RUNS IN BOTH CASES) ───
      let remainingToDeduct = qtyToTransfer;

      for (const row of matchingRows) {
        if (remainingToDeduct <= 0) break;

        const currentSheets = parseFloat(row.total_eligible_sheets || 0);
        if (currentSheets <= 0) continue;

        const deduct = Math.min(currentSheets, remainingToDeduct);
        const newSheets = currentSheets - deduct;
        remainingToDeduct -= deduct;

        if (newSheets <= 0) {
          // If sheets hit zero, DELETE it from the database
          const { error: deleteErr } = await supabase
            .from('commission_ledger')
            .delete()
            .eq('architect_name', detailsModal.architectName)
            .eq('product_sku', row.product_sku)
            .eq('claim_no', row.claim_no);

          if (deleteErr) throw deleteErr;
        } else {
          // Reduce sheets and update total payout
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

      showToast(`✅ Successfully transferred ${qtyToTransfer} sheets!`, "success");
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

  // Wrapped fetchLedgerData in useCallback to stabilize reference across cycles
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

  // Compute Group-By aggregations based purely on the parsed Architect ID code
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
          hasNaturesSignature: false, // Flag to show pencil icon dynamically
          associatedNames: new Set() 
        };
      }
  
      aggregationMap[archId].total_sheets += sheets;
      aggregationMap[archId].raw_pool_payout += payout;
      aggregationMap[archId].associatedNames.add(rawName);

      // Check if this active record is a Nature Signature SKU
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

  // Eligibility Update via explicit Name Variants Array matching
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

// ─── 📊 EXPORT ALL ARCHITECTS SALES SUMMARY TO EXCEL (CSV) ───
  const handleExportExcel = () => {
    // 1. Group all raw ledger rows by architect name and category on the fly
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

    // 2. Build the CSV Document headers & row structure matching the dashboard summary calculations
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
      
      // Escape commas in the architect string names safely
      const safeName = name.includes(',') ? `"${name}"` : name;
      csvContent += `${safeName},${arch.architect_id},${pw},${bb},${fd},${dec},${totalSheets},₹${payout},₹${balance}\n`;
    });

    // 3. Fire Native Web File System Downloader Browser Routine 
    // 💡 FIX: Prepend "\uFEFF" (UTF-8 BOM) so Excel processes the Rupee symbol correctly
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Architects_Sales_Summary_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    logTelemetry("EXPORT_EXCEL_REPORT", "Generated comprehensive sales summary matrix report for Excel.");
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

    // Filter condition for rows that contain the pencil icon
    const matchesPencil = !filters.pencilOnly || row.hasNaturesSignature; // <-- Add this line

    const matchesState = filters.state === '' || (row.state && row.state.toLowerCase() === filters.state.toLowerCase());

    // <-- Update the return statement to include matchesState
    return matchesSearch && matchesElig && matchesStatus && matchesPencil && matchesState;
  });
 const kpi = filteredArchitects.reduce((acc, row) => {
    acc.totalArchitects++;
    if (row.isEligible) {
      acc.eligible++;
      acc.totalSheets += row.total_sheets || 0; //   ONLY ADD IF ELIGIBLE
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
// Extract unique states for the filter dropdown
  const uniqueStates = [...new Set(architectsList.map(item => item.state).filter(Boolean))];
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
      
      {/* ── REACT MODAL COMPONENT OVERLAY ── */}
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

      {/* ── ARCHITECT DETAILS SUMMARY MODAL ── */}
      {detailsModal.show && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10005,
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', width: '640px', maxWidth: '90%', maxHeight: '85vh',
            padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e5e7eb', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#111827' }}>Sales Summary</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#6b7280' }}>{detailsModal.architectName}</p>
              </div>
              <button 
                onClick={() => setDetailsModal({ show: false, loading: false, architectName: '', summaryData: {} })} 
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}
              >✕</button>
            </div>

            {/* ISOLATED & STABLE CONVERSION FORM */}
            {transferState.show && (
              <div style={{ 
                background: '#f0f9ff', 
                padding: '16px', 
                borderRadius: '8px',
                border: '1px solid #bae6fd',
                marginBottom: '16px',
                display: 'flex', flexDirection: 'column', gap: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, color: '#0369a1', fontSize: '13px', fontWeight: 600 }}>
                    Convert Sheets: <span style={{ color: '#0f172a', fontWeight: 'bold' }}>{transferState.sourceSku}</span>
                  </h4>
                  <button onClick={() => setTransferState(prev => ({ ...prev, show: false }))} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px' }}>✕ Close Panel</button>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select 
                    value={transferState.targetSku}
                    onChange={e => setTransferState(prev => ({ ...prev, targetSku: e.target.value }))}
                    style={{ flex: 2, minWidth: '200px', padding: '8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12.5px', color: '#0f172a' }}
                  >
                    <option value="">-- Select Target Decorative Product --</option>
                    {decorativeMasterList
                      .filter(item => !item.sku.toUpperCase().includes('NATURES SIGNATURE') && !item.sku.toUpperCase().includes('NATURE SIGNATURE'))
                      .map(item => (
                        <option key={item.sku} value={item.sku}>{item.sku} {item.size ? `(${item.size})` : ''}</option>
                      ))
                    }
                  </select>
                  
                  <input 
                    type="number" 
                    placeholder={`Qty (Max ${transferState.maxQty})`}
                    max={transferState.maxQty}
                    min="1"
                    value={transferState.transferQty}
                    onChange={e => setTransferState(prev => ({ ...prev, transferQty: e.target.value }))}
                    style={{ width: '110px', padding: '8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12.5px' }}
                  />
                  
                  <button 
                    onClick={handleTransferSubmit}
                    disabled={transferState.loading}
                    style={{
                      background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px',
                      padding: '8px 16px', fontSize: '12.5px', fontWeight: 600, cursor: transferState.loading ? 'not-allowed' : 'pointer',
                      opacity: transferState.loading ? 0.7 : 1
                    }}
                  >
                    {transferState.loading ? 'Updating...' : 'Confirm'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ overflowY: 'auto', flexGrow: 1, paddingRight: '4px' }}>
              {detailsModal.loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>⏳ Calculating SKU summaries...</div>
              ) : Object.keys(detailsModal.summaryData).length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No eligible sheets found for this architect.</div>
              ) : (
                Object.entries(detailsModal.summaryData).map(([category, data]) => (
                  <div key={category} style={{ marginBottom: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                    
                    {/* Category Header (e.g., PW, BB, Decorative) */}
                    <div style={{ background: '#f9fafb', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb' }}>
                      <strong style={{ fontSize: '14px', color: '#374151' }}>{category}</strong>
                      <strong style={{ fontSize: '14px', color: '#059669' }}>Total: {data.categoryTotal.toFixed(1)} Sheets</strong>
                    </div>
                    
                    {/* Specific SKUs */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <tbody>
                        {Object.entries(data.skus).map(([sku, total], idx) => {
                         const isNaturesSignature = /NATURE'?S?[\s_]*SIGNATURE/i.test(sku || '');
                          return (
                            <tr key={sku} style={{ borderBottom: idx === Object.keys(data.skus).length - 1 ? 'none' : '1px solid #f3f4f6' }}>
                              <td style={{ padding: '10px 16px', color: '#4b5563' }}>
                                {sku}
                              </td>
                              <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 500, color: '#111827', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                                <span>{total.toFixed(1)} Sheets</span>
                                
                                {isNaturesSignature && (
                                  <button 
                                    onClick={() => setTransferState({
                                      show: true,
                                      loading: false,
                                      sourceSku: sku,
                                      maxQty: total,
                                      targetSku: '',
                                      transferQty: ''
                                    })}
                                    style={{
                                      background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                                      borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer',
                                      fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                  >
                                    ✏️ Edit
                                  </button>
                                )}
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

      {/* ── FLOATING TOAST SNACKBAR ── */}
     {/* ── FLOATING TOAST SNACKBAR ── */}
{toast.show && (
  <div style={{
    position: 'fixed', bottom: '24px', right: '24px', 
    padding: '12px 20px', borderRadius: '8px',
    backgroundColor: getToastStyles().bg, color: getToastStyles().color, fontSize: '13px', fontWeight: '500',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
    zIndex: 20000, // 🔥 Changed from 9999 to 20000 to overlay above the edit modal
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
          <div className="kpi-val" style={{ fontSize: '18px', fontWeight: 700, color: '#dc2626', margin: '4px 0' }}>{kpi.notEligible}</div>
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
          {/* Add this inside your filtration control inputs section */}
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
                  <th style={{ padding: '10px 12px', textAlign: 'left',width:'16%' }}>State</th>
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
                      title={`View sales summary for ${row.architect_name}`}
                    >
                      {/* Pencil Icon prefix added dynamically in front of the architect name */}
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
                      <span>{row.architect_name}</span>
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