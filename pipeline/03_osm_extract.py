"""
Extract features from data/raw/opole.osm.pbf into data/build/osm.pkl.
Handles nodes, ways, AND multipolygon relations (Odra river, forests, parks, courtyard buildings).
Transforms coordinates into EPSG:2180 scene coords:
  x = Easting - ORIGIN_E
  z = ORIGIN_N - Northing (south is +z)
"""

import os
import pickle
import sys
import osmium
import pyproj

sys.path.append(os.path.dirname(__file__))
from config import ORIGIN_E, ORIGIN_N, X0, X1, Y0, Y1

RAW_PBF = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "opole.osm.pbf")
BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "build")
os.makedirs(BUILD_DIR, exist_ok=True)
OUT_PKL = os.path.join(BUILD_DIR, "osm.pkl")

# Coordinate transformer: WGS84 -> EPSG:2180
trans = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:2180", always_xy=True)

# Pre-filter in WGS84 degrees (with margin around 14x14km Opole box) before expensive pyproj calls
MIN_LON, MAX_LON = 17.78, 18.08
MIN_LAT, MAX_LAT = 50.56, 50.77
MARGIN = 500.0


def to_scene_xy(lon, lat):
    e, n = trans.transform(lon, lat)
    sx = e - ORIGIN_E
    sz = ORIGIN_N - n
    return sx, sz, e, n


def parse_float(val, default):
    try:
        return float(str(val).split()[0].replace(",", "."))
    except Exception:
        return default


def parse_int(val, default):
    try:
        return int(float(str(val).split()[0]))
    except Exception:
        return default


