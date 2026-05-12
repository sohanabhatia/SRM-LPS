import ezdxf
from shapely.geometry import Polygon


def convert_dwg_to_dxf(input_path):
    import subprocess
    import os

    oda_exe = r"C:\Program Files\ODA\ODAFileConverter 27.1.0\ODAFileConverter.exe"
    input_folder = os.path.dirname(input_path)
    output_folder = os.path.join(input_folder, "converted")
    os.makedirs(output_folder, exist_ok=True)

    subprocess.run([oda_exe, input_folder, output_folder, "ACAD2018", "DXF", "0", "1"])

    filename = os.path.basename(input_path)
    name = os.path.splitext(filename)[0]
    return os.path.join(output_folder, name + ".dxf")


def extract_lines(doc):
    closed_polylines = []
    msp = doc.modelspace()
    lines = []

    for e in msp:
        if e.dxftype() == "LINE":
            start = e.dxf.start
            end = e.dxf.end
            lines.append(((start.x, start.y), (end.x, end.y)))

        elif e.dxftype() in ["LWPOLYLINE", "POLYLINE"]:
            if e.dxftype() == "LWPOLYLINE":
                points = [(p[0], p[1]) for p in e]
                is_closed = e.closed
            else:
                points = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices()]
                is_closed = e.is_closed

            if is_closed:
                closed_polylines.append(points)
                for i in range(len(points)):
                    p1 = points[i]
                    p2 = points[(i + 1) % len(points)]
                    lines.append((p1, p2))

    return lines, closed_polylines


def extract_labels(doc):
    msp = doc.modelspace()
    labels = []
    MIN_HEIGHT = 300  # filter out tiny annotation text below this height in mm

    for e in msp:
        try:
            if e.dxftype() == "TEXT":
                height = e.dxf.get("height", 0)
                if height < MIN_HEIGHT:
                    continue
                text = e.dxf.text.strip()
                if not text:
                    continue
                labels.append({
                    "x": e.dxf.insert.x,
                    "y": e.dxf.insert.y,
                    "text": text,
                    "height": height
                })

            elif e.dxftype() == "MTEXT":
                height = e.dxf.get("char_height", 0)
                if height < MIN_HEIGHT:
                    continue
                raw = e.plain_mtext().strip()
                if not raw:
                    continue
                labels.append({
                    "x": e.dxf.insert.x,
                    "y": e.dxf.insert.y,
                    "text": raw,
                    "height": height
                })
        except Exception:
            continue

    print(f"LABELS FOUND: {len(labels)}")
    return labels


def detect_real_boundary(lines):
    from shapely.geometry import LineString, MultiPoint
    from shapely.ops import unary_union, polygonize
    import math

    if not lines:
        return []

    points = [p for line in lines for p in line]
    if not points:
        return []

    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)

    min_x = min(p[0] for p in points)
    max_x = max(p[0] for p in points)
    min_y = min(p[1] for p in points)
    max_y = max(p[1] for p in points)
    max_dim = max(max_x - min_x, max_y - min_y)

    filtered = []
    for p1, p2 in lines:
        mx = (p1[0] + p2[0]) / 2
        my = (p1[1] + p2[1]) / 2
        if math.hypot(mx - cx, my - cy) < 0.6 * max_dim:
            filtered.append((p1, p2))

    if not filtered:
        filtered = lines

    shapely_lines = [LineString([p1, p2]) for p1, p2 in filtered]
    merged = unary_union(shapely_lines)
    polygons = list(polygonize(merged))

    xs = [p[0] for l in filtered for p in l]
    ys = [p[1] for l in filtered for p in l]
    total_w = max(xs) - min(xs)
    total_h = max(ys) - min(ys)

    valid = []
    for poly in polygons:
        bx, by, Bx, By = poly.bounds
        if (Bx - bx) > 0.6 * total_w and (By - by) > 0.6 * total_h:
            valid.append(poly)

    if valid:
        return list(max(valid, key=lambda p: p.area).exterior.coords)

    pts = [p for line in lines for p in line]
    if pts:
        return list(MultiPoint(pts).convex_hull.exterior.coords)
    return []


