import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supbase';

// --- INLINE SVG ICON COMPONENTS ---
const IconSearch = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);

const IconUser = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

const IconBriefcase = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

const IconPhone = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const IconShoppingBag = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const IconMapPin = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
  </svg>
);

const IconHome = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const IconChevronDown = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const IconChevronUp = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 15-6-6-6 6" />
  </svg>
);

const IconRefresh = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
  </svg>
);

const IconCalendar = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
  </svg>
);

const IconUserCheck = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" />
  </svg>
);

const IconHardHat = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z" /><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" /><path d="M4 15a8 8 0 0 1 16 0" />
  </svg>
);

const IconDownload = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

const IconFilePdf = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" />
  </svg>
);

const IconFileText = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" />
  </svg>
);

// Dynamic loader helper for jsPDF
const getJsPDF = () => {
  return new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) {
      resolve(window.jspdf.jsPDF);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => {
      if (window.jspdf && window.jspdf.jsPDF) {
        resolve(window.jspdf.jsPDF);
      } else {
        reject(new Error('jsPDF library failed to load'));
      }
    };
    script.onerror = () => reject(new Error('jsPDF script tag failed to load.'));
    document.body.appendChild(script);
  });
};

// Helper to convert Image URL to Base64 for PDF embedding
const loadImageAsBase64 = (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/jpeg');
        resolve({ dataURL, width: img.width, height: img.height });
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

export default function ArchitectDashboard() {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  // Fetch data from Supabase
  const fetchRegistrations = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('architect_registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setRegistrations(data || []);
    } catch (err) {
      console.error('Error fetching registrations:', err.message);
      setError('Failed to load registrations. Please refresh or try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, []);

  // Download single image directly
  const handleDownloadImage = async (imgUrl, filename = 'Bill_Attachment.jpg') => {
    try {
      const response = await fetch(imgUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      window.open(imgUrl, '_blank');
    }
  };

  // Export ALL raw data including clickable Excel image hyperlinks
  const exportAllToExcel = () => {
    if (!registrations || registrations.length === 0) {
      alert('No data available to export.');
      return;
    }

    const headers = [
      'Architect ID',
      'Architect Name',
      'Firm Name',
      'Architect Phone',
      'Registration Date',
      'Bill Attached Image URLs',
      'Dealer Name',
      'Dealer Shop Name',
      'Dealer Phone',
      'Dealer Image URL',
      'Site Address',
      'Site Owner Phone',
      'Site Contractor Name',
      'Site Contractor Phone',
      'Site Image URL',
      'No Site Attached Contractor Name',
      'No Site Attached Contractor Phone'
    ];

    const csvRows = [headers.join(',')];

    const formatCell = (val) => {
      if (val === null || val === undefined || val === '') return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    // Excel clickable Hyperlink Formatter
    const formatUrlCell = (url) => {
      if (!url || url === '""' || url === '') return '""';
      const cleanUrl = String(url).trim();
      if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
        return `"=HYPERLINK(""${cleanUrl}"", ""View Attached Image"")"`;
      }
      return formatCell(cleanUrl);
    };

    registrations.forEach((row) => {
      const dealersList = row.dealers && row.dealers.length > 0 ? row.dealers : [];
      const sitesList = row.sites && row.sites.length > 0 ? row.sites : [];
      const directContractorsList = row.contractors && row.contractors.length > 0 ? row.contractors : [];
      
      const mainImages = Array.isArray(row.images) ? row.images.join(' ; ') : (row.images || '');

      const maxDealerSiteRows = Math.max(dealersList.length, sitesList.length);

      if (maxDealerSiteRows > 0) {
        for (let i = 0; i < maxDealerSiteRows; i++) {
          const dealer = dealersList[i] || {};
          const site = sitesList[i] || {};

          const dealerImg = dealer.imageUrl || dealer.image_url || dealer.image;
          const siteImg = site.imageUrl || site.image_url || site.image;

          const rowValues = [
            formatCell(row.id),
            formatCell(row.architect_name),
            formatCell(row.firm_name),
            formatCell(row.phone_no),
            formatCell(new Date(row.created_at).toLocaleDateString('en-IN')),
            formatUrlCell(mainImages),
            
            // Dealer Info
            formatCell(dealer.name),
            formatCell(dealer.shopName),
            formatCell(dealer.phone),
            formatUrlCell(dealerImg),
            
            // Site Info
            formatCell(site.address),
            formatCell(site.ownerPhone),
            formatCell(site.contractorName),
            formatCell(site.contractorPhone),
            formatUrlCell(siteImg),
            
            '""',
            '""'
          ];

          csvRows.push(rowValues.join(','));
        }
      } else if (directContractorsList.length === 0) {
        const rowValues = [
          formatCell(row.id),
          formatCell(row.architect_name),
          formatCell(row.firm_name),
          formatCell(row.phone_no),
          formatCell(new Date(row.created_at).toLocaleDateString('en-IN')),
          formatUrlCell(mainImages),
          '""', '""', '""', '""',
          '""', '""', '""', '""', '""',
          '""', '""'
        ];
        csvRows.push(rowValues.join(','));
      }

      directContractorsList.forEach((contractor) => {
        const contractorRowValues = [
          formatCell(row.id),
          formatCell(row.architect_name),
          formatCell(row.firm_name),
          formatCell(row.phone_no),
          formatCell(new Date(row.created_at).toLocaleDateString('en-IN')),
          formatUrlCell(mainImages),
          '""', '""', '""', '""',
          '""', '""', '""', '""', '""',
          formatCell(contractor.name),
          formatCell(contractor.phone)
        ];

        csvRows.push(contractorRowValues.join(','));
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Architect_Registrations_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- ADDITION 1: EXPORT TO EXCEL (NO IMAGES / TEXT ONLY) ---
  const exportToExcelWithoutImages = () => {
    if (!registrations || registrations.length === 0) {
      alert('No data available to export.');
      return;
    }

    const headers = [
      'Architect ID',
      'Architect Name',
      'Firm Name',
      'Architect Phone',
      'Registration Date',
      'Dealer Name',
      'Dealer Shop Name',
      'Dealer Phone',
      'Site Address',
      'Site Owner Phone',
      'Site Contractor Name',
      'Site Contractor Phone',
      'No Site Attached Contractor Name',
      'No Site Attached Contractor Phone'
    ];

    const csvRows = [headers.join(',')];

    const formatCell = (val) => {
      if (val === null || val === undefined || val === '') return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    registrations.forEach((row) => {
      const dealersList = row.dealers && row.dealers.length > 0 ? row.dealers : [];
      const sitesList = row.sites && row.sites.length > 0 ? row.sites : [];
      const directContractorsList = row.contractors && row.contractors.length > 0 ? row.contractors : [];

      const maxDealerSiteRows = Math.max(dealersList.length, sitesList.length);

      if (maxDealerSiteRows > 0) {
        for (let i = 0; i < maxDealerSiteRows; i++) {
          const dealer = dealersList[i] || {};
          const site = sitesList[i] || {};

          const rowValues = [
            formatCell(row.id),
            formatCell(row.architect_name),
            formatCell(row.firm_name),
            formatCell(row.phone_no),
            formatCell(new Date(row.created_at).toLocaleDateString('en-IN')),
            
            // Dealer Info
            formatCell(dealer.name),
            formatCell(dealer.shopName),
            formatCell(dealer.phone),
            
            // Site Info
            formatCell(site.address),
            formatCell(site.ownerPhone),
            formatCell(site.contractorName),
            formatCell(site.contractorPhone),
            
            '""',
            '""'
          ];

          csvRows.push(rowValues.join(','));
        }
      } else if (directContractorsList.length === 0) {
        const rowValues = [
          formatCell(row.id),
          formatCell(row.architect_name),
          formatCell(row.firm_name),
          formatCell(row.phone_no),
          formatCell(new Date(row.created_at).toLocaleDateString('en-IN')),
          '""', '""', '""',
          '""', '""', '""', '""',
          '""', '""'
        ];
        csvRows.push(rowValues.join(','));
      }

      directContractorsList.forEach((contractor) => {
        const contractorRowValues = [
          formatCell(row.id),
          formatCell(row.architect_name),
          formatCell(row.firm_name),
          formatCell(row.phone_no),
          formatCell(new Date(row.created_at).toLocaleDateString('en-IN')),
          '""', '""', '""',
          '""', '""', '""', '""',
          formatCell(contractor.name),
          formatCell(contractor.phone)
        ];

        csvRows.push(contractorRowValues.join(','));
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Architect_Registrations_No_Images_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export ALL Bills and Dealer Info to PDF using jsPDF
  const exportAllBillsToPDF = async () => {
    if (!registrations || registrations.length === 0) {
      alert('No registration data available to export to PDF.');
      return;
    }

    setPdfGenerating(true);
    try {
      const jsPDF = await getJsPDF();
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

      let yPos = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Report Header
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Architect Registration & Attached Bills Report', 14, yPos);

      yPos += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')} | Total Records: ${registrations.length}`, 14, yPos);

      yPos += 10;
      doc.setDrawColor(203, 213, 225);
      doc.line(14, yPos, pageWidth - 14, yPos);
      yPos += 8;

      for (let i = 0; i < registrations.length; i++) {
        const item = registrations[i];
        const dealersList = item.dealers || [];
        const sitesList = item.sites || [];
        const itemImages = item.images || [];

        // Check page overflow
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = 15;
        }

        // Section Title: Architect Info
        doc.setFillColor(241, 245, 249);
        doc.rect(14, yPos, pageWidth - 28, 12, 'F');

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text(`Architect: ${item.architect_name || 'N/A'}`, 18, yPos + 8);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(`Firm: ${item.firm_name || 'N/A'} | Phone: ${item.phone_no || 'N/A'}`, 110, yPos + 8);

        yPos += 16;

        // Collect all bill images for this architect record
        const billEntries = [];

        itemImages.forEach((img, idx) => {
          billEntries.push({
            type: 'Main Uploaded Bill',
            dealerName: 'N/A',
            shopName: 'N/A',
            phone: 'N/A',
            url: img
          });
        });

        dealersList.forEach((dealer) => {
          const imgUrl = dealer.imageUrl || dealer.image_url || dealer.image;
          if (imgUrl) {
            billEntries.push({
              type: 'Dealer Bill',
              dealerName: dealer.name || 'N/A',
              shopName: dealer.shopName || 'N/A',
              phone: dealer.phone || 'N/A',
              url: imgUrl
            });
          }
        });

        sitesList.forEach((site) => {
          const imgUrl = site.imageUrl || site.image_url || site.image;
          if (imgUrl) {
            billEntries.push({
              type: 'Site Bill',
              dealerName: `Site: ${site.address || 'Address Unspecified'}`,
              shopName: `Owner Phone: ${site.ownerPhone || 'N/A'}`,
              phone: `Contractor: ${site.contractorName || 'N/A'}`,
              url: imgUrl
            });
          }
        });

        if (billEntries.length === 0) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(148, 163, 184);
          doc.text('No bill images attached for this record.', 18, yPos);
          yPos += 10;
        } else {
          for (const bill of billEntries) {
            if (yPos > pageHeight - 65) {
              doc.addPage();
              yPos = 15;
            }

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(4, 120, 87);
            doc.text(`[${bill.type}] Dealer/Source: ${bill.dealerName}`, 18, yPos);
            
            yPos += 5;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            doc.text(`Shop: ${bill.shopName} | Phone: ${bill.phone}`, 18, yPos);

            yPos += 5;

            // Load and draw image
            const loadedImg = await loadImageAsBase64(bill.url);
            if (loadedImg && loadedImg.dataURL) {
              const maxImgWidth = 70;
              const maxImgHeight = 50;
              let imgWidth = maxImgWidth;
              let imgHeight = (loadedImg.height * imgWidth) / loadedImg.width;

              if (imgHeight > maxImgHeight) {
                imgHeight = maxImgHeight;
                imgWidth = (loadedImg.width * imgHeight) / loadedImg.height;
              }

              if (yPos + imgHeight > pageHeight - 15) {
                doc.addPage();
                yPos = 15;
              }

              try {
                doc.addImage(loadedImg.dataURL, 'JPEG', 18, yPos, imgWidth, imgHeight);
                yPos += imgHeight + 8;
              } catch (e) {
                doc.setTextColor(225, 29, 72);
                doc.text(`[Image Attachment Link]: ${bill.url}`, 18, yPos);
                yPos += 8;
              }
            } else {
              doc.setTextColor(37, 99, 235);
              doc.text(`[Bill Image Link]: ${bill.url}`, 18, yPos);
              yPos += 8;
            }
          }
        }

        yPos += 5;
        doc.setDrawColor(226, 232, 240);
        doc.line(14, yPos, pageWidth - 14, yPos);
        yPos += 8;
      }

      doc.save(`Architect_Bills_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF. Please ensure your internet connection is active.');
    } finally {
      setPdfGenerating(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const filteredRegistrations = registrations.filter((item) => {
    const q = searchQuery.toLowerCase();
    const architect = (item.architect_name || '').toLowerCase();
    const firm = (item.firm_name || '').toLowerCase();
    const phone = (item.phone_no || '').toLowerCase();

    const matchesDealer = (item.dealers || []).some(
      (d) =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.shopName || '').toLowerCase().includes(q)
    );

    const matchesSite = (item.sites || []).some((s) =>
      (s.address || '').toLowerCase().includes(q)
    );

    return (
      architect.includes(q) ||
      firm.includes(q) ||
      phone.includes(q) ||
      matchesDealer ||
      matchesSite
    );
  });

  return (
    <div className="dashboard-wrapper">
      <style>{`
        .dashboard-wrapper {
          width: 100%;
          min-height: 100vh;
          background: transparent;
          padding: 1.5rem 1rem;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #1e293b;
          box-sizing: border-box;
        }

        .dashboard-container {
          max-width: 1100px;
          margin: 0 auto;
        }

        /* HEADER */
        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.25rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .dashboard-title {
          font-size: 1.6rem;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.02em;
          margin: 0;
        }

        .dashboard-subtitle {
          font-size: 0.85rem;
          color: #64748b;
          margin-top: 0.2rem;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .btn-action {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          padding: 0.5rem 0.9rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.82rem;
          color: #334155;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-action:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }

        .btn-excel {
          background: #10b981;
          color: #ffffff;
          border: 1px solid #059669;
        }

        .btn-excel:hover {
          background: #059669;
        }

        .btn-excel-no-img {
          background: #0284c7;
          color: #ffffff;
          border: 1px solid #0369a1;
        }

        .btn-excel-no-img:hover {
          background: #0369a1;
        }

        .btn-pdf {
          background: #ef4444;
          color: #ffffff;
          border: 1px solid #dc2626;
        }

        .btn-pdf:hover {
          background: #dc2626;
        }

        .btn-download-modal {
          background: #2563eb;
          color: #ffffff;
          border: 1px solid #1d4ed8;
          padding: 0.55rem 1.1rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.88rem;
          transition: background 0.2s ease;
        }

        .btn-download-modal:hover {
          background: #1d4ed8;
        }

        /* CONTROLS */
        .dashboard-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.25rem;
          flex-wrap: wrap;
        }

        .search-box {
          position: relative;
          flex: 1;
          min-width: 260px;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }

        .search-input {
          width: 100%;
          padding: 0.6rem 1rem 0.6rem 2.4rem;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 0.88rem;
          outline: none;
          background: #ffffff;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }

        .search-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .stats-badge {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          padding: 0.6rem 0.9rem;
          border-radius: 8px;
          font-size: 0.82rem;
          color: #475569;
        }

        /* CARDS LIST */
        .records-list {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .record-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }

        .record-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
        }

        .record-card.expanded {
          border-color: #3b82f6;
          box-shadow: 0 4px 16px rgba(59, 130, 246, 0.08);
        }

        .record-header {
          padding: 1rem 1.15rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .architect-info-block {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .section-label-group {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }

        .section-label {
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #2563eb;
          background: #eff6ff;
          padding: 0.15rem 0.45rem;
          border-radius: 4px;
          width: fit-content;
        }

        /* BILL ATTACHED BADGE NEAR ARCHITECT INFO */
        .bill-attached-tag {
          font-size: 0.68rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #047857;
          background: #d1fae5;
          border: 1px solid #a7f3d0;
          padding: 0.15rem 0.45rem;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }

        .architect-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .avatar-icon {
          width: 38px;
          height: 38px;
          background: #f1f5f9;
          color: #2563eb;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          flex-shrink: 0;
        }

        .architect-name {
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }

        .firm-name {
          font-size: 0.82rem;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          margin: 0;
        }

        .record-meta {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
        }

        .phone-pill {
          font-size: 0.82rem;
          font-weight: 600;
          color: #334155;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 0.3rem 0.65rem;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        .summary-badges {
          display: flex;
          gap: 0.35rem;
        }

        .badge {
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.25rem 0.5rem;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
        }

        .badge-dealer {
          background: #fef3c7;
          color: #92400e;
        }

        .badge-site {
          background: #dcfce7;
          color: #166534;
        }

        .badge-contractor {
          background: #f3e8ff;
          color: #6b21a8;
        }

        .date-tag {
          font-size: 0.78rem;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 0.3rem;
        }

        .btn-toggle {
          background: transparent;
          border: none;
          font-size: 1.1rem;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        /* EXPANDED DETAILS */
        .record-details {
          border-top: 1px solid #f1f5f9;
          background: #fafafa;
          padding: 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .detail-block {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .block-title {
          font-size: 0.83rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #334155;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin: 0;
        }

        .bill-block-title {
          font-size: 0.85rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #047857;
          background: #d1fae5;
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          width: fit-content;
        }

        .nested-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 0.65rem;
        }

        .nested-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 0.65rem 0.8rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .nested-primary {
          font-size: 0.85rem;
          font-weight: 600;
          color: #0f172a;
          margin: 0;
        }

        .nested-sub {
          font-size: 0.78rem;
          color: #64748b;
          margin: 0.2rem 0 0 0;
          display: flex;
          align-items: center;
          gap: 0.3rem;
        }

        /* IMAGE THUMBNAIL STYLES */
        .image-preview-container {
          margin-top: 0.6rem;
          padding-top: 0.5rem;
          border-top: 1px dashed #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .bill-attached-label {
          font-size: 0.72rem;
          font-weight: 800;
          color: #047857;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .image-action-group {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .image-thumbnail-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 0.3rem 0.5rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .image-thumbnail-btn:hover {
          background: #e2e8f0;
          border-color: #94a3b8;
        }

        .thumbnail-img {
          width: 32px;
          height: 32px;
          object-fit: cover;
          border-radius: 4px;
        }

        .thumbnail-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #2563eb;
        }

        .icon-btn-download {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1d4ed8;
          padding: 0.35rem 0.5rem;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease;
        }

        .icon-btn-download:hover {
          background: #dbeafe;
        }

        /* MODAL STYLES */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }

        .modal-content {
          position: relative;
          background: #ffffff;
          padding: 1.25rem;
          border-radius: 12px;
          max-width: 90vw;
          max-height: 90vh;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.9rem;
        }

        .modal-img {
          max-width: 100%;
          max-height: 70vh;
          object-fit: contain;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
        }

        .modal-close-btn {
          position: absolute;
          top: -12px;
          right: -12px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          font-size: 0.95rem;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }

        .inline-icon {
          color: #94a3b8;
        }

        .loading-container, .empty-state {
          text-align: center;
          padding: 3rem 1rem;
          color: #64748b;
          background: #ffffff;
          border-radius: 12px;
          border: 1px dashed #cbd5e1;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .dashboard-error-card {
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
          padding: 0.8rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          font-size: 0.85rem;
        }
      `}</style>

      <div className="dashboard-container">
        
        {/* HEADER */}
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Architect Registrations</h1>
            <p className="dashboard-subtitle">
              Manage and view live architect, dealer, site, and contractor records
            </p>
          </div>
          <div className="header-actions">
            <button onClick={exportAllToExcel} className="btn-action btn-excel" title="Export All Data to Excel with Clickable Image Links">
              <IconDownload /> Export Excel
            </button>
            {/* ADDITION 2: BUTTON FOR EXPORTING EXCEL WITHOUT IMAGES */}
            <button onClick={exportToExcelWithoutImages} className="btn-action btn-excel-no-img" title="Export Data to Excel without Image links">
              <IconDownload /> Export Excel (Text Only)
            </button>
            <button 
              onClick={exportAllBillsToPDF} 
              disabled={pdfGenerating} 
              className="btn-action btn-pdf" 
              title="Download All Attached Bills along with Dealer details in PDF"
            >
              <IconFilePdf className={pdfGenerating ? 'spin' : ''} /> {pdfGenerating ? 'Generating PDF...' : 'Download Bills PDF'}
            </button>
            <button onClick={fetchRegistrations} className="btn-action" title="Refresh Data">
              <IconRefresh className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="dashboard-controls">
          <div className="search-box">
            <IconSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search by Architect, Firm, Dealer, Address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="stats-badge">
            Total Records: <strong>{filteredRegistrations.length}</strong>
          </div>
        </div>

        {error && <div className="dashboard-error-card">{error}</div>}

        {loading ? (
          <div className="loading-container">
            <IconRefresh className="spin loading-icon" />
            <p>Loading registrations from database...</p>
          </div>
        ) : filteredRegistrations.length === 0 ? (
          <div className="empty-state">
            <p>No registration records found.</p>
          </div>
        ) : (
          <div className="records-list">
            {filteredRegistrations.map((item) => {
              const isExpanded = expandedId === item.id;
              const dealersList = item.dealers || [];
              const sitesList = item.sites || [];
              const contractorsList = item.contractors || [];

              // Check if bill image exists anywhere in this record
              const hasBillAttached = 
                (item.images && item.images.length > 0) ||
                dealersList.some(d => d.imageUrl || d.image_url || d.image) ||
                sitesList.some(s => s.imageUrl || s.image_url || s.image);

              const dateFormatted = new Date(item.created_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });

              return (
                <div key={item.id} className={`record-card ${isExpanded ? 'expanded' : ''}`}>
                  
                  <div className="record-header" onClick={() => toggleExpand(item.id)}>
                    
                    <div className="architect-info-block">
                      <div className="section-label-group">
                        <span className="section-label">Architect Information</span>
                        {/* VISIBLE "BILL ATTACHED" BADGE NEAR ARCHITECT INFO */}
                        {hasBillAttached && (
                          <span className="bill-attached-tag">
                            <IconFileText /> Bill Attached
                          </span>
                        )}
                      </div>

                      <div className="architect-info">
                        <div className="avatar-icon">
                          <IconUser />
                        </div>
                        <div>
                          <h3 className="architect-name">{item.architect_name || 'N/A'}</h3>
                          <p className="firm-name">
                            <IconBriefcase className="inline-icon" /> {item.firm_name || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="record-meta">
                      <div className="phone-pill">
                        <IconPhone /> {item.phone_no || 'N/A'}
                      </div>

                      <div className="summary-badges">
                        <span className="badge badge-dealer" title="Dealers count">
                          <IconShoppingBag /> {dealersList.length} Dealer(s)
                        </span>
                        <span className="badge badge-site" title="Sites count">
                          <IconMapPin /> {sitesList.length} Site(s)
                        </span>
                        {contractorsList.length > 0 && (
                          <span className="badge badge-contractor" title="Contractors count">
                            <IconHardHat /> {contractorsList.length} Contractor(s)
                          </span>
                        )}
                      </div>

                      <div className="date-tag">
                        <IconCalendar /> {dateFormatted}
                      </div>

                      <button className="btn-toggle">
                        {isExpanded ? <IconChevronUp /> : <IconChevronDown />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="record-details">
                      
                      {/* TOP-LEVEL BILL ATTACHMENTS (from images text[] column) */}
                      {item.images && item.images.length > 0 && (
                        <div className="detail-block">
                          <h4 className="bill-block-title">
                            <IconFileText /> Bill Attached ({item.images.length})
                          </h4>
                          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                            {item.images.map((imgUrl, idx) => (
                              <div key={idx} className="image-action-group">
                                <button
                                  className="image-thumbnail-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedImage(imgUrl);
                                  }}
                                >
                                  <img src={imgUrl} alt={`Bill Attached ${idx + 1}`} className="thumbnail-img" />
                                  <span className="thumbnail-label">
                                    View Bill Image {item.images.length > 1 ? `#${idx + 1}` : ''}
                                  </span>
                                </button>
                                <button
                                  className="icon-btn-download"
                                  title="Download Bill Image"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadImage(imgUrl, `Bill_Attachment_${item.id}_${idx + 1}.jpg`);
                                  }}
                                >
                                  <IconDownload />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* DEALERS BLOCK */}
                      <div className="detail-block">
                        <h4 className="block-title">
                          <IconShoppingBag /> Dealer Details ({dealersList.length})
                        </h4>
                        <div className="nested-grid">
                          {dealersList.map((dealer, idx) => {
                            const imgUrl = dealer.imageUrl || dealer.image_url || dealer.image;
                            return (
                              <div key={idx} className="nested-card">
                                <div>
                                  <p className="nested-primary">{dealer.name || 'N/A'}</p>
                                  {dealer.shopName && (
                                    <p className="nested-sub"><IconHome className="inline-icon" /> {dealer.shopName}</p>
                                  )}
                                  {dealer.phone && (
                                    <p className="nested-sub"><IconPhone className="inline-icon" /> {dealer.phone}</p>
                                  )}
                                </div>
                                {imgUrl && (
                                  <div className="image-preview-container">
                                    <span className="bill-attached-label">
                                      <IconFileText /> Bill Attached:
                                    </span>
                                    <div className="image-action-group">
                                      <button 
                                        className="image-thumbnail-btn" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedImage(imgUrl);
                                        }}
                                      >
                                        <img src={imgUrl} alt="Dealer Bill Attachment" className="thumbnail-img" />
                                        <span className="thumbnail-label">View Bill</span>
                                      </button>
                                      <button
                                        className="icon-btn-download"
                                        title="Download Dealer Bill Image"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDownloadImage(imgUrl, `Dealer_Bill_${dealer.name || idx + 1}.jpg`);
                                        }}
                                      >
                                        <IconDownload />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* SITES BLOCK */}
                      <div className="detail-block">
                        <h4 className="block-title">
                          <IconMapPin /> Site Details ({sitesList.length})
                        </h4>
                        <div className="nested-grid">
                          {sitesList.map((site, idx) => {
                            const imgUrl = site.imageUrl || site.image_url || site.image;
                            return (
                              <div key={idx} className="nested-card">
                                <div>
                                  <p className="nested-primary">
                                    <IconMapPin className="inline-icon" /> {site.address || 'Unspecified Address'}
                                  </p>
                                  {site.ownerPhone && (
                                    <p className="nested-sub">
                                      <IconUserCheck className="inline-icon" /> Owner Phone: {site.ownerPhone}
                                    </p>
                                  )}
                                  {site.contractorName && (
                                    <p className="nested-sub">
                                      <IconHardHat className="inline-icon" /> Contractor: {site.contractorName} {site.contractorPhone ? `(${site.contractorPhone})` : ''}
                                    </p>
                                  )}
                                </div>
                                {imgUrl && (
                                  <div className="image-preview-container">
                                    <span className="bill-attached-label">
                                      <IconFileText /> Bill Attached:
                                    </span>
                                    <div className="image-action-group">
                                      <button 
                                        className="image-thumbnail-btn" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedImage(imgUrl);
                                        }}
                                      >
                                        <img src={imgUrl} alt="Site Bill Attachment" className="thumbnail-img" />
                                        <span className="thumbnail-label">View Bill</span>
                                      </button>
                                      <button
                                        className="icon-btn-download"
                                        title="Download Site Bill Image"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDownloadImage(imgUrl, `Site_Bill_${idx + 1}.jpg`);
                                        }}
                                      >
                                        <IconDownload />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* CONTRACTORS BLOCK */}
                      {contractorsList.length > 0 && (
                        <div className="detail-block">
                          <h4 className="block-title">
                            <IconHardHat /> Contractor Details ({contractorsList.length})
                          </h4>
                          <div className="nested-grid">
                            {contractorsList.map((contractor, idx) => (
                              <div key={idx} className="nested-card">
                                <div>
                                  <p className="nested-primary">{contractor.name}</p>
                                  {contractor.phone && (
                                    <p className="nested-sub"><IconPhone className="inline-icon" /> {contractor.phone}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* FULL-SCREEN IMAGE MODAL WITH DOWNLOAD */}
      {selectedImage && (
        <div className="modal-overlay" onClick={() => setSelectedImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedImage(null)}>
              ✕
            </button>
            <img src={selectedImage} alt="Bill Attachment Preview" className="modal-img" />
            <button 
              className="btn-download-modal"
              onClick={() => handleDownloadImage(selectedImage, 'Attached_Bill_Image.jpg')}
            >
              <IconDownload /> Download Image
            </button>
          </div>
        </div>
      )}

    </div>
  );
}