// import React, { useCallback, useEffect, useMemo, useState } from 'react';
// import { supabase } from '../../lib/supbase';

// const normalizeSku = (value) => String(value || '')
//   .normalize('NFKC')
//   .trim()
//   .toLocaleLowerCase('en-US')
//   .replace(/[^a-z0-9]/g, '');

// const isApproved = (status) => {
//   const value = String(status || '').trim().toUpperCase();
//   return value.startsWith('APPROVE') || value === 'SANCTIONED';
// };

// // Supabase returns at most 1,000 rows by default. The report must inspect the
// // complete uploads; otherwise claims and their matching leads can fall on
// // different pages and every valid architect row appears missing.
// const fetchAllRows = async (table, columns, orderColumn) => {
//   const pageSize = 1000;
//   const allRows = [];
//   let from = 0;

//   while (true) {
//     const { data, error } = await supabase
//       .from(table)
//       .select(columns)
//       .order(orderColumn)
//       .range(from, from + pageSize - 1);
//     if (error) throw error;

//     const page = data || [];
//     allRows.push(...page);
//     if (page.length < pageSize) return allRows;
//     from += pageSize;
//   }
// };

// export default function SheetGapReport() {
//   const [rows, setRows] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [search, setSearch] = useState('');
//   const [error, setError] = useState('');

//   const loadReport = useCallback(async () => {
//     setLoading(true);
//     setError('');
//     try {
//       const [leads, claims, skus, ledger] = await Promise.all([
//         fetchAllRows('leads_master', 'lead_id, linked_architect, state, lead_status', 'lead_id'),
//         fetchAllRows('dmi_claims', 'claim_no, lead_id, product_code, approved_qty, status', 'claim_no'),
//         fetchAllRows('product_sku_master', 'sku, price', 'sku'),
//         fetchAllRows('commission_ledger', 'claim_no, total_eligible_sheets', 'claim_no'),
//       ]);

//       const leadsById = new Map(leads.map(lead => [String(lead.lead_id || '').trim(), lead]));
//       const priceBySku = new Map(skus.map(sku => [normalizeSku(sku.sku), Number(sku.price || 0)]));
//       const ledgerSheetsByClaim = new Map();
//       ledger.forEach(row => {
//         const claimNo = String(row.claim_no || '').trim();
//         if (!claimNo) return;
//         ledgerSheetsByClaim.set(
//           claimNo,
//           (ledgerSheetsByClaim.get(claimNo) || 0) + Number(row.total_eligible_sheets || 0)
//         );
//       });

//       const candidateRows = claims.flatMap(claim => {
//         if (!isApproved(claim.status)) return [];
//         const lead = leadsById.get(String(claim.lead_id || '').trim());
//         if (!lead?.linked_architect || String(lead.lead_status || '').trim().toUpperCase() === 'LOST') return [];

//         const productSku = String(claim.product_code || '').trim();
//         // Nature's Signature is intentionally handled through the conversion flow,
//         // so it is not a missing-price / missing-sheet gap.
//         if (/SIGNATURE|NATURE/i.test(productSku)) return [];

//         const normalized = normalizeSku(productSku);
//         let hasPrice = priceBySku.get(normalized) > 0;
//         if (!hasPrice && normalized.startsWith('fd')) {
//           hasPrice = priceBySku.get(`${normalized.replace(/\d+mm$/, '')}allthickness`) > 0;
//         }
//         if (!hasPrice && normalized.startsWith('decorative')) {
//           hasPrice = priceBySku.get(`${normalized.replace(/\d+$/, '')}allthickness`) > 0;
//         }
//         const claimNo = String(claim.claim_no || '').trim();
//         const approvedSheets = Number(claim.approved_qty || 0);
//         const ledgerSheets = ledgerSheetsByClaim.get(claimNo) || 0;
//         const missingSheets = Math.max(0, approvedSheets - ledgerSheets);
//         const hasMmThickness = /\d+\s*mm\b/i.test(productSku);