def detect_all_buildings(closed_polylines, min_area=500000):
    """
    Find all outer building boundaries.
    Keeps only the outermost polygon per cluster.
    Discards anything fully contained inside a larger polygon.
    min_area=500000 means minimum 0.5 sqm footprint in mm units.
    """
    if not closed_polylines:
        return []

    def safe_area(pts):
        try:
            return Polygon(pts).area
        except Exception:
            return 0

    # filter by minimum area
    candidates = []
    for pts in closed_polylines:
        area = safe_area(pts)
        if area >= min_area:
            candidates.append((pts, area))

    if not candidates:
        return []

    # sort largest first
    candidates.sort(key=lambda x: -x[1])

    # build shapely objects
    shapely_polys = []
    for pts, area in candidates:
        try:
            shapely_polys.append((pts, area, Polygon(pts)))
        except Exception:
            continue

    # keep only outermost — discard any polygon whose centroid
    # sits inside a larger polygon (inner rooms, inner structures)
    buildings = []
    for i, (pts, area, spoly) in enumerate(shapely_polys):
        is_inside = False
        for j, (_, other_area, other_poly) in enumerate(shapely_polys):
            if i == j:
                continue
            try:
                if other_area > area and other_poly.contains(spoly.centroid):
                    is_inside = True
                    break
            except Exception:
                continue
        if not is_inside:
            buildings.append(pts)

    print(f"BUILDINGS DETECTED: {len(buildings)}")
    return buildings


def generate_down_conductors(boundary, spacing=10000):
    import math

    if not boundary or len(boundary) < 2:
        return []

    edges = []
    total_length = 0
    for i in range(len(boundary)):
        p1 = boundary[i]
        p2 = boundary[(i + 1) % len(boundary)]
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        length = math.hypot(dx, dy)
        edges.append((p1, p2, length))
        total_length += length

    count = max(1, int(total_length // spacing))
    step = total_length / count

    conductors = []
    dist_accum = 0
    target = 0
    edge_index = 0

    while target <= total_length:
        while edge_index < len(edges) and dist_accum + edges[edge_index][2] < target:
            dist_accum += edges[edge_index][2]
            edge_index += 1
        if edge_index >= len(edges):
            break
        p1, p2, length = edges[edge_index]
        remaining = target - dist_accum
        t = remaining / length if length != 0 else 0
        conductors.append((p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])))
        target += step

    return conductors


def generate_mesh(boundary, spacing=10000):
    from shapely.geometry import LineString, Polygon

    if not boundary:
        return []

    poly = Polygon(boundary)
    min_x, min_y, max_x, max_y = poly.bounds
    mesh_lines = []

    x = min_x
    while x <= max_x:
        line = LineString([(x, min_y), (x, max_y)])
        clipped = line.intersection(poly)
        if not clipped.is_empty:
            if clipped.geom_type == "MultiLineString":
                for seg in clipped.geoms:
                    mesh_lines.append((seg.coords[0], seg.coords[-1]))
            else:
                mesh_lines.append((clipped.coords[0], clipped.coords[-1]))
        x += spacing

    y = min_y
    while y <= max_y:
        line = LineString([(min_x, y), (max_x, y)])
        clipped = line.intersection(poly)
        if not clipped.is_empty:
            if clipped.geom_type == "MultiLineString":
                for seg in clipped.geoms:
                    mesh_lines.append((seg.coords[0], seg.coords[-1]))
            else:
                mesh_lines.append((clipped.coords[0], clipped.coords[-1]))
        y += spacing

    return mesh_lines


def generate_earthing_ring(boundary):
    from shapely.geometry import Polygon

    if not boundary or len(boundary) < 3:
        return []

    poly = Polygon(boundary)
    ring = poly.buffer(800)

    if ring.geom_type == "Polygon":
        coords = list(ring.exterior.coords)
        return [(coords[i], coords[i + 1]) for i in range(len(coords) - 1)]
    return []


