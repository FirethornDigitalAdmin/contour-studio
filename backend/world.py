"""Longitude handling shared by geographic providers, including the date line."""
def longitude_span(west, east):
    return east - west if east >= west else east - west + 360


def unwrap(lon, west):
    # Choose the world copy closest to the centre of a small selection.
    return west + (lon - west + 180) % 360 - 180


def rectangles(west, south, east, north):
    end = west + longitude_span(west, east)
    if end <= 180:
        return [(west, south, end, north)]
    return [(west, south, 180, north), (-180, south, end - 360, north)]


MAX_BUILDING_AREA_KM2 = 100


def selection_area_km2(bounds):
    import math
    return (6371.0088 ** 2 * math.radians(longitude_span(bounds.west, bounds.east))
            * (math.sin(math.radians(bounds.north)) - math.sin(math.radians(bounds.south))))
