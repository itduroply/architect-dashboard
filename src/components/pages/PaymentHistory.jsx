import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supbase';
import * as XLSX from 'xlsx';
import { Search, Loader2, AlertCircle, ChevronRight, ChevronDown, Calendar, Download, Wallet, Users, MapPin, Layers } from 'lucide-react';

const PAGE_SIZE = 25;

const STAGE_PAID = 'Paid';
const STAGE_PROCESS = 'In Process';
const STAGE_QUEUE = 'In Queue';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const DURATION_OPTIONS = [
  { id: 'all', label: 'All Time', months: 0 },
  { id: '3m', label: 'Last 3 Months', months: 3 },
  { id: '6m', label: 'Last 6 Months', months: 6 },
  { id: '12m', label: 'Last 12 Months', months: 12 }
];

/* ── Value helpers ───────────────────────────────────────── */

// commission_ledger stores the architect as "2511001131   | Rajusharma";
// payout_request keeps the same number in account_identity.
const extractAccountId = (fullName) => {
  if (!fullName) return '';
  const str = String(fullName);
  return (str.includes('|') ? str.split('|')[0] : str).trim();
};

const cleanName = (fullName) => {
  if (!fullName) return 'Unmapped Architect';
  const tail = String(fullName).includes('|')
    ? String(fullName).split('|').slice(1).join('|')
    : String(fullName);
  return tail.trim() || 'Unmapped Architect';
};

// Date columns arrive in two shapes: timestamptz ("2026-07-21T07:23:04Z") and
// plain date ("2026-07-21"). Plain dates are parsed as local so they never
// slide back a day in IST.
const toLocalDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const str = String(value);
  if (str.includes('T')) {
    const parsed = new Date(str);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const monthKeyOf = (value) => {
  const date = toLocalDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabelOf = (key) => {
  if (!key) return '—';
  const [year, month] = key.split('-');
  return `${MONTH_LABELS[Number(month) - 1] || month} ${year}`;
};

const formatDate = (value) => {
  const date = toLocalDate(value);
  if (!date) return '—';
  return `${String(date.getDate()).padStart(2, '0')} ${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;
};

// The architect-facing app prints "2026-August-25"; the statement mirrors it.
const formatLongDate = (value) => {
  const date = toLocalDate(value);
  if (!date) return '—';
  return `${date.getFullYear()}-${MONTH_FULL[date.getMonth()]}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatMoney = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
}).format(Number(amount) || 0);

const daysBetween = (from, to) => {
  const a = toLocalDate(from);
  const b = toLocalDate(to);
  if (!a || !b) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
};

/* ── Fiscal quarters ─────────────────────────────────────
   The financial year runs April to March, so Q1 is Apr-Jun.
   A quarter key is "<year the FY starts>-Q<n>". */
const QUARTER_MONTHS = {
  1: [4, 5, 6],
  2: [7, 8, 9],
  3: [10, 11, 12],
  4: [1, 2, 3]
};

const quarterOfMonthKey = (monthKey) => {
  if (!monthKey) return null;
  const [yearPart, monthPart] = monthKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!year || !month) return null;
  const fyStart = month >= 4 ? year : year - 1;
  const quarter = Math.floor(((month - 4 + 12) % 12) / 3) + 1;
  return { fyStart, quarter, key: `${fyStart}-Q${quarter}` };
};

const monthKeysOfQuarter = (quarterKey) => {
  if (!quarterKey) return [];
  const [fyPart, quarterPart] = quarterKey.split('-Q');
  const fyStart = Number(fyPart);
  const quarter = Number(quarterPart);
  if (!fyStart || !quarter) return [];
  return (QUARTER_MONTHS[quarter] || []).map((month) => {
    const year = month >= 4 ? fyStart : fyStart + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  });
};

const quarterLabelOf = (quarterKey) => {
  const months = monthKeysOfQuarter(quarterKey);
  if (months.length === 0) return '—';
  const quarter = Number(quarterKey.split('-Q')[1]);
  const first = months[0].split('-');
  const last = months[months.length - 1].split('-');
  const firstLabel = `${MONTH_LABELS[Number(first[1]) - 1]} ${first[0]}`;
  const lastLabel = `${MONTH_LABELS[Number(last[1]) - 1]} ${last[0]}`;
  return `Q${quarter} · ${firstLabel} – ${lastLabel}`;
};

// Rolls several months into one period so a quarter reads exactly like a month.
const aggregatePeriod = (months) => {
  const architects = {};
  const leadIds = new Set();
  let payout = 0;
  let sheets = 0;
  let claimCount = 0;

  months.forEach((month) => {
    payout += month.payout;
    sheets += month.sheets;
    claimCount += month.claimCount;

    month.architects.forEach((architect) => {
      if (!architects[architect.accountId]) {
        architects[architect.accountId] = {
          accountId: architect.accountId,
          name: architect.name,
          branches: architect.branches || [],
          state: architect.state || '',
          payout: 0,
          sheets: 0,
          claimCount: 0,
          leads: {}
        };
      }
      const target = architects[architect.accountId];
      target.payout += architect.payout;
      target.sheets += architect.sheets;
      target.claimCount += architect.claimCount;

      architect.leads.forEach((lead) => {
        const leadKey = lead.leadId || 'UNMAPPED';
        leadIds.add(leadKey);
        if (!target.leads[leadKey]) {
          target.leads[leadKey] = {
            leadId: lead.leadId,
            siteNo: lead.siteNo,
            payout: 0,
            sheets: 0,
            claimCount: 0,
            dates: []
          };
        }
        const leadTarget = target.leads[leadKey];
        leadTarget.payout += lead.payout;
        leadTarget.sheets += lead.sheets;
        leadTarget.claimCount += lead.claimCount;
        leadTarget.dates.push(...lead.dates);
      });
    });
  });

  return {
    payout,
    sheets,
    claimCount,
    leadCount: leadIds.size,
    architects: Object.values(architects)
      .map((architect) => ({
        ...architect,
        leadCount: Object.keys(architect.leads).length,
        leads: Object.values(architect.leads)
          .map((lead) => ({ ...lead, dates: [...lead.dates].sort() }))
          .sort((a, b) => b.payout - a.payout)
      }))
      .sort((a, b) => b.payout - a.payout || a.name.localeCompare(b.name))
  };
};

// Supabase caps one request at 1,000 rows and commission_ledger is already
// past that, so the lead references have to be paged in.
const fetchAllRows = async (table, columns, orderColumn) => {
  const pageSize = 1000;
  const collected = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderColumn)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    collected.push(...page);
    if (page.length < pageSize) return collected;
  }
};

