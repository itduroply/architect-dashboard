import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supbase'; // Adjust this path to match your project directory
import * as XLSX from 'xlsx';

const UploadCalculate = () => {
  // Operational processing states
  const [isUploadingLead, setIsUploadingLead] = useState(false);
  const [isUploadingDmi, setIsUploadingDmi] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPushingLedger, setIsPushingLedger] = useState(false);
  
  // Large file handling memory states
  const [uploadProgress, setUploadProgress] = useState(0);

  // File Presence and data memory caches
  const [leadFileLoaded, setLeadFileLoaded] = useState(false);
  const [dmiFileLoaded, setDmiFileLoaded] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState('claim-output');

  // Interactive Snackbar Feedback Management
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'success' });

  // Analytical Calculation State Metrics
  const [metrics, setMetrics] = useState({
    leadRows: 0,
    dmiRows: 0,
    matchedApproved: 0,
    flagsCount: 0,
    totalQty: 0,
    architectsCount: 0,
    totalPayout: 0,
    zeroRateCount: 0
  });

  // Table lists for reporting view panes
  const [claimOutputData, setClaimOutputData] = useState([]);
  const [architectSummary, setArchitectSummary] = useState([]);
  const [payoutCalcData, setPayoutCalcData] = useState([]);
  const [flagsData, setFlagsData] = useState([]);

  const showNotification = (message, type = 'success') => {
    setSnackbar({ show: true, message, type });
  };
