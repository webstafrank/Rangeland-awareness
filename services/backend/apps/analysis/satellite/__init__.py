"""NASA GIBS satellite layers, read as numbers rather than pictures.

GIBS publishes imagery, not data: every layer is a colour-mapped PNG. That would
normally rule it out for modelling, the same reason `apps/layers/geoserver.py`
warns against reading slope out of a WMS tile. GIBS is the exception because it
publishes the colour map itself, entry by entry, with the value range each
colour stands for. Inverting that table turns a pixel back into a value with a
known precision (the colormap's step), which is what this package does.

    catalog.py    which GIBS layers the models read, and why each one
    colormap.py   GIBS colormap XML -> lookup table -> RGBA decoded to values
    gibs.py       WMTS time dimension, WMS GetMap, the on-disk cache
"""
