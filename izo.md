# Isometric living-city map — implementation guide

A browser map of a whole city and its surroundings, drawn as an **isometric pixel-art 3D scene**
that is also a **living simulation**: pedestrians, cars, buses, trains, aircraft, weather, day/night,
seasons and a handful of date-driven easter eggs. Everything is precomputed from open data into
static files; the browser only renders and simulates.

This document is distilled from the requests that shaped the first build (a mid-size Polish city
with mountains next to it) and is written so the same result can be produced for **another city**.
City-specific pieces are called out in **"Replace for a new city"** boxes.

---

## 1. Goals (what "done" looks like)

- The whole city + surroundings, every building, tree, road, rail line and river, in 3D, crisp
  pixel-art look (low internal resolution, nearest upscale, outline pass), smooth on desktop and
  usable on phones.
- It must feel **alive**: people walk on pavements between homes, stops and squares; cars obey
  speed limits and traffic lights; real buses at their live positions; trains on timetable;
  playgrounds and pitches in use; light planes and gliders over the local airfield.
- **Landmarks are modelled by hand** from photos (cathedral, city hall, castle, theatre, main post
  office, station, stadium, malls, university, bridges, fountains, sculptures, huts and masts on the
  hills). Old-town squares get per-house façades.
- Day/night with the real sun, four seasons (snow in winter), weather (live or manual), wind.
- Purely static files; the only live calls go through a caching reverse proxy.
- No trademarks/logos (brand **colours** only). Credit the open data sources in an About box.
  Small credit bottom-left: "Created with ♥ by <author>" linking to the author's profile.
- **Never extend the map area** once fixed; POIs outside it are skipped.

---

## 2. Architecture

```
open data ──► Python pipeline (offline, minutes) ──► static files (tiles + JSON/BIN layers)
                                                      │
                                   Vite + three.js app ┘  (render + simulate)
                                   live feeds via a small caching proxy at /api/*
```

- **Coordinates:** national metric CRS (here EPSG:2180). Scene: `x = E − ORIGIN_E`, `z = ORIGIN_N − N`
  (z points south), `y = H − 200` (height offset). Map = grid of **1 km tiles** (here 19 × 24 = 456).
- **Repo layout:** `pipeline/` (Python, venv), `data/raw` (downloads, deleted after processing to save
  disk), `data/build` (intermediates), `web/` (Vite app; `web/public/data` = pipeline output),
  plus the `/api` proxy config.
- **Disk discipline:** delete raw downloads after use, keep only what rebuilds need
  (e.g. raw + graded DTM copies).

### Replace for a new city
| Thing | First build | For a new city |
|---|---|---|
| CRS | EPSG:2180 | the country's metric CRS (or UTM zone) |
| Bounds / origin | `config.py` X0..X1, Y0..Y1, ORIGIN | pick the city box + surrounding hills; origin at the main square |
| Default view | main square, azimuth 205°, 0.43 m/texel | your signature view |

---

## 3. Data sources

| Layer | First build source | Replace for a new city |
|---|---|---|
| Terrain (DTM, bare earth) 1–2 m | national geoportal WCS (GUGiK NMT) | national LiDAR DTM (e.g. AHN, IGN RGE ALTI, USGS 3DEP, Copernicus GLO-30 as fallback) |
| Surface (DSM) → CHM = DSM − DTM | GUGiK NMPT | same LiDAR product; needed for trees, bridge decks, missing buildings |
| 3D buildings with roofs | GUGiK **LoD2** CityGML | national LoD2 / CityGML (DE, NL, CH, FR have it); else OSM extrusion + DSM heights |
| Orthophoto | GUGiK HighResolution | national ortho; used to sample roof colours and verify features |
| Streets, land use, POIs, rail, barriers, lamps | OSM extract (Geofabrik region .pbf) | the region's Geofabrik extract |
| Live buses + timetables | city transit API (`getRunningVehicles`, stops, courses, calendar) | city GTFS + GTFS-RT, or its custom API |
| Road congestion / signalised junctions | city ITS API (`/api/v1/traffic`) | city ITS / open traffic feed; else a typical-day profile only |
| Trains | national GTFS (community feed) + rolling-stock photos/liveries | national/regional GTFS; operators' liveries |
| Expressway volumes | road agency traffic counts | national counts |
| Weather (auto mode) | Open-Meteo `current=` for the city lat/lon (CC BY 4.0) | same, change coordinates |
| Landmark references | Wikimedia Commons, Wikipedia, local galleries | same |

