"""
Tile generator for Opole-IZO.
Renders 14 x 14 = 196 tiles at upgraded resolution:
- tile_{tx}_{ty}.png: 500x500 indexed 8-bit ground texture (2 m/px, classes 0-63)
- tile_{tx}_{ty}_s.png: 128x128 far-LOD & minimap overview texture
- tile_{tx}_{ty}.bin: binary payload (101x101 10m terrain heights, LoD2+OSM building meshes, trees)
- overview_dtm.bin: 281x281 (50m) global city terrain grid for instant whole-city far LOD
- manifest.json: metadata, seasonal palette table, and verified landmark elevations
"""

import os
import sys
import struct
import pickle
import json
import numpy as np
from PIL import Image, ImageDraw

sys.path.append(os.path.dirname(__file__))
from config import X0, X1, Y0, Y1, ORIGIN_E, ORIGIN_N, HEIGHT_OFFSET, TILE_SIZE, BUILD_ID, NUM_TILES_X, NUM_TILES_Y
from palette import PALETTE_SUMMER, PALETTE_AUTUMN, PALETTE_WINTER, PALETTE_SPRING

BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "build")
TILES_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data", "tiles")
MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data", "manifest.json")
OVERVIEW_DTM_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data", "overview_dtm.bin")
os.makedirs(TILES_DIR, exist_ok=True)

OSM_PKL = os.path.join(BUILD_DIR, "osm.pkl")
DTM_IN = os.path.join(BUILD_DIR, "graded_dtm.npy")
BLDG_PKL = os.path.join(BUILD_DIR, "buildings_by_tile.pkl")
TREES_PKL = os.path.join(BUILD_DIR, "trees_by_tile.pkl")

LANDUSE_LAYER_PRIORITY = {
    "farmland": (3, 1), "farm": (3, 1),
    "residential": (54, 1),
    "industrial": (36, 1), "commercial": (36, 1), "retail": (36, 1),
    "construction": (46, 1), "brownfield": (48, 1),
    "meadow": (2, 2), "grass": (2, 2),
    "orchard": (5, 2),
    "forest": (6, 3), "wood": (6, 3), "nature_reserve": (6, 3),
    "park": (1, 3), "garden": (1, 3), "recreation_ground": (1, 3),
    "allotments": (40, 3),
    "cemetery": (38, 4),
    "pitch": (42, 4),
    "parking": (34, 4),
    "beach": (45, 4),
}


def get_pillow_palette(palette_list):
    pal = []
    for rgb in palette_list:
        pal.extend(rgb)
    while len(pal) < 256 * 3:
        pal.extend([0, 0, 0])
    return pal


SUMMER_PIL_PAL = get_pillow_palette(PALETTE_SUMMER)


def bbox_pts(pts):
    xs = [p[0] for p in pts]
    zs = [p[1] for p in pts]
    return min(xs), min(zs), max(xs), max(zs)


