"""
Ground color palette definition: 64 classes across 4 seasons (summer, autumn, winter, spring).
Each class maps to an 8-bit index (0-63).
"""

CLASSES = {
    0: "default_grass",
    1: "park_grass",
    2: "meadow",
    3: "farmland_crop",
    4: "farmland_fallow",
    5: "orchard",
    6: "forest_deciduous",
    7: "forest_coniferous",
    8: "forest_mixed",
    9: "scrub",
    10: "water_deep",
    11: "water_shallow",
    12: "river_bank",
    13: "canal_mlynowka",
    14: "lake_bolko",
    15: "wetland",
    16: "road_highway",
    17: "road_primary",
    18: "road_secondary",
    19: "road_residential",
    20: "road_service",
    21: "track_unpaved",
    22: "path_pedestrian",
    23: "cycleway",
    24: "railway_ballast",
    25: "railway_service",
    26: "tram_track",
    27: "pavement_concrete",
    28: "pavement_cobblestone",
    29: "rynek_stone",
    30: "building_footprint",
    31: "building_roof_tile",
    32: "building_roof_metal",
    33: "building_roof_flat",
    34: "parking_asphalt",
    35: "parking_cobble",
    36: "industrial_ground",
    37: "railway_station_platform",
    38: "cemetery_ground",
    39: "cemetery_grave_row",
    40: "allotment_garden",
    41: "playground_rubber",
    42: "pitch_grass",
    43: "pitch_artificial",
    44: "pitch_clay",
    45: "beach_sand",
    46: "construction",
    47: "quarry_gravel",
    48: "brownfield",
    49: "bridge_deck_road",
    50: "bridge_deck_foot",
    51: "tunnel_approach",
    52: "embankment",
    53: "fountain_basin",
    54: "courtyard",
    55: "stadium_turf",
    56: "stadium_running_track",
    57: "zoo_enclosure",
    58: "skansen_pasture",
    59: "amphitheatre_stone",
    60: "hedge",
    61: "flowerbed",
    62: "curb_marking",
    63: "void",
}

# Seasonal RGB palettes: index -> (R, G, B)
# Seasons: 0=summer, 1=autumn, 2=winter, 3=spring

# Summer (vibrant greens, warm stone, deep blue water)
PALETTE_SUMMER = [
    (118, 168, 88),   # 0: default_grass
    (96, 172, 74),    # 1: park_grass
    (134, 184, 98),   # 2: meadow
    (198, 182, 108),  # 3: farmland_crop
    (168, 142, 102),  # 4: farmland_fallow
    (106, 162, 70),   # 5: orchard
    (68, 128, 54),    # 6: forest_deciduous
    (48, 98, 48),     # 7: forest_coniferous
    (58, 114, 52),    # 8: forest_mixed
    (110, 148, 76),   # 9: scrub
    (54, 96, 142),    # 10: water_deep (Odra)
    (68, 118, 158),   # 11: water_shallow
    (138, 134, 112),  # 12: river_bank
    (58, 108, 138),   # 13: canal_mlynowka
    (52, 92, 136),    # 14: lake_bolko
    (88, 124, 94),    # 15: wetland
    (74, 76, 80),     # 16: road_highway
    (88, 90, 94),     # 17: road_primary
    (108, 110, 114),  # 18: road_secondary
    (124, 126, 128),  # 19: road_residential
    (134, 132, 128),  # 20: road_service
    (178, 164, 140),  # 21: track_unpaved
    (184, 178, 168),  # 22: path_pedestrian
    (160, 94, 86),    # 23: cycleway (red asphalt in Poland)
    (102, 98, 96),    # 24: railway_ballast
    (118, 114, 112),  # 25: railway_service
    (124, 122, 120),  # 26: tram_track
    (188, 186, 182),  # 27: pavement_concrete
    (156, 150, 144),  # 28: pavement_cobblestone
    (172, 162, 150),  # 29: rynek_stone (granite slabs)
    (70, 68, 66),     # 30: building_footprint
    (184, 88, 66),    # 31: building_roof_tile (terracotta)
    (130, 138, 144),  # 32: building_roof_metal
    (110, 112, 116),  # 33: building_roof_flat
    (92, 94, 98),     # 34: parking_asphalt
    (144, 142, 138),  # 35: parking_cobble
    (138, 136, 130),  # 36: industrial_ground
    (164, 162, 158),  # 37: railway_station_platform
    (114, 142, 102),  # 38: cemetery_ground
    (150, 146, 142),  # 39: cemetery_grave_row
    (116, 162, 94),   # 40: allotment_garden
    (82, 138, 178),   # 41: playground_rubber (blue/red)
    (78, 166, 68),    # 42: pitch_grass
    (64, 158, 62),    # 43: pitch_artificial (bright green)
    (188, 102, 74),   # 44: pitch_clay (tennis red)
    (214, 198, 156),  # 45: beach_sand
    (168, 152, 126),  # 46: construction
    (162, 158, 150),  # 47: quarry_gravel
    (142, 138, 128),  # 48: brownfield
    (84, 86, 90),     # 49: bridge_deck_road
    (158, 154, 148),  # 50: bridge_deck_foot
    (96, 96, 98),     # 51: tunnel_approach
    (124, 152, 104),  # 52: embankment
    (74, 138, 178),   # 53: fountain_basin
    (168, 164, 158),  # 54: courtyard
    (68, 162, 60),    # 55: stadium_turf
    (178, 82, 70),    # 56: stadium_running_track
    (126, 168, 98),   # 57: zoo_enclosure
    (146, 174, 108),  # 58: skansen_pasture
    (162, 160, 156),  # 59: amphitheatre_stone
    (54, 114, 46),    # 60: hedge
    (182, 104, 128),  # 61: flowerbed
    (240, 240, 240),  # 62: curb_marking (white)
    (20, 22, 26),     # 63: void
]