export default function PaymentHistory() {
  const [rows, setRows] = useState([]);
  const [accountIndex, setAccountIndex] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState('');
  const [dateBasis, setDateBasis] = useState('claim'); // 'claim' | 'payment'
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedKey, setExpandedKey] = useState(null);

  // Architect statement view
  const [viewMode, setViewMode] = useState('monthly'); // 'ledger' | 'statement' | 'monthly'
  const [architectSearch, setArchitectSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [statementTab, setStatementTab] = useState('history'); // 'history' | 'progress' | 'completed'
  const [durationCycle, setDurationCycle] = useState('all');

  // Month-wise pool view
  const [poolMonth, setPoolMonth] = useState('');
  const [poolQuarter, setPoolQuarter] = useState('');
  const [periodType, setPeriodType] = useState('all'); // 'all' | 'month' | 'quarter'
  const [monthSearch, setMonthSearch] = useState('');
  const [expandedMonthArchitect, setExpandedMonthArchitect] = useState(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [payoutRes, remittanceRes, ledgerRows] = await Promise.all([
        supabase
          .from('payout_request')
          .select('id, account_identity, architect_name, payout_amount, created_at, status, mobile_no')
          .order('created_at', { ascending: false }),
        supabase
          .from('remittances')
          .select('id, transaction_id, architect_name, account_number, amount, status, created_payment_date, done_payment_date, utr, payment_mode, remark'),
        fetchAllRows(
          'commission_ledger',
          'architect_name, lead_id, claim_no, claim_date, total_eligible_sheets, total_payout_amount, branch_name, state, status',
          'claim_no'
        )
      ]);

      if (payoutRes.error) throw payoutRes.error;
      if (remittanceRes.error) throw remittanceRes.error;

      // Lead / claim context per architect account number.
      const index = {};
      (ledgerRows || []).forEach((row) => {
        const accountId = extractAccountId(row.architect_name);
        if (!accountId) return;
        if (!index[accountId]) {
          index[accountId] = {
            displayName: cleanName(row.architect_name),
            leadIds: new Set(),
            claimNos: new Set(),
            sheets: 0,
            earned: 0,
            branches: new Set(),
            state: '',
            leadFirstSeen: {},
            creditGroups: {},
            eligibility: ''
          };
        }
        const bucket = index[accountId];
        const leadId = String(row.lead_id || '').trim();
        const claimDate = row.claim_date || '';
        const amount = Number(row.total_payout_amount || 0);
        const sheets = Number(row.total_eligible_sheets || 0);

        if (leadId) bucket.leadIds.add(leadId);
        if (row.claim_no) bucket.claimNos.add(String(row.claim_no).trim());
        if (row.branch_name) bucket.branches.add(String(row.branch_name).trim());
        if (!bucket.state && row.state) bucket.state = row.state;
        if (row.status) bucket.eligibility = String(row.status).toLowerCase();
        bucket.sheets += sheets;
        bucket.earned += amount;

        // One credit line per claim date per lead — the same grouping the
        // architect's own transaction history shows.
        if (claimDate) {
          if (leadId && (!bucket.leadFirstSeen[leadId] || claimDate < bucket.leadFirstSeen[leadId])) {
            bucket.leadFirstSeen[leadId] = claimDate;
          }
          const groupKey = `${claimDate}~${leadId}`;
          if (!bucket.creditGroups[groupKey]) {
            bucket.creditGroups[groupKey] = {
              key: groupKey,
              date: claimDate,
              leadId,
              amount: 0,
              sheets: 0,
              claimNos: []
            };
          }
          const credit = bucket.creditGroups[groupKey];
          credit.amount += amount;
          credit.sheets += sheets;
          if (row.claim_no) credit.claimNos.push(String(row.claim_no).trim());
        }
      });

      const compiledIndex = {};
      Object.keys(index).forEach((key) => {
        const bucket = index[key];

        // Site numbers run in the order the architect's leads first appeared,
        // so Site 1 is always their oldest lead.
        const orderedLeads = Object.keys(bucket.leadFirstSeen).sort((a, b) => {
          const diff = String(bucket.leadFirstSeen[a]).localeCompare(String(bucket.leadFirstSeen[b]));
          return diff !== 0 ? diff : a.localeCompare(b);
        });
        const siteNoByLead = {};
        orderedLeads.forEach((leadId, position) => { siteNoByLead[leadId] = position + 1; });

        const credits = Object.values(bucket.creditGroups)
          .map((credit) => ({ ...credit, siteNo: siteNoByLead[credit.leadId] || null }))
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));

        const leadSummary = orderedLeads.map((leadId) => {
          const lines = credits.filter((credit) => credit.leadId === leadId);
          const dates = lines.map((line) => line.date).sort();
          return {
            leadId,
            siteNo: siteNoByLead[leadId],
            earned: lines.reduce((sum, line) => sum + line.amount, 0),
            sheets: lines.reduce((sum, line) => sum + line.sheets, 0),
            claimCount: lines.reduce((sum, line) => sum + line.claimNos.length, 0),
            firstDate: dates[0] || null,
            lastDate: dates[dates.length - 1] || null
          };
        });

        compiledIndex[key] = {
          displayName: bucket.displayName,
          leadIds: Array.from(bucket.leadIds).sort(),
          claimCount: bucket.claimNos.size,
          sheets: bucket.sheets,
          earned: bucket.earned,
          branches: Array.from(bucket.branches).sort(),
          state: bucket.state,
          eligibility: bucket.eligibility,
          credits,
          leadSummary
        };
      });

      const remittanceByTxn = new Map();
      const usedRemittanceIds = new Set();
      (remittanceRes.data || []).forEach((row) => {
        if (row.transaction_id === null || row.transaction_id === undefined) return;
        remittanceByTxn.set(Number(row.transaction_id), row);
      });

      const compiled = (payoutRes.data || []).map((request) => {
        const remittance = remittanceByTxn.get(Number(request.id));
        if (remittance) usedRemittanceIds.add(remittance.id);

        const remittanceStatus = String(remittance?.status || '').toLowerCase();
        let stage = STAGE_QUEUE;
        if (remittance && remittanceStatus === 'paid') stage = STAGE_PAID;
        else if (remittance) stage = STAGE_PROCESS;

        const accountId = String(request.account_identity || '').trim();
        const claimedAmount = Number(request.payout_amount || 0);
        const releasedAmount = Number(remittance?.amount ?? request.payout_amount ?? 0);
        const paidDate = stage === STAGE_PAID
          ? (remittance?.done_payment_date || remittance?.created_payment_date)
          : null;

        return {
          key: `req-${request.id}`,
          requestId: request.id,
          accountId,
          architectName: cleanName(request.architect_name),
          mobile: request.mobile_no || '',
          stage,
          claimedAmount,
          paidAmount: stage === STAGE_PAID ? releasedAmount : 0,
          pendingAmount: stage === STAGE_PAID ? 0 : claimedAmount,
          claimDate: request.created_at,
          initiatedDate: remittance?.created_payment_date || null,
          paidDate,
          utr: remittance?.utr || '',
          paymentMode: remittance?.payment_mode || '',
          remark: remittance?.remark || '',
          accountNumber: remittance?.account_number || accountId,
          requestStatus: request.status || '',
          isOrphanRemittance: false
        };
      });

      // A remittance released without a matching request would otherwise never
      // appear on this ledger; carry it as its own row.
      (remittanceRes.data || []).forEach((remittance) => {
        if (usedRemittanceIds.has(remittance.id)) return;
        const accountId = String(remittance.account_number || extractAccountId(remittance.architect_name) || '').trim();
        const isPaid = String(remittance.status || '').toLowerCase() === 'paid';
        const amount = Number(remittance.amount || 0);
        compiled.push({
          key: `rem-${remittance.id}`,
          requestId: remittance.transaction_id || '—',
          accountId,
          architectName: cleanName(remittance.architect_name),
          mobile: '',
          stage: isPaid ? STAGE_PAID : STAGE_PROCESS,
          claimedAmount: amount,
          paidAmount: isPaid ? amount : 0,
          pendingAmount: isPaid ? 0 : amount,
          claimDate: remittance.created_payment_date || null,
          initiatedDate: remittance.created_payment_date || null,
          paidDate: isPaid ? (remittance.done_payment_date || remittance.created_payment_date) : null,
          utr: remittance.utr || '',
          paymentMode: remittance.payment_mode || '',
          remark: remittance.remark || '',
          accountNumber: remittance.account_number || accountId,
          requestStatus: 'Direct Remittance',
          isOrphanRemittance: true
        });
      });

      compiled.sort((a, b) => {
        const left = toLocalDate(a.paidDate || a.claimDate)?.getTime() || 0;
        const right = toLocalDate(b.paidDate || b.claimDate)?.getTime() || 0;
        return right - left;
      });

      setAccountIndex(compiledIndex);
      setRows(compiled);
    } catch (err) {
      setError(err.message || 'Unable to load the payment history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    setCurrentPage(1);
    setExpandedKey(null);
  }, [search, stageFilter, monthFilter, dateBasis]);

  const leadsFor = useCallback(
    (accountId) => accountIndex[accountId]?.leadIds || [],
    [accountIndex]
  );

  /* ── Month options ────────────────────────────────────── */
  // Every month of every year in play is listed, not only the months that
  // happen to carry a settlement, so a quiet month can still be selected and
  // read as a genuine zero.
  const monthOptions = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    rows.forEach((row) => {
      const claimKey = monthKeyOf(row.claimDate);
      const payKey = monthKeyOf(row.paidDate);
      if (claimKey) years.add(Number(claimKey.slice(0, 4)));
      if (payKey) years.add(Number(payKey.slice(0, 4)));
    });

    const keys = [];
    Array.from(years)
      .sort((a, b) => b - a)
      .forEach((year) => {
        for (let month = 12; month >= 1; month -= 1) {
          keys.push(`${year}-${String(month).padStart(2, '0')}`);
        }
      });
    return keys;
  }, [rows]);

  /* ── Month-wise roll-up ───────────────────────────────── */
  const monthlySummary = useMemo(() => {
    const buckets = {};
    const touch = (key) => {
      if (!buckets[key]) {
        buckets[key] = {
          monthKey: key,
          claimCount: 0,
          claimAmount: 0,
          paidCount: 0,
          paidAmount: 0,
          openCount: 0,
          openAmount: 0
        };
      }
      return buckets[key];
    };

    rows.forEach((row) => {
      const claimKey = monthKeyOf(row.claimDate);
      if (claimKey) {
        const bucket = touch(claimKey);
        bucket.claimCount += 1;
        bucket.claimAmount += row.claimedAmount;
        if (row.stage !== STAGE_PAID) {
          bucket.openCount += 1;
          bucket.openAmount += row.pendingAmount;
        }
      }
      const payKey = monthKeyOf(row.paidDate);
      if (payKey) {
        const bucket = touch(payKey);
        bucket.paidCount += 1;
        bucket.paidAmount += row.paidAmount;
      }
    });

    return Object.values(buckets).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [rows]);

  /* ── Filtered detail rows ─────────────────────────────── */
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (stageFilter === 'Pending') {
        if (row.stage === STAGE_PAID) return false;
      } else if (stageFilter !== 'All' && row.stage !== stageFilter) {
        return false;
      }

      if (monthFilter) {
        const basisValue = dateBasis === 'payment' ? row.paidDate : row.claimDate;
        if (monthKeyOf(basisValue) !== monthFilter) return false;
      }

      if (!needle) return true;

      const haystack = [
        row.architectName,
        row.accountId,
        row.accountNumber,
        row.mobile,
        row.utr,
        `#${row.requestId}`,
        ...leadsFor(row.accountId)
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [rows, search, stageFilter, monthFilter, dateBasis, leadsFor]);

  /* ── Headline numbers, scoped to the active filters ───── */
  // eslint-disable-next-line no-unused-vars
  const totals = useMemo(() => {
    const summary = {
      claimedCount: filteredRows.length,
      claimedAmount: 0,
      paidCount: 0,
      paidAmount: 0,
      processCount: 0,
      processAmount: 0,
      queueCount: 0,
      queueAmount: 0,
      oldestPendingDays: 0,
      settlementDaysTotal: 0,
      settlementSamples: 0
    };
    const today = new Date();

    filteredRows.forEach((row) => {
      summary.claimedAmount += row.claimedAmount;
      if (row.stage === STAGE_PAID) {
        summary.paidCount += 1;
        summary.paidAmount += row.paidAmount;
        const span = daysBetween(row.claimDate, row.paidDate);
        if (span !== null) {
          summary.settlementDaysTotal += span;
          summary.settlementSamples += 1;
        }
      } else {
        const ageing = daysBetween(row.claimDate, today) || 0;
        if (ageing > summary.oldestPendingDays) summary.oldestPendingDays = ageing;
        if (row.stage === STAGE_PROCESS) {
          summary.processCount += 1;
          summary.processAmount += row.pendingAmount;
        } else {
          summary.queueCount += 1;
          summary.queueAmount += row.pendingAmount;
        }
      }
    });

    summary.pendingAmount = summary.processAmount + summary.queueAmount;
    summary.pendingCount = summary.processCount + summary.queueCount;
    summary.avgSettlementDays = summary.settlementSamples
      ? Math.round(summary.settlementDaysTotal / summary.settlementSamples)
      : null;

    return summary;
  }, [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetFilters = () => {
    setSearch('');
    setStageFilter('All');
    setMonthFilter('');
    setDateBasis('claim');
  };

  /* ── Architect directory ──────────────────────────────── */
  // Every architect in the commission ledger appears here, not only the ones
  // who have asked for money, so a statement can be opened for anybody.
  const architectDirectory = useMemo(() => {
    const directory = {};

    Object.keys(accountIndex).forEach((accountId) => {
      const entry = accountIndex[accountId];
      directory[accountId] = {
        accountId,
        name: entry.displayName || 'Unmapped Architect',
        earned: entry.earned,
        sheets: entry.sheets,
        leadCount: entry.leadIds.length,
        branches: entry.branches,
        state: entry.state,
        isEligible: entry.eligibility !== 'ineligible',
        paidOut: 0,
        underProcess: 0,
        requestCount: 0,
        mobile: ''
      };
    });

    rows.forEach((row) => {
      if (!row.accountId) return;
      if (!directory[row.accountId]) {
        directory[row.accountId] = {
          accountId: row.accountId,
          name: row.architectName,
          earned: 0,
          sheets: 0,
          leadCount: 0,
          branches: [],
          state: '',
          isEligible: true,
          paidOut: 0,
          underProcess: 0,
          requestCount: 0,
          mobile: ''
        };
      }
      const entry = directory[row.accountId];
      entry.requestCount += 1;
      if (row.mobile && !entry.mobile) entry.mobile = row.mobile;
      if (row.stage === STAGE_PAID) entry.paidOut += row.paidAmount;
      else entry.underProcess += row.pendingAmount;
    });

    return Object.values(directory)
      .map((entry) => {
        // Architect Accounts zeroes the payout of an ineligible architect and
        // reads balance as pool minus what has actually been credited. The
        // statement follows the same rule so both pages agree.
        const poolAllowed = entry.isEligible ? entry.earned : 0;
        return {
          ...entry,
          poolAllowed,
          balanceDue: Math.max(0, poolAllowed - entry.paidOut)
        };
      })
      .sort((a, b) => b.earned - a.earned || a.name.localeCompare(b.name));
  }, [accountIndex, rows]);

  // The whole commission pool, and how it is split across architects.
  const poolTotals = useMemo(() => architectDirectory.reduce((acc, entry) => ({
    pool: acc.pool + entry.earned,
    allowed: acc.allowed + entry.poolAllowed,
    paid: acc.paid + entry.paidOut,
    process: acc.process + entry.underProcess,
    due: acc.due + entry.balanceDue
  }), { pool: 0, allowed: 0, paid: 0, process: 0, due: 0 }), [architectDirectory]);

  const visibleArchitects = useMemo(() => {
    const needle = architectSearch.trim().toLowerCase();
    if (!needle) return architectDirectory;
    return architectDirectory.filter((entry) => {
      const leadIds = accountIndex[entry.accountId]?.leadIds || [];
      return [entry.name, entry.accountId, entry.mobile, ...leadIds]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [architectDirectory, architectSearch, accountIndex]);

  const selectedArchitect = useMemo(
    () => architectDirectory.find((entry) => entry.accountId === selectedAccount) || null,
    [architectDirectory, selectedAccount]
  );

  // The statement merges credits earned against leads with the withdrawals the
  // architect has raised, newest first — one running list, like a passbook.
  const statementRows = useMemo(() => {
    if (!selectedArchitect) return [];

    const credits = (accountIndex[selectedArchitect.accountId]?.credits || []).map((credit) => ({
      key: `credit-${credit.key}`,
      type: 'credit',
      date: credit.date,
      leadId: credit.leadId,
      siteNo: credit.siteNo,
      amount: credit.amount,
      sheets: credit.sheets,
      claimNos: credit.claimNos
    }));

    const debits = rows
      .filter((row) => row.accountId === selectedArchitect.accountId)
      .map((row) => ({
        key: `debit-${row.key}`,
        type: 'debit',
        date: row.claimDate,
        amount: row.stage === STAGE_PAID ? row.paidAmount : row.pendingAmount,
        stage: row.stage,
        requestId: row.requestId,
        paidDate: row.paidDate,
        utr: row.utr,
        paymentMode: row.paymentMode
      }));

    return [...credits, ...debits].sort((a, b) => {
      const left = toLocalDate(b.date)?.getTime() || 0;
      const right = toLocalDate(a.date)?.getTime() || 0;
      return left - right;
    });
  }, [selectedArchitect, accountIndex, rows]);

  const visibleStatementRows = useMemo(() => {
    const option = DURATION_OPTIONS.find((entry) => entry.id === durationCycle);
    let cutoff = null;
    if (option && option.months) {
      cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - option.months);
    }

    return statementRows.filter((row) => {
      if (statementTab === 'progress' && !(row.type === 'debit' && row.stage !== STAGE_PAID)) return false;
      if (statementTab === 'completed' && !(row.type === 'debit' && row.stage === STAGE_PAID)) return false;
      if (cutoff) {
        const date = toLocalDate(row.date);
        if (!date || date < cutoff) return false;
      }
      return true;
    });
  }, [statementRows, statementTab, durationCycle]);

  /* ── Month-wise pool ──────────────────────────────────── */
  // The same commission pool, cut by the month the claim was earned in, then
  // by architect, then by the lead that produced it.
  const monthlyPool = useMemo(() => {
    const months = {};

    Object.keys(accountIndex).forEach((accountId) => {
      const entry = accountIndex[accountId];
      (entry.credits || []).forEach((credit) => {
        const monthKey = monthKeyOf(credit.date);
        if (!monthKey) return;

        if (!months[monthKey]) {
          months[monthKey] = {
            monthKey,
            payout: 0,
            sheets: 0,
            claimCount: 0,
            leadIds: new Set(),
            architects: {}
          };
        }
        const month = months[monthKey];
        month.payout += credit.amount;
        month.sheets += credit.sheets;
        month.claimCount += credit.claimNos.length;
        if (credit.leadId) month.leadIds.add(credit.leadId);

        if (!month.architects[accountId]) {
          month.architects[accountId] = {
            accountId,
            name: entry.displayName || 'Unmapped Architect',
            branches: entry.branches || [],
            state: entry.state || '',
            payout: 0,
            sheets: 0,
            claimCount: 0,
            leads: {}
          };
        }
        const architect = month.architects[accountId];
        architect.payout += credit.amount;
        architect.sheets += credit.sheets;
        architect.claimCount += credit.claimNos.length;

        const leadKey = credit.leadId || 'UNMAPPED';
        if (!architect.leads[leadKey]) {
          architect.leads[leadKey] = {
            leadId: credit.leadId || '',
            siteNo: credit.siteNo,
            payout: 0,
            sheets: 0,
            claimCount: 0,
            dates: []
          };
        }
        const lead = architect.leads[leadKey];
        lead.payout += credit.amount;
        lead.sheets += credit.sheets;
        lead.claimCount += credit.claimNos.length;
        lead.dates.push(credit.date);
      });
    });

    return Object.values(months)
      .map((month) => ({
        monthKey: month.monthKey,
        payout: month.payout,
        sheets: month.sheets,
        claimCount: month.claimCount,
        leadCount: month.leadIds.size,
        architects: Object.values(month.architects)
          .map((architect) => ({
            ...architect,
            leadCount: Object.keys(architect.leads).length,
            leads: Object.values(architect.leads)
              .map((lead) => ({ ...lead, dates: lead.dates.sort() }))
              .sort((a, b) => b.payout - a.payout)
          }))
          .sort((a, b) => b.payout - a.payout || a.name.localeCompare(b.name))
      }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [accountIndex]);

  // Every quarter of every financial year the months touch, so an empty
  // quarter can still be picked and read as a real zero.
  // Only the quarters the data actually falls in, so financial years with
  // nothing in them never reach the dropdown.
  const quarterOptions = useMemo(() => {
    const keys = new Set();
    monthlyPool.forEach((month) => {
      if (!month.payout) return;
      const quarter = quarterOfMonthKey(month.monthKey);
      if (quarter) keys.add(quarter.key);
    });
    return Array.from(keys).sort().reverse();
  }, [monthlyPool]);

  // One selection drives the view: everything, a single month, or a quarter.
  const activeMonth = useMemo(() => {
    if (periodType === 'all') {
      if (monthlyPool.length === 0) return null;
      return {
        monthKey: '',
        label: 'All Data',
        isQuarter: false,
        isAll: true,
        ...aggregatePeriod(monthlyPool)
      };
    }

    if (periodType === 'quarter') {
      const quarterKey = poolQuarter || quarterOptions[0] || '';
      if (!quarterKey) return null;
      const wanted = monthKeysOfQuarter(quarterKey);
      const months = monthlyPool.filter((month) => wanted.includes(month.monthKey));
      return {
        monthKey: quarterKey,
        label: quarterLabelOf(quarterKey),
        isQuarter: true,
        isAll: false,
        ...aggregatePeriod(months)
      };
    }

    const key = poolMonth || monthlyPool[0]?.monthKey || '';
    if (!key) return null;
    const found = monthlyPool.find((month) => month.monthKey === key);
    return {
      monthKey: key,
      label: monthLabelOf(key),
      isQuarter: false,
      isAll: false,
      payout: found?.payout || 0,
      sheets: found?.sheets || 0,
      claimCount: found?.claimCount || 0,
      leadCount: found?.leadCount || 0,
      architects: found?.architects || []
    };
  }, [monthlyPool, poolMonth, poolQuarter, periodType, quarterOptions]);

  const monthArchitects = useMemo(() => {
    if (!activeMonth) return [];
    const needle = monthSearch.trim().toLowerCase();
    if (!needle) return activeMonth.architects;
    return activeMonth.architects.filter((architect) => [
      architect.name,
      architect.accountId,
      ...architect.leads.map((lead) => lead.leadId)
    ].join(' ').toLowerCase().includes(needle));
  }, [activeMonth, monthSearch]);

  const handleMonthExport = () => {
    if (!activeMonth || monthArchitects.length === 0) return;

    const monthName = activeMonth.label;

    const architectRows = monthArchitects.map((architect) => ({
      'Period': monthName,
      'Architect': architect.name,
      'Account Identity': architect.accountId,
      'Branch': (architect.branches || []).join(', '),
      'Leads': architect.leadCount,
      'Claims': architect.claimCount,
      'Sheets': architect.sheets,
      'Payout (INR)': architect.payout,
      'Share of Month (%)': activeMonth.payout
        ? Number(((architect.payout / activeMonth.payout) * 100).toFixed(2))
        : 0
    }));

    const leadRows = [];
    monthArchitects.forEach((architect) => {
      architect.leads.forEach((lead) => {
        leadRows.push({
          'Period': monthName,
          'Architect': architect.name,
          'Account Identity': architect.accountId,
          'Site': lead.siteNo ? `Site ${lead.siteNo}` : '',
          'Lead ID': lead.leadId,
          'Claims': lead.claimCount,
          'Sheets': lead.sheets,
          'Payout (INR)': lead.payout,
          'Claim Dates': lead.dates.map((date) => formatDate(date)).join(', ')
        });
      });
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(architectRows), 'Architect Wise');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(leadRows), 'Lead Wise');
    XLSX.writeFile(workbook, `Pool_${activeMonth.monthKey || 'All_Data'}_Architect_Lead_Wise.xlsx`);
  };

  const handleStatementExport = () => {
    if (!selectedArchitect || visibleStatementRows.length === 0) return;

    const sheetRows = visibleStatementRows.map((row) => ({
      'Date': formatLongDate(row.date),
      'Type': row.type === 'credit' ? 'Commission Earned' : 'Withdrawal Request',
      'Source / Entity': row.type === 'credit'
        ? `Lead ID: ${row.leadId} (Site ${row.siteNo || '-'})`
        : (row.stage === STAGE_PAID ? 'Paid' : 'Under Process'),
      'Lead ID': row.type === 'credit' ? row.leadId : '',
      'Site': row.type === 'credit' ? (row.siteNo || '') : '',
      'Sheets': row.type === 'credit' ? row.sheets : '',
      'Credit (INR)': row.type === 'credit' ? row.amount : '',
      'Debit (INR)': row.type === 'debit' ? row.amount : '',
      'Request No': row.type === 'debit' ? row.requestId : '',
      'Payment Done On': row.type === 'debit' ? formatDate(row.paidDate) : '',
      'UTR': row.type === 'debit' ? row.utr : ''
    }));

    const leadRows = (accountIndex[selectedArchitect.accountId]?.leadSummary || []).map((lead) => ({
      'Lead ID': lead.leadId,
      'Site': `Site ${lead.siteNo}`,
      'Claims': lead.claimCount,
      'Sheets': lead.sheets,
      'Pool Share (INR)': lead.earned,
      'Share of Pool (%)': selectedArchitect.earned
        ? Number(((lead.earned / selectedArchitect.earned) * 100).toFixed(2))
        : 0,
      'First Claim': formatDate(lead.firstDate),
      'Last Claim': formatDate(lead.lastDate)
    }));

    const summaryRows = [{
      'Architect': selectedArchitect.name,
      'Account Identity': selectedArchitect.accountId,
      'Mobile': selectedArchitect.mobile,
      'Commission Pool (INR)': selectedArchitect.earned,
      'Payable Pool (INR)': selectedArchitect.poolAllowed,
      'Paid Out (INR)': selectedArchitect.paidOut,
      'Under Process (INR)': selectedArchitect.underProcess,
      'Balance Due (INR)': selectedArchitect.balanceDue,
      'Eligibility': selectedArchitect.isEligible ? 'Eligible' : 'Ineligible',
      'Leads': selectedArchitect.leadCount,
      'Duration Cycle': DURATION_OPTIONS.find((entry) => entry.id === durationCycle)?.label || 'All Time'
    }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheetRows), 'Transactions');
    if (leadRows.length) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(leadRows), 'Lead Wise');
    }
    XLSX.writeFile(workbook, `Statement_${selectedArchitect.accountId}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // eslint-disable-next-line no-unused-vars
  const handleExport = () => {
    if (filteredRows.length === 0) return;

    const today = new Date();
    const sheetRows = filteredRows.map((row) => ({
      'Request No': row.requestId,
      'Architect': row.architectName,
      'Account Identity': row.accountId,
      'Mobile': row.mobile,
      'Lead IDs': leadsFor(row.accountId).join(', '),
      'Lead Count': leadsFor(row.accountId).length,
      'Claim Amount (INR)': row.claimedAmount,
      'Claim Raised On': formatDate(row.claimDate),
      'Claim Month': monthLabelOf(monthKeyOf(row.claimDate)),
      'Stage': row.stage,
      'Payment Initiated On': formatDate(row.initiatedDate),
      'Payment Done On': formatDate(row.paidDate),
      'Payment Month': monthLabelOf(monthKeyOf(row.paidDate)),
      'Paid Amount (INR)': row.paidAmount,
      'Pending Amount (INR)': row.pendingAmount,
      'Pending Since (Days)': row.stage === STAGE_PAID ? '' : (daysBetween(row.claimDate, today) ?? ''),
      'Settlement Days': row.stage === STAGE_PAID ? (daysBetween(row.claimDate, row.paidDate) ?? '') : '',
      'UTR': row.utr,
      'Payment Mode': row.paymentMode,
      'Remark': row.remark
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    worksheet['!cols'] = Object.keys(sheetRows[0]).map((header) => {
      let width = header.length;
      sheetRows.forEach((row) => {
        const length = row[header] ? String(row[header]).length : 0;
        if (length > width) width = length;
      });
      return { wch: Math.min(width + 3, 60) };
    });

    const summarySheet = XLSX.utils.json_to_sheet(monthlySummary.map((bucket) => ({
      'Month': monthLabelOf(bucket.monthKey),
      'Claims Raised': bucket.claimCount,
      'Claim Amount (INR)': bucket.claimAmount,
      'Payments Made': bucket.paidCount,
      'Paid Amount (INR)': bucket.paidAmount,
      'Still Pending (Count)': bucket.openCount,
      'Still Pending (INR)': bucket.openAmount
    })));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Month Summary');
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payment History');
    XLSX.writeFile(workbook, `Payment_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const stageTabs = [
    { id: 'All', label: 'All Records' },
    { id: STAGE_PAID, label: 'Paid' },
    { id: STAGE_PROCESS, label: 'In Process' },
    { id: STAGE_QUEUE, label: 'In Queue' },
    { id: 'Pending', label: 'All Pending' }
  ];

  const ageingTone = (days) => {
    if (days === null || days === undefined) return 'age-flat';
    if (days <= 7) return 'age-fresh';
    if (days <= 30) return 'age-warm';
    return 'age-hot';
  };

  return (
    <div className="ph-wrapper">
      <style>{`
        .ph-wrapper {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto 2.5rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #4a311d;
        }
        .ph-card {
          background: #ffffff;
          border: 1px solid #eaddcc;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(58, 35, 18, 0.05);
          padding: 1.6rem 1.75rem;
          margin-bottom: 1.25rem;
        }
        .ph-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 1rem;
          flex-wrap: wrap;
          padding-bottom: 1.25rem;
          border-bottom: 1px solid #f2ebd9;
          margin-bottom: 1.4rem;
        }
        .ph-head h1 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #2a1a0f;
          margin: 0 0 0.3rem;
          letter-spacing: -0.01em;
        }
        .ph-head p {
          font-size: 0.83rem;
          color: #8c7662;
          margin: 0;
        }
        .ph-head-actions { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
        .ph-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          border-radius: 8px;
          padding: 0.55rem 1rem;
          font-size: 0.8rem;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.18s ease-in-out;
          border: 1px solid #eaddcc;
          background: #fdfaf5;
          color: #5c4632;
        }
        .ph-btn:hover { background: #f5ece0; color: #2a1a0f; }
        .ph-btn.primary { background: #2a1a0f; border-color: #2a1a0f; color: #fdfaf5; }
        .ph-btn.primary:hover { background: #45301d; box-shadow: 0 6px 18px rgba(42, 26, 15, 0.18); }
        .ph-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .ph-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 0.9rem;
          margin-bottom: 0.25rem;
        }
        .kpi-tile {
          border: 1px solid #eaddcc;
          border-radius: 14px;
          padding: 1rem 1.1rem;
          background: linear-gradient(160deg, #ffffff 0%, #fdfaf5 100%);
          position: relative;
          overflow: hidden;
        }
        .kpi-tile::after {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: #d8c5a5;
        }
        .kpi-tile.tone-claim::after { background: #8a683e; }
        .kpi-tile.tone-paid::after { background: #1a7a44; }
        .kpi-tile.tone-process::after { background: #b8860b; }
        .kpi-tile.tone-queue::after { background: #1558b0; }
        .kpi-tile.tone-age::after { background: #b82020; }
        .kpi-head {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: #a68b72;
          margin-bottom: 0.5rem;
        }
        .kpi-value { font-size: 1.4rem; font-weight: 800; color: #2a1a0f; line-height: 1.1; }
        .kpi-sub { font-size: 0.72rem; color: #8c7662; margin-top: 0.3rem; }

        .ph-section-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.95rem;
          font-weight: 700;
          color: #2a1a0f;
          margin-bottom: 0.25rem;
        }
        .ph-section-note { font-size: 0.76rem; color: #a68b72; margin-bottom: 1rem; }

        .ph-table-scroll { overflow-x: auto; width: 100%; }
        table.ph-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; text-align: left; }
        .ph-table th {
          padding: 0.65rem 0.85rem;
          font-size: 0.68rem;
          font-weight: 700;
          color: #b8956c;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border-bottom: 2px solid #f2ebd9;
          white-space: nowrap;
        }
        .ph-table td {
          padding: 0.85rem;
          border-bottom: 1px solid #faf7f2;
          color: #4a311d;
          vertical-align: middle;
        }
        .ph-table tbody tr:hover td { background: #fdfbf7; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .strong { font-weight: 700; color: #2a1a0f; }

        .month-row { cursor: pointer; }
        .month-row.selected td { background: #fbf4e8; }
        .month-name { font-weight: 700; color: #2a1a0f; }

        .ph-filters {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          padding-bottom: 1rem;
          margin-bottom: 1rem;
          border-bottom: 1px solid #f2ebd9;
        }
        .tab-group { display: flex; gap: 0.3rem; background: #fbf7f0; padding: 0.25rem; border-radius: 9px; border: 1px solid #f2ebd9; }
        .tab-btn {
          border: none;
          background: none;
          padding: 0.45rem 0.9rem;
          font-size: 0.78rem;
          font-weight: 700;
          font-family: inherit;
          color: #8c7662;
          border-radius: 7px;
          cursor: pointer;
          transition: all 0.18s ease-in-out;
          white-space: nowrap;
        }
        .tab-btn:hover { color: #2a1a0f; }
        .tab-btn.active { background: #8a683e; color: #ffffff; }
        .search-shell {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          border: 1px solid #eaddcc;
          background: #fdfaf5;
          border-radius: 8px;
          padding: 0.42rem 0.7rem;
          min-width: 250px;
          flex: 1 1 250px;
        }
        .search-shell input {
          border: none;
          outline: none;
          background: transparent;
          font-family: inherit;
          font-size: 0.82rem;
          color: #2a1a0f;
          width: 100%;
        }
        .select-shell {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          border: 1px solid #eaddcc;
          background: #fdfaf5;
          border-radius: 8px;
          padding: 0.35rem 0.6rem;
        }
        .select-shell select {
          border: none;
          background: transparent;
          outline: none;
          font-family: inherit;
          font-size: 0.8rem;
          font-weight: 600;
          color: #2a1a0f;
          cursor: pointer;
        }

        .chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.24rem 0.6rem;
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }
        .chip.paid { background: rgba(26, 122, 68, 0.1); color: #14663a; border: 1px solid rgba(26, 122, 68, 0.22); }
        .chip.process { background: rgba(184, 134, 11, 0.12); color: #8a6508; border: 1px solid rgba(184, 134, 11, 0.24); }
        .chip.queue { background: rgba(21, 88, 176, 0.1); color: #114980; border: 1px solid rgba(21, 88, 176, 0.22); }
        .chip.age-fresh { background: rgba(26, 122, 68, 0.08); color: #14663a; }
        .chip.age-warm { background: rgba(184, 134, 11, 0.12); color: #8a6508; }
        .chip.age-hot { background: rgba(184, 32, 32, 0.1); color: #9c1b1b; }
        .chip.age-flat { background: #f5efe6; color: #8c7662; }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.76rem;
          background: #fbf9f5;
          border: 1px solid #eaddcc;
          color: #5c4632;
          padding: 0.18rem 0.45rem;
          border-radius: 6px;
        }
        .arch-cell { display: flex; flex-direction: column; gap: 0.22rem; }
        .arch-name { font-weight: 700; color: #2a1a0f; }
        .arch-meta { font-size: 0.72rem; color: #a68b72; }
        .row-toggle {
          border: 1px solid #eaddcc;
          background: #fdfaf5;
          border-radius: 6px;
          width: 24px; height: 24px;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; color: #8a683e;
        }
        .row-toggle:hover { background: #f2e6d5; }

        .detail-cell { background: #fdfbf7 !important; padding: 1.1rem 1.4rem !important; }
        .detail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 1rem 1.6rem;
        }
        .detail-label {
          font-size: 0.66rem;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          font-weight: 700;
          color: #a68b72;
          margin-bottom: 0.3rem;
        }
        .detail-value { font-size: 0.83rem; color: #4a311d; font-weight: 600; line-height: 1.7; }
        .lead-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.2rem; }
        .lead-chip {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.72rem;
          background: #ffffff;
          border: 1px solid #eaddcc;
          color: #5c4632;
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
        }
        .timeline { display: flex; flex-direction: column; gap: 0.55rem; }
        .timeline-step { display: flex; align-items: flex-start; gap: 0.6rem; }
        .timeline-dot {
          width: 9px; height: 9px; border-radius: 50%;
          margin-top: 0.35rem; flex-shrink: 0;
          background: #d8c5a5;
        }
        .timeline-step.done .timeline-dot { background: #1a7a44; }
        .timeline-step.active .timeline-dot { background: #b8860b; }
        .timeline-title { font-size: 0.78rem; font-weight: 700; color: #2a1a0f; }
        .timeline-date { font-size: 0.72rem; color: #8c7662; }

        .ph-pager {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
          padding-top: 1rem;
          margin-top: 0.4rem;
          border-top: 1px solid #f2ebd9;
          font-size: 0.78rem;
          color: #8c7662;
        }
        .pager-controls { display: flex; align-items: center; gap: 0.5rem; }
        .ph-state {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          padding: 3rem 1rem;
          color: #8c7662;
          font-size: 0.85rem;
        }
        .ph-error {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          background: rgba(184, 32, 32, 0.07);
          border: 1px solid rgba(184, 32, 32, 0.2);
          color: #9c1b1b;
          border-radius: 10px;
          padding: 0.75rem 1rem;
          font-size: 0.82rem;
          margin-bottom: 1rem;
        }
        /* ── Architect statement ── */
        .view-switch { display: flex; gap: 0.3rem; background: #fbf7f0; padding: 0.25rem; border-radius: 9px; border: 1px solid #f2ebd9; }
        .stmt-shell { display: grid; grid-template-columns: 300px 1fr; gap: 1.5rem; align-items: start; }
        @media (max-width: 900px) { .stmt-shell { grid-template-columns: 1fr; } }
        .stmt-side { border-right: 1px solid #f2ebd9; padding-right: 1.25rem; }
        @media (max-width: 900px) { .stmt-side { border-right: none; padding-right: 0; border-bottom: 1px solid #f2ebd9; padding-bottom: 1rem; } }
        .stmt-side-title {
          font-size: 0.66rem; font-weight: 700; letter-spacing: 0.07em;
          text-transform: uppercase; color: #a68b72; margin-bottom: 0.55rem;
        }
        .pool-banner {
          border: 1px solid #eaddcc; border-radius: 12px;
          background: linear-gradient(160deg, #ffffff 0%, #fdf7ec 100%);
          padding: 0.8rem 0.9rem; margin-bottom: 0.85rem;
        }
        .pool-banner-value { font-size: 1.25rem; font-weight: 800; color: #2a1a0f; }
        .pool-banner-sub { font-size: 0.7rem; color: #8c7662; margin-top: 0.25rem; line-height: 1.6; }
        .stmt-list { margin-top: 0.75rem; max-height: 520px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.3rem; }
        .stmt-list-item {
          display: flex; flex-direction: column; gap: 0.15rem;
          width: 100%; text-align: left; font-family: inherit;
          border: 1px solid transparent; background: none;
          border-radius: 9px; padding: 0.55rem 0.7rem; cursor: pointer;
          transition: all 0.15s ease-in-out;
        }
        .stmt-list-item:hover { background: #fbf7f0; }
        .stmt-list-item.active { background: #fbf4e8; border-color: #eaddcc; }
        .stmt-list-name { font-size: 0.82rem; font-weight: 700; color: #2a1a0f; }
        .stmt-list-meta { font-size: 0.7rem; color: #a68b72; }
        .stmt-list-amt { font-size: 0.76rem; font-weight: 700; color: #14663a; }
        .stmt-main { min-width: 0; }
        .stmt-head {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 1rem; flex-wrap: wrap; margin-bottom: 1.1rem;
        }
        .stmt-head h2 { font-size: 1.15rem; font-weight: 700; color: #2a1a0f; margin: 0 0 0.2rem; }
        .stmt-head p { font-size: 0.76rem; color: #8c7662; margin: 0; }
        .stmt-tiles {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.75rem; margin-bottom: 1.25rem;
        }
        .stmt-tile { border: 1px solid #eaddcc; border-radius: 12px; padding: 0.8rem 0.9rem; background: #fdfaf5; }
        .stmt-tile-label {
          font-size: 0.63rem; font-weight: 700; letter-spacing: 0.07em;
          text-transform: uppercase; color: #a68b72; margin-bottom: 0.35rem;
        }
        .stmt-tile-value { font-size: 1.1rem; font-weight: 800; color: #2a1a0f; }
        .stmt-tile.earned .stmt-tile-value { color: #14663a; }
        .stmt-tile.process .stmt-tile-value { color: #8a6508; }
        .stmt-tile.due .stmt-tile-value { color: #b4610d; }
        .stmt-controls {
          display: flex; justify-content: space-between; align-items: center;
          gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem;
        }
        .stmt-table td { padding: 0.95rem 0.85rem; }
        .stmt-date { color: #8c7662; font-size: 0.82rem; }
        .stmt-lead { font-size: 0.85rem; font-weight: 600; color: #2a1a0f; }
        .badge-process {
          display: inline-block; padding: 0.28rem 0.6rem; border-radius: 7px;
          background: #fdf4e3; color: #a97514; border: 1px solid #f3e3c6;
          font-size: 0.73rem; font-weight: 700;
        }
        .badge-paid {
          display: inline-block; padding: 0.28rem 0.6rem; border-radius: 7px;
          background: rgba(26, 122, 68, 0.1); color: #14663a;
          border: 1px solid rgba(26, 122, 68, 0.22);
          font-size: 0.73rem; font-weight: 700;
        }
        .badge-inel {
          display: inline-block; padding: 0.2rem 0.5rem; border-radius: 6px;
          background: rgba(184, 32, 32, 0.09); color: #9c1b1b;
          border: 1px solid rgba(184, 32, 32, 0.2);
          font-size: 0.68rem; font-weight: 700; margin-left: 0.45rem;
        }
        .amt-credit { color: #178a4d; font-weight: 800; font-size: 0.95rem; }
        .amt-debit { color: #b4610d; font-weight: 800; font-size: 0.95rem; }
        .stmt-leads { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid #f2ebd9; }
        .ph-table tfoot td {
          border-top: 2px solid #f2ebd9; border-bottom: none;
          font-weight: 800; color: #2a1a0f; background: #fdfaf5;
        }
        /* ── Month wise: hero ── */
        .mw-hero {
          position: relative;
          border-radius: 18px;
          padding: 1.75rem 1.9rem;
          margin-bottom: 1.25rem;
          overflow: hidden;
          background:
            radial-gradient(ellipse 60% 120% at 88% 0%, rgba(217, 184, 119, 0.22) 0%, transparent 60%),
            linear-gradient(135deg, #2f1e11 0%, #1a1209 55%, #3a2614 100%);
          box-shadow: 0 12px 34px rgba(42, 26, 15, 0.22);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .mw-hero::before {
          content: '';
          position: absolute; inset: 0;
          border-radius: 18px;
          border: 1px solid rgba(217, 184, 119, 0.22);
          pointer-events: none;
        }
        .mw-hero-label {
          font-size: 0.66rem; font-weight: 700; letter-spacing: 0.16em;
          text-transform: uppercase; color: #d9b877; margin-bottom: 0.6rem;
        }
        .mw-hero-value {
          font-size: 2.35rem; font-weight: 800; color: #fdfaf5;
          line-height: 1; letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }
        .mw-hero-sub {
          font-size: 0.8rem; color: rgba(253, 250, 245, 0.62);
          margin-top: 0.65rem; line-height: 1.6;
        }
        .mw-hero-sub b { color: #e8c88c; font-weight: 700; }
        .mw-hero-right {
          display: flex; align-items: center; gap: 0.65rem;
          flex-wrap: wrap; position: relative; z-index: 1;
        }
        .mw-select-shell {
          display: flex; align-items: center; gap: 0.5rem;
          background: rgba(253, 250, 245, 0.09);
          border: 1px solid rgba(217, 184, 119, 0.34);
          border-radius: 10px;
          padding: 0.55rem 0.8rem;
          transition: border-color 0.18s ease-in-out, background 0.18s ease-in-out;
        }
        .mw-select-shell:hover { background: rgba(253, 250, 245, 0.14); border-color: rgba(217, 184, 119, 0.55); }
        .mw-select-shell label {
          font-size: 0.6rem; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: #d9b877; white-space: nowrap;
        }
        .mw-select-shell select {
          background: transparent; border: none; outline: none;
          font-family: inherit; font-size: 0.86rem; font-weight: 700;
          color: #fdfaf5; cursor: pointer; padding-right: 0.2rem;
        }
        .mw-select-shell select option { color: #2a1a0f; background: #ffffff; }
        .mw-download {
          display: inline-flex; align-items: center; gap: 0.45rem;
          background: #f6e7c9; color: #2a1a0f;
          border: 1px solid #e8d5ab; border-radius: 10px;
          padding: 0.6rem 1.05rem;
          font-family: inherit; font-size: 0.8rem; font-weight: 700;
          cursor: pointer; transition: all 0.18s ease-in-out;
        }
        .mw-download:hover { background: #fdf3dd; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22); }
        .mw-download:disabled { opacity: 0.4; cursor: not-allowed; }

        /* ── Month wise: stat strip ── */
        .mw-stats {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
          gap: 0.85rem; margin-bottom: 1.75rem;
        }
        .mw-stat {
          border: 1px solid #eaddcc; border-radius: 13px;
          background: #ffffff; padding: 0.95rem 1.05rem;
          display: flex; align-items: center; gap: 0.75rem;
        }
        .mw-stat-icon {
          width: 34px; height: 34px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          background: #fbf4e8; color: #8a683e; flex-shrink: 0;
        }
        .mw-stat-label {
          display: block;
          font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: #a68b72; margin-bottom: 0.18rem;
        }
        .mw-stat-value {
          display: block;
          font-size: 1.12rem; font-weight: 800; color: #2a1a0f;
          font-variant-numeric: tabular-nums; line-height: 1.1;
        }

        /* ── Month wise: table ── */
        .mw-bar-head {
          display: flex; justify-content: space-between; align-items: center;
          gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;
        }
        .mw-filters { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
        .mw-filter {
          display: flex; align-items: center; gap: 0.4rem;
          border: 1px solid #eaddcc; background: #fdfaf5;
          border-radius: 9px; padding: 0.42rem 0.7rem;
          transition: all 0.18s ease-in-out;
        }
        .mw-filter:hover { border-color: #d8c5a5; background: #fbf4e8; }
        .mw-filter.on { border-color: #c9a25a; background: #fbf4e8; box-shadow: 0 0 0 2px rgba(201, 162, 90, 0.13); }
        .mw-filter select {
          border: none; background: transparent; outline: none;
          font-family: inherit; font-size: 0.8rem; font-weight: 700;
          color: #2a1a0f; cursor: pointer;
        }
        .mw-count { font-size: 0.75rem; color: #a68b72; white-space: nowrap; }
        .mw-bar-head h3 {
          font-size: 1rem; font-weight: 700; color: #2a1a0f; margin: 0 0 0.2rem;
        }
        .mw-bar-head p { font-size: 0.75rem; color: #a68b72; margin: 0; }
        .mw-table { width: 100%; border-collapse: separate; border-spacing: 0 6px; }
        .mw-table th {
          padding: 0 1rem 0.5rem;
          font-size: 0.64rem; font-weight: 700; color: #b8956c;
          text-transform: uppercase; letter-spacing: 0.09em;
          text-align: left; white-space: nowrap;
        }
        .mw-row > td {
          background: #ffffff;
          border-top: 1px solid #f2ebd9; border-bottom: 1px solid #f2ebd9;
          padding: 0.85rem 1rem; vertical-align: middle;
          transition: background 0.15s ease-in-out;
          cursor: pointer;
        }
        .mw-row > td:first-child { border-left: 1px solid #f2ebd9; border-radius: 12px 0 0 12px; }
        .mw-row > td:last-child { border-right: 1px solid #f2ebd9; border-radius: 0 12px 12px 0; }
        .mw-row:hover > td { background: #fdfbf7; border-color: #eaddcc; }
        .mw-row.open > td { background: #fdf8ef; border-color: #e6d5b8; }
        .mw-rank {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 9px;
          background: #f7f2e9; color: #8c7662;
          font-size: 0.76rem; font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .mw-rank.top {
          background: linear-gradient(140deg, #e9cd94 0%, #cfa855 100%);
          color: #3a2614; box-shadow: 0 2px 8px rgba(154, 120, 8, 0.25);
        }
        .mw-arch-name { font-size: 0.88rem; font-weight: 700; color: #2a1a0f; }
        .mw-arch-meta { font-size: 0.71rem; color: #a68b72; margin-top: 0.15rem; }
        .mw-amount {
          font-size: 0.95rem; font-weight: 800; color: #14663a;
          font-variant-numeric: tabular-nums;
        }
        .mw-share-wrap { display: flex; flex-direction: column; gap: 0.3rem; align-items: flex-end; min-width: 92px; }
        .mw-share-pct { font-size: 0.76rem; font-weight: 700; color: #5c4632; font-variant-numeric: tabular-nums; }
        .mw-share-track { display: block; width: 100%; height: 5px; border-radius: 3px; background: #f2e6d5; overflow: hidden; }
        .mw-share-fill { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #c9a25a 0%, #8a683e 100%); }
        .mw-chevron { color: #b8956c; display: inline-flex; }

        /* ── Month wise: expanded lead panel ── */
        .mw-lead-cell { padding: 0 !important; background: transparent !important; border: none !important; }
        .mw-lead-panel {
          margin: 0.1rem 0 0.75rem;
          border: 1px solid #e6d5b8; border-left: 3px solid #c9a25a;
          border-radius: 12px; background: #fdfaf3;
          padding: 1.1rem 1.25rem;
        }
        .mw-lead-title {
          font-size: 0.66rem; font-weight: 700; letter-spacing: 0.09em;
          text-transform: uppercase; color: #a68b72; margin-bottom: 0.7rem;
        }
        .mw-lead-table { width: 100%; border-collapse: collapse; font-size: 0.81rem; }
        .mw-lead-table th {
          text-align: left; padding: 0.35rem 0.7rem;
          font-size: 0.62rem; letter-spacing: 0.07em; text-transform: uppercase;
          color: #b8956c; font-weight: 700; white-space: nowrap;
        }
        .mw-lead-table td { padding: 0.55rem 0.7rem; border-top: 1px solid #f0e6d4; color: #4a311d; }
        .mw-site-chip {
          display: inline-block; padding: 0.2rem 0.55rem; border-radius: 6px;
          background: #f3e8d4; color: #6d5230; font-size: 0.7rem; font-weight: 700;
          white-space: nowrap;
        }
        .mw-foot > td {
          background: #fbf4e8; border-top: 1px solid #e6d5b8; border-bottom: 1px solid #e6d5b8;
          padding: 0.9rem 1rem; font-weight: 800; color: #2a1a0f;
        }
        .mw-foot > td:first-child { border-left: 1px solid #e6d5b8; border-radius: 12px 0 0 12px; }
        .mw-foot > td:last-child { border-right: 1px solid #e6d5b8; border-radius: 0 12px 12px 0; }
        .mw-empty { text-align: center; color: #a68b72; padding: 2.5rem 1rem; font-size: 0.85rem; }
        .share-bar {
          height: 5px; border-radius: 3px; background: #f2e6d5;
          overflow: hidden; margin-top: 0.3rem; min-width: 70px;
        }
        .share-bar span { display: block; height: 100%; background: #8a683e; }
        .spin { animation: ph-spin 1s linear infinite; }
        @keyframes ph-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* HEADER + KPI BANNER */}
      <div className="ph-card">
        <div className="ph-head">
          <div>
            <h1>Payment History</h1>
          </div>
          <div className="ph-head-actions">
            <div className="view-switch">
              <button
                className={`tab-btn ${viewMode === 'statement' ? 'active' : ''}`}
                onClick={() => setViewMode('statement')}
              >
                Architect Statement
              </button>
              <button
                className={`tab-btn ${viewMode === 'monthly' ? 'active' : ''}`}
                onClick={() => setViewMode('monthly')}
              >
                Month Wise
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="ph-error">
            <AlertCircle size={16} /> {error}
          </div>
        )}
      </div>

    

      {/* MONTH-WISE POOL, ARCHITECT AND LEAD WISE */}
      {viewMode === 'monthly' && (
      <div className="ph-card">
        {loading ? (
          <div className="ph-state"><Loader2 size={18} className="spin" /> Loading month-wise pool…</div>
        ) : !activeMonth ? (
          <div className="mw-empty">No pool activity recorded yet.</div>
        ) : (
          <>
            {/* HERO — pool of the selected month + the month filter */}
            <div className="mw-hero">
              <div>
                <div className="mw-hero-label">Commission Pool · {activeMonth.label}</div>
                <div className="mw-hero-value">{formatMoney(activeMonth.payout)}</div>
                <div className="mw-hero-sub">
                  {activeMonth.architects.length} architects earned in this period
                  {!activeMonth.isAll && poolTotals.pool ? (
                    <>
                      {' · '}<b>{((activeMonth.payout / poolTotals.pool) * 100).toFixed(1)}%</b>
                      {' of the '}{formatMoney(poolTotals.pool)}{' total pool'}
                    </>
                  ) : ''}
                </div>
              </div>

              <div className="mw-hero-right">
                <button
                  className="mw-download"
                  onClick={handleMonthExport}
                  disabled={monthArchitects.length === 0}
                >
                  <Download size={14} /> Download Excel Data
                </button>
              </div>
            </div>

            {/* STAT STRIP */}
            <div className="mw-stats">
              <div className="mw-stat">
                <span className="mw-stat-icon"><Wallet size={16} /></span>
                <span>
                  <span className="mw-stat-label">Payout</span>
                  <span className="mw-stat-value">{formatMoney(activeMonth.payout)}</span>
                </span>
              </div>
              <div className="mw-stat">
                <span className="mw-stat-icon"><Users size={16} /></span>
                <span>
                  <span className="mw-stat-label">Architects</span>
                  <span className="mw-stat-value">{activeMonth.architects.length}</span>
                </span>
              </div>
              <div className="mw-stat">
                <span className="mw-stat-icon"><MapPin size={16} /></span>
                <span>
                  <span className="mw-stat-label">Leads</span>
                  <span className="mw-stat-value">{activeMonth.leadCount}</span>
                </span>
              </div>
              <div className="mw-stat">
                <span className="mw-stat-icon"><Layers size={16} /></span>
                <span>
                  <span className="mw-stat-label">Sheets</span>
                  <span className="mw-stat-value">{activeMonth.sheets.toLocaleString('en-IN')}</span>
                </span>
              </div>
            </div>

            {/* ARCHITECT TABLE */}
            <div className="mw-bar-head">
              <div>
                <h3>Architect-wise Payout</h3>
                <p>{activeMonth.label} · open any row to see the leads that produced that payout.</p>
              </div>
              <div className="mw-filters">
                <div className="search-shell" style={{ minWidth: '240px' }}>
                  <Search size={14} color="#a68b72" />
                  <input
                    type="text"
                    placeholder="Search architect, account or lead ID"
                    value={monthSearch}
                    onChange={(e) => { setMonthSearch(e.target.value); setExpandedMonthArchitect(null); }}
                  />
                </div>

                <div className={`mw-filter ${periodType === 'month' ? 'on' : ''}`}>
                  <Calendar size={13} color="#a68b72" />
                  <select
                    value={periodType === 'month' ? activeMonth.monthKey : ''}
                    onChange={(e) => {
                      setPeriodType(e.target.value ? 'month' : 'all');
                      setPoolMonth(e.target.value);
                      setExpandedMonthArchitect(null);
                      setMonthSearch('');
                    }}
                  >
                    <option value="">All Months</option>
                    {monthOptions.map((key) => (
                      <option key={key} value={key}>{monthLabelOf(key)}</option>
                    ))}
                  </select>
                </div>

                <div className={`mw-filter ${periodType === 'quarter' ? 'on' : ''}`}>
                  <Layers size={13} color="#a68b72" />
                  <select
                    value={periodType === 'quarter' ? activeMonth.monthKey : ''}
                    onChange={(e) => {
                      setPeriodType(e.target.value ? 'quarter' : 'all');
                      setPoolQuarter(e.target.value);
                      setExpandedMonthArchitect(null);
                      setMonthSearch('');
                    }}
                  >
                    <option value="">All Quarters</option>
                    {quarterOptions.map((key) => (
                      <option key={key} value={key}>{quarterLabelOf(key)}</option>
                    ))}
                  </select>
                </div>

                <span className="mw-count">
                  {monthArchitects.length} of {activeMonth.architects.length}
                </span>
              </div>
            </div>

            <div className="ph-table-scroll">
              <table className="mw-table">
                <thead>
                  <tr>
                    <th style={{ width: '58px' }}>Rank</th>
                    <th>Architect</th>
                    <th style={{ textAlign: 'right' }}>Leads</th>
                    <th style={{ textAlign: 'right' }}>Claims</th>
                    <th style={{ textAlign: 'right' }}>Sheets</th>
                    <th style={{ textAlign: 'right' }}>Payout</th>
                    <th style={{ textAlign: 'right', width: '120px' }}>Share</th>
                    <th style={{ width: '34px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {monthArchitects.length === 0 && (
                    <tr>
                      <td className="mw-empty" colSpan={8}>
                        {activeMonth.payout
                          ? 'No architect matches that search.'
                          : 'No commission was earned in this period.'}
                      </td>
                    </tr>
                  )}

                  {monthArchitects.map((architect, position) => {
                    const isOpen = expandedMonthArchitect === architect.accountId;
                    const share = activeMonth.payout
                      ? (architect.payout / activeMonth.payout) * 100
                      : 0;
                    const toggle = () => setExpandedMonthArchitect(isOpen ? null : architect.accountId);

                    return (
                      <React.Fragment key={architect.accountId}>
                        <tr
                          className={`mw-row ${isOpen ? 'open' : ''}`}
                          onClick={toggle}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter') toggle(); }}
                        >
                          <td>
                            <span className={`mw-rank ${position < 3 ? 'top' : ''}`}>
                              {String(position + 1).padStart(2, '0')}
                            </span>
                          </td>
                          <td>
                            <div className="mw-arch-name">{architect.name}</div>
                            <div className="mw-arch-meta">
                              {architect.accountId}
                              {architect.branches.length ? ` · ${architect.branches.join(', ')}` : ''}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>{architect.leadCount}</td>
                          <td style={{ textAlign: 'right' }}>{architect.claimCount}</td>
                          <td style={{ textAlign: 'right' }}>{architect.sheets.toLocaleString('en-IN')}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="mw-amount">{formatMoney(architect.payout)}</span>
                          </td>
                          <td>
                            <div className="mw-share-wrap">
                              <span className="mw-share-pct">{share.toFixed(1)}%</span>
                              <span className="mw-share-track">
                                <span className="mw-share-fill" style={{ width: `${Math.max(3, Math.min(100, share * 5))}%` }} />
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="mw-chevron">
                              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td className="mw-lead-cell" colSpan={8}>
                              <div className="mw-lead-panel">
                                <div className="mw-lead-title">
                                  Lead-wise payout · {activeMonth.label}
                                </div>
                                <table className="mw-lead-table">
                                  <thead>
                                    <tr>
                                      <th>Site</th>
                                      <th>Lead ID</th>
                                      <th style={{ textAlign: 'right' }}>Claims</th>
                                      <th style={{ textAlign: 'right' }}>Sheets</th>
                                      <th style={{ textAlign: 'right' }}>Payout</th>
                                      <th>Claim Dates</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {architect.leads.map((lead) => (
                                      <tr key={lead.leadId || 'unmapped'}>
                                        <td>
                                          <span className="mw-site-chip">
                                            {lead.siteNo ? `Site ${lead.siteNo}` : 'Unmapped'}
                                          </span>
                                        </td>
                                        <td><span className="mono">{lead.leadId || '—'}</span></td>
                                        <td style={{ textAlign: 'right' }}>{lead.claimCount}</td>
                                        <td style={{ textAlign: 'right' }}>{lead.sheets.toLocaleString('en-IN')}</td>
                                        <td style={{ textAlign: 'right' }}>
                                          <span className="mw-amount">{formatMoney(lead.payout)}</span>
                                        </td>
                                        <td>{lead.dates.map((date) => formatDate(date)).join(', ')}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {monthArchitects.length > 0 && (
                  <tfoot>
                    <tr className="mw-foot">
                      <td colSpan={2}>Total · {activeMonth.label}</td>
                      <td style={{ textAlign: 'right' }}>
                        {monthArchitects.reduce((sum, architect) => sum + architect.leadCount, 0)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {monthArchitects.reduce((sum, architect) => sum + architect.claimCount, 0)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {monthArchitects.reduce((sum, architect) => sum + architect.sheets, 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{ textAlign: 'right', color: '#14663a' }}>
                        {formatMoney(monthArchitects.reduce((sum, architect) => sum + architect.payout, 0))}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
      )}

      {/* PER-ARCHITECT STATEMENT */}
      {viewMode === 'statement' && (
      <div className="ph-card">
        {loading ? (
          <div className="ph-state"><Loader2 size={18} className="spin" /> Loading architect statements…</div>
        ) : (
          <div className="stmt-shell">
            {/* ARCHITECT DIRECTORY */}
            <aside className="stmt-side">
              <div className="stmt-side-title">Commission Pool</div>
              <div className="pool-banner">
                <div className="pool-banner-value">{formatMoney(poolTotals.pool)}</div>
                <div className="pool-banner-sub">
                  across {architectDirectory.length} architects<br />
                  Paid {formatMoney(poolTotals.paid)} · Balance due {formatMoney(poolTotals.due)}
                </div>
              </div>

              <div className="search-shell">
                <Search size={14} color="#a68b72" />
                <input
                  type="text"
                  placeholder="Name, account or lead ID"
                  value={architectSearch}
                  onChange={(e) => setArchitectSearch(e.target.value)}
                />
              </div>

              <div className="stmt-list">
                {visibleArchitects.length === 0 && (
                  <div style={{ fontSize: '0.78rem', color: '#a68b72', padding: '0.75rem 0.2rem' }}>
                    No architect matches that search.
                  </div>
                )}
                {visibleArchitects.map((entry) => {
                  const share = poolTotals.pool ? (entry.earned / poolTotals.pool) * 100 : 0;
                  return (
                    <button
                      key={entry.accountId}
                      className={`stmt-list-item ${selectedAccount === entry.accountId ? 'active' : ''}`}
                      onClick={() => { setSelectedAccount(entry.accountId); setStatementTab('history'); }}
                    >
                      <span className="stmt-list-name">{entry.name}</span>
                      <span className="stmt-list-meta">
                        {entry.accountId} · {entry.leadCount} lead{entry.leadCount === 1 ? '' : 's'}
                        {entry.underProcess ? ' · request open' : ''}
                      </span>
                      <span className="stmt-list-amt">
                        {formatMoney(entry.earned)} · {share.toFixed(1)}% of pool
                      </span>
                      <span className="share-bar"><span style={{ width: `${Math.min(100, share)}%` }} /></span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* STATEMENT */}
            <section className="stmt-main">
              {!selectedArchitect ? (
                <div className="ph-state">Select an architect on the left to open their statement.</div>
              ) : (
                <>
                  <div className="stmt-head">
                    <div>
                      <h2>
                        {selectedArchitect.name}
                        {!selectedArchitect.isEligible && <span className="badge-inel">Ineligible</span>}
                      </h2>
                      <p>
                        Account {selectedArchitect.accountId}
                        {selectedArchitect.mobile ? ` · ${selectedArchitect.mobile}` : ''}
                        {selectedArchitect.branches.length ? ` · ${selectedArchitect.branches.join(', ')}` : ''}
                        {poolTotals.pool
                          ? ` · ${((selectedArchitect.earned / poolTotals.pool) * 100).toFixed(2)}% of the total pool`
                          : ''}
                      </p>
                    </div>
                    <button
                      className="ph-btn primary"
                      onClick={handleStatementExport}
                      disabled={visibleStatementRows.length === 0}
                    >
                      <Download size={14} /> Download Statement
                    </button>
                  </div>

                  <div className="stmt-tiles">
                    <div className="stmt-tile earned">
                      <div className="stmt-tile-label">Pool Payout</div>
                      <div className="stmt-tile-value">{formatMoney(selectedArchitect.earned)}</div>
                    </div>
                    <div className="stmt-tile">
                      <div className="stmt-tile-label">Paid Out</div>
                      <div className="stmt-tile-value">{formatMoney(selectedArchitect.paidOut)}</div>
                    </div>
                    <div className="stmt-tile process">
                      <div className="stmt-tile-label">Under Process</div>
                      <div className="stmt-tile-value">{formatMoney(selectedArchitect.underProcess)}</div>
                    </div>
                    <div className="stmt-tile due">
                      <div className="stmt-tile-label">Balance Due</div>
                      <div className="stmt-tile-value">{formatMoney(selectedArchitect.balanceDue)}</div>
                    </div>
                  </div>

                  <div className="stmt-controls">
                    <div className="tab-group">
                      <button
                        className={`tab-btn ${statementTab === 'history' ? 'active' : ''}`}
                        onClick={() => setStatementTab('history')}
                      >
                        Transaction History
                      </button>
                      <button
                        className={`tab-btn ${statementTab === 'progress' ? 'active' : ''}`}
                        onClick={() => setStatementTab('progress')}
                      >
                        Transaction In Progress
                      </button>
                      <button
                        className={`tab-btn ${statementTab === 'completed' ? 'active' : ''}`}
                        onClick={() => setStatementTab('completed')}
                      >
                        Transaction Completed
                      </button>
                    </div>

                    <div className="select-shell">
                      <Calendar size={14} color="#a68b72" />
                      <select value={durationCycle} onChange={(e) => setDurationCycle(e.target.value)}>
                        {DURATION_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="ph-table-scroll">
                    <table className="ph-table stmt-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Source / Entity</th>
                          <th className="num">Transaction Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleStatementRows.length === 0 && (
                          <tr>
                            <td colSpan={3} style={{ textAlign: 'center', color: '#a68b72', padding: '1.75rem' }}>
                              No transaction in this period.
                            </td>
                          </tr>
                        )}
                        {visibleStatementRows.map((row) => (
                          <tr key={row.key}>
                            <td className="stmt-date">{formatLongDate(row.date)}</td>
                            <td>
                              {row.type === 'credit' ? (
                                <span className="stmt-lead">
                                  Lead ID: {row.leadId || 'Unmapped'}{row.siteNo ? ` (Site ${row.siteNo})` : ''}
                                </span>
                              ) : row.stage === STAGE_PAID ? (
                                <span className="badge-paid">
                                  Paid on {formatDate(row.paidDate)}{row.utr ? ` · UTR ${row.utr}` : ''}
                                </span>
                              ) : (
                                <span className="badge-process">Under Process</span>
                              )}
                            </td>
                            <td className={`num ${row.type === 'credit' ? 'amt-credit' : 'amt-debit'}`}>
                              {row.type === 'credit' ? '+' : ''}{formatMoney(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* LEAD-WISE SPLIT OF THE POOL PAYOUT */}
                  <div className="stmt-leads">
                    <div className="ph-section-title">Pool Payout, Lead by Lead</div>
                    <div className="ph-section-note">
                      The architect's whole pool payout, split across the leads that produced it. The total below is the same figure shown on Architect Accounts.
                    </div>
                    <div className="ph-table-scroll">
                      <table className="ph-table">
                        <thead>
                          <tr>
                            <th>Site</th>
                            <th>Lead ID</th>
                            <th className="num">Claims</th>
                            <th className="num">Sheets</th>
                            <th className="num">Pool Payout</th>
                            <th className="num">Share</th>
                            <th>First Claim</th>
                            <th>Last Claim</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(accountIndex[selectedArchitect.accountId]?.leadSummary || []).length === 0 && (
                            <tr>
                              <td colSpan={8} style={{ textAlign: 'center', color: '#a68b72', padding: '1.25rem' }}>
                                No lead mapped in the commission ledger.
                              </td>
                            </tr>
                          )}
                          {(accountIndex[selectedArchitect.accountId]?.leadSummary || []).map((lead) => {
                            const share = selectedArchitect.earned
                              ? (lead.earned / selectedArchitect.earned) * 100
                              : 0;
                            return (
                              <tr key={lead.leadId}>
                                <td className="strong">Site {lead.siteNo}</td>
                                <td><span className="mono">{lead.leadId}</span></td>
                                <td className="num">{lead.claimCount}</td>
                                <td className="num">{lead.sheets.toLocaleString('en-IN')}</td>
                                <td className="num strong" style={{ color: '#14663a' }}>{formatMoney(lead.earned)}</td>
                                <td className="num">{share.toFixed(1)}%</td>
                                <td>{formatDate(lead.firstDate)}</td>
                                <td>{formatDate(lead.lastDate)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3}>Total pool payout</td>
                            <td className="num">
                              {(accountIndex[selectedArchitect.accountId]?.sheets ?? 0).toLocaleString('en-IN')}
                            </td>
                            <td className="num" style={{ color: '#14663a' }}>{formatMoney(selectedArchitect.earned)}</td>
                            <td className="num">100%</td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
      )}

      {/* DETAIL LEDGER */}
      {viewMode === 'ledger' && (
      <div className="ph-card">
        <div className="ph-filters">
          <div className="tab-group">
            {stageTabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-btn ${stageFilter === tab.id ? 'active' : ''}`}
                onClick={() => setStageFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="search-shell">
            <Search size={14} color="#a68b72" />
            <input
              type="text"
              placeholder="Search architect, account, mobile, UTR or lead ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="select-shell">
            <Calendar size={14} color="#a68b72" />
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
              <option value="">All months</option>
              {monthOptions.map((key) => (
                <option key={key} value={key}>{monthLabelOf(key)}</option>
              ))}
            </select>
          </div>

          <div className="select-shell">
            <select value={dateBasis} onChange={(e) => setDateBasis(e.target.value)}>
              <option value="claim">by Claim date</option>
              <option value="payment">by Payment date</option>
            </select>
          </div>

          <button className="ph-btn" onClick={resetFilters}>Reset</button>
        </div>

        {loading ? (
          <div className="ph-state"><Loader2 size={18} className="spin" /> Loading settlement records…</div>
        ) : filteredRows.length === 0 ? (
          <div className="ph-state">No records match the selected filters.</div>
        ) : (
          <>
            <div className="ph-table-scroll">
              <table className="ph-table">
                <thead>
                  <tr>
                    <th style={{ width: '34px' }}></th>
                    <th>Request</th>
                    <th>Architect</th>
                    <th className="num">Claim Amount</th>
                    <th>Claim Date</th>
                    <th>Stage</th>
                    <th>Payment Date</th>
                    <th>UTR</th>
                    <th className="num">Pending</th>
                    <th>Ageing</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const isOpen = expandedKey === row.key;
                    const leads = leadsFor(row.accountId);
                    const pendingDays = row.stage === STAGE_PAID ? null : daysBetween(row.claimDate, new Date());
                    const settlementDays = row.stage === STAGE_PAID ? daysBetween(row.claimDate, row.paidDate) : null;
                    const stageClass = row.stage === STAGE_PAID
                      ? 'paid'
                      : row.stage === STAGE_PROCESS ? 'process' : 'queue';

                    return (
                      <React.Fragment key={row.key}>
                        <tr>
                          <td>
                            <span
                              className="row-toggle"
                              role="button"
                              tabIndex={0}
                              onClick={() => setExpandedKey(isOpen ? null : row.key)}
                              onKeyDown={(e) => { if (e.key === 'Enter') setExpandedKey(isOpen ? null : row.key); }}
                            >
                              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                          </td>
                          <td><span className="mono">#{row.requestId}</span></td>
                          <td>
                            <div className="arch-cell">
                              <span className="arch-name">{row.architectName}</span>
                              <span className="arch-meta">
                                {row.accountId || '—'}{row.mobile ? ` · ${row.mobile}` : ''}
                                {leads.length ? ` · ${leads.length} lead${leads.length > 1 ? 's' : ''}` : ''}
                              </span>
                            </div>
                          </td>
                          <td className="num strong">{formatMoney(row.claimedAmount)}</td>
                          <td>{formatDate(row.claimDate)}</td>
                          <td><span className={`chip ${stageClass}`}>{row.stage}</span></td>
                          <td>
                            {row.stage === STAGE_PAID
                              ? formatDate(row.paidDate)
                              : row.initiatedDate
                                ? <span style={{ color: '#8a6508' }}>Sent {formatDate(row.initiatedDate)}</span>
                                : '—'}
                          </td>
                          <td>{row.utr ? <span className="mono">{row.utr}</span> : '—'}</td>
                          <td className="num strong" style={{ color: row.pendingAmount ? '#9c1b1b' : '#a68b72' }}>
                            {row.pendingAmount ? formatMoney(row.pendingAmount) : '—'}
                          </td>
                          <td>
                            {row.stage === STAGE_PAID
                              ? <span className="chip age-fresh">Settled in {settlementDays ?? 0}d</span>
                              : <span className={`chip ${ageingTone(pendingDays)}`}>{pendingDays ?? 0} days open</span>}
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td className="detail-cell" colSpan={10}>
                              <div className="detail-grid">
                                <div>
                                  <div className="detail-label">Settlement Timeline</div>
                                  <div className="timeline">
                                    <div className="timeline-step done">
                                      <span className="timeline-dot" />
                                      <div>
                                        <div className="timeline-title">Claim raised by architect</div>
                                        <div className="timeline-date">{formatDate(row.claimDate)}</div>
                                      </div>
                                    </div>
                                    <div className={`timeline-step ${row.initiatedDate ? (row.stage === STAGE_PAID ? 'done' : 'active') : ''}`}>
                                      <span className="timeline-dot" />
                                      <div>
                                        <div className="timeline-title">Sent to finance for release</div>
                                        <div className="timeline-date">
                                          {row.initiatedDate ? formatDate(row.initiatedDate) : 'Not generated yet'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className={`timeline-step ${row.stage === STAGE_PAID ? 'done' : ''}`}>
                                      <span className="timeline-dot" />
                                      <div>
                                        <div className="timeline-title">Payment credited</div>
                                        <div className="timeline-date">
                                          {row.stage === STAGE_PAID ? formatDate(row.paidDate) : 'Pending'}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <div className="detail-label">Bank Details</div>
                                  <div className="detail-value">Account · {row.accountNumber || '—'}</div>
                                  <div className="detail-value">Mode · {row.paymentMode || '—'}</div>
                                  <div className="detail-value">UTR · {row.utr || 'Not received'}</div>
                                  <div className="detail-value">Remark · {row.remark || '—'}</div>
                                </div>

                                <div>
                                  <div className="detail-label">Amounts</div>
                                  <div className="detail-value">Claimed · {formatMoney(row.claimedAmount)}</div>
                                  <div className="detail-value">Paid · {formatMoney(row.paidAmount)}</div>
                                  <div className="detail-value">Pending · {formatMoney(row.pendingAmount)}</div>
                                  <div className="detail-value">Request state · {row.requestStatus || '—'}</div>
                                </div>

                                <div>
                                  <div className="detail-label">Ledger Context</div>
                                  <div className="detail-value">
                                    Claims in ledger · {accountIndex[row.accountId]?.claimCount ?? 0}
                                  </div>
                                  <div className="detail-value">
                                    Eligible sheets · {(accountIndex[row.accountId]?.sheets ?? 0).toLocaleString('en-IN')}
                                  </div>
                                  <div className="detail-value">
                                    Commission earned · {formatMoney(accountIndex[row.accountId]?.earned ?? 0)}
                                  </div>
                                  <div className="detail-value">
                                    Branch · {(accountIndex[row.accountId]?.branches || []).join(', ') || '—'}
                                  </div>
                                </div>

                                <div style={{ gridColumn: '1 / -1' }}>
                                  <div className="detail-label">Lead IDs mapped to this architect</div>
                                  {leads.length === 0 ? (
                                    <div className="detail-value">No lead reference found in the commission ledger.</div>
                                  ) : (
                                    <div className="lead-chips">
                                      {leads.map((leadId) => (
                                        <span className="lead-chip" key={leadId}>{leadId}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="ph-pager">
              <span>
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} records
              </span>
              <div className="pager-controls">
                <button className="ph-btn" disabled={safePage <= 1} onClick={() => setCurrentPage(safePage - 1)}>Previous</button>
                <span style={{ fontWeight: 700, color: '#2a1a0f' }}>Page {safePage} of {totalPages}</span>
                <button className="ph-btn" disabled={safePage >= totalPages} onClick={() => setCurrentPage(safePage + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