def index_by_tile(items, pts_key):
    """Spatially bin OSM primitives by overlapping tile indices for fast per-tile drawing."""
    grid = {(tx, ty): [] for ty in range(NUM_TILES_Y) for tx in range(NUM_TILES_X)}
    for item in items:
        pts = item.get(pts_key, [])
        if not pts:
            continue
        x0, z0, x1, z1 = bbox_pts(pts)
        # Convert scene x/z to tile range (with small padding for line widths)
        pad = 25.0
        tx0 = max(0, int((x0 - pad + ORIGIN_E - X0) // TILE_SIZE))
        tx1 = min(NUM_TILES_X - 1, int((x1 + pad + ORIGIN_E - X0) // TILE_SIZE))
        ty0 = max(0, int((ORIGIN_N - (z1 + pad) - Y0) // TILE_SIZE))
        ty1 = min(NUM_TILES_Y - 1, int((ORIGIN_N - (z0 - pad) - Y0) // TILE_SIZE))
        for ty in range(ty0, ty1 + 1):
            for tx in range(tx0, tx1 + 1):
                grid[(tx, ty)].append(item)
    return grid


def sample_y(x, z, dtm):
    e = x + ORIGIN_E
    n = ORIGIN_N - z
    col = max(0, min(dtm.shape[1] - 1, int(round((e - X0) / 10.0))))
    row = max(0, min(dtm.shape[0] - 1, int(round((n - Y0) / 10.0))))
    return round(float(dtm[row, col]) - HEIGHT_OFFSET, 2)


def main():
    print("Loading precomputed layers...")
    with open(OSM_PKL, "rb") as f:
        osm = pickle.load(f)
    dtm = np.load(DTM_IN)
    with open(BLDG_PKL, "rb") as f:
        bldgs_by_tile = pickle.load(f)
    with open(TREES_PKL, "rb") as f:
        trees_by_tile = pickle.load(f)

    # Spatially index OSM layers by tile
    print("Spatially indexing OSM layers per tile...")
    lu_by_tile = index_by_tile(osm.get("landuse", []), "poly")
    wa_by_tile = index_by_tile(osm.get("water_areas", []), "poly")
    ww_by_tile = index_by_tile(osm.get("waterways", []), "pts")
    rw_by_tile = index_by_tile(osm.get("railways", []), "pts")
    rd_by_tile = index_by_tile(osm.get("roads", []), "pts")

    # Export 50m overview DTM (281 x 281, North-up to match Three.js PlaneGeometry) for whole-city far LOD
    overview_dtm = np.flipud(dtm[::5, ::5] - HEIGHT_OFFSET).astype(np.float32)
    with open(OVERVIEW_DTM_PATH, "wb") as of:
        of.write(struct.pack("<HH", overview_dtm.shape[1], overview_dtm.shape[0]))
        of.write(overview_dtm.tobytes())
    print(f"Saved whole-city overview DTM {overview_dtm.shape} to {OVERVIEW_DTM_PATH}")

    print(f"Generating {NUM_TILES_X}x{NUM_TILES_Y} = {NUM_TILES_X * NUM_TILES_Y} high-res tiles...")
    manifest_tiles = []

    # 101x101 points per 1 km tile = exact 10m GUGiK LiDAR grid spacing
    GRID_PTS = 101
    IMG_W = 500
    IMG_H = 500

    for ty in range(NUM_TILES_Y):
        for tx in range(NUM_TILES_X):
            t_key = (tx, ty)
            tile_name = f"tile_{tx}_{ty}"

            t_e0 = X0 + tx * TILE_SIZE
            t_e1 = t_e0 + TILE_SIZE
            t_n0 = Y0 + ty * TILE_SIZE
            t_n1 = t_n0 + TILE_SIZE

            t_x0 = t_e0 - ORIGIN_E
            t_x1 = t_e1 - ORIGIN_E
            t_z0 = ORIGIN_N - t_n1  # north (-z)
            t_z1 = ORIGIN_N - t_n0  # south (+z)

            # 1. Generate 500x500 Indexed Ground Texture (1 px = 2 m)
            img = Image.new("P", (IMG_W, IMG_H), 0)
            draw = ImageDraw.Draw(img)

            def to_px(sx, sz):
                px = int(round(((sx - t_x0) / (t_x1 - t_x0)) * IMG_W))
                py = int(round(((sz - t_z0) / (t_z1 - t_z0)) * IMG_H))
                return px, py

            # (A) Landuse areas sorted by priority
            lu_items = []
            for lu in lu_by_tile[t_key]:
                val = lu["val"]
                if val in LANDUSE_LAYER_PRIORITY:
                    cls_idx, prio = LANDUSE_LAYER_PRIORITY[val]
                    lu_items.append((prio, cls_idx, lu["poly"]))
            lu_items.sort(key=lambda x: x[0])
            for _, cls_idx, poly in lu_items:
                px_pts = [to_px(p[0], p[1]) for p in poly]
                if len(px_pts) >= 3:
                    draw.polygon(px_pts, fill=cls_idx)

            # (B) Water areas (Odra river multipolygon, lakes, ponds)
            for wa in wa_by_tile[t_key]:
                px_pts = [to_px(p[0], p[1]) for p in wa["poly"]]
                if len(px_pts) >= 3:
                    draw.polygon(px_pts, fill=10)

            # (C) Waterways (streams, canals, Odra centerline fallback)
            for ww in ww_by_tile[t_key]:
                pts = ww["pts"]
                if len(pts) >= 2:
                    px_pts = [to_px(p[0], p[1]) for p in pts]
                    w_name = ww.get("name", "").lower()
                    w_width = 22 if "odra" in w_name else (10 if "ulgi" in w_name or "młyn" in w_name else 4)
                    draw.line(px_pts, fill=10, width=w_width)

            # (D) Railways
            for rw in rw_by_tile[t_key]:
                pts = rw["pts"]
                if len(pts) >= 2:
                    px_pts = [to_px(p[0], p[1]) for p in pts]
                    draw.line(px_pts, fill=24, width=4)

            # (E) Roads & paths
            for rd in rd_by_tile[t_key]:
                pts = rd["pts"]
                if len(pts) >= 2:
                    px_pts = [to_px(p[0], p[1]) for p in pts]
                    h_type = rd["type"]
                    c_idx = 19
                    lw = 4
                    if h_type in ("motorway", "trunk", "primary"):
                        c_idx = 17
                        lw = 8
                    elif h_type in ("secondary", "tertiary"):
                        c_idx = 18
                        lw = 6
                    elif h_type in ("pedestrian", "footway", "path", "steps"):
                        c_idx = 22
                        lw = 2
                    elif h_type in ("cycleway",):
                        c_idx = 23
                        lw = 2
                    draw.line(px_pts, fill=c_idx, width=lw)

            # (F) Real Rynek Granite Pavement at (-145..-35, -245..-140) in tile (6, 7)
            if tx == 6 and ty == 7:
                r_pts = [to_px(rx, rz) for rx, rz in [(-145, -245), (-35, -245), (-35, -140), (-145, -140)]]
                draw.polygon(r_pts, fill=29)

            img.putpalette(SUMMER_PIL_PAL)
            png_path = os.path.join(TILES_DIR, f"{tile_name}.png")
            img.save(png_path, optimize=True)

            # Save 128x128 far-LOD & minimap overview copy
            s_img = img.resize((128, 128), Image.Resampling.NEAREST)
            s_img.save(os.path.join(TILES_DIR, f"{tile_name}_s.png"), optimize=True)

            # 2. Extract 101x101 10m Terrain Heights & FLIP North-to-South to match Three.js PlaneGeometry!
            r0 = ty * 100
            r1 = r0 + 100
            c0 = tx * 100
            c1 = c0 + 100
            dtm_sub = dtm[r0:r1 + 1, c0:c1 + 1]
            if dtm_sub.shape == (GRID_PTS, GRID_PTS):
                heights = np.flipud(dtm_sub - HEIGHT_OFFSET).astype(np.float32)
            else:
                heights = np.full((GRID_PTS, GRID_PTS), 5.0, dtype=np.float32)

            # 3. Buildings Mesh (LoD2 + OSM fallback)
            bldg_data = bldgs_by_tile.get(t_key, {"roof_tris": [], "wall_tris": []})
            roof_tris = bldg_data["roof_tris"]
            wall_tris = bldg_data["wall_tris"]

            bldg_vertices = []
            for i in range(0, len(roof_tris), 3):
                v0, v1, v2 = roof_tris[i], roof_tris[i + 1], roof_tris[i + 2]
                e1 = np.array(v1) - np.array(v0)
                e2 = np.array(v2) - np.array(v0)
                n = np.cross(e1, e2)
                norm = np.linalg.norm(n)
                n = (n / norm) if norm > 1e-5 else np.array([0.0, 1.0, 0.0])
                for v in (v0, v1, v2):
                    bldg_vertices.extend([v[0], v[1], v[2], n[0], n[1], n[2], 1.0])

            for i in range(0, len(wall_tris), 3):
                v0, v1, v2 = wall_tris[i], wall_tris[i + 1], wall_tris[i + 2]
                e1 = np.array(v1) - np.array(v0)
                e2 = np.array(v2) - np.array(v0)
                n = np.cross(e1, e2)
                norm = np.linalg.norm(n)
                n = (n / norm) if norm > 1e-5 else np.array([0.0, 1.0, 0.0])
                for v in (v0, v1, v2):
                    bldg_vertices.extend([v[0], v[1], v[2], n[0], n[1], n[2], 0.0])

            bldg_vert_arr = np.array(bldg_vertices, dtype=np.float32)

            # 4. Trees
            tree_list = trees_by_tile.get(t_key, [])
            tree_arr = np.array(tree_list, dtype=np.float32) if tree_list else np.empty((0, 6), dtype=np.float32)

            # 5. Binary Tile File (.bin)
            bin_path = os.path.join(TILES_DIR, f"{tile_name}.bin")
            with open(bin_path, "wb") as bf:
                header = struct.pack(
                    "<4sHHHHII12s",
                    b"IZO1",
                    tx,
                    ty,
                    GRID_PTS,
                    0,
                    len(bldg_vert_arr) // 7,
                    len(tree_arr),
                    b"\x00" * 12
                )
                bf.write(header)
                bf.write(heights.tobytes())
                if len(bldg_vert_arr) > 0:
                    bf.write(bldg_vert_arr.tobytes())
                if len(tree_arr) > 0:
                    bf.write(tree_arr.tobytes())

            manifest_tiles.append({
                "tx": tx,
                "ty": ty,
                "name": tile_name,
                "bounds": [t_x0, t_z0, t_x1, t_z1],
                "bldgVertices": len(bldg_vert_arr) // 7,
                "treeCount": len(tree_arr),
                "binSize": os.path.getsize(bin_path)
            })

            sys.stdout.write(f"\rGenerated tile {tx:2d},{ty:2d} ({len(manifest_tiles)}/{NUM_TILES_X * NUM_TILES_Y})...")
            sys.stdout.flush()

    print("\nAll tiles generated.")

    # Precompute exact ground elevations for hand-modelled landmarks & easter eggs
    landmarks_elev = {
        "rynek": sample_y(-88, -195, dtm),
        "wieza": sample_y(-300, -62, dtm),
        "amfiteatr": sample_y(-365, -90, dtm),
        "katedra": sample_y(-234, -390, dtm),
        "groszowy": sample_y(-101, 92, dtm),
        "wenecja": sample_y(-251, -174, dtm),
        "dworzec": sample_y(199, 563, dtm),
        "solaris": sample_y(191, -364, dtm),
        "bolko": sample_y(-58, 1227, dtm),
        "cmentarz": sample_y(-3095, -513, dtm),
        "pasture": sample_y(-140, 620, dtm),
    }

    manifest = {
        "buildId": BUILD_ID,
        "city": "Opole",
        "country": "Poland",
        "crs": "EPSG:2180",
        "origin": {
            "e": ORIGIN_E,
            "n": ORIGIN_N,
            "heightOffset": HEIGHT_OFFSET,
            "lat": 50.666818,
            "lon": 17.923641
        },
        "grid": {
            "numTilesX": NUM_TILES_X,
            "numTilesY": NUM_TILES_Y,
            "tileSize": TILE_SIZE,
            "centerTile": {"tx": 6, "ty": 7}
        },
        "landmarkElevations": landmarks_elev,
        "palettes": {
            "summer": PALETTE_SUMMER,
            "autumn": PALETTE_AUTUMN,
            "winter": PALETTE_WINTER,
            "spring": PALETTE_SPRING
        },
        "tiles": manifest_tiles
    }

    with open(MANIFEST_PATH, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2)

    print(f"Saved manifest to {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
