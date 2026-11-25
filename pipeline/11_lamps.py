"""
Generate street light positions (lamps.bin) across the entire 14x14 km city of Opole.
Combines real OSM highway=street_lamp nodes with procedural lamps spaced along
lit urban streets where OSM nodes are sparse, seated on 10m GUGiK DTM elevation.
Outputs web/public/data/lamps.bin
"""

import os
import sys
import struct
import pickle
import math
import numpy as np

sys.path.append(os.path.dirname(__file__))
from config import X0, Y0, ORIGIN_E, ORIGIN_N, HEIGHT_OFFSET

BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "build")
PUBLIC_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data")
os.makedirs(PUBLIC_DATA_DIR, exist_ok=True)

OSM_PKL = os.path.join(BUILD_DIR, "osm.pkl")
DTM_IN = os.path.join(BUILD_DIR, "graded_dtm.npy")
OUT_LAMPS = os.path.join(PUBLIC_DATA_DIR, "lamps.bin")

LIT_HIGHWAYS = {
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "unclassified",
    "residential",
    "living_street",
    "pedestrian",
}

CELL_SIZE = 42.0  # Minimum spacing (~42m) between street lamps


def get_y(x, z, dtm):
    e = x + ORIGIN_E
    n = ORIGIN_N - z
    col = max(0, min(dtm.shape[1] - 1, int(round((e - X0) / 10.0))))
    row = max(0, min(dtm.shape[0] - 1, int(round((n - Y0) / 10.0))))
    return float(dtm[row, col]) - HEIGHT_OFFSET


def main():
    print(f"Loading {OSM_PKL} and {DTM_IN} for street light generation...")
    with open(OSM_PKL, "rb") as f:
        osm = pickle.load(f)
    dtm = np.load(DTM_IN)

    lamps = []
    occupied = set()

    def is_occupied(x, z):
        gx = int(math.floor(x / CELL_SIZE))
        gz = int(math.floor(z / CELL_SIZE))
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                if (gx + dx, gz + dz) in occupied:
                    return True
        return False

    def add_lamp(x, z, yaw):
        if abs(x) > 7000 or abs(z) > 7600:
            return False
        gx = int(math.floor(x / CELL_SIZE))
        gz = int(math.floor(z / CELL_SIZE))
        occupied.add((gx, gz))
        y = get_y(x, z, dtm)
        lamps.append((x, y, z, yaw))
        return True

    # 1. Keep real OSM street_lamp nodes first
    for l in osm.get("lamps", []):
        add_lamp(float(l["x"]), float(l["z"]), 0.0)
    osm_count = len(lamps)

    # 2. Fill along lit urban roads at ~48m intervals where OSM hasn't mapped lamps
    spacing = 48.0
    for r in osm.get("roads", []):
        if r["type"] not in LIT_HIGHWAYS:
            continue
        pts = r["pts"]
        if len(pts) < 2:
            continue

        accum = 0.0
        for i in range(len(pts) - 1):
            p1, p2 = pts[i], pts[i + 1]
            dx = p2[0] - p1[0]
            dz = p2[1] - p1[1]
            seg_len = math.hypot(dx, dz)
            if seg_len < 1.0:
                continue
            yaw = -math.atan2(dz, dx)
            # Slight roadside offset (~4.5m perpendicular to carriageway)
            nx = -dz / seg_len
            nz = dx / seg_len
            side = 4.2 if ((i % 2) == 0) else -4.2

            dist_along = spacing - accum
            while dist_along <= seg_len:
                t = dist_along / seg_len
                lx = p1[0] + dx * t + nx * side
                lz = p1[1] + dz * t + nz * side
                if not is_occupied(lx, lz):
                    add_lamp(lx, lz, yaw)
                dist_along += spacing
            accum = (accum + seg_len) % spacing

    arr = np.array(lamps, dtype=np.float32)
    with open(OUT_LAMPS, "wb") as f:
        f.write(struct.pack("<I", len(arr)))
        if len(arr) > 0:
            f.write(arr.tobytes())

    print(f"Generated {len(arr)} street lamps ({osm_count} from OSM + {len(arr) - osm_count} roadside) -> {OUT_LAMPS} ({os.path.getsize(OUT_LAMPS) // 1024} KB)")


if __name__ == "__main__":
    main()