**ITS replacement in detail.** The first build used the city's ITS for three things:
(1) live congestion colours per road segment, (2) the list of signalised junctions and approaches,
(3) live bus positions + full timetables. For another city:
- buses → **GTFS** (static: stops, shapes, trips, calendar) + **GTFS-RT VehiclePositions**;
  rebuild "courses" from `stop_times`; keep the same `buses.json` shape the web module reads.
- traffic lights → OSM `highway=traffic_signals` (+ `traffic_signals:direction`), generate phases
  per junction.
- congestion → if no open feed, ship only a precomputed hour-of-week profile (the app already
  falls back to it).

---

## 4. Pipeline (run in order; `run_all.sh`)

1. **download** — DTM + DSM tiles via WCS (2 km chunks, 2 m), OSM pbf, LoD2 zips.
2. **terrain** — mosaic → `dtm.npy`, `chm.npy` (uint8, 0.25 m units).
3. **osm_extract** — one pyosmium pass → `osm.pkl` (lines / areas / nodes with the tag keys you need;
   remember `barrier` for nodes too).
4. **grade** — fixes the bare-earth DTM for transport:
   - fill pits where roads/rails cross culverts and small untagged bridges (morphological closing
     along each road/rail chain, steepness test, embankment fall-off);
   - **do not** skip a pit just because a `tunnel=yes`/`layer<0` way crosses it (that way is *below*);
   - **underpasses:** where a ground road passes under a bridge deck the DTM humps up to the deck
     level → cut it back to the grade on either side;
   - **road tunnels:** cut approaches to the portal face with retaining walls, export portals
     (position, heading, road level, width, ground above) → `road_tunnels.json`;
   - never cut into rail corridors; carve stadium bowls to the pitch level.
5. **buildings** (LoD2 → per-tile triangle soup), **osm_buildings** (OSM fallback where LoD2 lacks a
   building; careful: don't drop a big new building because two old sheds' centroids fall inside it),
   **military_fill** (blurred areas in the official data filled from older photos/maps).
6. **trees** — from CHM local maxima (crown height/radius, broadleaf vs conifer); drop trunks on
   roads/railways/playgrounds/landmark footprints; trim crowns overhanging carriageways.
7. **ortho** — roof colour sampling.
8. **Hand-modelled layers** (data from pipeline, geometry in JS): `landmarks`, `squares`, `malls`
   (big boxes newer than the LiDAR), `sculptures`, `poi_overrides`, `frontages` (old-town houses:
   OSM footprint + LoD2 roof clipped per house + façade rules + photo overrides), `extra_places`
   (university, park/recreation ground, dam…), `airfield`, `playgrounds` (+ pitches, courts),
   `extras` (place names, POIs, lamps with road-facing yaw, signals, crosses, aerialways),
   `cemeteries` (grave rows per quarter, walls/fences/gates, candle data, row bands for tiles).
9. **cars** (parking lots), **tiles** (ground index PNG per tile + `_s.png` far copy + .bin with
   heights, buildings, trees; hide polygons for anything modelled by hand), **trains**, **traffic**
   (road graph, lanes, densities, signals, ITS mapping), **buses**, **people** (walk graph, residents,
   square life), **roads3d** (bridge decks from DSM + approach grades, piers, abutments, noise walls),
   **outdoor** (hiking/MTB/ski).

Ground is a **palette-indexed** texture (64 classes × 4 seasons, `palette.py`); classes include
grass, forest, water, roads, rail, farmland, cemetery, grave rows, coal, etc. Use per-OSM-id
`FORCE` overrides for misleading tags (e.g. a "farmland" that is a pasture, a "pitch" that is asphalt).

---

## 5. Web app (Vite + three.js)

**Rendering**
- Orthographic isometric camera (30° elevation, free azimuth, snap to 45° multiples), zoom in
  metres-per-texel; render target at ½ CSS resolution → **outline/crease pass + weather in the
  low-res pass** → nearest upscale. Optional **CRT look** (Lottes multipass shader, blend 0..1;
  default 0.4; xBR was tried first and is worse for this content).
- Tiles streamed by distance; **decoded in Web Workers** (transferable buffers) and committed one
  per frame; LOD by zoom (coarser terrain grid, 250 px ground copy, trees thinned then hidden).
