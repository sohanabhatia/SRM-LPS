import { useEffect, useRef, useState, useCallback } from "react";

const ROLLING_SPHERE_M     = { I: 20,  II: 30,  III: 45, IV: 60 };
const PROTECTION_ANGLE_DEG = { I: 25,  II: 35,  III: 45, IV: 55 };

export default function Canvas({
  data, meshVisible, layerVis = {}, editMode, lpsClass,
  showRollingSphere, showProtectionAngle, onEditChange,
}) {
  const canvasRef = useRef();
  const stateRef  = useRef({ scale: 1, offsetX: 0, offsetY: 0, minX: 0, minY: 0, H: 0 });

  const [zoom, setZoom]         = useState(1);
  const [pan, setPan]           = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hoverPt, setHoverPt]   = useState(null);
  const [dragPt, setDragPt]     = useState(null);

  const toScreen = useCallback((wx, wy) => {
    const { scale, offsetX, offsetY, minX, minY, H } = stateRef.current;
    return [
      (wx - minX) * scale * zoom + offsetX + pan.x,
      H - ((wy - minY) * scale * zoom + offsetY + pan.y),
    ];
  }, [zoom, pan]);

  const toWorld = useCallback((sx, sy) => {
    const { scale, offsetX, offsetY, minX, minY, H } = stateRef.current;
    return [
      (sx - offsetX - pan.x) / (scale * zoom) + minX,
      (H - sy - offsetY - pan.y) / (scale * zoom) + minY,
    ];
  }, [zoom, pan]);

  const computeBounds = useCallback((d) => {
    if (!d || !d.lines) return null;
    const allX = [], allY = [];
    const pp = (p) => { allX.push(p[0]); allY.push(p[1]); };
    const ps = (s) => { pp(s[0]); pp(s[1]); };
    d.lines.forEach(ps);
    const buildings = d.buildings && d.buildings.length > 0 ? d.buildings : [];
    if (buildings.length > 0) {
      buildings.forEach(b => {
        b.boundary?.forEach(pp);
        b.mesh?.forEach(ps);
        b.earthing?.forEach(ps);
        b.conductors?.forEach(pp);
        b.earth_pits?.forEach(pp);
        b.air_terminals?.forEach(pp);
      });
    } else {
      d.boundary?.forEach(pp);
      d.mesh?.forEach(ps);
      d.earthing?.forEach(ps);
      d.conductors?.forEach(pp);
      d.earth_pits?.forEach(pp);
      d.air_terminals?.forEach(pp);
    }
    d.labels?.forEach(l => { allX.push(l.x); allY.push(l.y); });
    if (allX.length === 0) return null;
    return {
      minX: Math.min(...allX), maxX: Math.max(...allX),
      minY: Math.min(...allY), maxY: Math.max(...allY),
    };
  }, []);

  // ── draw ─────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // CRITICAL: always sync canvas pixel size to its CSS size before drawing
    const cssW = canvas.offsetWidth;
    const cssH = canvas.offsetHeight;
    if (cssW > 0) canvas.width  = cssW;
    if (cssH > 0) canvas.height = cssH;

    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    if (W === 0 || H === 0) return;

    ctx.clearRect(0, 0, W, H);

    // grid
    ctx.save();
    ctx.strokeStyle = "rgba(34,211,238,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    if (!data || !data.lines || data.lines.length === 0) return;

    const bounds = computeBounds(data);
    if (!bounds) return;

    const { minX, maxX, minY, maxY } = bounds;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const baseScale = Math.min(W / rangeX, H / rangeY) * 0.88;
    const offsetX = (W - rangeX * baseScale) / 2;
    const offsetY = (H - rangeY * baseScale) / 2;

    stateRef.current = { scale: baseScale, offsetX, offsetY, minX, minY, H };

    const sx = (wx) => (wx - minX) * baseScale * zoom + offsetX + pan.x;
    const sy = (wy) => H - ((wy - minY) * baseScale * zoom + offsetY + pan.y);

    // building lines — white
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;
    data.lines.forEach(([p1, p2]) => {
      ctx.beginPath();
      ctx.moveTo(sx(p1[0]), sy(p1[1]));
      ctx.lineTo(sx(p2[0]), sy(p2[1]));
      ctx.stroke();
    });

    const buildings = data.buildings && data.buildings.length > 0
      ? data.buildings
      : [{
          boundary:      data.boundary,
          mesh:          data.mesh,
          earthing:      data.earthing,
          conductors:    data.conductors,
          earth_pits:    data.earth_pits,
          air_terminals: data.air_terminals,
        }];

    buildings.forEach((b, bIdx) => {

      // boundary — grey dashed
      if (layerVis.boundary !== false && b.boundary && b.boundary.length > 0) {
        ctx.strokeStyle = editMode === "boundary" ? "#22d3ee" : "#6b7280";
        ctx.lineWidth = editMode === "boundary" ? 2 : 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        b.boundary.forEach((p, i) => {
          if (i === 0) ctx.moveTo(sx(p[0]), sy(p[1]));
          else ctx.lineTo(sx(p[0]), sy(p[1]));
        });
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        if (editMode === "boundary") {
          b.boundary.forEach((p, pIdx) => {
            const isHov = hoverPt?.bIdx === bIdx && hoverPt?.type === "boundary" && hoverPt?.pIdx === pIdx;
            ctx.fillStyle = isHov ? "#22d3ee" : "rgba(34,211,238,0.5)";
            ctx.fillRect(sx(p[0]) - 5, sy(p[1]) - 5, 10, 10);
          });
        }
      }

      // mesh — respects BOTH meshVisible AND layer toggle
      if (meshVisible && layerVis.mesh !== false && b.mesh && b.mesh.length > 0) {
        ctx.strokeStyle = "#FF4D00";
        ctx.lineWidth = 1;
        b.mesh.forEach(([p1, p2]) => {
          ctx.beginPath();
          ctx.moveTo(sx(p1[0]), sy(p1[1]));
          ctx.lineTo(sx(p2[0]), sy(p2[1]));
          ctx.stroke();
        });
      }

      // earthing ring — green
      if (layerVis.earthing !== false && b.earthing && b.earthing.length > 0) {
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 3;
        b.earthing.forEach(([p1, p2]) => {
          ctx.beginPath();
          ctx.moveTo(sx(p1[0]), sy(p1[1]));
          ctx.lineTo(sx(p2[0]), sy(p2[1]));
          ctx.stroke();
        });
      }

      // down conductors — blue dots
      if (layerVis.conductors !== false && b.conductors && b.conductors.length > 0) {
        b.conductors.forEach(([x, y], pIdx) => {
          const isHov = hoverPt?.bIdx === bIdx && hoverPt?.type === "conductors" && hoverPt?.pIdx === pIdx;
          const r = isHov ? 8 : 4;
          ctx.fillStyle = editMode === "delete" && isHov ? "#ef4444" : "#3B82F6";
          ctx.beginPath();
          ctx.arc(sx(x), sy(y), r, 0, Math.PI * 2);
          ctx.fill();
          if (isHov && editMode === "select") {
            ctx.strokeStyle = "#93c5fd";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });
      }

      // earth pits — yellow squares
      if (layerVis.earth_pits !== false && b.earth_pits && b.earth_pits.length > 0) {
        ctx.fillStyle = "#eab308";
        b.earth_pits.forEach(([x, y]) => {
          ctx.fillRect(sx(x) - 3, sy(y) - 3, 6, 6);
        });
      }

      // air terminals — magenta triangles
      if (layerVis.air_terminals !== false && b.air_terminals && b.air_terminals.length > 0) {
        b.air_terminals.forEach(([x, y], pIdx) => {
          const isHov = hoverPt?.bIdx === bIdx && hoverPt?.type === "air_terminals" && hoverPt?.pIdx === pIdx;
          const size = isHov ? 9 : 6;
          const cx2 = sx(x);
          const cy2 = sy(y);
          ctx.fillStyle = editMode === "delete" && isHov ? "#ef4444" : "#ff00ff";
          ctx.beginPath();
          ctx.moveTo(cx2, cy2 - size);
          ctx.lineTo(cx2 - size, cy2 + size);
          ctx.lineTo(cx2 + size, cy2 + size);
          ctx.closePath();
          ctx.fill();
        });

        // rolling sphere
        if (showRollingSphere) {
          const R_screen = (ROLLING_SPHERE_M[lpsClass] || 45) * 1000 * baseScale * zoom;
          ctx.save();
          ctx.strokeStyle = "rgba(6,182,212,0.35)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          b.air_terminals.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(sx(x), sy(y), R_screen, 0, Math.PI * 2);
            ctx.stroke();
          });
          ctx.setLineDash([]);
          ctx.restore();
        }

        // protection angle
        if (showProtectionAngle) {
          const angleDeg = PROTECTION_ANGLE_DEG[lpsClass] || 45;
          const coneR_screen = 2000 * Math.tan((angleDeg * Math.PI) / 180) * baseScale * zoom;
          ctx.save();
          ctx.fillStyle = "rgba(168,85,247,0.08)";
          ctx.strokeStyle = "rgba(168,85,247,0.4)";
          ctx.lineWidth = 1;
          b.air_terminals.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(sx(x), sy(y), coneR_screen, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
          ctx.restore();
        }
      }
    });

    // labels
    if (layerVis.labels !== false && data.labels && data.labels.length > 0) {
      data.labels.forEach((label) => {
        const fontSize = Math.min(20, Math.max(9, label.height * baseScale * zoom * 0.8));
        ctx.save();
        ctx.font = `${fontSize}px monospace`;
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 4;
        ctx.fillText(label.text, sx(label.x), sy(label.y));
        ctx.restore();
      });
    }

  }, [data, meshVisible, layerVis, editMode, zoom, pan, hoverPt,
      showRollingSphere, showProtectionAngle, lpsClass, computeBounds]);

  // ── resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const wheelHandler = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      setZoom(z => Math.min(Math.max(z * factor, 0.1), 30));
    };
    canvas.addEventListener("wheel", wheelHandler, { passive: false });

    return () => {
      ro.disconnect();
      canvas.removeEventListener("wheel", wheelHandler);
    };
  }, [draw]);

  // ── redraw when data/zoom/pan/hover changes ───────────────────────────────
  useEffect(() => {
    draw();
  }, [draw, zoom, pan, hoverPt]);

  // ── CRITICAL: force redraw when data arrives ──────────────────────────────
  useEffect(() => {
    if (!data) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // force sync pixel size then draw
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    draw();
  }, [data]);

  // ── mouse handlers ────────────────────────────────────────────────────────
  const getCanvasXY = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const getBuildingsCopy = () => JSON.parse(JSON.stringify(
    data.buildings && data.buildings.length > 0
      ? data.buildings
      : [{ boundary: data.boundary, conductors: data.conductors,
           air_terminals: data.air_terminals, mesh: data.mesh,
           earthing: data.earthing, earth_pits: data.earth_pits }]
  ));

  const handleMouseMove = (e) => {
    const [cx, cy] = getCanvasXY(e);
    if (dragPt) {
      const [wx, wy] = toWorld(cx, cy);
      const nb = getBuildingsCopy();
      const b = nb[dragPt.bIdx];
      if (dragPt.type === "boundary") b.boundary[dragPt.pIdx] = [wx, wy];
      else b[dragPt.type][dragPt.pIdx] = [wx, wy];
      onEditChange(nb);
      return;
    }
    if (dragging && !editMode) {
      setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
      return;
    }
    if (editMode) setHoverPt(findNearestPoint(cx, cy));
  };

  const findNearestPoint = useCallback((canvasX, canvasY, radius = 14) => {
    if (!data) return null;
    const buildings = data.buildings && data.buildings.length > 0
      ? data.buildings
      : [{ boundary: data.boundary, conductors: data.conductors, air_terminals: data.air_terminals }];
    let best = null, bestDist = radius;
    buildings.forEach((b, bIdx) => {
      const types = editMode === "boundary"
        ? [["boundary", b.boundary || []]]
        : [["conductors", b.conductors || []], ["air_terminals", b.air_terminals || []]];
      types.forEach(([type, pts]) => {
        pts.forEach((pt, pIdx) => {
          const [sx2, sy2] = toScreen(pt[0], pt[1]);
          const dist = Math.hypot(canvasX - sx2, canvasY - sy2);
          if (dist < bestDist) { bestDist = dist; best = { bIdx, type, pIdx }; }
        });
      });
    });
    return best;
  }, [data, editMode, toScreen]);

  const handleMouseDown = (e) => {
    const [cx, cy] = getCanvasXY(e);
    if (!editMode) { setDragging(true); return; }
    if (editMode === "select" || editMode === "boundary") {
      const found = findNearestPoint(cx, cy);
      if (found) setDragPt(found);
      return;
    }
    if (editMode === "delete") {
      const found = findNearestPoint(cx, cy);
      if (!found) return;
      const nb = getBuildingsCopy();
      nb[found.bIdx][found.type].splice(found.pIdx, 1);
      onEditChange(nb);
      setHoverPt(null);
      return;
    }
    if (editMode === "add_conductor" || editMode === "add_terminal") {
      const [wx, wy] = toWorld(cx, cy);
      const field = editMode === "add_conductor" ? "conductors" : "air_terminals";
      const nb = getBuildingsCopy();
      nb[0][field].push([wx, wy]);
      onEditChange(nb);
    }
  };

  const handleMouseUp = () => { setDragPt(null); setDragging(false); };
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return (
    <div style={{ flex: 1, position: "relative", background: "#050a14", width: "100%", height: "100vh" }}>

      {/* Zoom panel */}
      <div style={{
        position: "absolute", top: 16, right: 16, zIndex: 20,
        background: "rgba(7,13,26,0.92)",
        border: "1px solid rgba(34,211,238,0.2)",
        borderRadius: 10, padding: "8px 10px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        userSelect: "none",
      }}>
        <ZoomBtn label="+" onClick={() => setZoom(z => Math.min(z * 1.25, 30))} />
        <span style={{ color: "#22d3ee", fontSize: 11, fontFamily: "monospace", minWidth: 38, textAlign: "center" }}>
          {Math.round(zoom * 100)}%
        </span>
        <ZoomBtn label="−" onClick={() => setZoom(z => Math.max(z * 0.8, 0.1))} />
        <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 0" }} />
        <ZoomBtn label="⊡" onClick={resetView} title="Fit to screen" />
      </div>

      {/* Edit mode indicator */}
      {editMode && (
        <div style={{
          position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 20, background: "rgba(34,211,238,0.12)",
          border: "1px solid rgba(34,211,238,0.3)",
          borderRadius: 20, padding: "5px 16px",
          color: "#22d3ee", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
        }}>
          {editMode === "select"        && "✥ Select / drag points"}
          {editMode === "add_conductor" && "+ Click to place Down Conductor"}
          {editMode === "add_terminal"  && "+ Click to place Air Terminal"}
          {editMode === "delete"        && "✕ Click point to delete"}
          {editMode === "boundary"      && "⬡ Drag boundary vertices"}
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "100%", zIndex: 10,
          cursor: editMode === "delete" ? "crosshair"
                : editMode ? "default"
                : dragging ? "grabbing" : "grab",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}

function ZoomBtn({ label, onClick, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 28, height: 28,
      background: "rgba(34,211,238,0.08)",
      border: "1px solid rgba(34,211,238,0.2)",
      borderRadius: 6, color: "#22d3ee",
      fontSize: 16, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, lineHeight: 1,
    }}>
      {label}
    </button>
  );
}