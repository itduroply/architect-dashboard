import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supbase';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  CheckCircle, 
  XCircle,
  Layers, 
  Coins, 
  Download, 
  RefreshCw, 
  Award, 
  FileSpreadsheet
} from 'lucide-react';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [architectsList, setArchitectsList] = useState([]);
  const [categoryBusinessData, setCategoryBusinessData] = useState([]);
  const [skuBusinessData, setSkuBusinessData] = useState([]);
  const [allSkuExcelData, setAllSkuExcelData] = useState([]); 
  const [skuLimit, setSkuLimit] = useState(6);

  const [kpi, setKpi] = useState({
    totalArchitects: 0,
    eligibleCount: 0,
    ineligibleCount: 0,
    totalBusiness: 0,
    totalCommission: 0,
    avgBusinessPerArchitect: 0
  });

  const syncDashboardMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const { data: ledger, error } = await supabase
        .from('commission_ledger')
        .select('*');

      if (error) throw error;

      const dataRows = ledger || [];
      const aggregationMap = {};
      
      const categoryPayoutMap = { PW: 0, BB: 0, FD: 0, Decorative: 0 };
      const skuPayoutMap = {};
      const skuSheetsMap = {}; 
      const skuPayoutSumMap = {}; 
      
      // Pass 1: Parse name fields, isolate the Architect ID prefix, and group arrays
      dataRows.forEach((row) => {
        if (!row) return;

        const rawNameField = String(row.architect_name || row.architectName || '').trim();
        
        let extractedId = '';
        let extractedName = 'Unmapped Architect';
        
        // Safely extract the target numeric ID prefix
        if (rawNameField.includes('|')) {
          const parts = rawNameField.split('|');
          extractedId = parts[0].trim();
          extractedName = parts[1].trim();
        } else {
          const idMatch = rawNameField.match(/^(\d+)/);
          if (idMatch) {
            extractedId = idMatch[1];
            extractedName = rawNameField.replace(extractedId, '').replace(/^[\s\-_|]+/, '').trim() || rawNameField;
          } else {
            extractedName = rawNameField || 'Unmapped Architect';
          }
        }

        // Group rows using the extracted Architect ID
        const uniqueKey = extractedId ? `id_${extractedId}` : `name_${extractedName}`;
        
        const sheets = parseFloat(row.total_eligible_sheets || row.totalSheets || row.sheets || 0);
        const payout = parseFloat(row.total_payout_amount || row.payoutAmount || row.amount || 0);
        const isRowIneligible = String(row.status || row.eligibilityStatus || '').toLowerCase() === 'ineligible';
        const rawProductSku = String(row.product_sku || row.product_code || row.item_code || '').trim();

        if (!aggregationMap[uniqueKey]) {
          aggregationMap[uniqueKey] = {
            architect_id: extractedId || 'N/A',
            architect_name: extractedName,
            total_sheets: 0,
            raw_commission: 0,
            ineligibleRowsCount: 0,
            totalRows: 0,
            skuBreakdown: []
          };
        }
        
        // Accumulate running values into the grouped object
        aggregationMap[uniqueKey].total_sheets += sheets;
        aggregationMap[uniqueKey].raw_commission += payout;
        aggregationMap[uniqueKey].totalRows += 1;
        if (isRowIneligible) {
          aggregationMap[uniqueKey].ineligibleRowsCount += 1;
        }

        aggregationMap[uniqueKey].skuBreakdown.push({ rawProductSku, payout, sheets });
      });

      // Pass 2: Verify eligibility rules and map data components
      const compiledArchitects = Object.values(aggregationMap).map(arch => {
        const isEligible = arch.ineligibleRowsCount < arch.totalRows;
        
        const finalCommission = isEligible ? arch.raw_commission : 0;
        const finalSheets = isEligible ? arch.total_sheets : 0;

        if (isEligible) {
          arch.skuBreakdown.forEach(({ rawProductSku, payout, sheets }) => {
            if (rawProductSku) {
              skuPayoutMap[rawProductSku] = (skuPayoutMap[rawProductSku] || 0) + payout;
              skuSheetsMap[rawProductSku] = (skuSheetsMap[rawProductSku] || 0) + sheets;
              skuPayoutSumMap[rawProductSku] = (skuPayoutSumMap[rawProductSku] || 0) + payout;

              if (/decorative/i.test(rawProductSku)) {
                categoryPayoutMap['Decorative'] += payout;
              } else if (rawProductSku.toUpperCase().startsWith('PW')) {
                categoryPayoutMap['PW'] += payout;
              } else if (rawProductSku.toUpperCase().startsWith('BB')) {
                categoryPayoutMap['BB'] += payout;
              } else if (rawProductSku.toUpperCase().startsWith('FD')) {
                categoryPayoutMap['FD'] += payout;
              }
            }
          });
        }

        return {
          architect_id: arch.architect_id,
          architect_name: arch.architect_name,
          total_sheets: finalSheets,
          commission_earned: finalCommission, 
          isEligible: isEligible
        };
      });
      
      compiledArchitects.sort((a, b) => b.commission_earned - a.commission_earned);
      setArchitectsList(compiledArchitects);

      setCategoryBusinessData(
        Object.entries(categoryPayoutMap).map(([name, value]) => ({ name, value }))
      );

      const compiledSkus = Object.keys(skuSheetsMap).map(sku => ({
        skuName: sku,
        totalSheets: skuSheetsMap[sku],
        businessValue: skuSheetsMap[sku] * 2500,
        totalPayoutSum: skuPayoutSumMap[sku] || 0 
      })).sort((a, b) => b.totalSheets - a.totalSheets);
      
      setAllSkuExcelData(compiledSkus);

      setSkuBusinessData(
        Object.entries(skuPayoutMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      );

      // Pass 3: Process the Global KPI state object values
      const totalArchs = compiledArchitects.length;
      const eligibleCount = compiledArchitects.filter(a => a.isEligible).length;
      const ineligibleCount = compiledArchitects.filter(a => !a.isEligible).length; 

      const aggregateCommission = compiledArchitects.reduce((sum, a) => sum + a.commission_earned, 0);
      const aggregateSheets = compiledArchitects.reduce((sum, a) => sum + a.total_sheets, 0);
      const aggregateBusiness = aggregateSheets * 2500;

      setKpi({
        totalArchitects: totalArchs,
        eligibleCount: eligibleCount,
        ineligibleCount: ineligibleCount, 
        totalBusiness: aggregateBusiness,
        totalCommission: aggregateCommission,
        avgBusinessPerArchitect: eligibleCount > 0 ? aggregateBusiness / eligibleCount : 0
      });

    } catch (err) {
      console.error('Calculation Runtime Error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []); 

  useEffect(() => {
    syncDashboardMetrics();
  }, [syncDashboardMetrics]);

  const downloadExcelReport = (exportType) => {
    const now = new Date();
    const dateString = now.toISOString().slice(0, 10); 
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12; 
    const timestamp = `${dateString}_${String(hours).padStart(2, '0')}-${minutes}_${ampm}`;

    let filename = `SaaS_Report_${exportType}_${timestamp}.csv`;
    let csvContent = "data:text/csv;charset=utf-8,";

    if (exportType === 'leaderboard' || exportType === 'summary') {
      csvContent += `Report Generated On:,${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n\n`;
      csvContent += "Rank,Architect ID,Architect Name,Total Sheets,Estimated Business (INR),Commission Earned (INR),Status\n";
      architectsList.forEach((row, i) => {
        const structuralName = row?.architect_name ? row.architect_name.replace(/"/g, '""') : 'Unknown Architect';
        csvContent += `${i + 1},${row?.architect_id || 'N/A'},"${structuralName}",${(row?.total_sheets || 0).toFixed(1)},${(row?.total_sheets || 0) * 2500},${row?.commission_earned || 0},${row?.isEligible ? 'Active Eligible' : 'Ineligible'}\n`;
      });
    } else if (exportType === 'category') {
      csvContent += `Category Report Generated On:,${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n\n`;
      csvContent += "Product Segment Group,Total Payout Volume Sum (INR)\n";
      categoryBusinessData.forEach(c => {
        csvContent += `"${c?.name || 'Unknown'}",${c?.value || 0}\n`;
      });
    } else if (exportType === 'product_sku') {
      csvContent += `Product SKU Report Generated On:,${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n\n`;
      csvContent += "Product SKU Code,Total Sheets Sold,Corresponding Turnover Value (INR),Total Commission Payout (INR)\n";
      allSkuExcelData.forEach(item => {
        const skuLabelClean = String(item?.skuName || '').replace(/"/g, '""');
        csvContent += `"${skuLabelClean}",${(item?.totalSheets || 0).toFixed(1)},${item?.businessValue || 0},${item?.totalPayoutSum || 0}\n`;
      });
    } else {
      csvContent += `Master Report Summary Generated On:,${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n\n`;
      csvContent += "Metric Profile Indicator,Calculated Value Metric\n";
      csvContent += `Total Monitored Accounts,${kpi.totalArchitects}\n`;
      csvContent += `Active Eligible Accounts,${kpi.eligibleCount}\n`;
      csvContent += `Total Ineligible Accounts,${kpi.ineligibleCount}\n`;
      csvContent += `Gross Turnaround Volume Business,${kpi.totalBusiness}\n`;
      csvContent += `Net Cumulative Commission Ledger Pool,${kpi.totalCommission}\n`;
    }

    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", encodeURI(csvContent));
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
  };

  const downloadTopWiseSkuReport = () => {
    const now = new Date();
    const dateString = now.toISOString().slice(0, 10);
    const filename = `Top_${skuLimit}_SKU_Performance_Report_${dateString}.csv`;
    let csvContent = "data:text/csv;charset=utf-8,";
    
    csvContent += `Top ${skuLimit} Product SKU Performance Report\n`;
    csvContent += `Generated On:,${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n`;
    csvContent += "Rank,Product SKU Code,Total Payout Volume Share (INR)\n";
    
    skuBusinessData.slice(0, skuLimit).forEach((item, index) => {
      const cleanSkuName = String(item?.name || '').replace(/"/g, '""');
      csvContent += `${index + 1},"${cleanSkuName}",${item?.value || 0}\n`;
    });

    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", encodeURI(csvContent));
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
  };

  const eligibleArchitectsOnly = architectsList.filter(arch => arch?.isEligible);
  const topTenEarners = eligibleArchitectsOnly.slice(0, 10);
  const PIE_COLORS = ['#10b981', '#3b82f6', '#6366f1', '#f59e0b'];

  const displayedSkuData = skuBusinessData.slice(0, skuLimit);

  return (
    <div className="page active" id="page-dashboard" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)', minHeight: '100vh', color: '#334155', fontFamily: '"Inter", system-ui, -apple-system, sans-serif', padding: '24px' }}>
      
      {/* Premium Navigation Action Ribbon Controls */}
      <div className="dl-strip" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', background: '#fff', padding: '12px 20px', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)' }}>
        <button className="btn-dl" onClick={syncDashboardMetrics} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '8px 16px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Ledger
        </button>
        <div style={{ height: '20px', width: '1px', background: '#e2e8f0' }} />
        <button className="btn-dl" onClick={() => downloadExcelReport('summary')} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '8px 16px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>
          <Download size={14} /> Summary CSV
        </button>
        <button className="btn-dl" onClick={() => downloadExcelReport('category')} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '8px 16px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>
          <FileSpreadsheet size={14} /> Category Payouts
        </button>
        <button className="btn-dl" onClick={() => downloadExcelReport('product_sku')} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '8px 16px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
          <Download size={14} /> Export SKU Report
        </button>
        <button className="btn-dl btn-dl-primary" onClick={() => downloadExcelReport('full')} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px', marginLeft: 'auto', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)' }}>
          <Download size={14} /> Export Master Report
        </button>
      </div>

      {/* KPI Dashboard Grid */}
      <div className="kpi-row kpi-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        
        {/* Metric 1 */}
        <div className="kpi" style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-lbl" style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Architects</div>
            <div style={{ background: '#eff6ff', padding: '8px', borderRadius: '10px' }}><Users size={16} color="#3b82f6" /></div>
          </div>
          <div className="kpi-val" style={{ fontSize: '26px', fontWeight: '700', color: '#0f172a', marginTop: '10px', letterSpacing: '-0.5px' }}>{loading ? '—' : kpi.totalArchitects}</div>
          <div className="kpi-note" style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Registered Portals</div>
        </div>

        {/* Metric 2 */}
        <div className="kpi" style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #bbf7d0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-lbl" style={{ fontSize: '11px', color: '#15803d', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Eligible</div>
            <div style={{ background: '#f0fdf4', padding: '8px', borderRadius: '10px' }}><CheckCircle size={16} color="#16a34a" /></div>
          </div>
          <div className="kpi-val" style={{ fontSize: '26px', fontWeight: '700', color: '#16a34a', marginTop: '10px', letterSpacing: '-0.5px' }}>{loading ? '—' : kpi.eligibleCount}</div>
          <div className="kpi-note" style={{ fontSize: '12px', color: '#166534', opacity: 0.8, marginTop: '6px' }}>Approved Statuses</div>
        </div>

        {/* Metric 3 */}
        <div className="kpi" style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #fecaca', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-lbl" style={{ fontSize: '11px', color: '#991b1b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Ineligible</div>
            <div style={{ background: '#fef2f2', padding: '8px', borderRadius: '10px' }}><XCircle size={16} color="#ef4444" /></div>
          </div>
          <div className="kpi-val" style={{ fontSize: '26px', fontWeight: '700', color: '#ef4444', marginTop: '10px', letterSpacing: '-0.5px' }}>{loading ? '—' : kpi.ineligibleCount}</div>
          <div className="kpi-note" style={{ fontSize: '12px', color: '#991b1b', opacity: 0.8, marginTop: '6px' }}>Blocked Portals</div>
        </div>

        {/* Metric 4 */}
        <div className="kpi" style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-lbl" style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Estimated Business Done</div>
            <div style={{ background: '#e0e7ff', padding: '8px', borderRadius: '10px' }}><Layers size={16} color="#6366f1" /></div>
          </div>
          <div className="kpi-val" style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginTop: '10px', letterSpacing: '-0.5px' }}>
            {loading ? '—' : `₹${kpi.totalBusiness.toLocaleString('en-IN')}`}
          </div>
          <div className="kpi-note" style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Gross Value Turnover</div>
        </div>

        {/* Metric 5 */}
        <div className="kpi" style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-lbl" style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Commission</div>
            <div style={{ background: '#fef3c7', padding: '8px', borderRadius: '10px' }}><Coins size={16} color="#eab308" /></div>
          </div>
          <div className="kpi-val" style={{ fontSize: '24px', fontWeight: '700', color: '#10b981', marginTop: '10px', letterSpacing: '-0.5px' }}>
            {loading ? '—' : `₹${kpi.totalCommission.toLocaleString('en-IN')}`}
          </div>
          <div className="kpi-note" style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Cumulative Payout Pool</div>
        </div>

        {/* Metric 6 */}
        <div className="kpi" style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-lbl" style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Business</div>
            <div style={{ background: '#fce7f3', padding: '8px', borderRadius: '10px' }}><TrendingUp size={16} color="#ec4899" /></div>
          </div>
          <div className="kpi-val" style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', marginTop: '10px', letterSpacing: '-0.5px' }}>
            {loading ? '—' : `₹${Math.round(kpi.avgBusinessPerArchitect).toLocaleString('en-IN')}`}
          </div>
          <div className="kpi-note" style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Per Active Partner</div>
        </div>
      </div>

      {/* Visual Analytics Charts Block */}
      <div className="chart-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px', marginBottom: '28px' }}>
        
        {/* Pie Graph Container */}
        <div className="chart-card" style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', height: '420px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div>
            <div className="ch-title" style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>Commission Split by Product Segment</div>
            <div className="ch-sub" style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Interactive payout breakdown share (Active Accounts)</div>
          </div>
          
          <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {loading ? (
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>Compiling segments...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryBusinessData} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value">
                    {categoryBusinessData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} style={{ outline: 'none' }} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `₹${value.toLocaleString('en-IN')}`} contentStyle={{ background: '#0f172a', color: '#fff', borderRadius: '8px', fontSize: '12px', border: 'none' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#475569' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Bar Graph Container */}
        <div className="chart-card" style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', height: '420px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div className="ch-title" style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>Top {skuLimit} Product Item SKUs Performance</div>
              <div className="ch-sub" style={{ fontSize: '13px', color: '#64748b' }}>Total payouts grouped from eligible partner rows</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select 
                value={skuLimit} 
                onChange={(e) => setSkuLimit(Number(e.target.value))}
                style={{ padding: '6px 12px', fontSize: '13px', color: '#475569', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', outline: 'none' }}
              >
                <option value={6}>Top 6</option>
                <option value={10}>Top 10</option>
                <option value={20}>Top 20</option>
              </select>
              <button 
                onClick={downloadTopWiseSkuReport}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '13px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s' }}
              >
                <Download size={13} /> Export Top {skuLimit}
              </button>
            </div>
          </div>
          
          <div style={{ flex: 1, width: '100%', height: '100%' }}>
            {loading ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', paddingTop: '120px', fontSize: '13px' }}>Mapping metric clusters...</div>
            ) : displayedSkuData.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', paddingTop: '120px', fontSize: '13px' }}>No active item SKU codes found</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayedSkuData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }} angle={-15} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(val) => `₹${val / 1000}k`} />
                  <Tooltip formatter={(value) => `₹${value.toLocaleString('en-IN')}`} contentStyle={{ background: '#0f172a', color: '#fff', borderRadius: '8px', border: 'none', fontSize: '12px' }} labelStyle={{ fontFamily: 'monospace' }} />
                  <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {displayedSkuData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#1d4ed8' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

      {/* Top Performance Leaders Grid Cards */}
      <div style={{ marginBottom: '28px' }}>
        <div className="chart-card" style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <div className="ch-title" style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>Top 10 Performance Leaders</div>
          <div className="ch-sub" style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Highest commission earners (Ineligible profiles excluded completely)</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px', gridColumn: '1/-1' }}>Organizing active ranks...</div>
            ) : topTenEarners.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px', gridColumn: '1/-1' }}>No calculated partner loops</div>
            ) : (
              topTenEarners.map((arch, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: '#f8fafc', borderRadius: '12px', borderLeft: index < 3 ? '4px solid #f59e0b' : '4px solid transparent', border: '1px solid #e2e8f0', borderLeftColor: index < 3 ? '#f59e0b' : 'transparent', transition: 'transform 0.2s', cursor: 'default' }}>
                  <div style={{ width: '28px', height: '28px', background: index === 0 ? '#fef3c7' : index === 1 ? '#e0e7ff' : '#f1f5f9', color: index === 0 ? '#b45309' : index === 1 ? '#4338ca' : '#475569', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700' }}>
                    {index + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{arch?.architect_name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>ID: {arch?.architect_id}</div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#10b981' }}>
                    ₹{(arch?.commission_earned || 0).toLocaleString('en-IN')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Table Matrix Component */}
      <div className="card" style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
        <div className="card-hd" style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', background: '#fef3c7', borderRadius: '10px' }}><Award size={20} color="#d97706" /></div>
            <div>
              <div className="card-title" style={{ fontWeight: '600', fontSize: '16px', color: '#0f172a' }}>Architect Leaderboard Matrix</div>
              <div className="card-sub" style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>Design Partner+ Program Aggregated Rank Ledger</div>
            </div>
          </div>
          <button className="btn-dl btn-dl-primary" onClick={() => downloadExcelReport('leaderboard')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.2)' }}>
            <FileSpreadsheet size={14} /> Export Table Data
          </button>
        </div>

        <div style={{ padding: '0px', overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '56px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>⏳ Querying live database loops...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 20px', fontWeight: '600', color: '#475569', width: '80px', textAlign: 'center' }}>Rank</th>
                  <th style={{ padding: '14px 20px', fontWeight: '600', color: '#475569' }}>Architect Profile Name</th>
                  <th style={{ padding: '14px 20px', fontWeight: '600', color: '#475569', width: '120px', textAlign: 'center' }}>Architect Account Number</th>
                  <th style={{ padding: '14px 20px', fontWeight: '600', color: '#475569', textAlign: 'right', width: '140px' }}>Sheets Volume</th>
                  <th style={{ padding: '14px 20px', fontWeight: '600', color: '#475569', textAlign: 'right', width: '180px' }}>Calculated Turnover</th>
                  <th style={{ padding: '14px 20px', fontWeight: '600', color: '#475569', textAlign: 'right', width: '160px' }}>Commission Pool</th>
                </tr>
              </thead>
              <tbody>
                {architectsList.map((row, index) => {
                  if (!row) return null;
                  return (
                    <tr key={index} style={{ borderBottom: '1px solid #f1f5f9', background: row.isEligible ? 'transparent' : '#fff5f5', transition: 'background-color 0.2s' }}>
                      <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: '700', color: row.isEligible ? '#64748b' : '#94a3b8' }}>
                        {index + 1}
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: '600', color: row.isEligible ? '#1e293b' : '#94a3b8' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {row.architect_name}
                          {!row.isEligible && (
                            <span style={{ fontSize: '11px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: '6px', fontWeight: '600' }}>
                              Blocked (Ineligible)
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center', color: '#64748b', fontWeight: '600', fontFamily: 'monospace' }}>
                        {row.architect_id}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '500', color: row.isEligible ? '#1e293b' : '#94a3b8' }}>
                        {(row.total_sheets || 0).toFixed(1)}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: row.isEligible ? '#475569' : '#94a3b8', fontWeight: '500' }}>
                        ₹{((row.total_sheets || 0) * 2500).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '700', color: row.isEligible ? '#10b981' : '#ef4444' }}>
                        ₹{(row.commission_earned || 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}