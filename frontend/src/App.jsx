import { useState } from "react";
import Sidebar from "./Sidebar";
import Canvas from "./Canvas";
import { uploadFile, processFile } from "./api";

export default function App() {
  const [data, setData]               = useState(null);
  const [editData, setEditData]       = useState(null);
  const [meshVisible, setMeshVisible] = useState(true);
  const [status, setStatus]           = useState(null);
  const [filePath, setFilePath]       = useState(null);
  const [lpsClassState, setLpsClassState] = useState("III");

  const [layerVis, setLayerVis] = useState({
    boundary:      true,
    mesh:          true,
    conductors:    true,
    earthing:      true,
    earth_pits:    true,
    air_terminals: true,
    labels:        true,
  });

  const [editMode, setEditMode] = useState(null);
  const [showRollingSphere,   setShowRollingSphere]   = useState(false);
  const [showProtectionAngle, setShowProtectionAngle] = useState(false);
  const [history, setHistory] = useState([]);

  const pushHistory = (buildings) => {
    setHistory(h => [...h.slice(-19), JSON.parse(JSON.stringify(buildings))]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setEditData(d => ({ ...d, buildings: prev }));
  };

  const handleUpload = async (file, lpsClass) => {
    try {
      setStatus("uploading");
      const res = await uploadFile(file);
      setFilePath(res.file_path);
      setLpsClassState(lpsClass);
      setStatus("processing");
      const processed = await processFile(res.file_path, lpsClass);
      setData(processed);
      setEditData(JSON.parse(JSON.stringify(processed)));
      setHistory([]);
      setStatus("done");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <Sidebar
        onUpload={handleUpload}
        data={data}
        editData={editData}
        status={status}
        meshVisible={meshVisible}
        setMeshVisible={setMeshVisible}
        filePath={filePath}
        lpsClass={lpsClassState}
        setLpsClass={setLpsClassState}
        layerVis={layerVis}
        setLayerVis={setLayerVis}
        editMode={editMode}
        setEditMode={setEditMode}
        showRollingSphere={showRollingSphere}
        setShowRollingSphere={setShowRollingSphere}
        showProtectionAngle={showProtectionAngle}
        setShowProtectionAngle={setShowProtectionAngle}
        onUndo={handleUndo}
        canUndo={history.length > 0}
      />
      <div style={{ flex: 1, height: "100vh" }}>
        <Canvas
          data={editData}
          meshVisible={meshVisible}
          layerVis={layerVis}
          editMode={editMode}
          lpsClass={lpsClassState}
          showRollingSphere={showRollingSphere}
          showProtectionAngle={showProtectionAngle}
          onEditChange={(newBuildings) => {
            if (!editData) return;
            pushHistory(editData.buildings);
            setEditData(d => ({ ...d, buildings: newBuildings }));
          }}
        />
      </div>
    </div>
  );
}