"""
Extract and distribute tree coordinates using real 10m GUGiK CHM (Canopy Height Model)
combined with OSM landuse (parks, forests, cemeteries, allotments, gardens) and DTM heights.
Excludes roads, railways, water, and building footprints.
Outputs data/build/trees_by_tile.pkl
"""

import os
import sys
import pickle
import random
import numpy as np

sys.path.append(os.path.dirname(__file__))
from config import X0, X1, Y0, Y1, ORIGIN_E, ORIGIN_N, HEIGHT_OFFSET, TILE_SIZE, NUM_TILES_X, NUM_TILES_Y

BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "build")
OSM_PKL = os.path.join(BUILD_DIR, "osm.pkl")
DTM_IN = os.path.join(BUILD_DIR, "graded_dtm.npy")
CHM_IN = os.path.join(BUILD_DIR, "chm.npy")
OUT_TREES = os.path.join(BUILD_DIR, "trees_by_tile.pkl")

TREE_LANDUSE = {
    "forest": {"density": 0.005, "height": (10.0, 18.0), "type": "mixed"},
    "wood": {"density": 0.005, "height": (9.0, 17.0), "type": "broadleaf"},
    "park": {"density": 0.003, "height": (7.0, 14.0), "type": "broadleaf"},
    "cemetery": {"density": 0.002, "height": (7.0, 14.0), "type": "conifer"},
    "allotments": {"density": 0.002, "height": (4.0, 8.0), "type": "broadleaf"},
    "orchard": {"density": 0.004, "height": (3.5, 6.5), "type": "broadleaf"},
    "grass": {"density": 0.00025, "height": (5.0, 10.0), "type": "broadleaf"},
    "meadow": {"density": 0.0002, "height": (5.0, 9.0), "type": "broadleaf"},
    "nature_reserve": {"density": 0.005, "height": (9.0, 17.0), "type": "broadleaf"}
}


def get_grid_val(x, z, arr):
    e = x + ORIGIN_E
    n = ORIGIN_N - z
    col = max(0, min(arr.shape[1] - 1, int(round((e - X0) / 10.0))))
    row = max(0, min(arr.shape[0] - 1, int(round((n - Y0) / 10.0))))
    return float(arr[row, col])


def point_in_polygon(x, y, poly):
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y) and y <= max(p1y, p2y) and x <= max(p1x, p2x):
            if p1y != p2y:
                xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
            if p1x == p2x or x <= xinters:
                inside = not inside
        p1x, p1y = p2x, p2y
    return inside


def build_exclusion_cells(osm):
    """Build 10m spatial hash of cells occupied by roads, railways, water, or buildings."""
    excluded = set()

    def mark_pt(sx, sz, pad=0):
        gx = int(round(sx / 10.0))
        gz = int(round(sz / 10.0))
        for dx in range(-pad, pad + 1):
            for dz in range(-pad, pad + 1):
                excluded.add((gx + dx, gz + dz))

    for rd in osm.get("roads", []):
        if rd["type"] in ("motorway", "trunk", "primary", "secondary", "tertiary", "residential"):
            pts = rd["pts"]
            for i in range(len(pts) - 1):
                p0, p1 = pts[i], pts[i + 1]
                steps = max(1, int(np.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 8.0))
                for s in range(steps + 1):
                    t = s / steps
                    mark_pt(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, pad=0)

    for b in osm.get("buildings", []):
        poly = b["poly"]
        if len(poly) >= 3:
            xs = [p[0] for p in poly]
            zs = [p[1] for p in poly]
            gx0, gx1 = int(min(xs) // 10), int(max(xs) // 10)
            gz0, gz1 = int(min(zs) // 10), int(max(zs) // 10)
            for gx in range(gx0, gx1 + 1):
                for gz in range(gz0, gz1 + 1):
                    excluded.add((gx, gz))

    for wa in osm.get("water_areas", []):
        poly = wa["poly"]
        if len(poly) >= 3:
            xs = [p[0] for p in poly]
            zs = [p[1] for p in poly]
            if (max(xs) - min(xs)) * (max(zs) - min(zs)) < 250000:
                gx0, gx1 = int(min(xs) // 10), int(max(xs) // 10)
                gz0, gz1 = int(min(zs) // 10), int(max(zs) // 10)
                for gx in range(gx0, gx1 + 1):
                    for gz in range(gz0, gz1 + 1):
                        if point_in_polygon(gx * 10.0 + 5.0, gz * 10.0 + 5.0, poly):
                            excluded.add((gx, gz))

    return excluded


def main():
    print(f"Loading {OSM_PKL}, {DTM_IN}, {CHM_IN} for tree generation...")
    with open(OSM_PKL, "rb") as f:
        osm = pickle.load(f)
    dtm = np.load(DTM_IN)
    chm = np.load(CHM_IN) if os.path.exists(CHM_IN) else None

    excluded = build_exclusion_cells(osm)
    print(f"Built exclusion mask ({len(excluded)} 10m cells).")

    landuse = osm.get("landuse", [])
    trees_by_tile = {}
    total_trees = 0
    random.seed(42)

    for item in landuse:
        val = item["val"]
        if val not in TREE_LANDUSE:
            continue

        cfg = TREE_LANDUSE[val]
        poly = item["poly"]
        if len(poly) < 3:
            continue

        min_x = min(p[0] for p in poly)
        max_x = max(p[0] for p in poly)
        min_z = min(p[1] for p in poly)
        max_z = max(p[1] for p in poly)

        area = (max_x - min_x) * (max_z - min_z)
        if area <= 10.0 or area > 9000000.0:
            continue

        target_trees = min(int(area * cfg["density"]), 1200)
        h_min, h_max = cfg["height"]
        tree_type_code = 0 if cfg["type"] == "broadleaf" else (1 if cfg["type"] == "conifer" else 2)

        for _ in range(target_trees):
            rx = random.uniform(min_x, max_x)
            rz = random.uniform(min_z, max_z)
            if (int(round(rx / 10.0)), int(round(rz / 10.0))) in excluded:
                continue
            if not point_in_polygon(rx, rz, poly):
                continue

            easting = rx + ORIGIN_E
            northing = ORIGIN_N - rz
            if not (X0 <= easting < X1 and Y0 <= northing < Y1):
                continue

            tx = int((easting - X0) / TILE_SIZE)
            ty = int((northing - Y0) / TILE_SIZE)
            if not (0 <= tx < NUM_TILES_X and 0 <= ty < NUM_TILES_Y):
                continue

            ground_y = get_grid_val(rx, rz, dtm) - HEIGHT_OFFSET
            chm_h = get_grid_val(rx, rz, chm) if chm is not None else 0.0
            if 3.0 <= chm_h <= 32.0:
                tree_height = chm_h
            else:
                tree_height = random.uniform(h_min, h_max)
            radius = tree_height * 0.35

            t_key = (tx, ty)
            if t_key not in trees_by_tile:
                trees_by_tile[t_key] = []
            trees_by_tile[t_key].append([
                round(rx, 2),
                round(ground_y, 2),
                round(rz, 2),
                round(tree_height, 2),
                round(radius, 2),
                tree_type_code
            ])
            total_trees += 1

    print(f"Generated {total_trees} trees across {len(trees_by_tile)} tiles.")
    with open(OUT_TREES, "wb") as fp:
        pickle.dump(trees_by_tile, fp, protocol=pickle.HIGHEST_PROTOCOL)
    print(f"Saved to {OUT_TREES} ({os.path.getsize(OUT_TREES) // 1024} KB)")


if __name__ == "__main__":
    main()
