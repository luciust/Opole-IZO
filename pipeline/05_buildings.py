"""
Parse GUGiK LoD2 CityGML files (1661 Miasto Opole + 1609 Powiat Opolski)
and merge with fresh OSM buildings (fallback for new post-2018 constructions & gaps).
Excludes hand-modelled landmarks at their true OSM/EPSG:2180 coordinates.
Outputs data/build/buildings_by_tile.pkl
"""

import os
import sys
import glob
import re
import pickle
import numpy as np

sys.path.append(os.path.dirname(__file__))
from config import X0, X1, Y0, Y1, ORIGIN_E, ORIGIN_N, HEIGHT_OFFSET, TILE_SIZE, NUM_TILES_X, NUM_TILES_Y

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
LOD2_DIRS = [
    os.path.join(RAW_DIR, "lod2_1661", "Modele_3D"),
    os.path.join(RAW_DIR, "lod2_1609", "Modele_3D"),
]
BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "build")
OSM_PKL = os.path.join(BUILD_DIR, "osm.pkl")
DTM_IN = os.path.join(BUILD_DIR, "graded_dtm.npy")
OUT_BLDG_PKL = os.path.join(BUILD_DIR, "buildings_by_tile.pkl")

# Verified scene-coord bounding boxes of hand-modelled landmarks (EPSG:2180 minus ORIGIN_E/N)
LANDMARK_BOXES = [
    # Ratusz on Rynek (-87.9, -195.2)
    {"name": "Ratusz", "min_x": -120, "max_x": -55, "min_z": -238, "max_z": -155},
    # Wieża Piastowska (-300, -62) & Amfiteatr Tysiąclecia (~ -365, -95)
    {"name": "Wieza_Amfiteatr", "min_x": -425, "max_x": -280, "min_z": -145, "max_z": -35},
    # Katedra pw. Podwyższenia Krzyża Świętego (-234.2, -390.2)
    {"name": "Katedra", "min_x": -275, "max_x": -190, "min_z": -425, "max_z": -355},
    # Dworzec Główny PKP (199.2, 562.6)
    {"name": "Dworzec_Glowny", "min_x": 145, "max_x": 250, "min_z": 525, "max_z": 605},
    # Most Groszowy (-100.7, 91.9)
    {"name": "Most_Groszowy", "min_x": -125, "max_x": -75, "min_z": 70, "max_z": 115},
]


def is_landmark_excluded(x, z):
    for b in LANDMARK_BOXES:
        if b["min_x"] <= x <= b["max_x"] and b["min_z"] <= z <= b["max_z"]:
            return True
    return False


def _signed_area_2d(pts):
    a = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        a += x1 * y2 - x2 * y1
    return 0.5 * a


