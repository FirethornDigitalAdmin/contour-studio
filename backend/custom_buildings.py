"""Project user-authored geographic outlines into the existing print pipeline."""
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from .buildings import polygonal


def merge_custom_buildings(features, settings, geo):
    if not settings.buildings:
        return features, 0
    clip=box(geo.inset,geo.inset,settings.width-geo.inset,settings.height-geo.inset)
    additions=[]
    for building in settings.custom_buildings:
        footprint=polygonal(Polygon([geo.point(lon,lat) for lon,lat in building.points]).intersection(clip))
        if not footprint.is_empty and footprint.area > 1e-8:
            additions.append(('building',footprint,{'building':'yes','height':str(building.height),
                              '_custom_id':building.id,'name':building.label}))
    if not additions:
        return features, 0
    # Authored outlines take precedence exactly where they overlap source data;
    # preserve the rest of any neighbouring or larger source footprint.
    authored=unary_union([g for _,g,_ in additions])
    result=[]
    for kind,geom,tags in features:
        if kind=='building' and geom.intersects(authored):
            geom=polygonal(geom.difference(authored))
        if not geom.is_empty:
            result.append((kind,geom,tags))
    return result+additions, len(additions)