/**
 * Sanitizes input strings by removing non-printable control characters.
 * The use of hexadecimal escapes satisfies the ESLint no-control-regex rule.
 */const safeFormatDate = (val) => {
  if (!val) return null;

  // Excel dates are calendar dates, not instants. Store their local date part
  // instead of converting to UTC, which otherwise shifts Indian midnight back
  // by one day (e.g. 08-Apr becomes 07-Apr in the database).
  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  }

  let strVal = String(val).trim();
  strVal = strVal.replace(/\(.*\)/g, '').replace(/GMT[+-]\d+/g, '').replace(/India Standard Time/g, '').trim();

  const dateOnlyMatch = strVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) return dateOnlyMatch[0];

  const d = new Date(strVal);
  if (Number.isNaN(d.getTime())) return null;

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return Array.from(str)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return !(
        code <= 8 ||
        (code >= 11 && code <= 12) ||
        (code >= 14 && code <= 31) ||
        (code >= 127 && code <= 159)
      );
    })
    .join('');
};
  useEffect(() => {
    if (snackbar.show) {
      const timer = setTimeout(() => {
        setSnackbar(prev => ({ ...prev, show: false }));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [snackbar.show]);

  /**
   * Creates one case-insensitive SKU key for both Excel and master data.
   * Examples: "PW_DUROFLEX_6MM", "pw_duroflex_6mm" and "PW DUROFLEX 6 MM"
   * all resolve to "pwduroflex6mm".
   */
  const aggressiveNormalize = (str) => {
    if (!str) return '';
    return str
      .toString()
      .normalize('NFKC')
      .trim()
      .toLocaleLowerCase('en-US')
      .replace(/[^a-z0-9]/g, '');
  };

  // Parsing and uploading Lead Master records using high-performance mapping lists
// Parsing and uploading Lead Master records with Composite Key deduplication
  const handleLeadMasterUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploadingLead(true);
    setUploadProgress(0);
    showNotification("Parsing large Lead Master spreadsheet configuration...", "info");

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          throw new Error("The selected file contains no valid data matrices rows.");
        }

        // 1. Process and Normalize
        // Inside your handleLeadMasterUpload function:
// 1. Process and Normalize
        const rawLeads = data.map(row => ({
          lead_id: sanitizeString((row['Lead Code'] || row['Lead Number'] || row['lead_id'] || '').toString().trim()),
          created_date: sanitizeString(row['Created Date'] != null ? String(row['Created Date']) : null),
          project_name: sanitizeString((row['Project Name'] || row['project_name'] || 'N/A').toString().trim()),
          latitude: sanitizeString(row['Latitude'] != null ? String(row['Latitude']) : null),
          longitude: sanitizeString(row['Longitude'] != null ? String(row['Longitude']) : null),
          address: sanitizeString(row['Adress'] != null ? String(row['Adress']) : null),
          landmark: sanitizeString(row['Landmark'] != null ? String(row['Landmark']) : null),
          locality: sanitizeString(row['Locality'] != null ? String(row['Locality']) : null),
          sub_locality: sanitizeString(row['Sub Locality'] != null ? String(row['Sub Locality']) : null),
          city: sanitizeString(row['City'] != null ? String(row['City']) : null),
          district: sanitizeString(row['District'] != null ? String(row['District']) : null),
          sub_district: sanitizeString(row['Sub District'] != null ? String(row['Sub District']) : null),
          state: sanitizeString(row['State'] != null ? String(row['State']) : null),
          pincode: sanitizeString(row['Pincode'] != null ? String(row['Pincode']) : null),
          source_of_lead: sanitizeString(row['Source Of Lead'] != null ? String(row['Source Of Lead']) : null),
          type_of_project: sanitizeString(row['Type Of Project'] != null ? String(row['Type Of Project']) : null),
          lead_stage: sanitizeString(row['Lead Stage'] != null ? String(row['Lead Stage']) : null),
          lead_status: sanitizeString(row['Lead Status'] != null ? String(row['Lead Status']) : null),
          decision_maker: sanitizeString(row['Decision Maker'] != null ? String(row['Decision Maker']) : null),
          expected_maturity_date: sanitizeString(row['Expected Maturity Date'] != null ? String(row['Expected Maturity Date']) : null),
          linked_dealer: sanitizeString(row['Linked Dealer'] != null ? String(row['Linked Dealer']) : null),
          linked_influencer: sanitizeString(row['Linked Influencer'] != null ? String(row['Linked Influencer']) : null),
          linked_architect: sanitizeString(row['Linked Architect'] != null ? String(row['Linked Architect']) : null),
          type_of_contact: sanitizeString(row['Type Of Contact'] != null ? String(row['Type Of Contact']) : null),
          no_of_pending_task: sanitizeString(row['No. Of Pending Task'] != null ? String(row['No. Of Pending Task']) : null),
          no_of_completed_task: sanitizeString(row['No. Of Completed Task'] != null ? String(row['No. Of Completed Task']) : null),
          pending_task_assigned_to: sanitizeString(row['Pending Task Assigned To'] != null ? String(row['Pending Task Assigned To']) : null),
          latest_task_type: sanitizeString(row['Latest Task Type'] != null ? String(row['Latest Task Type']) : null),
          latest_task_scheduled_date: sanitizeString(row['Latest Task Scheduled Date'] != null ? String(row['Latest Task Scheduled Date']) : null),
          latest_task_status: sanitizeString(row['Latest Task Status'] != null ? String(row['Latest Task Status']) : null),
          latest_task_assign_to: sanitizeString(row['Latest Task Assign To'] != null ? String(row['Latest Task Assign To']) : null),
          lead_last_update_date: sanitizeString(row['Lead Last Update Date'] != null ? String(row['Lead Last Update Date']) : null),
          lead_created_by: sanitizeString(row['Lead Created By'] != null ? String(row['Lead Created By']) : null),
          task_created_by: sanitizeString(row['Task Created By'] != null ? String(row['Task Created By']) : null),
          contact_type: sanitizeString(row['Contact type'] != null ? String(row['Contact type']) : null),
          contact_person: sanitizeString(row['Contact Person'] != null ? String(row['Contact Person']) : null),
          mobile_no: sanitizeString(row['Mobile No'] != null ? String(row['Mobile No']) : null),
          whatsapp_no: sanitizeString(row['WhatsApp No'] != null ? String(row['WhatsApp No']) : null),
          email_id: sanitizeString(row['Email ID'] != null ? String(row['Email ID']) : null),
          old_lead_status: sanitizeString(row['Old Lead Status'] != null ? String(row['Old Lead Status']) : null),
          ageing: sanitizeString(row['Ageing'] != null ? String(row['Ageing']) : null),
          market_city: sanitizeString(row['Market City'] != null ? String(row['Market City']) : null),
          lead_assign_to: sanitizeString(row['Lead Assign To'] != null ? String(row['Lead Assign To']) : null),
          lead_assign_date: sanitizeString(row['Lead Assign Date'] != null ? String(row['Lead Assign Date']) : null),
          lead_status_changed_on: sanitizeString(row['Lead Status Changed On'] != null ? String(row['Lead Status Changed On']) : null),
          are_you_standing_on_site_location: sanitizeString(row['Are you standing on site location'] != null ? String(row['Are you standing on site location']) : null),
        })).filter(r => r.lead_id);

        // 2. Deduplicate based on the Composite Key (lead_id + project_name)
        // This prevents the "cannot affect row a second time" error
        const uniqueLeadsMap = new Map();
        rawLeads.forEach(lead => {
          const compositeKey = `${lead.lead_id}|${lead.project_name}`.toLowerCase();
          uniqueLeadsMap.set(compositeKey, lead);
        });

        const dedupedLeads = Array.from(uniqueLeadsMap.values());

        // 3. Batch Upsert with Composite onConflict
        const CHUNK_SIZE = 500;
        let processedCount = 0;

        for (let i = 0; i < dedupedLeads.length; i += CHUNK_SIZE) {
          const chunk = dedupedLeads.slice(i, i + CHUNK_SIZE);
          
          const { error } = await supabase
            .from('leads_master')
            .upsert(chunk, { onConflict: 'lead_id, project_name' });

          if (error) throw error;
          processedCount += chunk.length;
          setUploadProgress(Math.round((processedCount / dedupedLeads.length) * 100));
        }

        setLeadFileLoaded(true);
        setMetrics(prev => ({ ...prev, leadRows: dedupedLeads.length }));
        showNotification(`Lead Master sync complete! ${dedupedLeads.length} unique rows processed.`, "success");
      } catch (err) {
        console.error(err);
        showNotification(`Lead upload failed: ${err.message}`, "error");
      } finally {
        setIsUploadingLead(false);
        setUploadProgress(0);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Parsing and uploading DMI Claim records using non-blocking chunking mapping
// Parsing and uploading DMI Claim records using non-blocking chunking mapping
const handleDmiClaimUpload = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setIsUploadingDmi(true);
  setUploadProgress(0);
  showNotification("Parsing large DMI Claim sheets dataset...", "info");

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);

      if (data.length === 0) {
        throw new Error("The selected file contains no relational claim entries.");
      }

      const standardClaims = [];
      for (let idx = 0; idx < data.length; idx++) {
        const row = data[idx];
        const rawLeadId = sanitizeString((row['Lead Number'] || row['Lead ID'] || row['lead_id'] || '').toString().trim());
        
        // REMOVED: The strict `if (rawLeadId)` check so all rows are captured.
        // Fallback fallback handling if claim_no is somehow missing, using index to guarantee uniqueness
        const rawClaimNo = sanitizeString(row['Claim No'] != null ? String(row['Claim No']) : `AUTO-${rawLeadId || 'MISSING'}-${idx}`);

        standardClaims.push({
          parent_claim_no: sanitizeString(row['Parent Claim No'] != null ? String(row['Parent Claim No']) : null),
          claim_no: rawClaimNo,
          claim_date: safeFormatDate(row['Claim Date']),
          account_number: sanitizeString(row['Account Number'] != null ? String(row['Account Number']) : null),
          influencer_name: sanitizeString(row['Influencer Name'] != null ? String(row['Influencer Name']) : null),
          influencer_type: sanitizeString(row['Influencer Type'] != null ? String(row['Influencer Type']) : null),
          influencer_market_city: sanitizeString(row['Influencer Market City'] != null ? String(row['Influencer Market City']) : null),
          mobile_no: sanitizeString(row['Mobile No'] != null ? String(row['Mobile No']) : null),
          pincode: sanitizeString(row['Pincode'] != null ? String(row['Pincode']) : null),
          influencer_city: sanitizeString(row['Influencer City'] != null ? String(row['Influencer City']) : null),
          influencer_district: sanitizeString(row['Influencer District'] != null ? String(row['Influencer District']) : null),
          influencer_state: sanitizeString(row['Influencer State'] != null ? String(row['Influencer State']) : null),
          mapped_isr_code: sanitizeString(row['Mapped ISR CODE'] != null ? String(row['Mapped ISR CODE']) : null),
          claim_approved_by_code_name: sanitizeString(row['Claim Approved by Code & Name'] != null ? String(row['Claim Approved by Code & Name']) : null),
          dealer_district: sanitizeString(row['Dealer District'] != null ? String(row['Dealer District']) : null),
          dealer_state: sanitizeString(row['Dealer State'] != null ? String(row['Dealer State']) : null),
          customer_name: sanitizeString(row['Customer Name'] != null ? String(row['Customer Name']) : null),
          customer_mobile_no: sanitizeString(row['Customer Mobile No'] != null ? String(row['Customer Mobile No']) : null),
          site_address: sanitizeString(row['Site Address'] != null ? String(row['Site Address']) : null),
          purchase_date: safeFormatDate(row['Purchase Date']),
          invoice_no: sanitizeString(row['Invoice No'] != null ? String(row['Invoice No']) : null),
          product_code: sanitizeString(row['Product Code'] != null ? String(row['Product Code']) : null),
          dealer_name: sanitizeString(row['Dealer Name'] != null ? String(row['Dealer Name']) : null),
          dealer_code: sanitizeString(row['Dealer Code'] != null ? String(row['Dealer Code']) : null),
          dealer_gst: sanitizeString(row['Dealer GST'] != null ? String(row['Dealer GST']) : null),
          distributor_name: sanitizeString(row['Distributor Name'] != null ? String(row['Distributor Name']) : null),
          distributor_code: sanitizeString(row['Distributor Code'] != null ? String(row['Distributor Code']) : null),
          base_point1_sheets: sanitizeString(row['Base Point/1 Sheets'] != null ? String(row['Base Point/1 Sheets']) : null),
          claimed_qty: parseFloat(row['Claimed Qty(Sheets)'] || 0),
          approved_qty: parseFloat(row['Approved Qty'] || 0),
          approved_points: sanitizeString(row['Approved Points'] != null ? String(row['Approved Points']) : null),
          status: sanitizeString(row['Status'] != null ? String(row['Status']) : null),
          status_date: safeFormatDate(row['Status Date']),
          se_approved_qtysheets: sanitizeString(row['SE Approved Qty(Sheets)'] != null ? String(row['SE Approved Qty(Sheets)']) : null),
          se_verification_status: sanitizeString(row['SE Verification Status '] != null ? String(row['SE Verification Status ']) : null),
          se_verification_by: sanitizeString(row['SE Verification By'] != null ? String(row['SE Verification By']) : null),
          se_verification_on: safeFormatDate(row['SE Verification On']),
          se_verification_remark: sanitizeString(row['SE Verification Remark'] != null ? String(row['SE Verification Remark']) : null),
          se_verification_rejection_reas: sanitizeString(row['SE Verification Rejection Reas'] != null ? String(row['SE Verification Rejection Reas']) : null),
          state_head_name: sanitizeString(row['State Head Name'] != null ? String(row['State Head Name']) : null),
          state_head_approved_qtysheets: sanitizeString(row['State Head Approved Qty(Sheets)'] != null ? String(row['State Head Approved Qty(Sheets)']) : null),
          state_head_verification_status: sanitizeString(row['State Head Verification Status '] != null ? String(row['State Head Verification Status ']) : null),
          state_head_site_visit_required: sanitizeString(row['State Head Site Visit Required'] != null ? String(row['State Head Site Visit Required']) : null),
          state_head_site_visited: sanitizeString(row['State Head Site Visited'] != null ? String(row['State Head Site Visited']) : null),
          state_head_verification_by: sanitizeString(row['State Head Verification By'] != null ? String(row['State Head Verification By']) : null),
          state_head_verification_on: safeFormatDate(row['State Head Verification On']),
          state_head_verification_remark: sanitizeString(row['State Head Verification Remark'] != null ? String(row['State Head Verification Remark']) : null),
          state_head_verification_rejection_rea: sanitizeString(row['State Head Verification Rejection Rea'] != null ? String(row['State Head Verification Rejection Rea']) : null),
          lvl3_approved_by: sanitizeString(row['LVL3 Approved By'] != null ? String(row['LVL3 Approved By']) : null),
          lvl3_status: sanitizeString(row['LVL3 Status'] != null ? String(row['LVL3 Status']) : null),
          lvl3_approved_qty: sanitizeString(row['LVL3 Approved Qty'] != null ? String(row['LVL3 Approved Qty']) : null),
          lvl3_remark: sanitizeString(row['LVL3 Remark'] != null ? String(row['LVL3 Remark']) : null),
          lvl3_rejection_remark: sanitizeString(row['LVL3 Rejection Remark'] != null ? String(row['LVL3 Rejection Remark']) : null),
          sales_data_not_available: sanitizeString(row['Sales Data Not Available'] != null ? String(row['Sales Data Not Available']) : null),
          dealer_volume_bank_exhausted: sanitizeString(row['Dealer Volume Bank Exhausted'] != null ? String(row['Dealer Volume Bank Exhausted']) : null),
          war_task_no: sanitizeString(row['War Task No'] != null ? String(row['War Task No']) : null),
          war_task_description: sanitizeString(row['War Task Description'] != null ? String(row['War Task Description']) : null),
          war_task_date: safeFormatDate(row['War Task Date']),
          war_task_assign_to: sanitizeString(row['War Task Assign To'] != null ? String(row['War Task Assign To']) : null),
          war_task_status: sanitizeString(row['War Task Status'] != null ? String(row['War Task Status']) : null),
          war_task_status_date: safeFormatDate(row['War Task Status Date']),
          submitted_by: sanitizeString(row['Submitted By'] != null ? String(row['Submitted By']) : null),
          source: sanitizeString(row['Source'] != null ? String(row['Source']) : null),
          total_attempts_till_date: sanitizeString(row['Total Attempts Till Date'] != null ? String(row['Total Attempts Till Date']) : null),
          last_attempt_date: safeFormatDate(row['Last Attempt Date']),
          market_city_state: sanitizeString(row['Market City State'] != null ? String(row['Market City State']) : null),
          war_task_generated: sanitizeString(row['War Task Generated'] != null ? String(row['War Task Generated']) : null),
          war_task_assigned: sanitizeString(row['War Task Assigned'] != null ? String(row['War Task Assigned']) : null),
          influencer_tier: sanitizeString(row['Influencer Tier'] != null ? String(row['Influencer Tier']) : null),
          lead_id: rawLeadId || null, // Stores rawLeadId if it exists, otherwise saves as null
          site_name: sanitizeString(row['Site Name'] != null ? String(row['Site Name']) : null),
        });
      }

      const CHUNK_SIZE = 500;
      let processedCount = 0;

      for (let i = 0; i < standardClaims.length; i += CHUNK_SIZE) {
        const chunk = standardClaims.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from('dmi_claims')
          .upsert(chunk, { onConflict: 'claim_no' });

        if (error) throw error;
        processedCount += chunk.length;
        setUploadProgress(Math.round((processedCount / standardClaims.length) * 100));
      }

      setDmiFileLoaded(true);
      setMetrics(prev => ({ ...prev, dmiRows: standardClaims.length }));
      showNotification(`DMI Claims synced cleanly! ${standardClaims.length} records active.`, "success");
    } catch (err) {
      console.error(err);
      showNotification(`Claims ingestion failed: ${err.message}`, "error");
    } finally {
      setIsUploadingDmi(false);
      setUploadProgress(0);
    }
  };
  reader.readAsBinaryString(file);
};

  // Step 4 execution calculation pipeline - MATCH MATRIX FIX EDITION
