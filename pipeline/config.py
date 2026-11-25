"""
Opole-IZO configuration.
CRS: EPSG:2180 (Poland CS92)
Center: Opole Rynek (Town Hall)
"""

# EPSG:2180 bounds for 14 km x 14 km (14 x 14 = 196 tiles of 1 km each)
TILE_SIZE = 1000.0  # 1000 meters per tile

X0 = 417000.0  # Min Easting
X1 = 431000.0  # Max Easting (14 km width)
Y0 = 304000.0  # Min Northing
Y1 = 318000.0  # Max Northing (14 km height)

NUM_TILES_X = int((X1 - X0) / TILE_SIZE)  # 14
NUM_TILES_Y = int((Y1 - Y0) / TILE_SIZE)  # 14

# Scene origin (Rynek / Ratusz in Opole)
ORIGIN_E = 423960.0
ORIGIN_N = 311640.0
HEIGHT_OFFSET = 150.0  # Ground is ~152-165m a.s.l., y = H - 150

# WGS84 coordinates of the center
CENTER_LAT = 50.666818
CENTER_LON = 17.923641

BUILD_ID = "opole_20261125_v3"

# Bounding box in WGS84 for external API requests (e.g. Overpass, zbiorkom live buses)
# Approx EPSG:2180 to WGS84 bounds
BBOX_WGS84 = {
    "min_lon": 17.82,
    "min_lat": 50.59,
    "max_lon": 18.03,
    "max_lat": 50.74,
}