//         // A missing MM suffix alone is not an error: for example, Decorative
//         // Duro Teak is legitimately counted without a thickness. Show a row
//         // only when there is an actual price-match or sheet-count gap.
//         if (hasPrice && missingSheets <= 0) return [];

//         const reasons = [];
//         if (!hasMmThickness) reasons.push('Product code has no MM thickness');
//         if (!productSku) reasons.push('Product code is blank');
//         if (!hasPrice && productSku) reasons.push('No matching SKU price in Product Master');
//         if (missingSheets > 0) {
//           reasons.push(ledgerSheets === 0
//             ? 'Ledger has zero sheets / no counted sheets'
//             : `Only ${ledgerSheets} of ${approvedSheets} sheets reached ledger`);
//         }

//         return [{
//           claimNo: claim.claim_no || '—',
//           leadId: claim.lead_id || '—',
//           architect: lead.linked_architect,
//           state: lead.state || 'Unknown',
//           productSku: productSku || 'Blank product code',
//           sheets: missingSheets > 0 ? missingSheets : approvedSheets,
//           // reason: reasons.join(' • '),
//         }];
//       });

//       // One clean row per architect + state + product, with all affected sheets
//       // combined. This is the same summary-style view used in Architect Accounts.
//       const groupedRows = Object.values(candidateRows.reduce((result, row) => {
//         const key = `${row.architect}__${row.state}__${row.productSku}__${row.reason}`;
//         if (!result[key]) result[key] = { ...row };
//         else result[key].sheets += row.sheets;
//         return result;
//       }, {}));

//       setRows(groupedRows);
//     } catch (err) {
//       console.error('Failed to load sheet gap report:', err.message);
//       setError(err.message);
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => { loadReport(); }, [loadReport]);

//   const filteredRows = useMemo(() => {
//     const query = search.trim().toLowerCase();
//     if (!query) return rows;
//     return rows.filter(row => [row.architect, row.productSku, row.claimNo, row.leadId, row.state]
//       .some(value => String(value).toLowerCase().includes(query)));
//   }, [rows, search]);

//   const totals = useMemo(() => ({
//     sheets: filteredRows.reduce((sum, row) => sum + row.sheets, 0),
//     architects: new Set(filteredRows.map(row => row.architect)).size,
//   }), [filteredRows]);

//   return (
//     <div style={{ color: '#172033', maxWidth: 1280, margin: '0 auto', padding: '8px 0 32px' }}>
//       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
//         <div>
//           <h1 style={{ margin: 0, fontSize: 28 }}>Uncounted Sheets Gap Report</h1>
//           {/* <p style={{ margin: '7px 0 0', color: '#64748b' }}>Architect-wise total sheets that have a Product Master price mismatch or an actual ledger sheet gap. Missing MM thickness is shown as an additional reason.</p> */}
//         </div>
//         <button onClick={loadReport} style={{ border: 'none', borderRadius: 8, padding: '10px 15px', color: '#fff', background: '#0284c7', cursor: 'pointer', fontWeight: 700 }}>Refresh Report</button>
//       </div>

//       <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
//         <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '13px 18px', minWidth: 170 }}>
//           <div style={{ color: '#9a3412', fontSize: 12, fontWeight: 700 }}>UNCOUNTED SHEETS</div>
//           <strong style={{ fontSize: 23, color: '#c2410c' }}>{totals.sheets.toLocaleString('en-IN')}</strong>
//           </div>
//         <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '13px 18px', minWidth: 170 }}>
//           <div style={{ color: '#1d4ed8', fontSize: 12, fontWeight: 700 }}>AFFECTED ARCHITECTS</div>
//           <strong style={{ fontSize: 23, color: '#1e40af' }}>{totals.architects}</strong>
//           </div>
//         <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '13px 18px', minWidth: 170 }}>
//           <div style={{ color: '#475569', fontSize: 12, fontWeight: 700 }}>UNMATCHED CLAIMS</div>
//           <strong style={{ fontSize: 23 }}>{filteredRows.length}</strong>
//           </div>
//       </div>

