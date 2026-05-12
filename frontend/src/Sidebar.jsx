import { useRef, useState } from "react";
import { exportDwg } from "./api";

export default function Sidebar({
  onUpload, data, editData, status,
  meshVisible, setMeshVisible,
  filePath, lpsClass, setLpsClass,
  layerVis, setLayerVis,
  editMode, setEditMode,
  showRollingSphere, setShowRollingSphere,
  showProtectionAngle, setShowProtectionAngle,
  onUndo, canUndo,
}) {
  const inputRef = useRef();
  const [fileName, setFileName] = useState(null);
  const [fileObj, setFileObj]   = useState(null);
  const [dropping, setDropping] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".dxf") && !name.endsWith(".dwg")) {
      alert("Please upload a DWG or DXF file");
      return;
    }
    setFileName(file.name);
    setFileObj(file);
  };

  const toggleLayer = (key) =>
    setLayerVis(v => ({ ...v, [key]: !v[key] }));

  const handleExport = async () => {
    if (!filePath) return alert("Generate LPS first");
    try {
      setExporting(true);
      const blob = await exportDwg(filePath, lpsClass);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lps_output.dwg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Export failed: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  const layerDefs = [
    { key: "boundary",      label: "Boundary",        color: "#6b7280" },
    { key: "mesh",          label: "Roof Mesh",        color: "#FF4D00" },
    { key: "conductors",    label: "Down Conductors",  color: "#3B82F6" },
    { key: "earthing",      label: "Earthing Ring",    color: "#16a34a" },
    { key: "earth_pits",    label: "Earth Pits",       color: "#eab308" },
    { key: "air_terminals", label: "Air Terminals",    color: "#ff00ff" },
    { key: "labels",        label: "Labels",           color: "#ffffff" },
  ];

  const editModes = [
    { key: "select",        label: "✥ Select / Move" },
    { key: "add_conductor", label: "+ Conductor" },
    { key: "add_terminal",  label: "+ Terminal" },
    { key: "delete",        label: "✕ Delete" },
    { key: "boundary",      label: "⬡ Edit Boundary" },
  ];

  const btn = (style = {}) => ({
    width: "100%",
    padding: "8px",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "600",
    transition: "all 0.2s",
    ...style,
  });

  const sectionTitle = (text) => (
    <p style={{
      fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
      color: "rgba(34,211,238,0.6)", margin: "0 0 6px 0", fontWeight: 700,
    }}>{text}</p>
  );

  return (
    <div style={{
      width: "280px", minWidth: "280px",
      background: "#070d1a",
      borderRight: "1px solid rgba(34,211,238,0.12)",
      display: "flex", flexDirection: "column", height: "100vh",
    }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid rgba(34,211,238,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, background: "#22d3ee", borderRadius: 2 }} />
          <span style={{ color: "#22d3ee", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase" }}>
            SRM University
          </span>
        </div>
        <h1 style={{ color: "white", fontWeight: 700, fontSize: 17, margin: 0, lineHeight: 1.3 }}>
          Automated<br />Drawing
        </h1>
      </div>

      {/* Scrollable body */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "16px 20px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>

        {/* Upload */}
        <div
          onClick={() => inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => { e.preventDefault(); setDropping(false); handleFile(e.dataTransfer.files[0]); }}
          style={{
            border: `2px dashed ${dropping ? "#22d3ee" : "rgba(34,211,238,0.2)"}`,
            borderRadius: 8, padding: "24px 16px",
            textAlign: "center", cursor: "pointer",
          }}
        >
          <input ref={inputRef} type="file" accept=".dwg,.dxf" style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files[0])} />
          {fileName
            ? <p style={{ color: "#22d3ee", fontSize: 12, margin: 0 }}>{fileName}</p>
            : <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>Upload DWG / DXF</p>
          }
        </div>

        {/* LPS Class */}
        <div>
          {sectionTitle("LPS Class")}
          <select
            value={lpsClass}
            onChange={(e) => setLpsClass(e.target.value)}
            style={{
              width: "100%", padding: "7px 10px",
              background: "#0d1a2e", color: "white",
              border: "1px solid rgba(34,211,238,0.25)", borderRadius: 6,
              fontSize: 12, cursor: "pointer", outline: "none",
            }}
          >
            <option value="I">Class I</option>
            <option value="II">Class II</option>
            <option value="III">Class III</option>
            <option value="IV">Class IV</option>
          </select>
        </div>

        {/* Generate */}
        <button
          onClick={() => { if (!fileObj) return alert("Upload a file first"); onUpload(fileObj, lpsClass); }}
          style={btn({
            background: "#22d3ee", color: "#001018",
            border: "none", fontSize: 13, padding: "10px",
          })}
        >
          {status === "uploading"   ? "⏳ Uploading…"
         : status === "processing" ? "⚙️ Processing…"
         : "⚡ Generate LPS"}
        </button>

        {/* Status */}
        {status === "error" && (
          <p style={{ color: "#ef4444", fontSize: 12, margin: 0, textAlign: "center" }}>
            ❌ Error — check file and try again
          </p>
        )}
        {status === "done" && (
          <p style={{ color: "#22d3ee", fontSize: 12, margin: 0, textAlign: "center" }}>
            ✅ LPS Generated
          </p>
        )}

        <div style={{ height: 1, background: "rgba(34,211,238,0.1)" }} />

        {/* Mesh Toggle */}
        <div>
          {sectionTitle("Mesh")}
          <button
            onClick={() => setMeshVisible(v => !v)}
            style={btn({
              background: meshVisible ? "rgba(255,77,0,0.15)" : "rgba(255,255,255,0.05)",
              color: meshVisible ? "#FF4D00" : "rgba(255,255,255,0.4)",
              border: `1px solid ${meshVisible ? "rgba(255,77,0,0.4)" : "rgba(255,255,255,0.1)"}`,
            })}
          >
            {meshVisible ? "⬛ Mesh: Visible" : "☐ Mesh: Hidden"}
          </button>
        </div>

        {/* Layer Visibility */}
        <div>
          {sectionTitle("Layers")}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {layerDefs.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => toggleLayer(key)}
                style={btn({
                  display: "flex", alignItems: "center", gap: 8,
                  background: layerVis[key] !== false
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.02)",
                  color: layerVis[key] !== false
                    ? "rgba(255,255,255,0.85)"
                    : "rgba(255,255,255,0.3)",
                  textAlign: "left",
                })}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                  background: layerVis[key] !== false ? color : "rgba(255,255,255,0.15)",
                }} />
                {label}
                <span style={{ marginLeft: "auto", fontSize: 10 }}>
                  {layerVis[key] !== false ? "●" : "○"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Visualisation Overlays */}
        <div>
          {sectionTitle("Visualisation")}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <button
              onClick={() => setShowRollingSphere(v => !v)}
              style={btn({
                background: showRollingSphere ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.04)",
                color: showRollingSphere ? "#06b6d4" : "rgba(255,255,255,0.5)",
                border: `1px solid ${showRollingSphere ? "rgba(6,182,212,0.4)" : "rgba(255,255,255,0.1)"}`,
              })}
            >
              ○ Rolling Sphere
            </button>
            <button
              onClick={() => setShowProtectionAngle(v => !v)}
              style={btn({
                background: showProtectionAngle ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)",
                color: showProtectionAngle ? "#a855f7" : "rgba(255,255,255,0.5)",
                border: `1px solid ${showProtectionAngle ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.1)"}`,
              })}
            >
              △ Protection Angle
            </button>
          </div>
        </div>

        {/* Edit Tools */}
        <div>
          {sectionTitle("Edit Tools")}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {editModes.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setEditMode(editMode === key ? null : key)}
                style={btn({
                  background: editMode === key ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.04)",
                  color: editMode === key ? "#22d3ee" : "rgba(255,255,255,0.6)",
                  border: `1px solid ${editMode === key ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.1)"}`,
                  textAlign: "left",
                })}
              >
                {label}
              </button>
            ))}
            <button
              onClick={onUndo}
              disabled={!canUndo}
              style={btn({
                background: "rgba(255,255,255,0.03)",
                color: canUndo ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)",
                cursor: canUndo ? "pointer" : "not-allowed",
              })}
            >
              ↩ Undo
            </button>
          </div>
        </div>

        <div style={{ height: 1, background: "rgba(34,211,238,0.1)" }} />

        {/* Download DWG */}
        <button
          onClick={handleExport}
          disabled={!filePath || !editData || exporting}
          style={btn({
            background: filePath && editData && !exporting
              ? "rgba(34,211,238,0.1)"
              : "rgba(255,255,255,0.03)",
            color: filePath && editData && !exporting
              ? "#22d3ee"
              : "rgba(255,255,255,0.25)",
            border: `1px solid ${filePath && editData && !exporting
              ? "rgba(34,211,238,0.35)"
              : "rgba(255,255,255,0.08)"}`,
            cursor: filePath && editData && !exporting ? "pointer" : "not-allowed",
            fontSize: 13, padding: "10px",
          })}
        >
          {exporting ? "⏳ Exporting…" : "⬇ Download DWG"}
        </button>

        {/* Legend */}
        <div style={{ borderTop: "1px solid rgba(34,211,238,0.1)", paddingTop: 12 }}>
          {sectionTitle("Legend")}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[
              { color: "#6b7280", label: "Boundary",      shape: "line"   },
              { color: "#FF4D00", label: "Roof Mesh",      shape: "line"   },
              { color: "#3B82F6", label: "Down Conductor", shape: "dot"    },
              { color: "#16a34a", label: "Earthing Ring",  shape: "line"   },
              { color: "#eab308", label: "Earth Pit",      shape: "square" },
              { color: "#ff00ff", label: "Air Terminal",   shape: "tri"    },
            ].map(({ color, label, shape }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {shape === "line"   && <div style={{ width: 16, height: 2, background: color, borderRadius: 1, flexShrink: 0 }} />}
                {shape === "dot"    && <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />}
                {shape === "square" && <div style={{ width: 8, height: 8, background: color, flexShrink: 0 }} />}
                {shape === "tri"    && (
                  <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
                    <polygon points="5,0 0,10 10,10" fill={color} />
                  </svg>
                )}
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}