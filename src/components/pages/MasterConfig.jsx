import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom"; // ✅ Integrated without breaking existing structure
import * as XLSX from "xlsx";
// Configured to point directly to your relative path setup
import { supabase } from "../../lib/supbase";

const MasterDataPage = ({ exportMasterData }) => {
  const fileInputRef = useRef(null);
  const location = useLocation(); // ✅ Hook initialized safely

  // --- State Architecture ---
  const [tableData, setTableData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("Pre-loaded");
  const [updatedBy, setUpdatedBy] = useState("System");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [loading, setLoading] = useState(false);

  // --- UI Toast & Modal States ---
  const [snackbar, setSnackbar] = useState({ show: false, message: "", type: "success" });
  const [showResetModal, setShowResetModal] = useState(false);

  // --- Snackbar Helper ---
  const showToast = (message, type = "success") => {
    setSnackbar({ show: true, message, type });
    setTimeout(() => {
      setSnackbar({ show: false, message: "", type: "success" });
    }, 4000); // Automatically disappears after 4 seconds
  };

  // --- 📝 Telemetry Logging Engine (Updated with Strict UUID & Role Configs) ---
  const logTelemetry = async (actionType, description) => {
    try {
      const activeId = localStorage.getItem('auth_uid'); // ✅ Uses the strict 36-char string UUID layout
      const activeRole = localStorage.getItem('user_role') || 'User';

      // Capturing explicit errors returned from Supabase to prevent silent rejections
      const { error } = await supabase.from('user_activity_logs').insert({
        user_id: activeId, 
        user_role: activeRole,
        action_type: actionType,
        description: description
      });

      if (error) {
        console.error("❌ Supabase DB Rejected Telemetry Row:", error.message, error.details);
      } else {
        console.log("✅ Telemetry successfully recorded in DB.");
      }
    } catch (err) {
      console.error("Telemetry error omitted:", err.message);
    }
  };

  // --- Fetch Engine ---
  const fetchMasterData = async () => {
    try {
      const { data, error } = await supabase
        .from("product_sku_master")
        .select("*")
        .order("id", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setTableData(data);
        setTotalCount(data.length);

        const latestEntry = data.reduce((latest, current) => {
          return new Date(current.updated_at) > new Date(latest.updated_at)
            ? current
            : latest;
        }, data[0]);

        setLastUpdated(new Date(latestEntry.updated_at).toLocaleString());
        setUpdatedBy(latestEntry.updated_by || "System");
      } else {
        setTableData([]);
        setTotalCount(0);
        setLastUpdated("Pre-loaded");
        setUpdatedBy("System");
      }
    } catch (err) {
      console.error("Error retrieving master data:", err.message);
    }
  };

  useEffect(() => {
    fetchMasterData();
  }, []);

  // --- Export Engine ---
  const handleExportMasterData = async () => {
    // Determine the acting user's profile context name seamlessly
    const currentActorName = location.state?.userProfile?.name || localStorage.getItem("user_role") || "Admin";

    if (exportMasterData) {
      // ✅ Await telemetry logging first so it completes safely before the parent layout can unmount
      await logTelemetry("EXPORT_MASTER_DATA", `Master data file exported via custom layout configurations by ${currentActorName}.`);
      exportMasterData();
      return;
    }

    if (tableData.length === 0) {
      showToast("There is no master data available to export.", "error");
      return;
    }

    try {
      const exportRows = tableData.map((row) => ({
        "Group": row.group,
        "Code": row.code,
        "SKU": row.sku,
        "Size": row.size,
        "Price": row.price,
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Master Data");
      XLSX.writeFile(workbook, "Product_SKU_Master_List_2026-27.xlsx");
      
      // ✅ Background activity logged asynchronously and awaited safely
      await logTelemetry("EXPORT_MASTER_DATA", `Master configuration sheets successfully requested and downloaded by ${currentActorName}.`);
      
      showToast("Master spreadsheet exported successfully!");
    } catch (err) {
      showToast(`Export execution failed: ${err.message}`, "error");
    }
  };

  // --- Upload Handlers ---
  const handleUploadButtonClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        // Fallback checks prioritize router parameter definitions dynamically
        let currentUserName = location.state?.userProfile?.name || "Admin";
        const activeId = localStorage.getItem("auth_uid");

        if (!location.state?.userProfile?.name && activeId) {
          const { data: userProfile, error: userError } = await supabase
            .from("users")
            .select("name")
            .eq("id", activeId)
            .maybeSingle();

          if (!userError && userProfile?.name) {
            currentUserName = userProfile.name;
          }
        }

        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawRows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: null,
        });

        if (rawRows.length === 0) {
          throw new Error("The selected file is empty.");
        }

        // Find the actual header index by searching down past empty banners/titles
        let headerRowIndex = -1;
        for (let i = 0; i < rawRows.length; i++) {
          const processedHeaders = rawRows[i].map(h => h?.toString().trim().toLowerCase() || "");
          if (processedHeaders.includes("sku") && (processedHeaders.includes("code") || processedHeaders.includes("item code"))) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          throw new Error("Could not find column header row. Ensure 'SKU' and 'Code' columns are present.");
        }

        // Map correct header indexes from the row we found
        const fileHeaders = rawRows[headerRowIndex].map((h) =>
          h?.toString().trim().toLowerCase() || ""
        );

        const payload = [];

        // Start reading data directly below the detected header row
        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.every((cell) => cell === null || cell === "")) continue;

          const getValue = (possibleNames) => {
            const index = fileHeaders.findIndex((h) => possibleNames.includes(h));
            return (index !== -1 && row[index] !== undefined) ? row[index] : null;
          };

          const rawPriceVal = getValue(["price", "rate", "amount"]);
          const sanitizedPriceStr = rawPriceVal !== null ? rawPriceVal.toString().replace(/[^0-9.]/g, "") : "0";
          const finalPriceNum = parseFloat(sanitizedPriceStr) || 0;

          const rawCode = getValue(["code", "item code"]);
          const rawSku = getValue(["sku", "sku name", "item description"]);
          const rawSize = getValue(["size", "thickness"]);

          // Skip empty placeholder/spacer lines within rows
          if (!rawSku || !rawCode) continue;

          const mappedRow = {
            group: (getValue(["group", "product group", "grp"]) || "PLYWOOD")
              .toString()
              .trim()
              .toUpperCase(),
            code: rawCode.toString().trim(),
            sku: rawSku.toString().trim(),
            size: rawSize ? rawSize.toString().trim() : "—", 
            price: finalPriceNum,
            updated_by: currentUserName, 
          };

          payload.push(mappedRow);
        }

        if (payload.length === 0) {
          throw new Error("No structured product entries parsed from data rows.");
        }

        // Performs update if conflict matches table unique definitions
        const { error } = await supabase
          .from("product_sku_master")
          .upsert(payload, { onConflict: "code,sku,size" });

        if (error) throw error;

        // ✅ Logs activity trace securely with target username details
        await logTelemetry("UPLOAD_MASTER_DATA", `Product SKU dataset synced. Processed ${payload.length} rows successfully by ${currentUserName}.`);

        showToast(`Data uploaded successfully! Synced ${payload.length} master rows.`);
        await fetchMasterData();
      } catch (error) {
        showToast(`Parsing Pipeline Exception: ${error.message}`, "error");
      } finally {
        setLoading(false);
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      showToast("Error reading file stream.", "error");
      setLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  // --- Reset Engine ---
  const handleConfirmReset = async () => {
    const currentActorName = location.state?.userProfile?.name || localStorage.getItem("user_role") || "Admin";
    setShowResetModal(false);
    setLoading(true);
    try {
      const { error } = await supabase
        .from("product_sku_master")
        .delete()
        .neq("id", 0);

      if (error) throw error;

      // ✅ Telemetry tracking for critical table truncation adjustments
      await logTelemetry("RESET_MASTER_DATA", `Product SKU Master list structural points table was reset and wiped entirely by ${currentActorName}.`);

      setTableData([]);
      setTotalCount(0);
      setLastUpdated("Cleared");
      setUpdatedBy("System");
      
      showToast("Data deleted successfully!", "success");
    } catch (err) {
      showToast(`Clear operation failed: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

 const filteredData = tableData.filter((row) => {
  const matchesSearch =
    row.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.group?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.code?.toLowerCase().includes(searchQuery.toLowerCase());

  // Normalize both sides: convert to lowercase and remove all spaces
  const rowGroupNormalized = row.group?.toLowerCase().replace(/\s+/g, '');
  const filterGroupNormalized = groupFilter?.toLowerCase().replace(/\s+/g, '');

  const matchesGroup = groupFilter === "" || rowGroupNormalized === filterGroupNormalized;
  
  return matchesSearch && matchesGroup;
});

  return (
    <div className="page" id="page-master" style={{ position: "relative" }}>
      
      {/* Dynamic Modal Overlay Engine */}
      {showResetModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            animation: "fadeIn 0.2s ease-out"
          }}
        >
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "440px",
              width: "90%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              textAlign: "center",
            }}
          >
            <div 
              style={{ 
                width: "56px", 
                height: "56px", 
                background: "#fef2f2", 
                borderRadius: "50%", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                margin: "0 auto 20px auto" 
              }}
            >
              <span style={{ fontSize: "24px", color: "#ef4444" }}>⚠️</span>
            </div>
            
            <h3 style={{ margin: "0 0 12px 0", fontSize: "18px", fontWeight: "600", color: "#1e293b" }}>
              Are you sure you want to delete the entire data?
            </h3>
            
            <p style={{ margin: "0 0 28px 0", fontSize: "14px", color: "#64748b", lineHeight: "1.6" }}>
              Once deleted, this master architecture dataset <strong style={{ color: "#334155" }}>cannot be retrieved</strong>. All matching calculation indices across the system will be left blank.
            </p>
            
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                style={{ 
                  flex: 1,
                  padding: "11px 16px", 
                  background: "#f1f5f9", 
                  color: "#475569",
                  border: "none", 
                  cursor: "pointer", 
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "500",
                  transition: "background 0.2s"
                }}
                onClick={() => setShowResetModal(false)}
              >
                Cancel
              </button>
              
              <button
                style={{ 
                  flex: 1,
                  padding: "11px 16px", 
                  backgroundColor: "#dc2626", 
                  color: "#ffffff", 
                  border: "none", 
                  cursor: "pointer", 
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "500",
                  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)"
                }}
                onClick={handleConfirmReset}
              >
                Ok, Delete Entire Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden native system file selector */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept=".xlsx, .xls, .csv"
        onChange={handleFileChange}
      />

      {/* Admin-only notice banner */}
      <div
        style={{
          background: "#fdf5e0",
          border: "1px solid #d8c070",
          borderRadius: "10px",
          padding: "12px 18px",
          marginBottom: "18px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span style={{ fontSize: "20px" }}>🔒</span>
        <div style={{ fontSize: "13px", color: "#6a4c00", lineHeight: 1.6, flex: 1 }}>
          <strong>Admin-Controlled Master Data.</strong> The Tier-wise Amount
          Master is uploaded once by admin and locked from all user-level
          editing. The calculation engine uses this master exclusively — no
          manual overrides are possible from the tool.
        </div>
        <div className="dl-strip" style={{ padding: 0, margin: 0 }}>
          <button className="btn-dl btn-dl-primary" onClick={handleExportMasterData}>
            ⬇ Export Master
          </button>
        </div>
      </div>

      {/* Formula callout */}
      <div
        style={{
          background: "#e8f7ef",
          border: "1px solid #a8dcc0",
          borderRadius: "10px",
          padding: "13px 18px",
          marginBottom: "18px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
        }}
      >
        <span style={{ fontSize: "20px" }}>🧮</span>
        <div style={{ fontSize: "13px", color: "#157040", lineHeight: 1.8, flex: 1 }}>
          <strong>Calculation Formula:</strong>&nbsp;
          <strong>Payout = Approved Quantity × Tier Amount (₹/sheet)</strong>&nbsp;·&nbsp; 
          The system picks the exact amount from the architect's tier column for that SKU row. 
          No additional percentage or multiplier is applied.
        </div>
      </div>

      {/* Tier-wise Amount Master card */}
      <div className="card">
        <div className="card-hd" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div className="card-icon">🗄️</div>
            <div>
              <div className="card-title">Tier-wise Amount Master (Point Table 2026–27)</div>
              <div className="card-sub">
                GROUP · CODE · SKU · Size · Price — admin upload only · auto pre-loaded from uploaded file
              </div>
            </div>
          </div>
          <div className="card-hd-right" id="ptmActions">
            <button className="btn btn-gold btn-sm" onClick={handleUploadButtonClick} disabled={loading}>
              {loading ? "Processing Sync..." : "⬆ Upload New Table"}
            </button>
          </div>
        </div>

        {/* Meta strip */}
        <div
          style={{
            padding: "10px 20px",
            background: "var(--bg2)",
            borderBottom: "1px solid var(--border)",
            fontSize: "11px",
            color: "var(--dim)",
            display: "flex",
            gap: "18px",
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <span>SKUs: <strong style={{ color: "var(--white)" }}>{totalCount}</strong></span>
          <span>Last updated: <strong style={{ color: "var(--white)" }}>{lastUpdated}</strong></span>
          <span>By: <strong style={{ color: "var(--white)" }}>{updatedBy}</strong></span>
          <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--gold)" }}>
            Data synchronization active for product master configurations
          </span>

          <button
            onClick={() => setShowResetModal(true)}
            style={{
              background: "none",
              border: "none",
              color: "var(--red)",
              fontSize: "11px",
              fontWeight: "600",
              cursor: "pointer",
              padding: "2px 6px"
            }}
          >
            🗑 Reset Table
          </button>
        </div>

        {/* Filter strip */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            className="inp"
            placeholder="Search SKU or code…"
            style={{ width: "200px", padding: "7px 12px", fontSize: "12px" }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select
            className="sel"
            style={{ width: "140px", fontSize: "12px", padding: "7px 10px" }}
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="">All Groups</option>
            <option value="PLYWOOD">Plywood (PW)</option>
            <option value="BLOCKBOARD">Blockboard (BB)</option>
            <option value="FLUSH DOORS">Flush Doors (FD)</option>
            <option value="DECORATIVE">Decorative</option>
          </select>

          <span style={{ fontSize: "11px", color: "var(--dim)", marginLeft: "8px" }}>
            Showing {filteredData.length} of {totalCount} SKUs
          </span>
        </div>

        {/* Responsive Table Wrapper */}
        <div style={{ padding: "14px 20px" }}>
          <div className="tbl-wrap" style={{ maxHeight: "480px", overflowY: "auto" }}>
            {filteredData.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--dim)" }}>
                {loading ? "Processing operational commands..." : "No data records loaded. Click upload to begin."}
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "10px" }}>#</th>
                    <th style={{ padding: "10px" }}>GROUP</th>
                    <th style={{ padding: "10px" }}>CODE</th>
                    <th style={{ padding: "10px" }}>SKU</th>
                    <th style={{ padding: "10px" }}>SIZE</th>
                    <th style={{ padding: "10px" }}>PRICE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, index) => (
                    <tr key={row.id || index} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px", color: "var(--dim)" }}>{index + 1}</td>
                      <td style={{ padding: "10px" }}>{row.group}</td>
                      <td style={{ padding: "10px" }}>{row.code}</td>
                      <td style={{ padding: "10px" }}><strong>{row.sku}</strong></td>
                      <td style={{ padding: "10px" }}>{row.size || "—"}</td>
                      <td style={{ padding: "10px" }}>₹{row.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ✅ High z-index notification layers */}
      {snackbar.show && (
        <div
          style={{
            position: "fixed",
            top: "100px",
            right: "24px",
            backgroundColor: snackbar.type === "error" ? "#fee2e2" : "#e8f7ef",
            border: snackbar.type === "error" ? "1px solid #fca5a5" : "1px solid #a8dcc0",
            color: snackbar.type === "error" ? "#991b1b" : "#157040",
            padding: "16px 24px",
            borderRadius: "8px",
            boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
            zIndex: 999999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontWeight: "600",
            pointerEvents: "none",
            minWidth: "180px",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: "18px" }}>
            {snackbar.type === "error" ? "❌" : "✅"}
          </span>
          <span>{snackbar.message}</span>
        </div>
      )}

    </div>
  );
};

export default MasterDataPage;