// ... (Keep all your existing state and handler code above)

const runClaimProcessor = async () => {
  setIsProcessing(true);
  showNotification("Executing high-speed parallel matrix matching...", "info");

  try {
    // 1. Optimized parallel fetch function
    const fetchAllRecordsOptimized = async (tableName, columns, orderByColumn) => {
      const { count, error: countErr } = await supabase
        .from(tableName)
        .select(columns, { count: 'exact', head: true });

      if (countErr) throw countErr;

      const pageSize = 1000;
      const totalRecords = count || 0;
      const promises = [];

      for (let from = 0; from < totalRecords; from += pageSize) {
        const to = from + pageSize - 1;
        promises.push(
          supabase
            .from(tableName)
            .select(columns)
            .range(from, to)
            .order(orderByColumn)
            .then(res => {
              if (res.error) throw res.error;
              return res.data || [];
            })
        );
      }

      const chunks = await Promise.all(promises);
      return chunks.flat();
    };

    // 2. Fetch dataset tables
    const dbLeads = await fetchAllRecordsOptimized('leads_master', 'lead_id, linked_architect,state,lead_status', 'lead_id');
    const dbClaims = await fetchAllRecordsOptimized('dmi_claims', 'claim_no, lead_id, status, product_code, approved_qty,claim_date', 'claim_no');
    // The ledger is transactional. Once a claim has been settled (or its Nature's
    // Signature volume has been converted), importing the same source files must
    // never recreate or overwrite that ledger transaction.
    const existingLedgerRows = await fetchAllRecordsOptimized(
      'commission_ledger',
      'claim_no, product_sku, total_eligible_sheets, payout_status',
      'claim_no'
    );
    
    const { data: dbSkus, error: errSkus } = await supabase.from('product_sku_master').select('sku, price');

    if (errSkus) {
      throw new Error("Unable to pull core dataset tables from Supabase database storage.");
    }

    if (!dbClaims || dbClaims.length === 0) {
      showNotification("No records exist to process. Please upload files first.", "error");
      setIsProcessing(false);
      return;
    }

    const existingLedgerClaimNos = new Set(
      existingLedgerRows
        .map(row => String(row.claim_no || '').trim())
        .filter(Boolean)
    );

    // Legacy conversions created target rows with IDs such as SOURCE-1-1.1.
    // Retain this recognition so conversions made before the zero-volume source
    // row fix are also protected when an old report is uploaded again.
    const legacyConvertedNatureClaimNos = new Set();
    const legacyConvertedTargetsBySourceClaim = new Map();
    existingLedgerRows.forEach(row => {
      const targetSku = String(row.product_sku || '');
      const targetClaimNo = String(row.claim_no || '').trim();
      const match = targetClaimNo.match(/^([^-]+)-([^-]+)-1\.\d+$/);

      if (match && !/NATURE'?S?[\s_]*SIGNATURE/i.test(targetSku)) {
        const sourceClaimNo = `${match[1]}-${match[2]}`;
        legacyConvertedNatureClaimNos.add(sourceClaimNo);
        const targets = legacyConvertedTargetsBySourceClaim.get(sourceClaimNo) || [];
        targets.push(row);
        legacyConvertedTargetsBySourceClaim.set(sourceClaimNo, targets);
      }
    });

    // Repair source rows created by the old re-upload bug, but only for a full
    // conversion: its converted target must have exactly the same sheet volume.
    // A partially converted Nature's Signature row is deliberately left intact.
    const legacySourceRowsToZero = existingLedgerRows.filter(row => {
      const sourceClaimNo = String(row.claim_no || '').trim();
      const sourceSku = String(row.product_sku || '');
      if (!/NATURE'?S?[\s_]*SIGNATURE/i.test(sourceSku)) return false;

      const convertedTargets = legacyConvertedTargetsBySourceClaim.get(sourceClaimNo) || [];
      const sourceSheets = parseFloat(row.total_eligible_sheets || 0);
      return sourceSheets > 0 && convertedTargets.some(target =>
        Math.abs(parseFloat(target.total_eligible_sheets || 0) - sourceSheets) < 0.0001
      );
    });

    if (legacySourceRowsToZero.length > 0) {
      await Promise.all(legacySourceRowsToZero.map(sourceRow =>
        supabase
          .from('commission_ledger')
          .update({
            total_eligible_sheets: 0,
            total_payout_amount: 0,
            payout_status: 'Converted to Decorative SKU'
          })
          .eq('claim_no', sourceRow.claim_no)
          .eq('product_sku', sourceRow.product_sku)
          .then(({ error }) => {
            if (error) throw error;
          })
      ));
    }

    // Build lookup maps
    const leadsMap = {};
    dbLeads.forEach(l => { 
      const hasArchitect = l.linked_architect && l.linked_architect.toString().trim() !== '';
      if (l.lead_id && hasArchitect) {
        const cleanId = l.lead_id.toString().trim();
        leadsMap[cleanId] = l; 
      }
    });

    const skuPriceMap = {};
    dbSkus.forEach(s => {
      if (s.sku) {
        const normKey = aggressiveNormalize(s.sku);
        skuPriceMap[normKey] = parseFloat(s.price || 0);
      }
    });

    let calculatedOutputs = [];
    let analyticalFlags = [];
    let architectGroupAggregation = {};
    let validMatches = 0;
    let zeroRates = 0;
    let aggregatedTotalSheets = 0;

    // Process claims
    dbClaims.forEach(claim => {
      const claimNo = String(claim.claim_no || '').trim();
      const claimLeadId = (claim.lead_id || '').toString().trim();
      const matchingLead = leadsMap[claimLeadId];
      const currentStatus = (claim.status || '').toString().trim().toUpperCase();
      const fileProductCode = (claim.product_code || '').toString().trim();
      const isNatureSignature = /SIGNATURE|NATURE/i.test(fileProductCode);

      if (existingLedgerClaimNos.has(claimNo)) {
        analyticalFlags.push({
          id: claim.claim_no,
          type: 'Existing Ledger Claim Skipped',
          description: `Claim '${claim.claim_no}' is already present in Commission Ledger and was not processed again.`
        });
        return;
      }

      if (isNatureSignature && legacyConvertedNatureClaimNos.has(claimNo)) {
        analyticalFlags.push({
          id: claim.claim_no,
          type: 'Previously Converted Nature Signature Claim Skipped',
          description: `Claim '${claim.claim_no}' was previously converted and will not be recreated from this upload.`
        });
        return;
      }

      const isApproved = currentStatus.startsWith('APPROVE') || currentStatus === 'SANCTIONED';

      if (!isApproved) {
        analyticalFlags.push({
          id: claim.claim_no,
          type: 'Status Validation Exclusion',
          description: `Record skipped: Status is '${claim.status}'. Only APPROVED/SANCTIONED records are processed.`
        });
        return; 
      }

      if (!matchingLead) {
        analyticalFlags.push({
          id: claim.claim_no,
          type: 'Orphan or No-Architect Lead',
          description: `Lead ID key '${claimLeadId}' either has no matching row in Leads Master, or the linked_architect is NULL/Empty.`
        });
        return;
      }

      const leadStatusClean = (matchingLead.lead_status || '').toString().trim().toUpperCase();
      if (leadStatusClean === 'LOST') {
        analyticalFlags.push({
          id: claim.claim_no,
          type: 'Lost Lead Exclusion',
          description: `Claim skipped: Associated Lead ID '${claimLeadId}' status is marked as LOST.`
        });
        return; 
      }

      const architectName = (() => {
        const rawArchitect = matchingLead?.linked_architect;
        if (!rawArchitect || rawArchitect.toString().trim() === '') {
          return 'Unmapped / Unknown Architect';
        }
        return rawArchitect.toString().trim();
      })();

      const safeClaimDate = (() => {
        if (!claim || !claim.claim_date) return null;
        try {
          const d = new Date(claim.claim_date);
          d.setDate(d.getDate() + 1);
          return d.toISOString().split('T')[0];
        } catch (e) {
          return null;
        }
      })();

      const leadState = matchingLead?.state ? matchingLead.state.toString().trim() : 'Unknown';
      const leadStatus = matchingLead?.lead_status ? matchingLead.lead_status.toString().trim() : 'Unknown';
      let matchKey = aggressiveNormalize(fileProductCode);

      // =========================================================================
      // NATURE'S SIGNATURE DIRECT BYPASS & PRICE MATRIX LOOKUP
      // =========================================================================
      let unitRatePrice = 0;

      if (isNatureSignature) {
        // Direct bypass: Do NOT search product_sku_master. Force rate = 0.
        unitRatePrice = 0;
      } else {
        // Standard SKU Matrix lookup
        unitRatePrice = skuPriceMap[matchKey] || 0;

        // Fallbacks for Doors & Generic Decorative
        if (unitRatePrice === 0) {
          if (fileProductCode.toUpperCase().startsWith('FD') || matchKey.startsWith('fd')) {
            const rootDoor = matchKey.replace(/\d+mm$/i, '') + 'allthickness';
            if (skuPriceMap[rootDoor]) unitRatePrice = skuPriceMap[rootDoor];
          } else if (fileProductCode.toUpperCase().startsWith('DECORATIVE') || matchKey.startsWith('decorative')) {
            const rootDecor = matchKey.replace(/\d+$/i, '') + 'allthickness';
            if (skuPriceMap[rootDecor]) unitRatePrice = skuPriceMap[rootDecor];
          }
        }
      }

      // Drop and flag ONLY if rate is 0 AND it's NOT a Nature's Signature item
      if (unitRatePrice === 0 && !isNatureSignature) {
        zeroRates++;
        analyticalFlags.push({
          id: claim.claim_no,
          type: 'Price Matrix Lookup Miss',
          description: `No pricing match for: '${fileProductCode}'`
        });
        return;
      }
      // =========================================================================

      const eligibleQty = parseFloat(claim.approved_qty || 0);
      const calculatedPayoutValue = eligibleQty * unitRatePrice; // 0 for Nature's Signature

      validMatches++;
      aggregatedTotalSheets += eligibleQty;

      calculatedOutputs.push({
        claim_no: claim.claim_no,
        lead_id: claimLeadId,
        architect: architectName,
        claim_date: safeClaimDate,
        state: leadState,
        lead_status: leadStatus,
        product: fileProductCode,
        qty: eligibleQty,
        rate: unitRatePrice,
        payout: calculatedPayoutValue
      });

      if (!architectGroupAggregation[architectName]) {
        architectGroupAggregation[architectName] = { sheets: 0, money: 0, distinctLeads: new Set() };
      }
      architectGroupAggregation[architectName].sheets += eligibleQty;
      architectGroupAggregation[architectName].money += calculatedPayoutValue;
      architectGroupAggregation[architectName].distinctLeads.add(claimLeadId);
    });

    const compiledArchitectRows = Object.keys(architectGroupAggregation).map(name => ({
      name: name,
      leadsCalculated: architectGroupAggregation[name].distinctLeads.size,
      totalSheetsVolume: architectGroupAggregation[name].sheets,
      calculatedPayout: architectGroupAggregation[name].money
    }));

    // ==========================================
    // DATABASE SYNC TO COMMISSION LEDGER
    // ==========================================
    if (calculatedOutputs.length > 0) {
      showNotification(`Syncing ${calculatedOutputs.length} unique settlements into Commission Ledger...`, "info");
      
      const batchSize = 2000;
      for (let i = 0; i < calculatedOutputs.length; i += batchSize) {
        const chunk = calculatedOutputs.slice(i, i + batchSize).map(row => ({
          architect_name: row.architect,
          claim_no: row.claim_no,
          lead_id: row.lead_id,
          state: row.state,
          lead_status: row.lead_status,
          claim_date: row.claim_date,
          product_sku: row.product,
          total_eligible_sheets: row.qty,
          matrix_rate: row.rate, // Saves as 0 for Nature's Signature
          total_payout_amount: row.payout, // Saves as 0 for Nature's Signature
          transaction_timestamp: new Date().toISOString(),
          payout_status: 'Settlement Generated'
        }));

        const { error: ledgerError } = await supabase
          .from('commission_ledger')
          .upsert(chunk, { onConflict: 'claim_no' });

        if (ledgerError) throw ledgerError;
      }
    }

    setClaimOutputData(calculatedOutputs);
    setArchitectSummary(compiledArchitectRows);
    setPayoutCalcData(calculatedOutputs); 
    setFlagsData(analyticalFlags);

    setMetrics({
      leadRows: dbLeads.length,
      dmiRows: dbClaims.length,
      matchedApproved: validMatches,
      flagsCount: analyticalFlags.length,
      totalQty: aggregatedTotalSheets,
      architectsCount: compiledArchitectRows.length,
      totalPayout: compiledArchitectRows.reduce((acc, curr) => acc + curr.calculatedPayout, 0),
      zeroRateCount: zeroRates
    });

    setShowResults(true);
    showNotification("All records successfully matched & saved to Ledger!", "success");
  } catch (err) {
    console.error(err);
    showNotification(`Processing error: ${err.message}`, "error");
  } finally {
    setIsProcessing(false);
  }
};

  /**
   * UPDATED: Safely UPSERTS transactional breakdown commission calculations directly into ledger table
   * Maps out row-by-row data from 'payoutCalcData' and maps to 'architect_name'.
   */
  const pushClaimsToLedger = async () => {
    if (payoutCalcData.length === 0) return;
    setIsPushingLedger(true);
    showNotification("Routing payout matrix breakdowns to Commission Ledger...", "info");

    try {
      const ledgerPayload = payoutCalcData.map(row => ({
        architect_name: row.architect,               // Swapped beneficiary_name -> architect_name
        claim_no: row.claim_no,                       // Line-item claim constraint tracking
        lead_id: row.lead_id,
        product_sku: row.product,
        total_eligible_sheets: row.qty,               // Base volume item metric
        matrix_rate: row.rate,
        total_payout_amount: row.payout,              // Row line payout value computed
        transaction_timestamp: new Date().toISOString(),
        payout_status: 'Settlement Generated'
      }));

      // Uses upsert linked with primary key field 'claim_no' to safely prevent duplicate lines
      const { error } = await supabase
        .from('commission_ledger')
        .upsert(ledgerPayload, { onConflict: 'claim_no' });

      if (error) throw error;
      showNotification("Success! Fine-grain payout calculation matrices updated in registry.", "success");
    } catch (err) {
      console.error(err);
      showNotification(`Ledger transactional breakout sync failure: ${err.message}`, "error");
    } finally {
      setIsPushingLedger(false);
    }
  };

  /**
   * FIXED: Dynamic XLSX File Downloader Engine
   * Converts data arrays directly into native spreadsheet downloads
   */
  const exportClaimOutput = (type) => {
    try {
      let dataToExport = [];
      let fileName = 'Report.xlsx';
      let sheetName = 'Data';

      if (type === 'output') {
        dataToExport = claimOutputData.map(row => ({
          'Claim Number': row.claim_no,
          'Lead ID': row.lead_id,
          'Linked Architect': row.architect,
          'Product Code String': row.product,
          'Approved Sheets Volume': row.qty
        }));
        fileName = 'Claim_Output_Data.xlsx';
        sheetName = 'Claim Base Records';
      } 
      else if (type === 'flags') {
        dataToExport = flagsData.map(row => ({
          'Reference ID': row.id,
          'Issue Classification': row.type,
          'Error Breakdown Log': row.description
        }));
        fileName = 'Processing_Flags_And_Issues.xlsx';
        sheetName = 'Exclusion Logs';
      } 
      else if (type === 'architect') {
        dataToExport = architectSummary.map(row => ({
          'Architect (Beneficiary)': row.name,
          'Unique Leads Handled': row.leadsCalculated,
          'Total Sheets Sum': row.totalSheetsVolume
        }));
        fileName = 'Architect_Summary_Report.xlsx';
        sheetName = 'Architect Aggregate';
      } 
      else if (type === 'full') {
        // Full consolidated payout calculation sheets dataset
        dataToExport = payoutCalcData.map(row => ({
          'Beneficiary (Architect)': row.architect,
          'Product Reference Code': row.product,
          'Volume Sheets': row.qty,
          'Matrix Payout Unit Rate': row.rate,
          'Final Net Commission (INR)': row.payout
        }));
        fileName = 'Full_Calculated_Payout_Report.xlsx';
        sheetName = 'Commission Matrix Calculations';
      }

      if (dataToExport.length === 0) {
        showNotification("No analytical data exists in this tab scope to write into Excel.", "error");
        return;
      }

      // Create Worksheet and Workbook objects natively
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      
      // Fire browser trigger file download
      XLSX.writeFile(wb, fileName);
      showNotification(`File "${fileName}" generated and downloaded successfully!`, "success");
    } catch (err) {
      console.error("Excel generation tracking error: ", err);
      showNotification("Failed to synthesize Excel report spreadsheet.", "error");
    }
  };

  return (
    <div className="page" id="page-claims" style={{ fontFamily: 'Inter, sans-serif', padding: '20px' }}>
      
      {/* Dynamic Floating Snackbar Notification Alerts */}
      {snackbar.show && (
        <div style={{
          position: 'fixed',
          top: '58px',
          right: '24px',
          zIndex: 9999,
          background: snackbar.type === 'success' ? '#10b981' : snackbar.type === 'error' ? '#ef4444' : '#3b82f6',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          fontWeight: 500,
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
        }}>
          {snackbar.message}
        </div>
      )}

      {/* Download action ribbon */}
      <div className="dl-strip" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '11px', color: '#6b7280', marginRight: '4px' }}>Download:</span>
        <button className="btn-dl" onClick={() => exportClaimOutput('output')}>⬇ Claim Output</button>
        <button className="btn-dl" onClick={() => exportClaimOutput('flags')}>⬇ Flags &amp; Issues</button>
        <button className="btn-dl" onClick={() => exportClaimOutput('architect')}>⬇ Architect Summary</button>
        <div className="dl-sep" style={{ width: '1px', background: '#e5e7eb', height: '16px' }}></div>
        <button className="btn-dl btn-dl-primary" onClick={() => exportClaimOutput('full')}>⬇ Full Claim Report</button>
      </div>

      {/* Information Header Block */}
      <div style={{
        background: '#eef3fc', 
        border: '1px solid #a8c0e8', 
        borderRadius: '10px', 
        padding: '14px 18px', 
        marginBottom: '16px', 
        display: 'flex', 
        gap: '18px', 
        flexWrap: 'wrap', 
        alignItems: 'flex-start'
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1d4ed8', whiteSpace: 'nowrap', marginTop: '2px' }}>
          🔗 Automated Claims Engine
        </div>
        <div style={{ fontSize: '12px', color: '#2050a0', lineHeight: 1.85, flex: 1 }}>
          <strong>Step 1 — Configure Rates</strong>: Synced with your dynamic Payout Rate Matrix master schema. &nbsp;·&nbsp;
          <strong>Step 2 — Ingest Relationships</strong>: Drop your Lead Master matching unique Lead IDs with linked Architect metrics. &nbsp;·&nbsp;
          <strong>Step 3 — Compute Allocations</strong>: Hit processing to automatically isolate entries marked with absolute <strong>APPROVED</strong> or <strong>SANCTIONED</strong> statuses, resolve custom dimensions, and build the payout registry.
        </div>
        <button 
          className="btn-dl btn-dl-primary" 
          onClick={runClaimProcessor} 
          disabled={isProcessing}
          id="btnRunClaims" 
          style={{ whiteSpace: 'nowrap', alignSelf: 'center', background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
        >
          {isProcessing ? '⏳ Computing...' : '⚡ Process Claims'}
        </button>
      </div>

      {/* Upload Drag Zones Grid Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

        {/* ZONE A: Lead Master Ingestion */}
        <div className="card" style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', background: '#fff' }}>
          <div className="card-hd" style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
            <div className="card-icon" style={{ fontSize: '20px' }}>📋</div>
            <div>
              <div className="card-title" style={{ fontWeight: 600, fontSize: '14px' }}>Dataset 1 — Lead Master</div>
              <div className="card-sub" style={{ fontSize: '12px', color: '#6b7280' }}>Contains Lead ID · Architect mapping · DMI mapping</div>
            </div>
          </div>
          <div className="card-body">
            <div className="dropzone" id="dzLead" style={{ border: '2px dashed #d1d5db', padding: '24px', borderRadius: '8px', textAlign: 'center', position: 'relative', background: isUploadingLead ? '#f3f4f6' : 'transparent' }}>
              <input 
                type="file" 
                id="fileLeadMaster" 
                accept=".xlsx,.xls,.csv" 
                onChange={handleLeadMasterUpload} 
                disabled={isUploadingLead}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} 
              />
              <span className="dz-icon" style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📋</span>
              <div className="dz-title" style={{ fontWeight: 500, fontSize: '14px' }}>
                {isUploadingLead ? `Uploading to Database (${uploadProgress}%)` : 'Drop Lead Detail Report'}
              </div>
              <div className="dz-sub" style={{ fontSize: '11px', color: '#9ca3af' }}>.xlsx · .xls · .csv — Lead ID · Architect · DMI</div>
            </div>
            
            <div className="status" id="statusLead" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div className="s-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: leadFileLoaded ? '#10b981' : '#d1d5db' }}></div>
              <span id="statusLeadTxt" style={{ fontSize: '12px', color: '#4b5563' }}>
                {leadFileLoaded ? 'New Lead Master file database active' : 'Using historical backend rows unless dynamic sheets are dropped'}
              </span>
            </div>
          </div>
        </div>

        {/* ZONE B: DMI Claim Sheet Ingestion */}
        <div className="card" style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', background: '#fff' }}>
          <div className="card-hd" style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
            <div className="card-icon" style={{ fontSize: '20px' }}>📊</div>
            <div>
              <div className="card-title" style={{ fontWeight: 600, fontSize: '14px' }}>Dataset 2 — DMI Claim Sheet</div>
              <div className="card-sub" style={{ fontSize: '12px', color: '#6b7280' }}>Contains Lead ID · Approved Qty · Claim Status</div>
            </div>
          </div>
          <div className="card-body">
            <div className="dropzone" id="dzDmi" style={{ border: '2px dashed #d1d5db', padding: '24px', borderRadius: '8px', textAlign: 'center', position: 'relative', background: isUploadingDmi ? '#f3f4f6' : 'transparent' }}>
              <input 
                type="file" 
                id="fileDmiClaim" 
                accept=".xlsx,.xls,.csv" 
                onChange={handleDmiClaimUpload}
                disabled={isUploadingDmi}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} 
              />
              <span className="dz-icon" style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📊</span>
              <div className="dz-title" style={{ fontWeight: 500, fontSize: '14px' }}>
                {isUploadingDmi ? `Uploading to Database (${uploadProgress}%)` : 'Drop Influencer Claim Stage Detail Report'}
              </div>
              <div className="dz-sub" style={{ fontSize: '11px', color: '#9ca3af' }}>.xlsx · .xls · .csv — Lead ID · Approved Qty · Status</div>
            </div>
            
            <div className="status" id="statusDmi" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div className="s-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: dmiFileLoaded ? '#10b981' : '#d1d5db' }}></div>
              <span id="statusDmiTxt" style={{ fontSize: '12px', color: '#4b5563' }}>
                {dmiFileLoaded ? 'New active DMI Claim records operational' : 'Using database records unless new files are provided'}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* PROCESSING ANALYTICS METRICS OUTPUT DISPLAY */}
      {showResults && (
        <div id="claimResultSection" style={{ marginTop: '24px' }}>
          
         

          {/* Tab View Interfaces */}
          <div className="card" style={{ border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
            <div className="card-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div className="card-title" style={{ fontWeight: 600, fontSize: '15px' }}>Claim Processing Computation Output</div>
              </div>
              <div>
                <button 
                  className="btn btn-gold" 
                  onClick={pushClaimsToLedger} 
                  disabled={isPushingLedger || payoutCalcData.length === 0}
                  style={{ background: '#d97706', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }}
                >
                  {isPushingLedger ? '⏳ Posting to Ledger...' : '⬆ Push Payout Matrix to Ledger'}
                </button>
              </div>
            </div>
            
            {/* Sub Nav Tab Strip */}
            <div className="tabbar" style={{ display: 'flex', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <button className={`tabbtn ${activeTab === 'claim-output' ? 'active' : ''}`} style={{ padding: '12px 16px', border: 'none', background: activeTab === 'claim-output' ? '#fff' : 'transparent', borderBottom: activeTab === 'claim-output' ? '2px solid #2563eb' : 'none', cursor: 'pointer', fontWeight: 500, fontSize: '13px' }} onClick={() => setActiveTab('claim-output')}>Claim Output</button>
              <button className={`tabbtn ${activeTab === 'claim-arch' ? 'active' : ''}`} style={{ padding: '12px 16px', border: 'none', background: activeTab === 'claim-arch' ? '#fff' : 'transparent', borderBottom: activeTab === 'claim-arch' ? '2px solid #2563eb' : 'none', cursor: 'pointer', fontWeight: 500, fontSize: '13px' }} onClick={() => setActiveTab('claim-arch')}>By Architect</button>
              <button className={`tabbtn ${activeTab === 'claim-payout' ? 'active' : ''}`} style={{ padding: '12px 16px', border: 'none', background: activeTab === 'claim-payout' ? '#fff' : 'transparent', borderBottom: activeTab === 'claim-payout' ? '2px solid #2563eb' : 'none', cursor: 'pointer', fontWeight: 500, fontSize: '13px' }} onClick={() => setActiveTab('claim-payout')}>💰 Payout Calculation</button>
              <button className={`tabbtn ${activeTab === 'claim-flags' ? 'active' : ''}`} style={{ padding: '12px 16px', border: 'none', background: activeTab === 'claim-flags' ? '#fff' : 'transparent', borderBottom: activeTab === 'claim-flags' ? '2px solid #2563eb' : 'none', cursor: 'pointer', fontWeight: 500, fontSize: '13px' }} onClick={() => setActiveTab('claim-flags')}>
                Flags &amp; Issues <span className="badge b-red" style={{ background: '#ef4444', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', marginLeft: '4px' }}>{metrics.flagsCount}</span>
              </button>
            </div>
            
            {/* Tab Pane Output Data Renderers */}
            <div style={{ padding: '16px', maxHeight: '400px', overflowY: 'auto' }}>
              {activeTab === 'claim-output' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Claim No</th>
                      <th style={{ padding: '8px' }}>Lead ID</th>
                      <th style={{ padding: '8px' }}>Linked Architect</th>
                      <th style={{ padding: '8px' }}>Product SKU</th>
                      <th style={{ padding: '8px' }}>Approved Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claimOutputData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px' }}>{row.claim_no}</td>
                        <td style={{ padding: '8px' }}>{row.lead_id}</td>
                        <td style={{ padding: '8px' }}>{row.architect}</td>
                        <td style={{ padding: '8px' }}>{row.product}</td>
                        <td style={{ padding: '8px' }}>{row.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === 'claim-arch' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Architect Title Entity</th>
                      <th style={{ padding: '8px' }}>Unique Leads Covered</th>
                      <th style={{ padding: '8px' }}>Total Volume Sheets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {architectSummary.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px', fontWeight: 500 }}>{row.name}</td>
                        <td style={{ padding: '8px' }}>{row.leadsCalculated}</td>
                        <td style={{ padding: '8px' }}>{row.totalSheetsVolume.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === 'claim-payout' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Beneficiary Name</th>
                      <th style={{ padding: '8px' }}>SKU Token Reference</th>
                      <th style={{ padding: '8px' }}>Eligible Volume</th>
                      <th style={{ padding: '8px' }}>Matrix Rate</th>
                      <th style={{ padding: '8px' }}>Computed Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoutCalcData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px' }}>{row.architect}</td>
                        <td style={{ padding: '8px' }}>{row.product}</td>
                        <td style={{ padding: '8px' }}>{row.qty}</td>
                        <td style={{ padding: '8px' }}>{row.rate > 0 ? `₹${row.rate}` : <span style={{ color: '#dc2626' }}>₹0 (No Rule)</span>}</td>
                        <td style={{ padding: '8px', fontWeight: 600, color: '#059669' }}>₹{row.payout.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === 'claim-flags' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Reference Key ID</th>
                      <th style={{ padding: '8px' }}>Anomalous Classification</th>
                      <th style={{ padding: '8px' }}>Log Descriptions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flagsData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: '#fff5f5' }}>
                        <td style={{ padding: '8px', color: '#b91c1c' }}>{row.id}</td>
                        <td style={{ padding: '8px', fontWeight: 500, color: '#991b1b' }}>{row.type}</td>
                        <td style={{ padding: '8px', color: '#dc2626' }}>{row.description}</td>
                      </tr>
                    ))}
                    {flagsData.length === 0 && (
                      <tr>
                        <td colSpan="3" style={{ padding: '16px', textAlign: 'center', color: '#9ca3af' }}>No compliance or parsing flags identified.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadCalculate;
