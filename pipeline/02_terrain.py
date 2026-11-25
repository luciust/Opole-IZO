"""
Build high-resolution terrain elevation model (dtm.npy) and canopy height model (chm.npy)
for Opole 14 km x 14 km extent at true 10 m resolution (1401 x 1401 grid).

Sources:
- Bare-earth DTM: GUGiK NMT WCS (DTM_PL-EVRF2007-NH) at 10 m spacing
- Surface DSM:    GUGiK NMPT WCS (DSM_PL-EVRF2007-NH) at 10 m spacing -> CHM = DSM - DTM
Fallback: Open-Meteo Copernicus DEM if a WCS chunk fails.
"""

import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
from scipy.ndimage import distance_transform_edt

sys.path.append(os.path.dirname(__file__))
from config import X0, X1, Y0, Y1

BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "build")
os.makedirs(BUILD_DIR, exist_ok=True)

DTM_PATH = os.path.join(BUILD_DIR, "dtm.npy")
CHM_PATH = os.path.join(BUILD_DIR, "chm.npy")

WCS_DTM = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel"
WCS_DSM = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel"

GRID_RES = 10.0
NX_TOTAL = int(round((X1 - X0) / GRID_RES)) + 1  # 1401
NY_TOTAL = int(round((Y1 - Y0) / GRID_RES)) + 1  # 1401


def parse_aaigrid(raw_bytes):
    """Parse AAIGrid payload (possibly wrapped in multipart WCS response) into (nrows, ncols) float32 array.
    Note: AAIGrid row 0 is North (top), row -1 is South (bottom). We flip vertically so row 0 = South (Y0).
    """
    text = raw_bytes.decode("utf-8", errors="ignore")
    idx = text.find("ncols")
    if idx < 0:
        raise ValueError("Missing ncols in WCS AAIGrid response")
    lines = text[idx:].splitlines()

    header = {}
    data_start = 0
    for i, ln in enumerate(lines):
        parts = ln.strip().split()
        if len(parts) == 2 and parts[0].lower() in ("ncols", "nrows", "xllcorner", "yllcorner", "xllcenter", "yllcenter", "cellsize", "nodata_value"):
            header[parts[0].lower()] = float(parts[1])
            data_start = i + 1
        else:
            break

    ncols = int(header["ncols"])
    nrows = int(header["nrows"])
    nodata = header.get("nodata_value", -9999.0)

    vals = []
    for ln in lines[data_start:]:
        s = ln.strip()
        if not s or s.startswith("--"):
            break
        vals.extend(float(v) for v in s.split())

    expected = nrows * ncols
    if len(vals) < expected:
        raise ValueError(f"AAIGrid truncated: got {len(vals)} vs {expected}")
    arr = np.array(vals[:expected], dtype=np.float32).reshape((nrows, ncols))
    # Mask invalid/nodata elevations (Opole lies between ~130m and ~250m a.s.l.)
    arr[(arr == nodata) | (arr < 100.0) | (arr > 350.0) | (~np.isfinite(arr))] = np.nan
    # Flip North-up AAIGrid to South-up (row 0 = min Northing)
    return np.flipud(arr)


def fetch_wcs_chunk(base_url, coverage_id, e0, e1, n0, n1, width, height):
    url = (
        f"{base_url}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage"
        f"&CoverageId={coverage_id}&FORMAT=image/x-aaigrid"
        f"&SUBSET=x({e0:.1f},{e1:.1f})&SUBSET=y({n0:.1f},{n1:.1f})"
        f"&SCALESIZE=x({width}),y({height})"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Opole-IZO-Pipeline/2.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return parse_aaigrid(resp.read())
        except Exception as exc:
            if attempt == 3:
                raise
            time.sleep(2.0 * (attempt + 1))


def fill_nan_nearest(arr):
    """Fill isolated NaN voids using nearest valid neighbor."""
    mask = np.isnan(arr)
    if not np.any(mask):
        return arr
    if np.all(mask):
        return np.full_like(arr, 155.0)
    _, indices = distance_transform_edt(mask, return_distances=True, return_indices=True)
    return arr[tuple(indices)]


def fetch_full_raster(base_url, coverage_id, label, chunks_per_axis=7):
    """Fetch full 14km x 14km raster in chunks_per_axis x chunks_per_axis parallel tiles (2km each)."""
    full = np.full((NY_TOTAL, NX_TOTAL), np.nan, dtype=np.float32)
    chunk_m = (X1 - X0) / chunks_per_axis  # 2000 m
    pts_per_chunk = int(round(chunk_m / GRID_RES))  # 200 cells

    jobs = []
    for cy in range(chunks_per_axis):
        for cx in range(chunks_per_axis):
            c_e0 = X0 + cx * chunk_m
            c_e1 = c_e0 + chunk_m
            c_n0 = Y0 + cy * chunk_m
            c_n1 = c_n0 + chunk_m
            r0 = cy * pts_per_chunk
            c0 = cx * pts_per_chunk
            jobs.append((cx, cy, c_e0, c_e1, c_n0, c_n1, r0, c0, pts_per_chunk, pts_per_chunk))

    print(f"Fetching {label} ({len(jobs)} chunks of {chunk_m:.0f}m @ {GRID_RES:.0f}m via GUGiK WCS)...")
    done = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {
            pool.submit(fetch_wcs_chunk, base_url, coverage_id, e0, e1, n0, n1, w, h): (cx, cy, r0, c0, w, h)
            for (cx, cy, e0, e1, n0, n1, r0, c0, w, h) in jobs
        }
        for fut in as_completed(futs):
            cx, cy, r0, c0, w, h = futs[fut]
            done += 1
            try:
                tile_arr = fut.result()
                full[r0:r0 + h, c0:c0 + w] = tile_arr
            except Exception as exc:
                print(f"\n  Warning: chunk ({cx},{cy}) failed: {exc}")
            sys.stdout.write(f"\r  {label}: {done}/{len(jobs)} chunks")
            sys.stdout.flush()
    print()

    # Edge row/col (index 1400) filled from 1399 via fill_nan_nearest
    full = fill_nan_nearest(full)
    return full


def main():
    force = "--force" in sys.argv
    if not force and os.path.exists(DTM_PATH) and os.path.exists(CHM_PATH):
        existing_chm = np.load(CHM_PATH)
        if np.count_nonzero(existing_chm) > 0:
            print(f"High-res GUGiK DTM & CHM already exist: {DTM_PATH}, {CHM_PATH}")
            return
        print("Existing CHM is empty/placeholder — upgrading DTM & CHM from GUGiK NMT/NMPT WCS...")

    dtm = fetch_full_raster(WCS_DTM, "DTM_PL-EVRF2007-NH", "GUGiK NMT (DTM)", chunks_per_axis=7)
    print(f"DTM range: {dtm.min():.2f}m .. {dtm.max():.2f}m (mean {dtm.mean():.2f}m)")
    np.save(DTM_PATH, dtm.astype(np.float32))
    print(f"Saved {DTM_PATH}")

    dsm = fetch_full_raster(WCS_DSM, "DSM_PL-EVRF2007-NH", "GUGiK NMPT (DSM)", chunks_per_axis=7)
    chm_float = np.clip(dsm - dtm, 0.0, 50.0)
    chm_u8 = np.clip(np.round(chm_float), 0, 255).astype(np.uint8)
    print(f"CHM nonzero cells: {np.count_nonzero(chm_u8)} / {chm_u8.size}, max height: {chm_u8.max()}m")
    np.save(CHM_PATH, chm_u8)
    print(f"Saved {CHM_PATH}")


if __name__ == "__main__":
    main()
