from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import shutil
import os
from processor import process_dxf
import subprocess
import ezdxf
from ezdxf import zoom
import uuid

app = FastAPI(title="SRM University Automated Drawing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)


@app.options("/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str):
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs("exports", exist_ok=True)


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    ext = file.filename.split(".")[-1].lower()
    return {"file_path": file_path, "file_type": ext}


@app.post("/process")
async def process(file: UploadFile = File(...), lpsClass: str = Form("III")):
    contents = await file.read()
    uid = uuid.uuid4().hex[:8]
    file_path = os.path.join(UPLOAD_FOLDER, f"{uid}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(contents)
    result = process_dxf(file_path, lpsClass)
    return result

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/export")
async def export_dwg(data: dict):
    file_path = data.get("file_path")
    lps_class = data.get("lpsClass")

    result = process_dxf(file_path, lps_class)

    doc = ezdxf.new("R2018")
    doc.header['$INSUNITS'] = 4
    msp = doc.modelspace()

    # layers
    doc.layers.add("BUILDING",        color=7)
    doc.layers.add("BOUNDARY",        color=6)
    doc.layers.add("LPS_MESH",        color=1)
    doc.layers.add("DOWN_CONDUCTORS", color=5)
    doc.layers.add("EARTHING_RING",   color=3)
    doc.layers.add("AIR_TERMINALS",   color=6)
    doc.layers.add("EARTH_PITS",      color=2)
    doc.layers.add("LABELS",          color=7)

    # 1. original building lines
    for p1, p2 in result["lines"]:
        msp.add_line(
            (float(p1[0]), float(p1[1])),
            (float(p2[0]), float(p2[1])),
            dxfattribs={"layer": "BUILDING"}
        )

    # 2. labels from original drawing
    for label in result.get("labels", []):
        try:
            msp.add_text(
                label["text"],
                dxfattribs={
                    "layer":  "LABELS",
                    "height": float(label.get("height", 200)),
                    "insert": (float(label["x"]), float(label["y"])),
                }
            )
        except Exception as ex:
            print(f"Label skip: {ex}")

    # 3. LPS for every building
    buildings = result.get("buildings", [])

    if not buildings:
        buildings = [{
            "boundary":      result.get("boundary", []),
            "mesh":          result.get("mesh", []),
            "conductors":    result.get("conductors", []),
            "earthing":      result.get("earthing", []),
            "air_terminals": result.get("air_terminals", []),
            "earth_pits":    result.get("earth_pits", []),
        }]

    for b in buildings:
        boundary = b.get("boundary", [])
        if len(boundary) >= 2:
            pts = [(float(p[0]), float(p[1])) for p in boundary]
            msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "BOUNDARY"})

        for p1, p2 in b.get("mesh", []):
            msp.add_line(
                (float(p1[0]), float(p1[1])),
                (float(p2[0]), float(p2[1])),
                dxfattribs={"layer": "LPS_MESH"}
            )

        for x, y in b.get("conductors", []):
            msp.add_circle(
                (float(x), float(y)), radius=200,
                dxfattribs={"layer": "DOWN_CONDUCTORS"}
            )

        for p1, p2 in b.get("earthing", []):
            msp.add_line(
                (float(p1[0]), float(p1[1])),
                (float(p2[0]), float(p2[1])),
                dxfattribs={"layer": "EARTHING_RING"}
            )

        for x, y in b.get("air_terminals", []):
            msp.add_circle(
                (float(x), float(y)), radius=150,
                dxfattribs={"layer": "AIR_TERMINALS"}
            )

        for x, y in b.get("earth_pits", []):
            msp.add_circle(
                (float(x), float(y)), radius=300,
                dxfattribs={"layer": "EARTH_PITS"}
            )

    # extents
    all_x, all_y = [], []
    for p1, p2 in result["lines"]:
        all_x += [float(p1[0]), float(p2[0])]
        all_y += [float(p1[1]), float(p2[1])]

    if all_x and all_y:
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        doc.header["$EXTMIN"] = (min_x, min_y, 0)
        doc.header["$EXTMAX"] = (max_x, max_y, 0)
        doc.header["$LIMMIN"] = (min_x, min_y)
        doc.header["$LIMMAX"] = (max_x, max_y)

    zoom.extents(msp)

    uid     = uuid.uuid4().hex[:8]
    src_dir = os.path.join(os.path.abspath("exports"), f"src_{uid}")
    dwg_dir = os.path.join(os.path.abspath("exports"), f"dwg_{uid}")
    os.makedirs(src_dir, exist_ok=True)
    os.makedirs(dwg_dir, exist_ok=True)

    dxf_path = os.path.join(src_dir, "lps_output.dxf")
    doc.saveas(dxf_path)
    print("DXF SAVED:", dxf_path, "| EXISTS:", os.path.exists(dxf_path))

    oda_exe = r"C:\Program Files\ODA\ODAFileConverter 27.1.0\ODAFileConverter.exe"
    proc = subprocess.run(
        [oda_exe, src_dir, dwg_dir, "ACAD2018", "DWG", "0", "1"],
        capture_output=True, text=True
    )
    print("ODA stdout:", proc.stdout)
    print("ODA stderr:", proc.stderr)

    dwg_path = os.path.join(dwg_dir, "lps_output.dwg")

    if os.path.exists(dwg_path):
        with open(dwg_path, "rb") as f:
            content = f.read()
        return Response(
            content=content,
            media_type="application/octet-stream",
            headers={"Content-Disposition": "attachment; filename=lps_output.dwg"}
        )
    else:
        with open(dxf_path, "rb") as f:
            content = f.read()
        return Response(
            content=content,
            media_type="application/octet-stream",
            headers={"Content-Disposition": "attachment; filename=lps_output.dxf"}
        )