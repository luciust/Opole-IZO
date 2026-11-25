"""
Grading pass: fixes bare-earth 10m GUGiK DTM for transport and water.
- Gently levels water cells along Odra / Kanał Ulgi / Kanał Młynówka using local water elevation (instead of a hardcoded global constant).
- Smooths road and rail bridge decks across river crossings so bridges stay level across channels.
- Exports road tunnels and bridge portals.
"""

import os
import sys
import pickle
import json
import numpy as np

sys.path.append(os.path.dirname(__file__))
from config import X0, Y0, ORIGIN_E, ORIGIN_N

BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "build")
DTM_IN = os.path.join(BUILD_DIR, "dtm.npy")
DTM_OUT = os.path.join(BUILD_DIR, "graded_dtm.npy")
PORTALS_OUT = os.path.join(BUILD_DIR, "road_tunnels.json")
OSM_PKL = os.path.join(BUILD_DIR, "osm.pkl")


def get_grid_indices(x, z, shape):
    e = x + ORIGIN_E
    n = ORIGIN_N - z
    col = int(round((e - X0) / 10.0))
    row = int(round((n - Y0) / 10.0))
    col = max(0, min(shape[1] - 1, col))
    row = max(0, min(shape[0] - 1, row))
    return row, col


def main():
    print("Loading 10m DTM and OSM data for grading...")
    dtm = np.load(DTM_IN).copy()
    with open(OSM_PKL, "rb") as f:
        osm = pickle.load(f)

    print(f"Loaded DTM shape: {dtm.shape}, range: {dtm.min():.2f}m .. {dtm.max():.2f}m")

    # 1. Smooth waterways without creating artificial cliffs against real LiDAR water levels
    # Sample local river elevation along each waterway and clamp steep riverbed spikes
    water_pts_count = 0
    for w in osm.get("waterways", []):
        pts = w["pts"]
        if len(pts) < 2:
            continue
        samples = [dtm[get_grid_indices(pt[0], pt[1], dtm.shape)] for pt in pts]
        local_water = float(np.percentile(samples, 25))
        for pt in pts:
            r, c = get_grid_indices(pt[0], pt[1], dtm.shape)
            if dtm[r, c] > local_water + 1.5:
                dtm[r, c] = local_water + 0.5
                water_pts_count += 1

    print(f"Waterway grading: smoothed {water_pts_count} waterway bank cells.")

    # 2. Bridge deck and approach grading (roads and railways)
    bridge_count = 0
    for r in osm.get("roads", []) + osm.get("railways", []):
        if r.get("bridge"):
            bridge_count += 1
            pts = r["pts"]
            if len(pts) >= 2:
                r0, c0 = get_grid_indices(pts[0][0], pts[0][1], dtm.shape)
                r1, c1 = get_grid_indices(pts[-1][0], pts[-1][1], dtm.shape)
                h0 = float(dtm[r0, c0])
                h1 = float(dtm[r1, c1])
                for idx, pt in enumerate(pts):
                    t = idx / (len(pts) - 1)
                    target_h = (1.0 - t) * h0 + t * h1
                    pr, pc = get_grid_indices(pt[0], pt[1], dtm.shape)
                    dtm[pr, pc] = max(dtm[pr, pc], target_h)

    print(f"Graded {bridge_count} road/rail bridge decks.")

    # 3. Road tunnels & underpasses
    tunnels = []
    for r in osm.get("roads", []):
        if r.get("tunnel"):
            pts = r["pts"]
            if len(pts) >= 2:
                tunnels.append({
                    "id": r["id"],
                    "name": r["name"],
                    "start": pts[0],
                    "end": pts[-1],
                    "pts": pts
                })

    print(f"Identified {len(tunnels)} road tunnels / underpasses.")
    with open(PORTALS_OUT, "w") as f:
        json.dump(tunnels, f, indent=2)

    np.save(DTM_OUT, dtm)
    print(f"Saved graded DTM to {DTM_OUT}")


if __name__ == "__main__":
    main()
