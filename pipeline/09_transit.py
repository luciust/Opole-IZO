"""
Transit data generator for Opole-IZO.
Extracts real railway polylines from osm.pkl and stamps 10m DTM elevation (y) onto every point.
Outputs web/public/data/transit.json
"""

import os
import sys
import pickle
import json
import numpy as np

sys.path.append(os.path.dirname(__file__))
from config import X0, Y0, ORIGIN_E, ORIGIN_N, HEIGHT_OFFSET

BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "build")
PUBLIC_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data")
OSM_PKL = os.path.join(BUILD_DIR, "osm.pkl")
DTM_IN = os.path.join(BUILD_DIR, "graded_dtm.npy")
OUT_TRANSIT = os.path.join(PUBLIC_DATA_DIR, "transit.json")


def get_y(x, z, dtm):
    e = x + ORIGIN_E
    n = ORIGIN_N - z
    col = max(0, min(dtm.shape[1] - 1, int(round((e - X0) / 10.0))))
    row = max(0, min(dtm.shape[0] - 1, int(round((n - Y0) / 10.0))))
    return round(float(dtm[row, col]) - HEIGHT_OFFSET, 2)


def stamp_y(pts2d, dtm):
    return [[round(p[0], 1), round(p[1], 1), get_y(p[0], p[1], dtm)] for p in pts2d]


def main():
    print(f"Loading {OSM_PKL} and {DTM_IN} for transit network...")
    with open(OSM_PKL, "rb") as f:
        osm = pickle.load(f)
    dtm = np.load(DTM_IN)

    railways = osm.get("railways", [])
    main_tracks = []
    for r in railways:
        pts = r["pts"]
        if len(pts) >= 2:
            main_tracks.append({
                "id": r["id"],
                "name": r.get("name", "Linia kolejowa"),
                "bridge": r.get("bridge", False),
                "pts": pts
            })

    print(f"Found {len(main_tracks)} railway segments.")

    # Key train routes across Opole with real elevation y
    precomputed_train_routes = [
        {
            "id": "e30_main",
            "name": "Linia E30 (Wrocław - Katowice)",
            "speed": 160,
            "pts": stamp_y([
                [-6500.0, -1800.0],
                [-3800.0, -800.0],
                [-1200.0, 100.0],   # Opole Zachodnie
                [-200.0, 350.0],    # Most kolejowy nad Odrą
                [199.0, 563.0],     # Opole Główne
                [1500.0, 1200.0],
                [3200.0, 2400.0],   # Opole Groszowice
                [6800.0, 5100.0]
            ], dtm),
            "trains": [
                {
                    "type": "PKP_InterCity_Pendolino",
                    "model": "ED250",
                    "length": 7,
                    "color": "#1e3799",
                    "accent": "#f6b93b",
                    "intervalSec": 180
                },
                {
                    "type": "Polregio_Impuls",
                    "model": "EN63A",
                    "length": 4,
                    "color": "#c0392b",
                    "accent": "#ecf0f1",
                    "intervalSec": 120
                }
            ]
        },
        {
            "id": "line_kluczbork",
            "name": "Linia do Kluczborka",
            "speed": 100,
            "pts": stamp_y([
                [199.0, 563.0],     # Opole Główne
                [1200.0, -200.0],   # Opole Wschodnie
                [2400.0, -1800.0],  # Opole Gosławice
                [4100.0, -4200.0],
                [5500.0, -6800.0]
            ], dtm),
            "trains": [
                {
                    "type": "Polregio_Szynobus",
                    "model": "SA137",
                    "length": 2,
                    "color": "#e67e22",
                    "accent": "#2c3e50",
                    "intervalSec": 240
                }
            ]
        }
    ]

    # Fallback simulated MZK bus routes (used when live GPS positions aren't available for a bus)
    mzk_lines = [
        {
            "route": "3",
            "color": "#e74c3c",
            "headsign": "Zaodrze - Dambonia <-> Pużaka",
            "pts": stamp_y([
                [-3200.0, 600.0],
                [-1500.0, 400.0],
                [-470.0, -280.0],  # Most Piastowski
                [50.0, 100.0],     # Plac Wolności
                [199.0, 563.0],    # Dworzec Główny
                [1200.0, 400.0],   # 1 Maja
                [2500.0, -300.0],  # Sosnkowskiego
                [3800.0, -800.0]   # Pużaka Pętla
            ], dtm)
        },
        {
            "route": "15",
            "color": "#3498db",
            "headsign": "Wrocławska <-> Witosa / USK",
            "pts": stamp_y([
                [-4200.0, -1800.0], # Bierkowice Skansen
                [-3095.0, -513.0],  # Cmentarz Półwieś
                [-1200.0, -100.0],  # Wrocławska
                [-470.0, -280.0],   # Most Piastowski
                [-100.0, -250.0],   # Katedralna
                [191.0, -364.0],    # Solaris / Plac Kopernika
                [1400.0, -600.0],   # Oleska
                [3200.0, -1200.0]   # Witosa Szpital USK
            ], dtm)
        },
        {
            "route": "9",
            "color": "#2ecc71",
            "headsign": "Bierkowice <-> Grotowice",
            "pts": stamp_y([
                [-4500.0, -2200.0],
                [-3095.0, -513.0],
                [-500.0, 100.0],
                [50.0, 120.0],     # Plac Wolności
                [199.0, 563.0],    # Dworzec Główny
                [800.0, 1400.0],   # Armii Krajowej
                [2400.0, 3200.0],  # Groszowice
                [4200.0, 5500.0]   # Grotowice
            ], dtm)
        },
        {
            "route": "17",
            "color": "#9b59b6",
            "headsign": "Chmielowice <-> Częstochowska",
            "pts": stamp_y([
                [-5200.0, 2200.0], # Chmielowice Pętla
                [-2800.0, 1200.0],
                [-800.0, 400.0],   # Spychalskiego
                [50.0, 150.0],     # Plac Wolności
                [191.0, -364.0],   # Solaris
                [1800.0, 200.0],   # Ozimska
                [3500.0, 800.0]    # Częstochowska
            ], dtm)
        }
    ]

    transit_data = {
        "city": "Opole",
        "trainRoutes": precomputed_train_routes,
        "mzkLines": mzk_lines,
        "railwayTracks": main_tracks[:600]
    }

    with open(OUT_TRANSIT, "w", encoding="utf-8") as f:
        json.dump(transit_data, f)

    print(f"Saved transit network to {OUT_TRANSIT} ({os.path.getsize(OUT_TRANSIT) // 1024} KB)")


if __name__ == "__main__":
    main()
