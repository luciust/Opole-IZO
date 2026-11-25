#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "=========================================================="
echo "          OPOLE-IZO — Pipeline Execution Script           "
echo "=========================================================="

PYTHON="pipeline/venv/bin/python"

if [ ! -f "${PYTHON}" ]; then
  echo "Virtualenv not found. Creating pipeline/venv..."
  python3 -m venv pipeline/venv
  pipeline/venv/bin/pip install --upgrade pip
  pipeline/venv/bin/pip install numpy scipy shapely pyproj pillow requests osmium
fi

echo "Step 1: Downloading open geodata (LoD2 CityGML, OSM)..."
${PYTHON} pipeline/01_download.py

echo "Step 2: Generating DTM elevation model and CHM..."
${PYTHON} pipeline/02_terrain.py

echo "Step 3: Extracting features from OSM (roads, waterways, landuse)..."
${PYTHON} pipeline/03_osm_extract.py

echo "Step 4: Grading terrain (waterways, bridge decks, tunnels)..."
${PYTHON} pipeline/04_grade.py

echo "Step 5: Extracting LoD2 3D building meshes..."
${PYTHON} pipeline/05_buildings.py

echo "Step 6: Generating tree distributions from landuse..."
${PYTHON} pipeline/06_trees.py

echo "Step 7: Building road traffic graph..."
${PYTHON} pipeline/07_traffic_graph.py

echo "Step 8: Building pedestrian walking graph..."
${PYTHON} pipeline/08_walk_graph.py

echo "Step 9: Generating transit routes and timetable data..."
${PYTHON} pipeline/09_transit.py

echo "Step 10: Generating binary tiles and ground palette textures..."
${PYTHON} pipeline/10_tile_generator.py

echo "Step 11: Generating city-wide street light positions..."
${PYTHON} pipeline/11_lamps.py

echo "Step 12: Building Vite production web bundle..."
cd web && npm run build && cd ..

echo "=========================================================="
echo "Pipeline execution finished successfully!"
echo "Run './start.sh' to start the application."
echo "=========================================================="