def _pt_in_tri_2d(p, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1 = sign(p, a, b)
    d2 = sign(p, b, c)
    d3 = sign(p, c, a)
    has_neg = (d1 < -1e-9) or (d2 < -1e-9) or (d3 < -1e-9)
    has_pos = (d1 > 1e-9) or (d2 > 1e-9) or (d3 > 1e-9)
    return not (has_neg and has_pos)


def earclip_2d(pts2d):
    """Return list of index triples (i0, i1, i2) triangulating a simple 2D polygon."""
    n = len(pts2d)
    if n < 3:
        return []
    if n == 3:
        return [(0, 1, 2)]

    area = _signed_area_2d(pts2d)
    if abs(area) < 1e-6:
        return []
    ccw = area > 0

    idxs = list(range(n))
    tris = []
    guard = 0
    max_iters = n * n + 10

    while len(idxs) > 3 and guard < max_iters:
        guard += 1
        ear_found = False
        m = len(idxs)
        for i in range(m):
            i_prev = idxs[(i - 1) % m]
            i_curr = idxs[i]
            i_next = idxs[(i + 1) % m]
            a, b, c = pts2d[i_prev], pts2d[i_curr], pts2d[i_next]
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if ccw and cross <= 1e-9:
                continue
            if (not ccw) and cross >= -1e-9:
                continue

            contains = False
            for j in range(m):
                ij = idxs[j]
                if ij in (i_prev, i_curr, i_next):
                    continue
                if _pt_in_tri_2d(pts2d[ij], a, b, c):
                    contains = True
                    break
            if not contains:
                tris.append((i_prev, i_curr, i_next))
                idxs.pop(i)
                ear_found = True
                break
        if not ear_found:
            break

    if len(idxs) == 3:
        tris.append((idxs[0], idxs[1], idxs[2]))
    return tris


def triangulate_polygon_3d(pts):
    """Robustly triangulate a 3D planar ring using Newell's normal + 2D ear-clipping."""
    if len(pts) < 3:
        return []
    if np.allclose(pts[0], pts[-1], atol=1e-3):
        pts = pts[:-1]
    if len(pts) < 3:
        return []
    if len(pts) == 3:
        return [pts[0], pts[1], pts[2]]

    # Newell normal to choose best 2D projection plane
    nx = ny = nz = 0.0
    n = len(pts)
    for i in range(n):
        p0 = pts[i]
        p1 = pts[(i + 1) % n]
        nx += (p0[1] - p1[1]) * (p0[2] + p1[2])
        ny += (p0[2] - p1[2]) * (p0[0] + p1[0])
        nz += (p0[0] - p1[0]) * (p0[1] + p1[1])

    ax, ay, az = abs(nx), abs(ny), abs(nz)
    if ax >= ay and ax >= az:
        pts2d = [(p[1], p[2]) for p in pts]
    elif ay >= ax and ay >= az:
        pts2d = [(p[0], p[2]) for p in pts]
    else:
        pts2d = [(p[0], p[1]) for p in pts]

    tri_idxs = earclip_2d(pts2d)
    if not tri_idxs:
        # Fallback fan only if earclip failed on degenerate self-intersection
        v0 = pts[0]
        out = []
        for i in range(1, len(pts) - 1):
            out.extend([v0, pts[i], pts[i + 1]])
        return out

    tris = []
    for i0, i1, i2 in tri_idxs:
        tris.extend([pts[i0], pts[i1], pts[i2]])
    return tris


def parse_pos_list(block):
    """Extract exterior LinearRing points from a GML surface block without merging separate rings."""
    rings = []
    ext_blocks = re.findall(r'<gml:exterior\b.*?</gml:exterior>', block, re.DOTALL)
    if not ext_blocks:
        ext_blocks = [block]
    for eb in ext_blocks:
        # Support both <gml:posList> and repeated <gml:pos>
        pos_list_m = re.findall(r'<gml:posList[^>]*>(.*?)</gml:posList>', eb, re.DOTALL)
        if pos_list_m:
            for pl in pos_list_m:
                nums = [float(v) for v in pl.split()]
                pts = []
                for k in range(0, len(nums) - 2, 3):
                    pts.append([nums[k] - ORIGIN_E, nums[k + 2] - HEIGHT_OFFSET, ORIGIN_N - nums[k + 1]])
                if len(pts) >= 3:
                    rings.append(pts)
        else:
            p_matches = re.findall(r'<gml:pos[^>]*>(.*?)</gml:pos>', eb)
            pts = []
            for pm in p_matches:
                c = [float(v) for v in pm.split()]
                if len(c) >= 3:
                    pts.append([c[0] - ORIGIN_E, c[2] - HEIGHT_OFFSET, ORIGIN_N - c[1]])
            if len(pts) >= 3:
                rings.append(pts)
    return rings


def get_dtm_elev(x, z, dtm):
    e = x + ORIGIN_E
    n = ORIGIN_N - z
    col = max(0, min(dtm.shape[1] - 1, int(round((e - X0) / 10.0))))
    row = max(0, min(dtm.shape[0] - 1, int(round((n - Y0) / 10.0))))
    return float(dtm[row, col])


def main():
    files = []
    for d in LOD2_DIRS:
        if os.path.exists(d):
            files.extend(sorted(glob.glob(os.path.join(d, "*.gml"))))
    print(f"Found {len(files)} CityGML files across 1661 + 1609. Parsing LoD2 geometry...")

    tiles_data = {}
    total_buildings = 0
    total_triangles = 0
    excluded_buildings = 0
    lod2_cells = set()  # 12m spatial hash cells occupied by LoD2 centroids

    def ensure_tile(tx, ty):
        k = (tx, ty)
        if k not in tiles_data:
            tiles_data[k] = {"roof_tris": [], "wall_tris": []}
        return tiles_data[k]

    for idx, fpath in enumerate(files):
        with open(fpath, "r", encoding="utf-8", errors="ignore") as fp:
            content = fp.read()

        bldg_blocks = re.findall(r'<bldg:Building\b.*?</bldg:Building>', content, re.DOTALL)
        total_buildings += len(bldg_blocks)

        for bldg in bldg_blocks:
            pos_matches = re.findall(r'<gml:pos[^>]*>(.*?)</gml:pos>', bldg)
            if not pos_matches:
                continue

            sample_pt = [float(x) for x in pos_matches[0].split()]
            easting, northing = sample_pt[0], sample_pt[1]

            if not (X0 <= easting < X1 and Y0 <= northing < Y1):
                continue

            sx = easting - ORIGIN_E
            sz = ORIGIN_N - northing

            if is_landmark_excluded(sx, sz):
                excluded_buildings += 1
                continue

            tx = int((easting - X0) / TILE_SIZE)
            ty = int((northing - Y0) / TILE_SIZE)
            if not (0 <= tx < NUM_TILES_X and 0 <= ty < NUM_TILES_Y):
                continue

            t_entry = ensure_tile(tx, ty)
            lod2_cells.add((int(round(sx / 12.0)), int(round(sz / 12.0))))

            roof_blocks = re.findall(r'<bldg:RoofSurface\b.*?</bldg:RoofSurface>', bldg, re.DOTALL)
            for rb in roof_blocks:
                for pts in parse_pos_list(rb):
                    tris = triangulate_polygon_3d(pts)
                    if tris:
                        t_entry["roof_tris"].extend(tris)
                        total_triangles += len(tris) // 3

            wall_blocks = re.findall(r'<bldg:WallSurface\b.*?</bldg:WallSurface>', bldg, re.DOTALL)
            for wb in wall_blocks:
                for pts in parse_pos_list(wb):
                    tris = triangulate_polygon_3d(pts)
                    if tris:
                        t_entry["wall_tris"].extend(tris)
                        total_triangles += len(tris) // 3

        if (idx + 1) % 10 == 0 or idx + 1 == len(files):
            sys.stdout.write(f"\rParsed {idx + 1}/{len(files)} GML files... ({total_triangles} LoD2 triangles)")
            sys.stdout.flush()

    print(f"\nLoD2 done: {total_buildings} buildings, {total_triangles} triangles across {len(tiles_data)} tiles (excluded {excluded_buildings} landmarks).")

    # --- OSM Building Fallback (for post-2018 buildings & outer areas lacking LoD2) ---
    if os.path.exists(OSM_PKL) and os.path.exists(DTM_IN):
        print("Adding OSM building fallbacks where LoD2 is absent...")
        with open(OSM_PKL, "rb") as f:
            osm = pickle.load(f)
        dtm = np.load(DTM_IN)

        osm_added = 0
        osm_tris = 0
        for b in osm.get("buildings", []):
            poly = b["poly"]
            if len(poly) < 3:
                continue
            if np.allclose(poly[0], poly[-1], atol=1e-3):
                poly = poly[:-1]
            if len(poly) < 3:
                continue

            cx = sum(p[0] for p in poly) / len(poly)
            cz = sum(p[1] for p in poly) / len(poly)
            easting = cx + ORIGIN_E
            northing = ORIGIN_N - cz
            if not (X0 <= easting < X1 and Y0 <= northing < Y1):
                continue
            if is_landmark_excluded(cx, cz):
                continue

            # Check if an LoD2 building already covers this spot (within ~18m)
            cell_x = int(round(cx / 12.0))
            cell_z = int(round(cz / 12.0))
            has_lod2 = False
            for dx in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    if (cell_x + dx, cell_z + dz) in lod2_cells:
                        has_lod2 = True
                        break
                if has_lod2:
                    break
            if has_lod2:
                continue

            tx = int((easting - X0) / TILE_SIZE)
            ty = int((northing - Y0) / TILE_SIZE)
            if not (0 <= tx < NUM_TILES_X and 0 <= ty < NUM_TILES_Y):
                continue
            t_entry = ensure_tile(tx, ty)

            base_y = get_dtm_elev(cx, cz, dtm) - HEIGHT_OFFSET - 0.6
            h = max(3.2, float(b.get("height", 6.0)))
            top_y = base_y + h

            # Walls
            n_pts = len(poly)
            for i in range(n_pts):
                p0 = poly[i]
                p1 = poly[(i + 1) % n_pts]
                v0 = [p0[0], base_y, p0[1]]
                v1 = [p1[0], base_y, p1[1]]
                v2 = [p1[0], top_y, p1[1]]
                v3 = [p0[0], top_y, p0[1]]
                t_entry["wall_tris"].extend([v0, v1, v2, v0, v2, v3])
                osm_tris += 2

            # Roof (pitched if explicitly pitched, else ear-clipped flat roof)
            roof_shape = b.get("roof_shape", "flat")
            if roof_shape in ("gabled", "hipped", "pyramidal") and n_pts <= 8:
                peak_y = top_y + min(3.5, h * 0.3)
                peak = [cx, peak_y, cz]
                for i in range(n_pts):
                    p0 = poly[i]
                    p1 = poly[(i + 1) % n_pts]
                    t_entry["roof_tris"].extend([
                        [p0[0], top_y, p0[1]],
                        [p1[0], top_y, p1[1]],
                        peak
                    ])
                    osm_tris += 1
            else:
                tri_idxs = earclip_2d(poly)
                for i0, i1, i2 in tri_idxs:
                    p0, p1, p2 = poly[i0], poly[i1], poly[i2]
                    t_entry["roof_tris"].extend([
                        [p0[0], top_y, p0[1]],
                        [p1[0], top_y, p1[1]],
                        [p2[0], top_y, p2[1]],
                    ])
                    osm_tris += 1

            osm_added += 1

        print(f"Added {osm_added} OSM fallback buildings ({osm_tris} triangles). Active building tiles: {len(tiles_data)}")

    with open(OUT_BLDG_PKL, "wb") as fp:
        pickle.dump(tiles_data, fp, protocol=pickle.HIGHEST_PROTOCOL)
    print(f"Saved to {OUT_BLDG_PKL} ({os.path.getsize(OUT_BLDG_PKL) // 1024} KB)")


if __name__ == "__main__":
    main()