def generate_earth_pits(earthing, spacing):
    import math

    if not earthing:
        return []

    total_length = sum(math.hypot(p2[0]-p1[0], p2[1]-p1[1]) for p1, p2 in earthing)
    if total_length == 0:
        return []

    count = max(1, int(total_length // spacing))
    step = total_length / count

    pits = []
    dist_accum = 0.0
    target = 0.0
    seg_index = 0

    while target <= total_length + 1e-6:
        while seg_index < len(earthing):
            p1, p2 = earthing[seg_index]
            seg_len = math.hypot(p2[0]-p1[0], p2[1]-p1[1])
            if dist_accum + seg_len >= target:
                break
            dist_accum += seg_len
            seg_index += 1

        if seg_index >= len(earthing):
            break

        p1, p2 = earthing[seg_index]
        seg_len = math.hypot(p2[0]-p1[0], p2[1]-p1[1])
        t = max(0.0, min(1.0, (target - dist_accum) / seg_len if seg_len > 0 else 0))
        pits.append((p1[0] + t*(p2[0]-p1[0]), p1[1] + t*(p2[1]-p1[1])))
        target += step

    return pits


ROLLING_SPHERE_RADIUS = {"I": 20, "II": 30, "III": 45, "IV": 60}


def calculate_spacing(lps_class, rod_height):
    import math
    r = ROLLING_SPHERE_RADIUS.get(lps_class, 45)
    d = 2 * math.sqrt((2 * r * rod_height) - (rod_height ** 2))
    return d * 1000


def generate_air_terminals(boundary, lps_class, rod_height=2):
    import math

    spacing = calculate_spacing(lps_class, rod_height)
    terminals = []

    for i in range(len(boundary)):
        p1 = boundary[i]
        p2 = boundary[(i + 1) % len(boundary)]
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        length = math.hypot(dx, dy)
        count = max(1, int(length // spacing))
        for j in range(count + 1):
            t = j / count if count else 0
            terminals.append((p1[0] + t*dx, p1[1] + t*dy))

    return terminals


def process_building(boundary, lps_class, c_spacing, m_spacing, p_spacing):
    conductors    = generate_down_conductors(boundary, c_spacing)
    mesh          = generate_mesh(boundary, m_spacing)
    earthing      = generate_earthing_ring(boundary)
    air_terminals = generate_air_terminals(boundary, lps_class, rod_height=2)
    earth_pits    = generate_earth_pits(earthing, p_spacing)
    return {
        "boundary":      boundary,
        "conductors":    conductors,
        "mesh":          mesh,
        "earthing":      earthing,
        "air_terminals": air_terminals,
        "earth_pits":    earth_pits,
    }


def process_dxf(file_path, lps_class=None):
    print("PROCESS STARTED")

    if file_path.lower().endswith(".dwg"):
        file_path = convert_dwg_to_dxf(file_path)

    doc = ezdxf.readfile(file_path)

    insunits = doc.header.get("$INSUNITS", 4)
    UNIT_TO_MM = {0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 1000, 6: 10}
    mm_per_unit = UNIT_TO_MM.get(insunits, 1)

    lines, closed_polylines = extract_lines(doc)
    labels = extract_labels(doc)

    CONDUCTOR_SPACING = {"I": 10000, "II": 10000, "III": 15000, "IV": 20000}
    MESH_SPACING      = {"I": 5000,  "II": 10000, "III": 15000, "IV": 20000}
    PIT_SPACING       = {"I": 10000, "II": 12000, "III": 15000, "IV": 20000}

    c_spacing = CONDUCTOR_SPACING.get(lps_class, 15000)
    m_spacing = MESH_SPACING.get(lps_class, 15000)
    p_spacing = PIT_SPACING.get(lps_class, 15000)

    if closed_polylines:
        buildings = detect_all_buildings(closed_polylines)
    else:
        boundary = detect_real_boundary(lines)
        buildings = [boundary] if boundary else []

    if not buildings:
        print("NO BUILDINGS FOUND")
        return {
            "lines": lines, "labels": labels, "buildings": [],
            "boundary": [], "conductors": [], "mesh": [],
            "earthing": [], "earth_pits": [], "air_terminals": [],
            "mm_per_unit": mm_per_unit, "insunits": insunits,
        }

    processed_buildings = [
        process_building(b, lps_class, c_spacing, m_spacing, p_spacing)
        for b in buildings
    ]

    print(f"BUILDINGS PROCESSED: {len(processed_buildings)}")
    first = processed_buildings[0]
    print("PROCESS FINISHED")

    return {
        "lines":         lines,
        "labels":        labels,
        "buildings":     processed_buildings,
        "boundary":      first["boundary"],
        "conductors":    first["conductors"],
        "mesh":          first["mesh"],
        "earthing":      first["earthing"],
        "earth_pits":    first["earth_pits"],
        "air_terminals": first["air_terminals"],
        "mm_per_unit":   mm_per_unit,
        "insunits":      insunits,
    }