//       <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search architect, product, lead ID or claim no..." style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 8, padding: '11px 13px', marginBottom: 14, fontSize: 14 }} />
//       {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>Could not load report: {error}</div>}
//       <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 }}>
//         <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
//           <thead>
//             <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
//               {['Architect', 'State', 'Product not counted', 'Total Sheet', 'Lead ID', 'Claim no.',].map(head =>
//                <th key={head} style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', color: '#475569', whiteSpace: 'nowrap' }}>{head}</th>)}
//                </tr>
//                </thead>
//           <tbody>{loading ? <tr>
//             <td colSpan="7" style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>Loading sheet-gap report...</td>
//             </tr> : filteredRows.length === 0 ? <tr><td colSpan="7" style={{ padding: 30, textAlign: 'center', color: '#059669' }}>No uncounted approved sheets found.</td></tr> : filteredRows.map((row, index) => <tr key={`${row.claimNo}-${index}`} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: '12px 14px', fontWeight: 600 }}>{row.architect}</td>
//             <td style={{ padding: '12px 14px' }}>{row.state}</td>
//             <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>{row.productSku}</td>
//             <td style={{ padding: '12px 14px', fontWeight: 700, color: '#c2410c', textAlign: 'right' }}>{row.sheets.toLocaleString('en-IN')}</td>
//             <td style={{ padding: '12px 14px' }}>{row.leadId}</td><td style={{ padding: '12px 14px' }}>{row.claimNo}</td>
//             {/* <td style={{ padding: '12px 14px', color: '#b45309' }}>{row.reason}</td> */}
//             </tr>)}
//             </tbody>
//         </table>
//       </div>
//     </div>
//   );
// }
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supbase';

const normalizeSku = (value) =>
  String(value || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]/g, '');

const isApproved = (status) => {
  const value = String(status || '').trim().toUpperCase();
  return value.startsWith('APPROVE') || value === 'SANCTIONED';
};

const isLostLead = (lead) =>
  String(lead?.lead_status || '').trim().toUpperCase() === 'LOST';

// Supabase caps a single request at 1,000 rows.
const PAGE_SIZE = 1000;

// Claims are pulled per lead id. Small groups keep each request well inside the
// row cap and the URL length limit.
const LEAD_ID_GROUP_SIZE = 80;

// Claim dates come from Excel as local calendar dates. Format them in IST so a
// UTC timestamp such as 2026-04-13T18:30:00.000Z remains 14-Apr-26.
const formatClaimDate = (value) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  }).format(date);
};

// Reads a table past the 1,000 row cap. The exact row count is taken first so
// every page can be requested in parallel; fetching them one after another is
// what made this report take tens of seconds to open.
const fetchAllRows = async (
  table,
  columns,
  orderColumns,
  applyFilters = (query) => query
) => {
  const { count, error: countError } = await applyFilters(
    supabase.from(table).select(columns, { count: 'exact', head: true })
  );

  if (countError) throw countError;

  const requests = [];

  for (let from = 0; from < (count || 0); from += PAGE_SIZE) {
    let query = applyFilters(supabase.from(table).select(columns));

    // The sort must be total. Paging on a non-unique column (lead_id repeats
    // per project in leads_master) lets a row appear on two pages and vanish
    // from the result, which silently drops claims from this report.
    orderColumns.forEach((column) => {
      query = query.order(column);
    });

    requests.push(
      query
        .range(from, from + PAGE_SIZE - 1)
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
    );
  }

  const pages = await Promise.all(requests);
  return pages.flat();
};

