"""
Build connected road traffic graph and signal network from osm.pkl with real 10m DTM elevation.
Covers the whole 14x14 km city evenly and exports node adjacency for continuous routing.
Outputs web/public/data/traffic.json
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
os.makedirs(PUBLIC_DATA_DIR, exist_ok=True)

OSM_PKL = os.path.join(BUILD_DIR, "osm.pkl")
DTM_IN = os.path.join(BUILD_DIR, "graded_dtm.npy")
OUT_TRAFFIC = os.path.join(PUBLIC_DATA_DIR, "traffic.json")

DRIVABLE_HIGHWAYS = {
    "motorway": (110, 0),
    "trunk": (90, 1),
    "primary": (60, 2),
    "secondary": (50, 3),
    "tertiary": (50, 4),
    "unclassified": (50, 5),
    "residential": (40, 6),
    "living_street": (20, 7),
}


def get_y(x, z, dtm):
    e = x + ORIGIN_E
    n = ORIGIN_N - z
    col = max(0, min(dtm.shape[1] - 1, int(round((e - X0) / 10.0))))
    row = max(0, min(dtm.shape[0] - 1, int(round((n - Y0) / 10.0))))
    return round(float(dtm[row, col]) - HEIGHT_OFFSET, 2)


def main():
    print(f"Loading {OSM_PKL} and {DTM_IN}...")
    with open(OSM_PKL, "rb") as f:
        osm = pickle.load(f)
    dtm = np.load(DTM_IN)

    roads = osm.get("roads", [])
    signals = osm.get("traffic_signals", [])

    # Sort by highway importance so even if capped, arterial/collector roads across the whole city are preserved
    drivable = [r for r in roads if r["type"] in DRIVABLE_HIGHWAYS]
    drivable.sort(key=lambda r: DRIVABLE_HIGHWAYS[r["type"]][1])

    edges = []
    nodes = {}
    out_adj = {}
    next_node_id = 0

    def get_node(pt):
        nonlocal next_node_id
        key = (round(pt[0], 1), round(pt[1], 1))
        if key not in nodes:
            nodes[key] = next_node_id
            out_adj[next_node_id] = []
            next_node_id += 1
        return nodes[key]

    for r in drivable:
        h_type = r["type"]
        pts = r["pts"]
        if len(pts) < 2:
            continue

        default_spd, _ = DRIVABLE_HIGHWAYS[h_type]
        base_speed = r.get("maxspeed") or default_spd
        oneway = r.get("oneway", False)

        for i in range(len(pts) - 1):
            p1, p2 = pts[i], pts[i + 1]
            # Keep within 14x14km scene bounds
            if abs(p1[0]) > 7500 or abs(p1[1]) > 7500 or abs(p2[0]) > 7500 or abs(p2[1]) > 7500:
                continue
            d = math.hypot(p1[0] - p2[0], p1[1] - p2[1])
            if d < 1.5:
                continue

            u = get_node(p1)
            v = get_node(p2)
            y1 = get_y(p1[0], p1[1], dtm)
            y2 = get_y(p2[0], p2[1], dtm)

            e_idx = len(edges)
            edges.append({
                "u": u, "v": v,
                "pts": [[round(p1[0], 1), round(p1[1], 1), y1], [round(p2[0], 1), round(p2[1], 1), y2]],
                "dist": round(d, 2),
                "speed": base_speed,
                "type": h_type
            })
            out_adj[u].append(e_idx)

            if not oneway:
                e_rev_idx = len(edges)
                edges.append({
                    "u": v, "v": u,
                    "pts": [[round(p2[0], 1), round(p2[1], 1), y2], [round(p1[0], 1), round(p1[1], 1), y1]],
                    "dist": round(d, 2),
                    "speed": base_speed,
                    "type": h_type
                })
                out_adj[v].append(e_rev_idx)

            if len(edges) >= 35000:
                break
        if len(edges) >= 35000:
            break

    sig_list = [{
        "id": s["id"],
        "x": round(s["x"], 1),
        "z": round(s["z"], 1),
        "y": get_y(s["x"], s["z"], dtm),
        "cycleSec": 45,
        "phaseOffset": (s["id"] % 45)
    } for s in signals]

    # Compact adjacency map for active nodes
    adj_compact = {str(nid): elist for nid, elist in out_adj.items() if elist}

    traffic_data = {
        "city": "Opole",
        "nodesCount": len(nodes),
        "edgesCount": len(edges),
        "signalsCount": len(sig_list),
        "signals": sig_list,
        "adj": adj_compact,
        "edges": edges
    }

    with open(OUT_TRAFFIC, "w", encoding="utf-8") as f:
        json.dump(traffic_data, f)

    print(f"Saved traffic graph ({len(edges)} edges, {len(sig_list)} signals) to {OUT_TRAFFIC} ({os.path.getsize(OUT_TRAFFIC) // 1024} KB)")


if __name__ == "__main__":
    main()