# Autumn (golden ambers, rusty foliage, muted fields)
PALETTE_AUTUMN = [
    (152, 148, 88),   # 0: default_grass
    (142, 144, 76),   # 1: park_grass
    (164, 152, 92),   # 2: meadow
    (174, 142, 88),   # 3: farmland_crop
    (150, 126, 90),   # 4: farmland_fallow
    (158, 128, 62),   # 5: orchard
    (176, 118, 54),   # 6: forest_deciduous (golden amber)
    (46, 88, 48),     # 7: forest_coniferous
    (118, 102, 52),   # 8: forest_mixed
    (140, 124, 72),   # 9: scrub
    (48, 84, 124),    # 10: water_deep
    (62, 104, 138),   # 11: water_shallow
    (132, 126, 106),  # 12: river_bank
    (52, 96, 124),    # 13: canal_mlynowka
    (46, 82, 118),    # 14: lake_bolko
    (102, 112, 84),   # 15: wetland
    (74, 76, 80),     # 16: road_highway
    (88, 90, 94),     # 17: road_primary
    (108, 110, 114),  # 18: road_secondary
    (124, 126, 128),  # 19: road_residential
    (134, 132, 128),  # 20: road_service
    (168, 154, 130),  # 21: track_unpaved
    (180, 174, 164),  # 22: path_pedestrian
    (150, 88, 80),    # 23: cycleway
    (102, 98, 96),    # 24: railway_ballast
    (118, 114, 112),  # 25: railway_service
    (124, 122, 120),  # 26: tram_track
    (184, 182, 178),  # 27: pavement_concrete
    (154, 148, 142),  # 28: pavement_cobblestone
    (170, 160, 148),  # 29: rynek_stone
    (70, 68, 66),     # 30: building_footprint
    (184, 88, 66),    # 31: building_roof_tile
    (130, 138, 144),  # 32: building_roof_metal
    (110, 112, 116),  # 33: building_roof_flat
    (92, 94, 98),     # 34: parking_asphalt
    (144, 142, 138),  # 35: parking_cobble
    (136, 132, 126),  # 36: industrial_ground
    (164, 162, 158),  # 37: railway_station_platform
    (138, 132, 98),   # 38: cemetery_ground
    (150, 146, 142),  # 39: cemetery_grave_row
    (136, 138, 88),   # 40: allotment_garden
    (82, 138, 178),   # 41: playground_rubber
    (124, 148, 76),   # 42: pitch_grass
    (64, 158, 62),    # 43: pitch_artificial
    (188, 102, 74),   # 44: pitch_clay
    (210, 194, 152),  # 45: beach_sand
    (164, 148, 122),  # 46: construction
    (158, 154, 146),  # 47: quarry_gravel
    (138, 134, 124),  # 48: brownfield
    (84, 86, 90),     # 49: bridge_deck_road
    (158, 154, 148),  # 50: bridge_deck_foot
    (96, 96, 98),     # 51: tunnel_approach
    (138, 136, 98),   # 52: embankment
    (70, 126, 164),   # 53: fountain_basin
    (168, 164, 158),  # 54: courtyard
    (118, 144, 70),   # 55: stadium_turf
    (178, 82, 70),    # 56: stadium_running_track
    (142, 144, 92),   # 57: zoo_enclosure
    (154, 150, 96),   # 58: skansen_pasture
    (162, 160, 156),  # 59: amphitheatre_stone
    (114, 102, 54),   # 60: hedge
    (164, 94, 84),    # 61: flowerbed
    (240, 240, 240),  # 62: curb_marking
    (20, 22, 26),     # 63: void
]