export default function SheetGapReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lostLeadSheets, setLostLeadSheets] = useState(0);
  const [reconciliation, setReconciliation] = useState({
    approvedSheets: 0,
    ledgerSheets: 0,
    uncountedSheets: 0,
    remainingSheets: 0,
  });

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      // Only a lead that carries an architect can create an architect-wise gap,
      // and those are a few hundred rows out of ~15,000 leads. Filtering on the
      // server keeps this report from downloading the whole leads and claims
      // tables on every open.
      const leads = await fetchAllRows(
        'leads_master',
        'lead_id, project_name, linked_architect, state, lead_status',
        ['lead_id', 'project_name'],
        (query) => query.not('linked_architect', 'is', null).neq('linked_architect', '')
      );

      const leadsById = new Map();

      leads.forEach((lead) => {
        const leadId = String(lead.lead_id || '').trim();
        if (!leadId) return;

        const existing = leadsById.get(leadId);

        // One lead id repeats once per project. Prefer an active row over a Lost
        // one so a stale duplicate cannot hide a claim from the report.
        if (!existing || (isLostLead(existing) && !isLostLead(lead))) {
          leadsById.set(leadId, lead);
        }
      });

      const leadIdGroups = [];
      const leadIds = Array.from(leadsById.keys());

      for (let index = 0; index < leadIds.length; index += LEAD_ID_GROUP_SIZE) {
        leadIdGroups.push(leadIds.slice(index, index + LEAD_ID_GROUP_SIZE));
      }

      const [claimGroups, skus, ledger] = await Promise.all([
        Promise.all(
          leadIdGroups.map((group) =>
            fetchAllRows(
              'dmi_claims',
              'claim_no, claim_date, lead_id, product_code, approved_qty, status',
              ['claim_no'],
              (query) => query.in('lead_id', group)
            )
          )
        ),
        fetchAllRows(
          'product_sku_master',
          'sku, price',
          ['sku']
        ),
        fetchAllRows(
          'commission_ledger',
          'claim_no, total_eligible_sheets',
          ['claim_no']
        ),
      ]);

      const claims = claimGroups.flat();

      const priceBySku = new Map(
        skus.map((sku) => [
          normalizeSku(sku.sku),
          Number(sku.price || 0),
        ])
      );

      const ledgerSheetsByClaim = new Map();

      ledger.forEach((row) => {
        const claimNo = String(row.claim_no || '').trim();

        if (!claimNo) return;

        ledgerSheetsByClaim.set(
          claimNo,
          (ledgerSheetsByClaim.get(claimNo) || 0) +
            Number(row.total_eligible_sheets || 0)
        );
      });

      let lostLeadGapSheets = 0;

      const candidateRows = claims.flatMap((claim) => {
        if (!isApproved(claim.status)) return [];

        const lead = leadsById.get(
          String(claim.lead_id || '').trim()
        );

        if (!lead?.linked_architect) return [];

        const productSku = String(
          claim.product_code || ''
        ).trim();

        // Nature's Signature is intentionally handled through the conversion flow.
        if (/SIGNATURE|NATURE/i.test(productSku)) return [];

        const normalized = normalizeSku(productSku);

        let hasPrice = priceBySku.get(normalized) > 0;

        if (!hasPrice && normalized.startsWith('fd')) {
          hasPrice =
            priceBySku.get(
              `${normalized.replace(/\d+mm$/, '')}allthickness`
            ) > 0;
        }

        if (!hasPrice && normalized.startsWith('decorative')) {
          hasPrice =
            priceBySku.get(
              `${normalized.replace(/\d+$/, '')}allthickness`
            ) > 0;
        }

        const claimNo = String(
          claim.claim_no || ''
        ).trim();

        const approvedSheets = Number(
          claim.approved_qty || 0
        );

        const ledgerSheets =
          ledgerSheetsByClaim.get(claimNo) || 0;

        const missingSheets = Math.max(
          0,
          approvedSheets - ledgerSheets
        );

        if (hasPrice && missingSheets <= 0) return [];

        const gapSheets =
          missingSheets > 0 ? missingSheets : approvedSheets;

        // A Lost lead is dropped by the claim processor by design. Keep it in
        // this diagnostic report, however, so the full gap can be traced back
        // to the exact claim instead of silently disappearing from the screen.
        if (isLostLead(lead)) {
          lostLeadGapSheets += gapSheets;
          return [{
            claimNo: claim.claim_no || '—',
            leadId: claim.lead_id || '—',
            claimDate: formatClaimDate(claim.claim_date),
            architect: lead.linked_architect,
            state: lead.state || 'Unknown',
            productSku: productSku || 'Blank product code',
            sheets: gapSheets,
            lostLeadExclusion: true,
          }];
        }

        return [
          {
            claimNo: claim.claim_no || '—',
            leadId: claim.lead_id || '—',
            claimDate: formatClaimDate(claim.claim_date),
            architect: lead.linked_architect,
            state: lead.state || 'Unknown',
            productSku:
              productSku || 'Blank product code',
            sheets: gapSheets,
          },
        ];
      });

      // One row per claim. Grouping used to merge claims on a key that included
      // an undefined `reason`, so several claims collapsed into a single row
      // that still displayed just the first claim number, lead id and date.
      candidateRows.sort(
        (first, second) =>
          String(first.architect).localeCompare(String(second.architect)) ||
          String(first.claimNo).localeCompare(String(second.claimNo))
      );

      // Reconcile claim-by-claim instead of comparing Architect Accounts with
      // the Ledger total directly. Architect Accounts is itself built from the
      // Ledger, so that comparison would count the same sheets twice.
      const countableCandidateRows = candidateRows.filter(
        (row) => !row.lostLeadExclusion
      );
      const uncountedSheetsByClaim = new Map(
        countableCandidateRows.map((row) => [String(row.claimNo || '').trim(), Number(row.sheets || 0)])
      );
      let approvedSheetsTotal = 0;
      let ledgerSheetsTotal = 0;
      let remainingSheetsTotal = 0;

      const reconciliationRows = claims.flatMap((claim) => {
        if (!isApproved(claim.status)) return [];

        const lead = leadsById.get(String(claim.lead_id || '').trim());
        const productSku = String(claim.product_code || '').trim();
        if (!lead?.linked_architect || isLostLead(lead) || /SIGNATURE|NATURE/i.test(productSku)) return [];

        const claimNo = String(claim.claim_no || '').trim();
        const approvedSheets = Number(claim.approved_qty || 0);
        const ledgerSheets = ledgerSheetsByClaim.get(claimNo) || 0;
        const uncountedSheets = uncountedSheetsByClaim.get(claimNo) || 0;
        const remainingSheets = Math.max(0, approvedSheets - ledgerSheets - uncountedSheets);

        approvedSheetsTotal += approvedSheets;
        ledgerSheetsTotal += Math.min(ledgerSheets, approvedSheets);
        remainingSheetsTotal += remainingSheets;

        if (remainingSheets <= 0) return [];

        return [{
          claimNo: claim.claim_no || '—',
          leadId: claim.lead_id || '—',
          claimDate: formatClaimDate(claim.claim_date),
          architect: lead.linked_architect,
          state: lead.state || 'Unknown',
          productSku: productSku || 'Blank product code',
          sheets: remainingSheets,
          reconciliationGap: true,
        }];
      });

      const reportRows = [...candidateRows, ...reconciliationRows].sort(
        (first, second) =>
          String(first.architect).localeCompare(String(second.architect)) ||
          String(first.claimNo).localeCompare(String(second.claimNo))
      );

      setRows(reportRows);
      setLostLeadSheets(lostLeadGapSheets);
      setReconciliation({
        approvedSheets: approvedSheetsTotal,
        ledgerSheets: ledgerSheetsTotal,
        uncountedSheets: countableCandidateRows.reduce((sum, row) => sum + Number(row.sheets || 0), 0),
        remainingSheets: remainingSheetsTotal,
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error(
        'Failed to load sheet gap report:',
        err.message
      );

      // Clear the previous result. Keeping it would leave the old totals on
      // screen next to the error, which reads as up-to-date data.
      setRows([]);
      setLostLeadSheets(0);
      setReconciliation({ approvedSheets: 0, ledgerSheets: 0, uncountedSheets: 0, remainingSheets: 0 });
      setLastUpdated(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return rows;

    return rows.filter((row) =>
      [
        row.architect,
        row.productSku,
        row.claimNo,
        row.claimDate,
        row.leadId,
        row.state,
      ].some((value) =>
        String(value)
          .toLowerCase()
          .includes(query)
      )
    );
  }, [rows, search]);

  const totals = useMemo(
    () => ({
      sheets: filteredRows.reduce(
        (sum, row) => sum + row.sheets,
        0
      ),
      architects: new Set(
        filteredRows.map((row) => row.architect)
      ).size,
    }),
    [filteredRows]
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f5f7fb',
        color: '#172033',
        padding: '28px 32px 40px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
        }}
      >

        {/* ================= HEADER ================= */}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 20,
            flexWrap: 'wrap',
            marginBottom: 28,
          }}
        >
          <div>
            
            <h1
              style={{
                margin: 0,
                fontSize: 30,
                lineHeight: 1.2,
                fontWeight: 750,
                letterSpacing: '-0.6px',
                color: '#172033',
              }}
            >
              Uncounted Sheets Report
            </h1>

            <p
              style={{
                margin: '8px 0 0',
                color: '#64748b',
                fontSize: 14,
              }}
            >
              Review approved sheets that are not reflected
              in the current count.
            </p>

            {/* Makes it obvious whether the figures below are from this load. */}
            <p
              style={{
                margin: '4px 0 0',
                color: '#94a3b8',
                fontSize: 12,
              }}
            >
              {loading
                ? 'Reading leads, claims and ledger...'
                : lastUpdated
                  ? `Last updated ${new Intl.DateTimeFormat('en-GB', {
                      timeZone: 'Asia/Kolkata',
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(lastUpdated)} IST`
                  : 'Not loaded yet'}
            </p>
          </div>

          <button
            onClick={loadReport}
            disabled={loading}
            style={{
              border: '1px solid #2563eb',
              borderRadius: 10,
              padding: '11px 17px',
              color: '#fff',
              background: loading ? '#94a3b8' : '#2563eb',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 14,
              boxShadow: '0 5px 14px rgba(37,99,235,0.18)',
            }}
          >
            {loading ? 'Refreshing...' : '↻  Refresh Report'}
          </button>
        </div>

        {/* ================= STATS ================= */}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 22,
          }}
        >

          {/* Uncounted Sheets */}

          <div
            style={{
              background: '#fff',
              border: '1px solid #e5eaf2',
              borderRadius: 14,
              padding: 20,
              boxShadow:
                '0 3px 12px rgba(15,23,42,0.04)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 4,
                height: '100%',
                background: '#f97316',
              }}
            />

            <div
              style={{
                color: '#64748b',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.7px',
              }}
            >
              UNCOUNTED SHEETS
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 10,
              }}
            >
              <strong
                style={{
                  fontSize: 28,
                  color: '#ea580c',
                }}
              >
                {totals.sheets.toLocaleString('en-IN')}
              </strong>
              {lostLeadSheets > 0 && (
                <span style={{ color: '#b45309', fontSize: 11, fontWeight: 700 }}>
                  Includes {lostLeadSheets.toLocaleString('en-IN')} lost-lead sheets
                </span>
              )}
            </div>
          </div>

          {/* Architects */}

          <div
            style={{
              background: '#fff',
              border: '1px solid #e5eaf2',
              borderRadius: 14,
              padding: 20,
              boxShadow:
                '0 3px 12px rgba(15,23,42,0.04)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 4,
                height: '100%',
                background: '#2563eb',
              }}
            />

            <div
              style={{
                color: '#64748b',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.7px',
              }}
            >
              AFFECTED ARCHITECTS
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 10,
              }}
            >
              <strong
                style={{
                  fontSize: 28,
                  color: '#1d4ed8',
                }}
              >
                {totals.architects}
              </strong>
            </div>
          </div>

          {/* Claims */}

          <div
            style={{
              background: '#fff',
              border: '1px solid #e5eaf2',
              borderRadius: 14,
              padding: 20,
              boxShadow:
                '0 3px 12px rgba(15,23,42,0.04)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 4,
                height: '100%',
                background: '#64748b',
              }}
            />

            <div
              style={{
                color: '#64748b',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.7px',
              }}
            >
              UNMATCHED CLAIMS
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 10,
              }}
            >
              <strong
                style={{
                  fontSize: 28,
                  color: '#334155',
                }}
              >
                {filteredRows.length}
              </strong>

            </div>
          </div>

          {/* Reconciliation remainder */}
          {/* <div
            style={{
              background: '#fff',
              border: '1px solid #e5eaf2',
              borderRadius: 14,
              padding: 20,
              boxShadow: '0 3px 12px rgba(15,23,42,0.04)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', left: 0, top: 0, width: 4, height: '100%', background: reconciliation.remainingSheets > 0 ? '#dc2626' : '#10b981' }} />
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800, letterSpacing: '0.7px' }}>
              RECONCILIATION GAP
            </div>
            <strong style={{ display: 'block', marginTop: 10, fontSize: 28, color: reconciliation.remainingSheets > 0 ? '#dc2626' : '#059669' }}>
              {reconciliation.remainingSheets.toLocaleString('en-IN')}
            </strong>
            <div style={{ marginTop: 5, color: '#94a3b8', fontSize: 11, lineHeight: 1.45 }}>
              Approved {reconciliation.approvedSheets.toLocaleString('en-IN')} − Ledger {reconciliation.ledgerSheets.toLocaleString('en-IN')} − Uncounted {reconciliation.uncountedSheets.toLocaleString('en-IN')}
            </div>
          </div> */}
        </div>

        {/* ================= SEARCH ================= */}

        <div
          style={{
            background: '#fff',
            border: '1px solid #e5eaf2',
            borderRadius: 14,
            padding: 14,
            marginBottom: 18,
            boxShadow:
              '0 3px 12px rgba(15,23,42,0.035)',
          }}
        >
          <div
            style={{
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
                fontSize: 18,
              }}
            >
              ⌕
            </span>

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search architect, product, lead ID or claim no..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid #dbe3ef',
                borderRadius: 10,
                padding: '12px 42px',
                fontSize: 14,
                outline: 'none',
                background: '#f8fafc',
                color: '#172033',
              }}
            />

            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: 18,
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* ================= ERROR ================= */}

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              padding: '13px 16px',
              borderRadius: 10,
              marginBottom: 18,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Could not load report: {error}
          </div>
        )}

        {/* ================= TABLE CARD ================= */}

        <div
          style={{
            background: '#fff',
            border: '1px solid #e5eaf2',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow:
              '0 4px 18px rgba(15,23,42,0.045)',
          }}
        >

          {/* Table Card Header */}

          <div
            style={{
              padding: '17px 20px',
              borderBottom: '1px solid #e5eaf2',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 750,
                  color: '#172033',
                }}
              >
                Sheet Details
              </div>

              <div
                style={{
                  marginTop: 3,
                  fontSize: 12,
                  color: '#94a3b8',
                }}
              >
                Showing {filteredRows.length} records
              </div>
            </div>

            {search && (
              <span
                style={{
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  padding: '5px 9px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Filtered
              </span>
            )}
          </div>

          {/* Table */}

          <div
            style={{
              overflowX: 'auto',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                minWidth: 900,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: '#f8fafc',
                    textAlign: 'left',
                  }}
                >
                  {[
                    'Architect',
                    'State',
                    'Product / Reconciliation Gap',
                    'Total Sheets',
                    'Lead ID',
                    'Claim No.',
                    'Claim Date',
                  ].map((head) => (
                    <th
                      key={head}
                      style={{
                        padding: '13px 18px',
                        borderBottom:
                          '1px solid #e5eaf2',
                        color: '#64748b',
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>

                {/* LOADING */}

                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: 60,
                        textAlign: 'center',
                        color: '#64748b',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        Loading sheet-gap report...
                      </div>

                      <div
                        style={{
                          marginTop: 7,
                          fontSize: 12,
                          color: '#94a3b8',
                        }}
                      >
                        Please wait while the report
                        is being prepared.
                      </div>
                    </td>
                  </tr>

                ) : filteredRows.length === 0 ? (

                  /* EMPTY */

                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: 65,
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: 50,
                          height: 50,
                          borderRadius: 14,
                          background: '#ecfdf5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 12px',
                          color: '#059669',
                          fontSize: 22,
                          fontWeight: 800,
                        }}
                      >
                        ✓
                      </div>

                      <div
                        style={{
                          fontWeight: 750,
                          color: '#047857',
                          fontSize: 15,
                        }}
                      >
                        No uncounted sheets found
                      </div>

                      <div
                        style={{
                          marginTop: 5,
                          color: '#94a3b8',
                          fontSize: 13,
                        }}
                      >
                        Everything looks good for the
                        current selection.
                      </div>
                    </td>
                  </tr>

                ) : (

                  /* DATA */

                  filteredRows.map((row, index) => (
                    <tr
                      key={`${row.claimNo}-${index}`}
                      style={{
                        borderBottom:
                          '1px solid #f1f5f9',
                        transition:
                          'background 0.15s ease',
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.background =
                          '#f8fafc';
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.background =
                          '#fff';
                      }}
                    >

                      {/* Architect */}

                      <td
                        style={{
                          padding: '15px 18px',
                          fontWeight: 700,
                          color: '#1e293b',
                        }}
                      >
                        {row.architect}
                      </td>

                      {/* State */}

                      <td
                        style={{
                          padding: '15px 18px',
                          color: '#64748b',
                        }}
                      >
                        {row.state}
                      </td>

                      {/* Product */}

                      <td
                        style={{
                          padding: '15px 18px',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            background: '#f8fafc',
                            border:
                              '1px solid #e2e8f0',
                            padding: '6px 9px',
                            borderRadius: 7,
                            fontFamily:
                              'monospace',
                            fontSize: 12,
                            color: '#334155',
                          }}
                        >
                          {row.productSku}
                          {row.lostLeadExclusion && (
                            <span style={{ display: 'block', marginTop: 5, color: '#b45309', fontFamily: 'inherit', fontSize: 10, fontWeight: 800 }}>
                              LOST LEAD — EXCLUDED FROM CURRENT COUNT
                            </span>
                          )}
                          {row.reconciliationGap && (
                            <span style={{ display: 'block', marginTop: 5, color: '#dc2626', fontFamily: 'inherit', fontSize: 10, fontWeight: 800 }}>
                              NOT IN LEDGER OR UNCOUNTED TOTAL
                            </span>
                          )}
                        </span>
                      </td>

                      {/* Sheets */}

                      <td
                        style={{
                          padding: '15px 18px',
                          textAlign: 'right',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 42,
                            background: '#fff7ed',
                            border:
                              '1px solid #fed7aa',
                            color: '#c2410c',
                            padding: '6px 10px',
                            borderRadius: 7,
                            fontWeight: 800,
                          }}
                        >
                          {row.sheets.toLocaleString(
                            'en-IN'
                          )}
                        </span>
                      </td>

                      {/* Lead ID */}

                      <td
                        style={{
                          padding: '15px 18px',
                          color: '#475569',
                          fontFamily:
                            'monospace',
                          fontSize: 12,
                        }}
                      >
                        {row.leadId}
                      </td>

                      {/* Claim No */}

                      <td
                        style={{
                          padding: '15px 18px',
                          color: '#475569',
                          fontFamily:
                            'monospace',
                          fontSize: 12,
                        }}
                      >
                        {row.claimNo}
                      </td>

                      <td
                        style={{
                          padding: '15px 18px',
                          color: '#475569',
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.claimDate}
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
