"""Real global NOAA relief outside the web terrain tiles' Mercator extent."""
import hashlib
import json
import numpy as np
from scipy.interpolate import RegularGridInterpolator

URL = 'https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_30s'
STEP = 1/120


def decode(data):
    raw=json.loads(data)
    if not isinstance(raw,dict) or not isinstance(raw.get('table'),dict):
        raise ValueError('NOAA returned no readable elevation grid.')
    table = raw['table']
    if not isinstance(table.get('rows'),list) or not table['rows']:
        raise ValueError('NOAA returned no elevation samples.')
    if table.get('columnNames') != ['latitude', 'longitude', 'z']:
        raise ValueError('NOAA returned unexpected elevation columns.')
    rows = np.asarray(table['rows'], dtype=float)
    if rows.ndim != 2 or rows.shape[1] != 3 or not np.isfinite(rows).all():
        raise ValueError('NOAA returned incomplete elevation samples.')
    lat = np.unique(rows[:, 0]); lon = np.unique(rows[:, 1])
    if len(rows) != len(lat)*len(lon) or len(lat)<2 or len(lon)<2:
        raise ValueError('NOAA returned an incomplete elevation grid.')
    values = np.full((len(lat), len(lon)), np.nan)
    values[np.searchsorted(lat, rows[:, 0]), np.searchsorted(lon, rows[:, 1])] = rows[:, 2]
    if not np.isfinite(values).all():
        raise ValueError('NOAA returned duplicate or missing elevation samples.')
    return lat, lon, values


def elevation(geo, xs, ys, progress, fetch):
    progress(9, 'Fetching global NOAA elevation for this polar area')
    b = geo.settings.bounds
    latitudes = b.south+(ys-geo.inset)/geo.map_height*(b.north-b.south)
    longitudes = (geo.west+(xs-geo.inset)/geo.map_width*(geo.east-geo.west)) % 360
    dem = np.empty((len(ys),len(xs)))
    requests = 0
    # NOAA uses 0…360 longitude; split selections crossing its prime meridian.
    breaks = np.flatnonzero(np.abs(np.diff(longitudes))>180)+1
    for indices in np.split(np.arange(len(xs)), breaks):
        if not len(indices): continue
        lo = max(STEP/2, float(longitudes[indices].min())-STEP*2)
        hi = min(360-STEP/2, float(longitudes[indices].max())+STEP*2)
        south = max(-90+STEP/2, float(latitudes.min())-STEP*2)
        north = min(90-STEP/2, float(latitudes.max())+STEP*2)
        query = f'z[({south:.9f}):1:({north:.9f})][({lo:.9f}):1:({hi:.9f})]'
        url = URL+'.json?'+query
        key = 'dem-noaa-'+hashlib.sha256(url.encode()).hexdigest()+'.json'
        lat, lon, values = decode(fetch(url,key,validate=decode))
        yy,xx = np.meshgrid(np.clip(latitudes,lat[0],lat[-1]),
                            np.clip(longitudes[indices],lon[0],lon[-1]), indexing='ij')
        dem[:,indices] = RegularGridInterpolator((lat,lon),values)(np.stack([yy,xx],axis=-1))
        requests += 1
    return dem, {'provider':'NOAA NCEI ETOPO 2022 · 30 arc-second global relief',
                 'url':URL+'.html', 'requests':requests, 'sample_spacing_m':927.7,
                 'attribution':'https://www.ncei.noaa.gov/products/etopo-global-relief-model',
                 'warning':'Polar relief uses a coarser 30 arc-second source. It includes ice surface and ocean bathymetry; the exact pole uses the nearest source row.'}