# Winter (snow blankets open ground, frozen river tinge, salted roads)
PALETTE_WINTER = [
    (218, 224, 230),  # 0: default_grass (snow cover)
    (224, 228, 234),  # 1: park_grass (snow cover)
    (220, 226, 232),  # 2: meadow (snow cover)
    (212, 218, 224),  # 3: farmland_crop (snow)
    (198, 204, 210),  # 4: farmland_fallow (snow)
    (214, 220, 226),  # 5: orchard
    (132, 134, 138),  # 6: forest_deciduous (bare trees with snow)
    (54, 78, 64),     # 7: forest_coniferous (dark pine with frost)
    (96, 108, 102),   # 8: forest_mixed
    (168, 174, 180),  # 9: scrub
    (68, 96, 122),    # 10: water_deep (icy Odra)
    (86, 118, 142),   # 11: water_shallow
    (184, 188, 192),  # 12: river_bank
    (74, 106, 130),   # 13: canal_mlynowka
    (62, 92, 118),    # 14: lake_bolko
    (172, 182, 188),  # 15: wetland
    (82, 84, 88),     # 16: road_highway (cleared / damp)
    (96, 98, 102),    # 17: road_primary
    (114, 116, 120),  # 18: road_secondary
    (144, 148, 152),  # 19: road_residential (slushy)
    (168, 172, 176),  # 20: road_service (snow-dusted)
    (192, 196, 200),  # 21: track_unpaved (snow)
    (178, 182, 186),  # 22: path_pedestrian
    (140, 112, 112),  # 23: cycleway
    (116, 118, 120),  # 24: railway_ballast
    (132, 134, 136),  # 25: railway_service
    (136, 138, 140),  # 26: tram_track
    (186, 188, 190),  # 27: pavement_concrete
    (164, 166, 168),  # 28: pavement_cobblestone
    (178, 178, 180),  # 29: rynek_stone (cleared granite)
    (70, 68, 66),     # 30: building_footprint
    (204, 168, 160),  # 31: building_roof_tile (snow edges)
    (186, 192, 198),  # 32: building_roof_metal (snow)
    (218, 222, 226),  # 33: building_roof_flat (snow blanket)
    (108, 112, 116),  # 34: parking_asphalt
    (156, 158, 160),  # 35: parking_cobble
    (148, 152, 156),  # 36: industrial_ground
    (168, 170, 172),  # 37: railway_station_platform
    (216, 220, 224),  # 38: cemetery_ground (snow)
    (172, 174, 178),  # 39: cemetery_grave_row
    (212, 218, 222),  # 40: allotment_garden
    (144, 168, 192),  # 41: playground_rubber
    (208, 216, 222),  # 42: pitch_grass
    (96, 158, 102),   # 43: pitch_artificial (brushed)
    (182, 144, 134),  # 44: pitch_clay
    (214, 216, 220),  # 45: beach_sand (frozen)
    (176, 174, 172),  # 46: construction
    (172, 174, 176),  # 47: quarry_gravel
    (158, 160, 162),  # 48: brownfield
    (88, 90, 94),     # 49: bridge_deck_road
    (164, 166, 168),  # 50: bridge_deck_foot
    (98, 98, 100),    # 51: tunnel_approach
    (206, 212, 218),  # 52: embankment
    (110, 154, 184),  # 53: fountain_basin (drained / frozen)
    (172, 174, 176),  # 54: courtyard
    (188, 206, 214),  # 55: stadium_turf (heated / frost)
    (178, 104, 98),   # 56: stadium_running_track
    (212, 218, 224),  # 57: zoo_enclosure
    (218, 222, 228),  # 58: skansen_pasture
    (172, 174, 176),  # 59: amphitheatre_stone
    (88, 98, 92),     # 60: hedge (bare with snow)
    (188, 192, 196),  # 61: flowerbed (mulch/snow)
    (240, 240, 240),  # 62: curb_marking
    (20, 22, 26),     # 63: void
]

