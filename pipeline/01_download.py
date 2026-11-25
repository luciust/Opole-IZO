"""
Download pipeline for Opole-IZO.
Downloads:
1. GUGiK LoD2 CityGML for Miasto Opole (TERYT 1661) and Powiat Opolski (TERYT 1609)
2. Geofabrik Opolskie OSM extract (opolskie-latest.osm.pbf -> opole.osm.pbf)
"""

import os
import sys
import time
import urllib.request
import zipfile

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
os.makedirs(RAW_DIR, exist_ok=True)

LOD2_1661_URL = "https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD2/1661_gml.zip"
LOD2_1609_URL = "https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD2/1609_gml.zip"
OSM_URL = "https://download.geofabrik.de/europe/poland/opolskie/opolskie-latest.osm.pbf"


def download_file(url, target_path, max_age_days=None):
    if os.path.exists(target_path) and os.path.getsize(target_path) > 1000:
        age_days = (time.time() - os.path.getmtime(target_path)) / 86400.0
        if max_age_days is None or age_days <= max_age_days:
            print(f"Already up to date: {target_path} ({os.path.getsize(target_path)} bytes, {age_days:.1f}d old)")
            return target_path
        print(f"Refreshing stale file ({age_days:.1f}d old): {target_path}")

    print(f"Downloading {url} -> {target_path}...")
    headers = {"User-Agent": "Opole-IZO-Pipeline/2.0"}
    req = urllib.request.Request(url, headers=headers)

    tmp_path = target_path + ".part"
    with urllib.request.urlopen(req, timeout=180) as resp:
        total_size = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size = 1024 * 512
        with open(tmp_path, "wb") as f:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    pct = (downloaded / total_size) * 100
                    sys.stdout.write(f"\r  [{pct:5.1f}%] {downloaded // 1024} / {total_size // 1024} KB")
                    sys.stdout.flush()
                else:
                    sys.stdout.write(f"\r  {downloaded // 1024} KB")
                    sys.stdout.flush()
    os.replace(tmp_path, target_path)
    print("\nDownload complete.")
    return target_path


def unpack_zip(zip_path, out_dir):
    if os.path.exists(out_dir) and any(os.scandir(out_dir)):
        print(f"Directory already unpacked: {out_dir}")
        return
    print(f"Unpacking {zip_path} -> {out_dir}...")
    os.makedirs(out_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(out_dir)
    print("Unpacked.")


def main():
    lod2_1661_zip = os.path.join(RAW_DIR, "1661_gml.zip")
    lod2_1609_zip = os.path.join(RAW_DIR, "1609_gml.zip")
    osm_pbf = os.path.join(RAW_DIR, "opole.osm.pbf")

    lod2_1661_dir = os.path.join(RAW_DIR, "lod2_1661")
    lod2_1609_dir = os.path.join(RAW_DIR, "lod2_1609")

    if not os.path.exists(lod2_1661_dir):
        download_file(LOD2_1661_URL, lod2_1661_zip)
        unpack_zip(lod2_1661_zip, lod2_1661_dir)
    else:
        print(f"LoD2 1661 already unpacked: {lod2_1661_dir}")

    if not os.path.exists(lod2_1609_dir):
        download_file(LOD2_1609_URL, lod2_1609_zip)
        unpack_zip(lod2_1609_zip, lod2_1609_dir)
    else:
        print(f"LoD2 1609 already unpacked: {lod2_1609_dir}")

    download_file(OSM_URL, osm_pbf, max_age_days=3.0)


if __name__ == "__main__":
    main()
