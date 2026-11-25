"""
Build connected pedestrian walking graph and squares network from osm.pkl with real 10m DTM elevation.
Uses verified OSM coordinates for Opole plazas.
Outputs web/public/data/walk.json
"""

import os
import sys
import pickle
import json
import math
import numpy as np

sys.path.append(os.path.dirname(__file__))
from config import X0, Y0, ORIGIN_E, ORIGIN_N, HEIGHT_OFFSET

BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "build")
PUBLIC_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data")
OSM_PKL = os.path.join(BUILD_DIR, "osm.pkl")
DTM_IN = os.path.join(BUILD_DIR, "graded_dtm.npy")
OUT_WALK = os.path.join(PUBLIC_DATA_DIR, "walk.json")

WALKABLE_HIGHWAYS = {
    "pedestrian": 0,
    "footway": 1,
    "living_street": 2,
    "path": 3,
    "steps": 4,
    "residential": 5,
    "service": 6,
}


def get_y(x, z, dtm):
    e = x + ORIGIN_E
    n = ORIGIN_N - z
    col = max(0, min(dtm.shape[1] - 1, int(round((e - X0) / 10.0))))
    row = max(0, min(dtm.shape[0] - 1, int(round((n - Y0) / 10.0))))
    return round(float(dtm[row, col]) - HEIGHT_OFFSET, 2)


def main():
    print(f"Loading {OSM_PKL} and {DTM_IN} for pedestrian walk graph...")
    with open(OSM_PKL, "rb") as f:
        osm = pickle.load(f)
    dtm = np.load(DTM_IN)

    roads = [r for r in osm.get("roads", []) if r["type"] in WALKABLE_HIGHWAYS]
    roads.sort(key=lambda r: WALKABLE_HIGHWAYS[r["type"]])

    edges = []
    nodes = {}
    adj = {}
    next_node_id = 0

    def get_node(pt):
        nonlocal next_node_id
        key = (round(pt[0], 1), round(pt[1], 1))
        if key not in nodes:
            nodes[key] = next_node_id
            adj[next_node_id] = []
            next_node_id += 1
        return nodes[key]

    for r in roads:
        h_type = r["type"]
        pts = r["pts"]
        if len(pts) < 2:
            continue

        for i in range(len(pts) - 1):
            p1, p2 = pts[i], pts[i + 1]
            if abs(p1[0]) > 7500 or abs(p1[1]) > 7500 or abs(p2[0]) > 7500 or abs(p2[1]) > 7500:
                continue
            d = math.hypot(p1[0] - p2[0], p1[1] - p2[1])
            if d < 1.0 or d > 200.0:
                continue

            u = get_node(p1)
            v = get_node(p2)
            y1 = get_y(p1[0], p1[1], dtm)
            y2 = get_y(p2[0], p2[1], dtm)

            e1 = len(edges)
            edges.append({
                "u": u, "v": v,
                "pts": [[round(p1[0], 1), round(p1[1], 1), y1], [round(p2[0], 1), round(p2[1], 1), y2]],
                "dist": round(d, 2),
                "type": h_type
            })
            adj[u].append(e1)

            e2 = len(edges)
            edges.append({
                "u": v, "v": u,
                "pts": [[round(p2[0], 1), round(p2[1], 1), y2], [round(p1[0], 1), round(p1[1], 1), y1]],
                "dist": round(d, 2),
                "type": h_type
            })
            adj[v].append(e2)

            if len(edges) >= 35000:
                break
        if len(edges) >= 35000:
            break

    # Verified Opole plaza locations in scene coordinates (with real DTM elevation y)
    plazas_raw = [
        {"name": "Rynek Ratusz", "x": -88.0, "z": -195.0, "radius": 38.0, "type": "cafe_square"},
        {"name": "Mały Rynek", "x": 58.0, "z": -140.0, "radius": 24.0, "type": "cafe_square"},
        {"name": "Plac Wolności", "x": 50.0, "z": 100.0, "radius": 25.0, "type": "park_plaza"},
        {"name": "Plac Kopernika (Solaris)", "x": 191.0, "z": -300.0, "radius": 32.0, "type": "mall_plaza"},
        {"name": "Dworzec Główny Plac", "x": 199.0, "z": 530.0, "radius": 30.0, "type": "station_plaza"},
        {"name": "Wzgórze Uniwersyteckie", "x": 45.0, "z": -280.0, "radius": 25.0, "type": "campus_plaza"},
        {"name": "Wyspa Bolko Zoo", "x": -58.0, "z": 1227.0, "radius": 50.0, "type": "park_lawn"},
        {"name": "Amfiteatr Bulwar", "x": -340.0, "z": -60.0, "radius": 28.0, "type": "promenade"},
        {"name": "Most Groszowy", "x": -101.0, "z": 92.0, "radius": 18.0, "type": "riverside"},
    ]
    for pl in plazas_raw:
        pl["y"] = get_y(pl["x"], pl["z"], dtm)

    adj_compact = {str(nid): elist for nid, elist in adj.items() if elist}

    walk_data = {
        "city": "Opole",
        "nodesCount": len(nodes),
        "edgesCount": len(edges),
        "adj": adj_compact,
        "edges": edges,
        "plazas": plazas_raw
    }

    with open(OUT_WALK, "w", encoding="utf-8") as f:
        json.dump(walk_data, f)

    print(f"Saved walk graph ({len(edges)} edges) to {OUT_WALK} ({os.path.getsize(OUT_WALK) // 1024} KB)")


if __name__ == "__main__":
    main()