# Spring (fresh bright greens, blossoming pastel tones)
PALETTE_SPRING = [
    (134, 192, 98),   # 0: default_grass
    (114, 198, 86),   # 1: park_grass
    (146, 204, 110),  # 2: meadow
    (174, 186, 112),  # 3: farmland_crop (young shoots)
    (156, 138, 104),  # 4: farmland_fallow
    (128, 184, 88),   # 5: orchard (blossom hints)
    (84, 152, 68),    # 6: forest_deciduous (light fresh green)
    (48, 104, 52),    # 7: forest_coniferous
    (70, 132, 62),    # 8: forest_mixed
    (124, 168, 88),   # 9: scrub
    (58, 104, 152),   # 10: water_deep
    (74, 128, 168),   # 11: water_shallow
    (142, 138, 118),  # 12: river_bank
    (64, 118, 148),   # 13: canal_mlynowka
    (56, 100, 144),   # 14: lake_bolko
    (96, 140, 106),   # 15: wetland
    (74, 76, 80),     # 16: road_highway
    (88, 90, 94),     # 17: road_primary
    (108, 110, 114),  # 18: road_secondary
    (124, 126, 128),  # 19: road_residential
    (134, 132, 128),  # 20: road_service
    (176, 162, 138),  # 21: track_unpaved
    (184, 178, 168),  # 22: path_pedestrian
    (160, 94, 86),    # 23: cycleway
    (102, 98, 96),    # 24: railway_ballast
    (118, 114, 112),  # 25: railway_service
    (124, 122, 120),  # 26: tram_track
    (188, 186, 182),  # 27: pavement_concrete
    (156, 150, 144),  # 28: pavement_cobblestone
    (172, 162, 150),  # 29: rynek_stone
    (70, 68, 66),     # 30: building_footprint
    (184, 88, 66),    # 31: building_roof_tile
    (130, 138, 144),  # 32: building_roof_metal
    (110, 112, 116),  # 33: building_roof_flat
    (92, 94, 98),     # 34: parking_asphalt
    (144, 142, 138),  # 35: parking_cobble
    (138, 136, 130),  # 36: industrial_ground
    (164, 162, 158),  # 37: railway_station_platform
    (126, 158, 112),  # 38: cemetery_ground
    (150, 146, 142),  # 39: cemetery_grave_row
    (128, 182, 104),  # 40: allotment_garden
    (82, 138, 178),   # 41: playground_rubber
    (88, 184, 78),    # 42: pitch_grass
    (64, 158, 62),    # 43: pitch_artificial
    (188, 102, 74),   # 44: pitch_clay
    (214, 198, 156),  # 45: beach_sand
    (168, 152, 126),  # 46: construction
    (162, 158, 150),  # 47: quarry_gravel
    (142, 138, 128),  # 48: brownfield
    (84, 86, 90),     # 49: bridge_deck_road
    (158, 154, 148),  # 50: bridge_deck_foot
    (96, 96, 98),     # 51: tunnel_approach
    (138, 172, 116),  # 52: embankment
    (74, 138, 178),   # 53: fountain_basin
    (168, 164, 158),  # 54: courtyard
    (78, 182, 70),    # 55: stadium_turf
    (178, 82, 70),    # 56: stadium_running_track
    (138, 184, 108),  # 57: zoo_enclosure
    (154, 192, 118),  # 58: skansen_pasture
    (162, 160, 156),  # 59: amphitheatre_stone
    (68, 138, 58),    # 60: hedge
    (212, 118, 158),  # 61: flowerbed (spring tulips)
    (240, 240, 240),  # 62: curb_marking
    (20, 22, 26),     # 63: void
]

SEASON_PALETTES = [
    PALETTE_SUMMER,  # 0
    PALETTE_AUTUMN,  # 1
    PALETTE_WINTER,  # 2
    PALETTE_SPRING,  # 3
]
