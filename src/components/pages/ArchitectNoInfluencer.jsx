import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supbase';
import * as XLSX from 'xlsx';
import { Calendar } from 'lucide-react';

// Architect-only claims: ledger rows whose DMI claim has no Influencer Type,
// on a lead that has an architect tagged. This page uses the same
// commission_ledger logic as Architect Accounts and only narrows it to those
// claims. It is read-only — nothing here writes to Supabase.

// commission_ledger dates arrive as either a plain date ("2026-07-21") or a
// timestamptz. Plain dates are parsed as local so they never slide back a day.
const toLocalDate = (value) => {
  if (!value) return null;
  const str = String(value);
  if (str.includes('T')) {
    const parsed = new Date(str);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const hasText = (value) => Boolean(value && String(value).trim());

const NATURE_SIGNATURE_RE = /NATURE'?S?[\s_]*SIGNATURE/i;

// Same helpers as Architect Accounts, so names and IDs read the same on both pages.
const extractArchitectId = (fullName) => {
  if (!fullName) return 'UNKNOWN';
  const str = String(fullName);
  return str.includes('|') ? str.split('|')[0].trim() : str.trim();
};

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

  nameWithDetails = nameWithDetails.replace(
    /\b([a-z]+?)(prasad|kalandre|pratab|yadav|kohli|singhai|charate|singhal|agarawal|agarwal|bansal|bhatt|chopra|gupta|jain|kapoor|khanna|maddela|mali|mehta|murthy|nawal|patel|rathore|reddy|sharma|singh|verma|kumar|powar)\b/ig,
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

// leads_master.lead_created_by is stored as "LOGINID | Name" — the DGO's
// human name is the part after the pipe.
const getDgoNameFromLeadCreatedBy = (value) => {
  const parts = String(value ?? '').split('|');
  return (parts[1] || parts[0] || '').trim();
};

const getProductCategory = (sku) => {
  const upperSku = String(sku || '').toUpperCase();
  if (upperSku.startsWith('PW')) return 'Plywood (PW)';
  if (upperSku.startsWith('BB')) return 'Blockboard (BB)';
  if (upperSku.startsWith('FD')) return 'Flush Door (FD)';
  if (upperSku.includes('DEC') || upperSku.includes('DECORATIVE') || NATURE_SIGNATURE_RE.test(upperSku)) return 'Decorative';
  return 'Other';
};

const formatRupees = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const ArchitectNoInfluencer = () => {
  const [filters, setFilters] = useState({
    search: '', eligibility: '', natureSignature: '', branch: '', startDate: '', endDate: '',
  });

  const [loading, setLoading] = useState(true);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [leadInfoMap, setLeadInfoMap] = useState({});
  const [eligibilityMap, setEligibilityMap] = useState({});
  const [detailsArchitectId, setDetailsArchitectId] = useState(null);
  const [expandedLeadIds, setExpandedLeadIds] = useState(new Set());
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
  };

  const fetchLedgerData = useCallback(async () => {
    setLoading(true);
    try {
      // Supabase caps a single request at 1,000 rows, so page through the ledger.
      let ledgerData = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data: pageData, error } = await supabase
          .from('commission_ledger')
          .select('*')
          .order('claim_no')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        ledgerData = ledgerData.concat(pageData || []);
        if (!pageData || pageData.length < pageSize) break;
      }

      // A ledger row belongs here only when its DMI claim has no Influencer
      // Type. A Nature's Signature conversion gets a new claim number
      // (SOURCE-1.N, e.g. C123-1-1.1), so it is traced back to its source claim.
      const getSourceClaimNo = (claimNo) => String(claimNo || '').trim().replace(/-1\.\d+$/, '');
      const claimNosToCheck = [...new Set(ledgerData.flatMap(row => {
        const claimNo = String(row.claim_no || '').trim();
        return claimNo ? [claimNo, getSourceClaimNo(claimNo)] : [];
      }))];
      const claimChunks = [];
      for (let i = 0; i < claimNosToCheck.length; i += 200) {
        claimChunks.push(claimNosToCheck.slice(i, i + 200));
      }
      const claimChunkResults = await Promise.all(claimChunks.map(chunk =>
        supabase.from('dmi_claims').select('claim_no, influencer_type').in('claim_no', chunk)
      ));
      const influencerTypeByClaim = {};
      claimChunkResults.forEach(({ data: claimRows, error: claimError }) => {
        if (claimError) throw claimError;
        (claimRows || []).forEach(claim => {
          influencerTypeByClaim[String(claim.claim_no || '').trim()] = claim.influencer_type;
        });
      });
      const claimHasNoInfluencerType = (claimNo) => {
        const ownClaimNo = String(claimNo || '').trim();
        const matchedClaimNo = ownClaimNo in influencerTypeByClaim ? ownClaimNo : getSourceClaimNo(ownClaimNo);
        return matchedClaimNo in influencerTypeByClaim && !hasText(influencerTypeByClaim[matchedClaimNo]);
      };

      // Same Lead Master check as Architect Accounts: the lead must still have
      // an architect linked. Lead details are read here for the site cards.
      const ledgerLeadIds = [...new Set(
        ledgerData.map(row => String(row.lead_id || '').trim()).filter(Boolean)
      )];
      const leadIdChunks = [];
      for (let i = 0; i < ledgerLeadIds.length; i += 200) {
        leadIdChunks.push(ledgerLeadIds.slice(i, i + 200));
      }
      const leadChunkResults = await Promise.all(leadIdChunks.map(chunk =>
        supabase
          .from('leads_master')
          .select('lead_id, project_name, linked_architect, address, landmark, city, district, state, pincode')
          .in('lead_id', chunk)
      ));

      const architectLeadIds = new Set();
      const infoByLead = {};
      leadChunkResults.forEach(({ data: leadRows, error: leadError }) => {
        if (leadError) throw leadError;
        (leadRows || []).forEach(lead => {
          const leadId = String(lead.lead_id || '').trim();
          if (hasText(lead.linked_architect)) {
            architectLeadIds.add(leadId);
            if (!infoByLead[leadId]) infoByLead[leadId] = lead;
          }
        });
      });

      // Eligibility is read the same way Architect Accounts reads it (ledger
      // status over the saved browser copy), but never written from here.
      const serverStatusMap = {};
      ledgerData.forEach(row => {
        const archId = extractArchitectId(row.architect_name || '');
        if (row.status && archId) serverStatusMap[archId] = String(row.status).toLowerCase();
      });
      let savedStatusMap = {};
      try {
        savedStatusMap = JSON.parse(localStorage.getItem('architect_eligibility_registry_v2') || '{}') || {};
      } catch (err) {
        savedStatusMap = {};
      }
      setEligibilityMap({ ...savedStatusMap, ...serverStatusMap });

      // Zero-sheet rows are conversion safeguards only, as on Architect Accounts.
      setLedgerRows(ledgerData.filter(row =>
        Number(row.total_eligible_sheets || 0) > 0 &&
        architectLeadIds.has(String(row.lead_id || '').trim()) &&
        claimHasNoInfluencerType(row.claim_no)
      ));
      setLeadInfoMap(infoByLead);
    } catch (err) {
      console.error('Error loading architect-only site ledger:', err.message);
      showToast(`❌ Database Fetch Error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLedgerData();
  }, [fetchLedgerData]);

  const architectsList = useMemo(() => {
    const aggregationMap = {};

    ledgerRows.forEach((row) => {
      const rawName = row.architect_name || 'Unmapped Architect';
      const archId = extractArchitectId(rawName);
      const sheets = parseFloat(row.total_eligible_sheets || 0);
      const payout = parseFloat(row.total_payout_amount || 0);

      if (!aggregationMap[archId]) {
        aggregationMap[archId] = {
          uniqueKey: archId,
          architect_id: archId,
          architect_name: rawName,
          branchSet: new Set(),
          ledgerRows: [],
          total_sheets: 0,
          raw_pool_payout: 0,
          hasNaturesSignature: false,
          hadNaturesSignature: false,
          leadIds: new Set(),
          architectMobiles: new Set(),
        };
      }

      const record = aggregationMap[archId];
      const branchName = String(row.branch_name || '').trim() || 'Unmapped Branch';
      record.branchSet.add(branchName);
      record.ledgerRows.push({ branch: branchName, claimDate: row.claim_date, sheets, payout });
      record.total_sheets += sheets;
      record.raw_pool_payout += payout;

      const leadId = String(row.lead_id || '').trim();
      const architectMobile = String(row.architect_mobile || '').trim();
      if (leadId) record.leadIds.add(leadId);
      if (architectMobile) record.architectMobiles.add(architectMobile);

      if (NATURE_SIGNATURE_RE.test(row.product_sku || '') && sheets > 0) record.hasNaturesSignature = true;
      if (row.payout_status === 'Converted Nature Signature Target') record.hadNaturesSignature = true;
    });

    return Object.values(aggregationMap)
      .map((record) => {
        const isEligible = eligibilityMap[record.uniqueKey] !== 'ineligible';
        return {
          ...record,
          branches: Array.from(record.branchSet).sort(),
          leadIds: Array.from(record.leadIds).sort(),
          architectMobiles: Array.from(record.architectMobiles).sort(),
          isEligible,
          actualPayoutAllowed: isEligible ? record.raw_pool_payout : 0,
        };
      })
      .sort((a, b) => b.actualPayoutAllowed - a.actualPayoutAllowed || b.total_sheets - a.total_sheets);
  }, [ledgerRows, eligibilityMap]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Same slice rule as Architect Accounts: with a branch and/or claim-date
  // range selected, sheets and pool payout count only that slice.
  const isRowInSlice = (branch, claimDateValue) => {
    if (filters.branch && branch !== filters.branch) return false;
    if (filters.startDate || filters.endDate) {
      const claimDate = toLocalDate(claimDateValue);
      if (!claimDate) return false;
      if (filters.startDate && claimDate < toLocalDate(filters.startDate)) return false;
      if (filters.endDate && claimDate > toLocalDate(filters.endDate)) return false;
    }
    return true;
  };

  const hasSliceFilter = Boolean(filters.branch || filters.startDate || filters.endDate);
  const hasDateFilter = Boolean(filters.startDate || filters.endDate);

  const sumLedgerSlice = (row, field) => (row.ledgerRows || []).reduce(
    (sum, entry) => (isRowInSlice(entry.branch, entry.claimDate) ? sum + (entry[field] || 0) : sum),
    0
  );

  const getBranchSheets = (row) => (hasSliceFilter ? sumLedgerSlice(row, 'sheets') : row.total_sheets || 0);

  const getBranchPayout = (row) => {
    if (!row.isEligible) return 0;
    return hasSliceFilter ? sumLedgerSlice(row, 'payout') : row.actualPayoutAllowed || 0;
  };

  const filteredArchitects = architectsList.filter((row) => {
    const searchString = filters.search?.toLowerCase() || '';
    const matchesSearch =
      (row.architect_name?.toLowerCase() || '').includes(searchString) ||
      (row.architect_id?.toLowerCase() || '').includes(searchString) ||
      row.architectMobiles.some((mobile) => mobile.toLowerCase().includes(searchString)) ||
      row.leadIds.some((leadId) => leadId.toLowerCase().includes(searchString));

    const matchesElig =
      filters.eligibility === '' ||
      (filters.eligibility === 'eligible' && row.isEligible) ||
      (filters.eligibility === 'ineligible' && !row.isEligible);

    const matchesNatureSignature =
      filters.natureSignature === '' ||
      (filters.natureSignature === 'all' && (row.hasNaturesSignature || row.hadNaturesSignature));

    const matchesBranch =
      filters.branch === '' ||
      row.branches.some((branch) => branch.toLowerCase() === filters.branch.toLowerCase());

    return matchesSearch && matchesElig && matchesNatureSignature && matchesBranch;
  });

  const kpi = filteredArchitects.reduce((acc, row) => {
    acc.totalArchitects++;
    acc.sites += row.leadIds.length;
    if (row.isEligible) {
      acc.eligible++;
      acc.totalSheets += getBranchSheets(row);
    } else {
      acc.notEligible++;
    }
    acc.commissionPool += getBranchPayout(row);
    return acc;
  }, { totalArchitects: 0, sites: 0, eligible: 0, notEligible: 0, totalSheets: 0, commissionPool: 0 });

  const uniqueBranches = [...new Set(architectsList.flatMap(item => item.branches))].sort();

  // Architect summary — one card per architect-only site, built from the rows
  // already loaded, so the modal and the table always agree.
  const detailsArchitect = architectsList.find(row => row.architect_id === detailsArchitectId) || null;
  const detailsLeads = useMemo(() => {
    if (!detailsArchitectId) return [];
    const grouped = {};

    ledgerRows.forEach((row) => {
      if (extractArchitectId(row.architect_name) !== detailsArchitectId) return;
      const sheets = parseFloat(row.total_eligible_sheets || 0);
      const payout = parseFloat(row.total_payout_amount || 0);
      const leadId = String(row.lead_id || '').trim() || 'UNKNOWN';
      const sku = row.product_sku || 'UNKNOWN';

      if (!grouped[leadId]) {
        const info = leadInfoMap[leadId] || {};
        grouped[leadId] = {
          leadId,
          projectName: hasText(info.project_name) && info.project_name !== 'N/A' ? info.project_name : '',
          dgoName: getDgoNameFromLeadCreatedBy(row.lead_created_by),
          dgoMobile: row.lead_created_by_mobile || '',
          address: [info.address, info.landmark].filter(hasText).join(', '),
          location: [info.city, info.district, info.state, info.pincode].filter(hasText).join(', '),
          branch: String(row.branch_name || '').trim(),
          totalSheets: 0,
          totalPayout: 0,
          products: {},
        };
      }

      const lead = grouped[leadId];
      lead.totalSheets += sheets;
      lead.totalPayout += payout;

      const isConverted = row.payout_status === 'Converted Nature Signature Target';
      const claimNo = String(row.claim_no || '').trim();
      // Each converted row is its own conversion, so it keeps its own line.
      const productKey = isConverted && claimNo ? `${sku}::${claimNo}` : sku;
      if (!lead.products[productKey]) {
        lead.products[productKey] = { key: productKey, sku, sheets: 0, rate: 0, payout: 0, isConverted };
      }
      const product = lead.products[productKey];
      product.sheets += sheets;
      product.payout += payout;
      product.rate = parseFloat(row.matrix_rate || 0) || product.rate;
    });

    return Object.values(grouped)
      .map(lead => ({ ...lead, products: Object.values(lead.products) }))
      .sort((a, b) => b.totalSheets - a.totalSheets);
  }, [detailsArchitectId, ledgerRows, leadInfoMap]);

  const openDetails = (architectId) => {
    setExpandedLeadIds(new Set());
    setDetailsArchitectId(architectId);
  };

  const toggleLeadExpanded = (leadId) => {
    setExpandedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  };

  const handleExportExcel = () => {
    if (filteredArchitects.length === 0) {
      showToast('No architects match the active filters to export.', 'error');
      return;
    }

    const selectedById = new Map(filteredArchitects.map((architect) => [architect.architect_id, architect]));
    const productSummary = {};
    const siteRows = [];

    ledgerRows.forEach((ledgerRow) => {
      const architectId = extractArchitectId(ledgerRow.architect_name);
      const architect = selectedById.get(architectId);
      const sheets = Number(ledgerRow.total_eligible_sheets || 0);
      const branch = String(ledgerRow.branch_name || '').trim() || 'Unmapped Branch';
      if (!architect || sheets === 0 || !isRowInSlice(branch, ledgerRow.claim_date)) return;

      const sku = ledgerRow.product_sku || 'UNKNOWN';
      const key = `${architectId}__${sku}`;
      if (!productSummary[key]) {
        productSummary[key] = { architectId, category: getProductCategory(sku), sku, sheets: 0 };
      }
      productSummary[key].sheets += sheets;

      const leadId = String(ledgerRow.lead_id || '').trim();
      const info = leadInfoMap[leadId] || {};
      siteRows.push({
        'Architect Name': getArchitectDisplayName(architect.architect_name),
        'Account Number': architect.architect_id,
        'Lead ID': leadId || '—',
        'Project Name': hasText(info.project_name) ? info.project_name : '—',
        'Influencer Type': 'Blank',
        Branch: branch,
        'Claim No': ledgerRow.claim_no || '—',
        'Claim Date': ledgerRow.claim_date || '—',
        'Product SKU': sku,
        Sheets: sheets,
        'Unit Rate': Number(ledgerRow.matrix_rate || 0),
        Payout: architect.isEligible ? Number(ledgerRow.total_payout_amount || 0) : 0,
        Eligibility: architect.isEligible ? 'Eligible' : 'Ineligible',
      });
    });

    const productDetailsByAccount = Object.values(productSummary)
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .reduce((result, product) => {
        if (!result[product.architectId]) result[product.architectId] = {};
        if (!result[product.architectId][product.category]) result[product.architectId][product.category] = [];
        result[product.architectId][product.category].push(`${product.sku} - ${product.sheets.toFixed(1)} Sheets`);
        return result;
      }, {});

    const summaryRows = filteredArchitects.map((architect, index) => ({
      Rank: index + 1,
      'Architect Name': getArchitectDisplayName(architect.architect_name),
      'Account Number': architect.architect_id,
      'Mobile Number': architect.architectMobiles.join(', ') || '—',
      'Architect-Only Sites': architect.leadIds.length,
      'Lead IDs': architect.leadIds.join(', ') || '—',
      Sheets: Number(getBranchSheets(architect)),
      'Pool Payout': Number(getBranchPayout(architect)),
      Branch: filters.branch || architect.branches.join(', ') || 'Unmapped Branch',
      'Eligibility Status': architect.isEligible ? 'Eligible' : 'Ineligible',
      'Product Details': Object.entries(productDetailsByAccount[architect.architect_id] || {})
        .map(([category, products]) => `${category}:\n${products.join('\n')}`)
        .join('\n\n') || 'No eligible sheets',
    }));

    siteRows.sort((a, b) =>
      a['Architect Name'].localeCompare(b['Architect Name']) ||
      a['Lead ID'].localeCompare(b['Lead ID']) ||
      String(a['Claim No']).localeCompare(String(b['Claim No'])));

    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    summarySheet['!autofilter'] = { ref: summarySheet['!ref'] || 'A1' };
    summarySheet['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 35 }, { wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 55 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Architect-Only Accounts');

    const siteSheet = XLSX.utils.json_to_sheet(siteRows);
    siteSheet['!autofilter'] = { ref: siteSheet['!ref'] || 'A1' };
    siteSheet['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 34 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, siteSheet, 'Site Claims');

    XLSX.writeFile(workbook, `Architect_Only_Sites_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`Exported ${summaryRows.length} architect rows and ${siteRows.length} claim rows.`, 'success');
  };

  return (
    <div className="page ani-page" id="page-no-influencer">
      <style>{`
        .ani-page { font-family: 'Inter', sans-serif; padding: 16px; max-width: 100%; box-sizing: border-box; color: #4a311d; }
        .ani-hero {
          position: relative; overflow: hidden; border: 1px solid #eaddcc; border-radius: 14px;
          background: linear-gradient(135deg, #ffffff 0%, #fdfaf5 55%, #f8efe0 100%);
          padding: 20px 22px; margin-bottom: 16px;
          display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;
        }
        /* Faint plywood ply lines along the right edge of the banner. */
        .ani-hero::after {
          content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 38%; pointer-events: none; opacity: .5;
          background: repeating-linear-gradient(90deg, transparent 0 9px, rgba(184, 149, 108, .10) 9px 10px, transparent 10px 17px, rgba(138, 104, 62, .07) 17px 19px);
          mask-image: linear-gradient(90deg, transparent, #000 70%);
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 70%);
        }
        .ani-hero > * { position: relative; z-index: 1; }
        .ani-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #b8956c; }
        .ani-title { margin: 4px 0 4px; font-size: 20px; font-weight: 800; color: #2a1a0f; }
        .ani-sub { margin: 0; font-size: 12.5px; color: #8c7662; max-width: 620px; line-height: 1.5; }
        .ani-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .ani-btn {
          border: 1px solid #eaddcc; background: #fdfaf5; color: #5c4632; border-radius: 8px;
          padding: 8px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all .15s ease;
          display: inline-flex; align-items: center; gap: 6px; font-family: inherit;
        }
        .ani-btn:hover { background: #f5ece0; color: #2a1a0f; }
        .ani-btn.primary { background: #2a1a0f; border-color: #2a1a0f; color: #fdfaf5; }
        .ani-btn.primary:hover { background: #45301d; box-shadow: 0 6px 18px rgba(42, 26, 15, .18); }

        .ani-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 16px; }
        .ani-kpi {
          position: relative; overflow: hidden; border: 1px solid #eaddcc; border-radius: 12px;
          background: linear-gradient(160deg, #ffffff 0%, #fdfaf5 100%); padding: 14px 16px 16px;
        }
        .ani-kpi::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: #d8c5a5; }
        .ani-kpi.tone-gold::after { background: #8a683e; }
        .ani-kpi.tone-green::after { background: #1a7a44; }
        .ani-kpi.tone-red::after { background: #b82020; }
        .ani-kpi.tone-amber::after { background: #b8860b; }
        .ani-kpi-lbl { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #a68b72; }
        .ani-kpi-val { font-size: 22px; font-weight: 800; color: #2a1a0f; margin-top: 4px; line-height: 1.1; }
        .ani-kpi-sub { font-size: 11px; color: #8c7662; margin-top: 4px; }

        .ani-card { border: 1px solid #eaddcc; border-radius: 12px; background: #ffffff; max-width: 100%; overflow: hidden; }
        .ani-card-hd {
          padding: 14px 16px; border-bottom: 1px solid #f2ebd9;
          display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
        }
        .ani-card-title { font-size: 14px; font-weight: 700; color: #2a1a0f; }
        .ani-card-note { font-size: 11.5px; color: #a68b72; margin-top: 2px; }
        .ani-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .ani-input, .ani-select {
          border: 1px solid #eaddcc; background: #fdfaf5; color: #2a1a0f; border-radius: 8px;
          padding: 7px 10px; font-size: 12.5px; font-family: inherit; outline: none;
        }
        .ani-input:focus, .ani-select:focus { border-color: #c9a25a; box-shadow: 0 0 0 2px rgba(201, 162, 90, .13); }
        .ani-select.active { border-color: #c9a25a; background: #fbf4e8; }
        .ani-date {
          display: flex; align-items: center; gap: 8px; border: 1px solid #eaddcc; background: #fdfaf5;
          border-radius: 8px; padding: 5px 10px; transition: all .15s ease;
        }
        .ani-date.active { border-color: #c9a25a; background: #fbf4e8; box-shadow: 0 0 0 2px rgba(201, 162, 90, .13); }
        .ani-date-lbl { font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #b8956c; }
        .ani-date input { border: none; outline: none; background: transparent; font-size: 12px; font-weight: 600; color: #2a1a0f; font-family: inherit; cursor: pointer; padding: 0; }
        .ani-date-clear {
          border: none; background: #f2e3c8; color: #8a683e; width: 16px; height: 16px; border-radius: 50%;
          cursor: pointer; font-size: 11px; line-height: 1; display: flex; align-items: center; justify-content: center;
        }

        .ani-table-wrap { max-width: 100%; overflow-x: auto; }
        .ani-table { width: 100%; min-width: 1100px; border-collapse: collapse; font-size: 13px; text-align: left; }
        .ani-table th {
          padding: 11px 12px; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
          color: #b8956c; border-bottom: 2px solid #f2ebd9; background: #fdfbf7; white-space: nowrap;
        }
        .ani-table td { padding: 11px 12px; border-bottom: 1px solid #faf7f2; color: #4a311d; vertical-align: middle; }
        .ani-table tbody tr { cursor: pointer; transition: background .12s ease; }
        .ani-table tbody tr:hover td { background: #fdf8ef; }
        .ani-table tbody tr.blocked td { background: #fff7f5; }
        .ani-num { text-align: right; white-space: nowrap; }
        .ani-rank { text-align: center; font-weight: 700; color: #a68b72; }
        .ani-rank.top { color: #b8860b; }
        .ani-name { font-weight: 700; color: #2a1a0f; display: flex; align-items: center; gap: 6px; }
        .ani-pill {
          display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 2px 9px;
          font-size: 11px; font-weight: 700; white-space: nowrap;
        }
        .ani-pill.eligible { background: #ecf7ef; color: #1a7a44; border: 1px solid #bfe3cb; }
        .ani-pill.blocked { background: #fdeeee; color: #b82020; border: 1px solid #f3c4c4; }
        .ani-pill.none { background: #fbf4e8; color: #8a683e; border: 1px solid #ecd9b8; }
        .ani-pill.ns { background: #eef7f1; color: #1f6b43; border: 1px solid #c4e4d0; }
        .ani-empty { padding: 36px; text-align: center; color: #a68b72; font-size: 13px; }

        .ani-overlay {
          position: fixed; inset: 0; background: rgba(42, 26, 15, .45); backdrop-filter: blur(4px);
          display: flex; justify-content: center; align-items: center; z-index: 10005;
        }
        .ani-modal {
          background: #ffffff; border-radius: 16px; width: 820px; max-width: 92vw; max-height: 86vh;
          padding: 22px 26px; box-shadow: 0 25px 50px -12px rgba(42, 26, 15, .3); box-sizing: border-box;
          display: flex; flex-direction: column; border: 1px solid #eaddcc;
        }
        .ani-modal-hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 1px solid #f2ebd9; padding-bottom: 14px; margin-bottom: 14px; }
        .ani-close {
          background: #fbf4e8; border: none; border-radius: 50%; width: 32px; height: 32px; font-size: 15px;
          cursor: pointer; color: #8a683e; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .ani-modal-body { overflow-y: auto; flex-grow: 1; padding-right: 4px; }
        .ani-lead { border: 1px solid #eaddcc; border-radius: 12px; margin-bottom: 14px; overflow: hidden; background: #ffffff; }
        .ani-lead-hd { padding: 14px 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
        .ani-lead-id { font-size: 15px; font-weight: 800; color: #2a1a0f; }
        .ani-lead-meta { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px; font-size: 12.5px; color: #5c4632; }
        .ani-lead-meta strong { color: #a68b72; font-weight: 600; }
        .ani-lead-addr { margin-top: 6px; font-size: 12.5px; color: #8c7662; max-width: 460px; }
        .ani-lead-val { text-align: right; }
        .ani-lead-val-lbl { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #b8860b; }
        .ani-lead-val-num { font-size: 18px; font-weight: 800; color: #2a1a0f; }
        .ani-lead-val-sub { font-size: 11.5px; color: #8c7662; }
        .ani-view {
          background: #2a1a0f; color: #fdfaf5; border: none; border-radius: 20px; padding: 7px 15px;
          font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; font-family: inherit;
        }
        .ani-products { width: 100%; border-collapse: collapse; font-size: 13px; border-top: 1px solid #f2ebd9; }
        .ani-products th { text-align: left; padding: 9px 16px; font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #b8956c; background: #fdfbf7; }
        .ani-products td { padding: 9px 16px; border-top: 1px solid #faf7f2; color: #4a311d; }

        .ani-toast {
          position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 8px; font-size: 13px;
          font-weight: 500; box-shadow: 0 4px 12px rgba(0, 0, 0, .15); z-index: 20050; color: #fff;
        }
      `}</style>

      {toast.show && (
        <div className="ani-toast" style={{ background: toast.type === 'error' ? '#b82020' : toast.type === 'success' ? '#1a7a44' : '#2a1a0f' }}>
          {toast.message}
        </div>
      )}

      {/* ── ARCHITECT SUMMARY MODAL ── */}
      {detailsArchitect && (
        <div className="ani-overlay" onClick={() => setDetailsArchitectId(null)}>
          <div className="ani-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ani-modal-hd">
              <div>
                <div className="ani-eyebrow">Architect-only sites</div>
                <h3 style={{ margin: '3px 0 2px', fontSize: '18px', fontWeight: 800, color: '#2a1a0f' }}>
                  {getArchitectDisplayName(detailsArchitect.architect_name)}
                </h3>
                <div style={{ fontSize: '12.5px', color: '#8c7662' }}>
                  Account {detailsArchitect.architect_id}
                  {detailsArchitect.architectMobiles.length > 0 && ` · Mob ${detailsArchitect.architectMobiles.join(', ')}`}
                  {` · ${detailsLeads.length} site${detailsLeads.length === 1 ? '' : 's'}`}
                </div>
              </div>
              <button className="ani-close" onClick={() => setDetailsArchitectId(null)}>✕</button>
            </div>

            <div className="ani-modal-body">
              {detailsLeads.length === 0 ? (
                <div className="ani-empty">No claimed sheets found with a blank Influencer Type.</div>
              ) : (
                detailsLeads.map((lead) => {
                  const isExpanded = expandedLeadIds.has(lead.leadId);
                  const natureSignatureSheets = lead.products
                    .filter(p => NATURE_SIGNATURE_RE.test(p.sku))
                    .reduce((sum, p) => sum + p.sheets, 0);

                  return (
                    <div key={lead.leadId} className="ani-lead">
                      <div className="ani-lead-hd">
                        <div style={{ minWidth: '240px', flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="ani-lead-id">Lead #{lead.leadId}</span>
                            <span className="ani-pill none" title="The DMI claims on this site have no Influencer Type">Influencer Type: blank</span>
                            {natureSignatureSheets > 0 && (
                              <span className="ani-pill ns">🌿 Nature's Signature · {natureSignatureSheets.toFixed(1)} sheets</span>
                            )}
                          </div>
                          {lead.projectName && (
                            <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: 600, color: '#5c4632' }}>{lead.projectName}</div>
                          )}
                          <div className="ani-lead-meta">
                            <span><strong>DGO:</strong> {lead.dgoName || '—'}</span>
                            <span><strong>Mob:</strong> {lead.dgoMobile || '—'}</span>
                            {lead.branch && <span><strong>Branch:</strong> {lead.branch}</span>}
                          </div>
                          {(lead.address || lead.location) && (
                            <div className="ani-lead-addr">🏠 {[lead.address, lead.location].filter(Boolean).join(' · ')}</div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <div className="ani-lead-val">
                            <div className="ani-lead-val-lbl">Aggregated Value</div>
                            <div className="ani-lead-val-num">
                              ₹{lead.totalPayout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="ani-lead-val-sub">{lead.totalSheets.toFixed(1)} sheets</div>
                          </div>
                          <button className="ani-view" onClick={() => toggleLeadExpanded(lead.leadId)}>
                            {isExpanded ? 'Hide ▲' : 'View ▼'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ overflowX: 'auto' }}>
                          <table className="ani-products">
                            <thead>
                              <tr>
                                <th>Product SKU</th>
                                <th style={{ textAlign: 'right' }}>Eligible Sheets</th>
                                <th style={{ textAlign: 'right' }}>Unit Price</th>
                                <th style={{ textAlign: 'right' }}>Total Payout</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lead.products.map((product) => (
                                <tr key={product.key}>
                                  <td style={{ fontWeight: 600, color: '#2a1a0f', wordBreak: 'break-word' }}>
                                    {product.sku}
                                    {product.isConverted && (
                                      <span className="ani-pill ns" style={{ marginLeft: '8px' }}>Converted from Nature's Signature</span>
                                    )}
                                  </td>
                                  <td className="ani-num">{product.sheets.toFixed(1)}</td>
                                  <td className="ani-num">₹{product.rate.toFixed(2)}</td>
                                  <td className="ani-num" style={{ fontWeight: 700, color: '#2a1a0f' }}>
                                    ₹{product.payout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="ani-hero">
        <div>
          <div className="ani-eyebrow">Accounts · Claim review</div>
          <h2 className="ani-title">Architect-Only Sites</h2>
          <p className="ani-sub">
            Claims where the architect is tagged on the site but the DMI claim has no Influencer Type.
            Sheets and payout follow the same ledger rules as Architect Accounts.
          </p>
        </div>
        <div className="ani-actions">
          <button className="ani-btn" onClick={fetchLedgerData}>🔄 Refresh</button>
          <button className="ani-btn primary" onClick={handleExportExcel}>📊 Export Excel Report</button>
        </div>
      </div>

      {/* ── KPI TILES ── */}
      <div className="ani-kpis">
        <div className="ani-kpi tone-gold">
          <div className="ani-kpi-lbl">Architects</div>
          <div className="ani-kpi-val">{kpi.totalArchitects}</div>
          <div className="ani-kpi-sub">With claimed sheets</div>
        </div>
        <div className="ani-kpi tone-amber">
          <div className="ani-kpi-lbl">Architect-Only Sites</div>
          <div className="ani-kpi-val">{kpi.sites}</div>
          <div className="ani-kpi-sub">Influencer Type blank</div>
        </div>
        <div className="ani-kpi tone-green">
          <div className="ani-kpi-lbl">Eligible</div>
          <div className="ani-kpi-val" style={{ color: '#1a7a44' }}>{kpi.eligible}</div>
        </div>
        <div className="ani-kpi tone-red">
          <div className="ani-kpi-lbl">Not Eligible</div>
          <div className="ani-kpi-val" style={{ color: '#b82020' }}>{kpi.notEligible}</div>
        </div>
        <div className="ani-kpi">
          <div className="ani-kpi-lbl">Total Sheets</div>
          <div className="ani-kpi-val">{kpi.totalSheets.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="ani-kpi-sub">{hasSliceFilter ? 'In selected slice' : 'Eligible architects'}</div>
        </div>
        <div className="ani-kpi tone-green">
          <div className="ani-kpi-lbl">Commission Pool</div>
          <div className="ani-kpi-val" style={{ color: '#1a7a44' }}>{formatRupees(kpi.commissionPool)}</div>
        </div>
      </div>

      {/* ── ARCHITECT TABLE ── */}
      <div className="ani-card">
        <div className="ani-card-hd">
          <div>
            <div className="ani-card-title">👛 Architect-Only Site Ledger</div>
            <div className="ani-card-note">Click a row to see each site and its products.</div>
          </div>

          <div className="ani-filters">
            <input
              className="ani-input"
              placeholder="Search name, code, mobile or Lead ID..."
              style={{ width: '230px' }}
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
            <select className={`ani-select ${filters.eligibility ? 'active' : ''}`} value={filters.eligibility} onChange={(e) => handleFilterChange('eligibility', e.target.value)}>
              <option value="">All Eligibility</option>
              <option value="eligible">✅ Eligible Only</option>
              <option value="ineligible">❌ Not Eligible</option>
            </select>
            <select className={`ani-select ${filters.branch ? 'active' : ''}`} value={filters.branch} onChange={(e) => handleFilterChange('branch', e.target.value)}>
              <option value="">All Branches</option>
              {uniqueBranches.map((branch) => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
            <select className={`ani-select ${filters.natureSignature ? 'active' : ''}`} value={filters.natureSignature} onChange={(e) => handleFilterChange('natureSignature', e.target.value)}>
              <option value="">All Sheet</option>
              <option value="all">All Nature Signature</option>
            </select>

            <div className={`ani-date ${hasDateFilter ? 'active' : ''}`}>
              <Calendar size={13} color={hasDateFilter ? '#8a683e' : '#b8956c'} />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: '1px' }}>
                <span className="ani-date-lbl">From</span>
                <input type="date" value={filters.startDate} onChange={(e) => handleFilterChange('startDate', e.target.value)} />
              </div>
              <div style={{ width: '1px', height: '20px', background: '#eaddcc' }} />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: '1px' }}>
                <span className="ani-date-lbl">To</span>
                <input type="date" value={filters.endDate} onChange={(e) => handleFilterChange('endDate', e.target.value)} />
              </div>
              {hasDateFilter && (
                <button
                  type="button"
                  className="ani-date-clear"
                  title="Clear date range"
                  onClick={() => setFilters(prev => ({ ...prev, startDate: '', endDate: '' }))}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="ani-table-wrap">
          {loading ? (
            <div className="ani-empty">⏳ Fetching records...</div>
          ) : filteredArchitects.length === 0 ? (
            <div className="ani-empty">
              {architectsList.length === 0
                ? 'No claimed sheets found yet with a blank Influencer Type.'
                : 'No matches found.'}
            </div>
          ) : (
            <table className="ani-table">
              <thead>
                <tr>
                  <th style={{ width: '56px', textAlign: 'center' }}>Rank</th>
                  <th>Architect Name</th>
                  <th>Account Number</th>
                  <th>Mobile Number</th>
                  <th className="ani-num">Sites</th>
                  <th className="ani-num">
                    Sheets{hasDateFilter && <div style={{ fontSize: '9px', fontWeight: 600, color: '#8a683e', textTransform: 'none' }}>in period</div>}
                  </th>
                  <th className="ani-num">
                    Pool Payout{hasDateFilter && <div style={{ fontSize: '9px', fontWeight: 600, color: '#8a683e', textTransform: 'none' }}>in period</div>}
                  </th>
                  <th>Branch</th>
                  <th style={{ textAlign: 'center' }}>Eligibility Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredArchitects.map((row, index) => (
                  <tr
                    key={row.uniqueKey}
                    className={row.isEligible ? '' : 'blocked'}
                    onClick={() => openDetails(row.architect_id)}
                    title={`View sites for ${getArchitectDisplayName(row.architect_name)}`}
                  >
                    <td className={`ani-rank ${index === 0 ? 'top' : ''}`}>{index + 1}</td>
                    <td>
                      <div className="ani-name">
                        {row.hasNaturesSignature && (
                          <span className="ani-pill ns" title="Has Nature's Signature sheets not yet converted">✏️</span>
                        )}
                        {!row.hasNaturesSignature && row.hadNaturesSignature && (
                          <span className="ani-pill eligible" title="Nature's Signature sheets fully converted">✅</span>
                        )}
                        <span>{getArchitectDisplayName(row.architect_name)}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 500, fontSize: '12.5px' }}>{row.architect_id}</td>
                    <td style={{ fontSize: '12px', overflowWrap: 'anywhere' }}>{row.architectMobiles.join(', ') || '—'}</td>
                    <td className="ani-num" title={row.leadIds.join(', ')}>{row.leadIds.length}</td>
                    <td className="ani-num" style={{ fontWeight: 600, color: '#2a1a0f' }}>{getBranchSheets(row).toFixed(1)}</td>
                    <td className="ani-num" style={{ fontWeight: 700, color: row.isEligible ? '#1a7a44' : '#a68b72' }}>
                      {formatRupees(getBranchPayout(row))}
                    </td>
                    <td style={{ fontSize: '12.5px', overflowWrap: 'anywhere' }}>{filters.branch || row.branches.join(', ') || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`ani-pill ${row.isEligible ? 'eligible' : 'blocked'}`}>
                        {row.isEligible ? 'Eligible' : 'Blocked'}
                      </span>
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

export default ArchitectNoInfluencer;