- Adaptive quality (shadow map size, tree density) from frame time; phones start lower.
- Buildings **double-sided** (courtyard walls are otherwise wound inward and vanish from one side).
- Every data URL carries the **build id** (`?v=`) because tiles keep their names between builds
  and caches would otherwise serve stale terrain.

**Simulation modules** (`update(dt, view, env)` each; `env = {night, season, date, anim, mpt, ctl,
outdoor, flyable, wind}`):
- people (residents' daily plans, pavements & crossings only, chatting groups, café gardens,
  crowds near cemeteries on 1–2 Nov), cars (lanes, speed limits, signals, junction priority,
  headlights at night, varied models/colours + motorcycles), parked cars by time of day,
  buses (live / timetable, passengers by load), trains (timetable, real liveries, tunnels clip),
  aircraft at the local airfield (aerotows, sorties, helicopters, visitors; max 2–3 in the air;
  runway into the wind; windsock follows the wind), playgrounds (kids on swings/carousels),
  football/basketball/tennis/volleyball, stadium matches (evening fixtures under floodlights),
  MTB riders on trails (night headlights until midnight), ski lifts/gondola.
- Street lamps: soft ovals stretched along the road (lamps face their road); a **top-down lamp
  light map** lets cars, buses and people light up under lamps.
- Weather: clouds (tileable field texture, per-cloud random transparency, stepped pixel puffs,
  shadows from the depth buffer), rain, snow, fog, lightning, wind (tree sway, falling autumn
  leaves, cloud/rain drift). Auto mode from the forecast.
- Advanced panel (desktop drawer / mobile bottom sheet): time & speed, weather, life, traffic,
  view; every non-default setting mirrored in the URL hash; "copy link".
- Onboarding tour on first visit (skippable, remembered), screensaver-style POI tour button,
  photo button (canvas without UI). Mobile: keep the toolbar short.

**Easter eggs (date-driven, no UI):** grave candles (faint on ordinary nights, a sea of lights on
1–2 Nov), Christmas trees on the two main squares 6 Dec – 12 Jan, New Year fireworks 23:50–00:10,
grazing cows/horses/sheep on specific pastures mid-May – September. Adapt dates and places to the
new city's customs.

---

## 6. Static output and live feeds

- The build is plain static files (precompressed .gz next to each asset); hashed bundles, tiles
  and data layers can be cached for a long time, `index.html` must not be.
- Live feeds never go from the browser to third parties: the app calls same-origin `/api/*`
  endpoints served by a **caching reverse proxy** (10–15 s for live vehicle/traffic feeds, hours
  for route shapes, 10 min for weather), with request coalescing, serve-stale-while-updating,
  only the exact endpoints whitelisted, foreign-Origin / cross-site requests refused and a
  per-visitor rate limit. This protects the city's services and lets the page run under a strict
  CSP (`connect-src 'self'`, self-hosted font).

## 7. Lessons / pitfalls

- Bare-earth DTM is wrong exactly where transport is: bridge abutments, culverts, underpasses,
  tunnel portals, stadium bowls. Grade it (section 4.4) before anything samples heights.
- LiDAR/LoD2 can be years old: new malls, sports halls and retail parks need manual big-box models.
- OSM tags lie sometimes (levels on pavilions, landuse of pastures, positions of outdoor gyms):
  check against the orthophoto and keep a small override table.
- Courtyard walls, tunnels, decks: anything with an "inside" needs explicit handling.
- Keep the main thread free: worker decoding, one commit per frame, instancing, chunked meshes,
  LOD by zoom; measure GPU time per change (timer/readPixels loop) and keep additions < ~1 ms.
- Cached static data: tiles keep their names between builds, so version every data URL.

## 8. New-city checklist

1. Choose CRS, bounds (city + hills), origin, default view; write `config.py`.
2. Find DTM/DSM/LoD2/ortho services; adapt `download.py` / `buildings.py` parsers.
3. Geofabrik extract; review tag coverage (lamps, signals, sidewalks, barriers).
4. Transit: GTFS + GTFS-RT → `buses.json`; trains GTFS → `trains.json`; liveries from photos.
5. Traffic: ITS feed if any → congestion + signals; else OSM signals + typical profile.
6. Run the pipeline; fix grading spots (bridges, tunnels, underpasses) by walking the map.
7. Model the top ~30 landmarks, squares' façades, stadium, station, malls, university, airfield.
8. Localise easter eggs (holidays, Christmas markets, fireworks, pastures) and texts/credits.
9. Proxy entries for the new live feeds + weather coordinates; CSP.