class OpoleOsmExtractor(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.roads = []
        self.waterways = []
        self.water_areas = []
        self.railways = []
        self.landuse = []
        self.buildings = []
        self.traffic_signals = []
        self.lamps = []
        self.pois = []
        self.barriers = []

    def _in_box(self, e, n_val, margin=0.0):
        return (X0 - margin <= e <= X1 + margin) and (Y0 - margin <= n_val <= Y1 + margin)

    def node(self, n):
        if not n.location.valid():
            return
        lon = n.location.lon
        lat = n.location.lat
        if not (MIN_LON <= lon <= MAX_LON and MIN_LAT <= lat <= MAX_LAT):
            return

        tags = dict(n.tags)
        if not tags:
            return

        sx, sz, e, n_val = to_scene_xy(lon, lat)
        if not self._in_box(e, n_val):
            return

        if tags.get("highway") == "traffic_signals":
            self.traffic_signals.append({
                "id": n.id,
                "x": sx, "z": sz, "e": e, "n": n_val,
                "direction": tags.get("traffic_signals:direction", ""),
            })

        if tags.get("highway") == "street_lamp":
            self.lamps.append({
                "id": n.id,
                "x": sx, "z": sz, "e": e, "n": n_val,
            })

        if any(k in tags for k in ("amenity", "tourism", "historic", "leisure")):
            self.pois.append({
                "id": n.id,
                "x": sx, "z": sz, "e": e, "n": n_val,
                "name": tags.get("name", ""),
                "type": tags.get("amenity") or tags.get("tourism") or tags.get("historic") or tags.get("leisure"),
                "tags": tags
            })

        if "barrier" in tags:
            self.barriers.append({
                "id": n.id,
                "x": sx, "z": sz, "e": e, "n": n_val,
                "barrier": tags.get("barrier")
            })

    def _extract_polygon_tags(self, osm_id, tags, pts_scene):
        # Water bodies (rivers, lakes, ponds, canals)
        if tags.get("natural") == "water" or "water" in tags or tags.get("landuse") in ("reservoir", "basin"):
            self.water_areas.append({
                "id": osm_id,
                "type": tags.get("water", tags.get("natural", "water")),
                "name": tags.get("name", ""),
                "poly": pts_scene
            })

        # Landuse, natural, leisure & amenity plazas/parkings/cemeteries
        landuse_keys = ("landuse", "natural", "leisure")
        matched_lu = False
        for k in landuse_keys:
            if k in tags:
                val = tags[k]
                if k == "natural" and val == "water":
                    continue
                self.landuse.append({
                    "id": osm_id,
                    "key": k,
                    "val": val,
                    "name": tags.get("name", ""),
                    "poly": pts_scene
                })
                matched_lu = True
                break
        if not matched_lu and tags.get("amenity") in ("parking", "grave_yard"):
            val = "cemetery" if tags.get("amenity") == "grave_yard" else "parking"
            self.landuse.append({
                "id": osm_id,
                "key": "amenity",
                "val": val,
                "name": tags.get("name", ""),
                "poly": pts_scene
            })

        # Buildings (OSM fallback & height/tag reference)
        if "building" in tags and tags["building"] != "no":
            lvl = parse_float(tags.get("building:levels", "1"), 1.0)
            height = parse_float(tags.get("height", ""), lvl * 3.2)
            height = max(2.5, min(height, 120.0))
            self.buildings.append({
                "id": osm_id,
                "type": tags["building"],
                "height": height,
                "levels": lvl,
                "name": tags.get("name", ""),
                "roof_shape": tags.get("roof:shape", "flat"),
                "poly": pts_scene
            })

    def way(self, w):
        if len(w.nodes) < 2:
            return
        tags = dict(w.tags)
        if not tags:
            return

        # Quick WGS84 check on first node to skip out-of-region ways rapidly
        first = w.nodes[0]
        if first.location.valid():
            if not (MIN_LON - 0.08 <= first.location.lon <= MAX_LON + 0.08 and
                    MIN_LAT - 0.05 <= first.location.lat <= MAX_LAT + 0.05):
                return

        coords = []
        in_bounds = False
        for n in w.nodes:
            if n.location.valid():
                sx, sz, e, n_val = to_scene_xy(n.location.lon, n.location.lat)
                coords.append((sx, sz, e, n_val))
                if self._in_box(e, n_val, MARGIN):
                    in_bounds = True

        if not in_bounds or len(coords) < 2:
            return

        pts_scene = [(p[0], p[1]) for p in coords]

        if "highway" in tags:
            h_type = tags["highway"]
            self.roads.append({
                "id": w.id,
                "type": h_type,
                "name": tags.get("name", ""),
                "ref": tags.get("ref", ""),
                "oneway": tags.get("oneway") in ("yes", "1", "true"),
                "bridge": tags.get("bridge") not in (None, "no"),
                "tunnel": tags.get("tunnel") in ("yes", "building_passage"),
                "layer": parse_int(tags.get("layer", "0"), 0),
                "lanes": parse_int(tags.get("lanes", "1"), 1),
                "maxspeed": parse_int(tags.get("maxspeed", "50"), 50),
                "pts": pts_scene
            })

        if "railway" in tags and tags["railway"] in ("rail", "tram", "light_rail", "subway", "narrow_gauge"):
            self.railways.append({
                "id": w.id,
                "type": tags["railway"],
                "bridge": tags.get("bridge") not in (None, "no"),
                "tunnel": tags.get("tunnel") == "yes",
                "layer": parse_int(tags.get("layer", "0"), 0),
                "name": tags.get("name", ""),
                "pts": pts_scene
            })

        if "waterway" in tags:
            self.waterways.append({
                "id": w.id,
                "type": tags["waterway"],
                "name": tags.get("name", ""),
                "pts": pts_scene
            })

        is_closed = (w.nodes[0].ref == w.nodes[-1].ref and len(coords) >= 4)
        if is_closed:
            self._extract_polygon_tags(w.id, tags, pts_scene)

    def area(self, a):
        # Closed ways are already handled in way(); only process multipolygon relations here
        if a.from_way():
            return
        tags = dict(a.tags)
        if not tags:
            return

        relevant = (
            "building" in tags
            or "landuse" in tags
            or "natural" in tags
            or "leisure" in tags
            or "water" in tags
            or tags.get("amenity") in ("parking", "grave_yard")
        )
        if not relevant:
            return

        for ring in a.outer_rings():
            coords = []
            in_bounds = False
            for n in ring:
                if n.location.valid():
                    sx, sz, e, n_val = to_scene_xy(n.location.lon, n.location.lat)
                    coords.append((sx, sz))
                    if self._in_box(e, n_val, MARGIN):
                        in_bounds = True
            if in_bounds and len(coords) >= 4:
                self._extract_polygon_tags(a.orig_id(), tags, coords)


def main():
    print(f"Extracting features from {RAW_PBF} with Osmium (nodes, ways, multipolygon areas)...")
    ext = OpoleOsmExtractor()
    ext.apply_file(RAW_PBF, locations=True)

    data = {
        "roads": ext.roads,
        "waterways": ext.waterways,
        "water_areas": ext.water_areas,
        "railways": ext.railways,
        "landuse": ext.landuse,
        "buildings": ext.buildings,
        "traffic_signals": ext.traffic_signals,
        "lamps": ext.lamps,
        "pois": ext.pois,
        "barriers": ext.barriers,
    }

    print("Extracted counts:")
    for k, v in data.items():
        print(f"  {k:16}: {len(v):7} items")

    with open(OUT_PKL, "wb") as f:
        pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)
    print(f"Saved to {OUT_PKL} ({os.path.getsize(OUT_PKL) // 1024} KB)")


if __name__ == "__main__":
    main()
