"""Invert a GIBS colormap: RGBA pixels back to the values they stand for.

A GIBS colormap (``https://gibs.earthdata.nasa.gov/colormaps/v1.3/<name>.xml``)
is a list of ``ColorMapEntry`` elements, each an ``rgb`` triple plus the value
range it was painted for::

    <ColorMapEntry rgb="241,236,236" transparent="false"
                   sourceValue="[1,51)" value="[0.0001,0.0051)" ref="3"/>

Decoding is a table lookup from colour to range, and the decoded value is the
range's MIDPOINT. That is the contract's rule and the only honest choice: the
PNG says "somewhere in [0.0001, 0.0051)" and nothing narrower, so the midpoint
is the estimate with the smallest worst-case error, and the step is the
precision every feature built from it inherits.

Four things in real colormaps make this less trivial than a dict, each handled
where it is handled and each seen in the colormaps this service reads:

1. **Excluded entries.** ``nodata="true"`` is fill, and ``transparent="true"``
   is a value GIBS chose not to draw. MODIS NDVI marks everything below 0.0001
   (water, bare rock) transparent. Both decode to NaN. Decoding a transparent
   entry as its nominal value would put an NDVI of -0.05 on every pixel the
   PNG left see-through, including pixels that were simply never observed.

2. **Shared colours.** MERRA-2 precipitation paints some adjacent ranges in the
   same colour (``[6e-06,7e-06)`` and ``[7e-06,8e-06)`` are both
   ``224,243,245``). The colour cannot say which, so it decodes to the union
   ``[6e-06,8e-06)`` and its midpoint: the precision honestly halves there. If
   a shared colour is ALSO a nodata entry, nodata wins, because a value that
   might be fill is not a value.

3. **Open ranges.** ``[-INF,0.00)`` and ``[2.10e-04,+INF)`` have no midpoint.
   The finite edge is used, which is the closest value the colour can vouch for.

4. **Classifications.** Land cover entries carry a single code,
   ``sourceValue="10"`` and no ``value``. A single number decodes to itself.

5. **Code lists.** One IGBP entry is ``sourceValue="0,17"``: two codes for the
   same thing (water), one colour. A list is a set of discrete codes, not a
   range, so taking a midpoint would be a category error (8.5 is between
   woody savanna and savanna). It decodes to the smallest code in the list,
   which for IGBP is 0, water.

A colour that is in no entry decodes to NaN and is counted. A real GIBS PNG
fetched at native resolution with nearest-neighbour sampling never contains one
(verified on every layer in `catalog.py`, 576 of 576 pixels matched); a non-zero
count means the image was resampled and colours were blended, and the caller
reports it rather than trusting the decode.
"""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

import numpy as np

#: ``[a,b)``, ``(a,b]``, ``[a,+INF)``, ``[a]``. Groups: open bracket, low, high
#: (optional), close bracket.
_INTERVAL = re.compile(
    r"^\s*([\[\(])\s*([^,\]\)]+?)\s*(?:,\s*([^\]\)]+?)\s*)?([\]\)])\s*$"
)


class ColormapError(ValueError):
    """The colormap document cannot be used. The message names the entry."""


@dataclass(frozen=True)
class ValueRange:
    low: float
    high: float
    #: A list of codes (rule 5): decodes to `low`, never to a midpoint.
    discrete: bool = False

    @property
    def midpoint(self) -> float:
        if self.discrete:
            return self.low
        low_finite, high_finite = math.isfinite(self.low), math.isfinite(self.high)
        if low_finite and high_finite:
            return (self.low + self.high) / 2.0
        if low_finite:
            return self.low
        if high_finite:
            return self.high
        raise ColormapError("a range with no finite edge has no value")


@dataclass
class Colormap:
    """A colour -> value table, built once per colormap document."""

    name: str
    units: str | None
    #: Packed 0xRRGGBB keys, sorted, for `np.searchsorted`.
    keys: np.ndarray = field(repr=False)
    #: The decoded value for each key; NaN for an excluded colour.
    values: np.ndarray = field(repr=False)
    #: The width of each key's range, so a caller can state the precision.
    widths: np.ndarray = field(repr=False)

    @property
    def step(self) -> float:
        """The typical precision: the median width of the finite ranges."""
        finite = self.widths[np.isfinite(self.widths) & (self.widths > 0)]
        return float(np.median(finite)) if finite.size else 0.0

    def decode(self, rgba: np.ndarray) -> tuple[np.ndarray, int]:
        """Decode an ``(4, rows, cols)`` or ``(rows, cols, 4)`` uint8 RGBA array.

        Returns ``(values, unknown)``: float32 values with NaN wherever the
        pixel is transparent, excluded, or a colour the table does not know,
        and the count of the last kind (see the module docstring for why it is
        counted rather than ignored).

        Alpha 0 is checked before the colour. GIBS writes fully transparent
        pixels with whatever RGB the encoder left there, often 0,0,0, and a
        colormap can legitimately contain black.
        """
        array = np.asarray(rgba)
        if array.ndim != 3:
            raise ColormapError(f"expected an RGBA image, got shape {array.shape}")
        if array.shape[0] in (3, 4) and array.shape[-1] not in (3, 4):
            array = np.moveaxis(array, 0, -1)
        if array.shape[-1] == 3:
            alpha = np.full(array.shape[:2], 255, dtype=np.uint8)
        elif array.shape[-1] == 4:
            alpha = array[..., 3]
        else:
            raise ColormapError(f"expected 3 or 4 channels, got {array.shape[-1]}")

        rgb = array[..., :3].astype(np.uint32)
        packed = (rgb[..., 0] << 16) | (rgb[..., 1] << 8) | rgb[..., 2]

        index = np.searchsorted(self.keys, packed)
        index = np.clip(index, 0, max(len(self.keys) - 1, 0))
        known = self.keys[index] == packed if len(self.keys) else np.zeros_like(packed, bool)

        opaque = alpha > 0
        out = np.full(packed.shape, np.nan, dtype=np.float32)
        hit = known & opaque
        out[hit] = self.values[index[hit]]
        unknown = int((opaque & ~known).sum())
        return out, unknown


def parse_colormap(xml: bytes, name: str = "") -> Colormap:
    """Build the lookup table from a GIBS colormap v1.3 document."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise ColormapError(f"{name or 'colormap'} is not XML: {exc}") from exc

    units: str | None = None
    #: packed colour -> list of ranges, or None once it is known to be nodata.
    by_colour: dict[int, list[ValueRange] | None] = {}

    for colormap in _iter_local(root, "ColorMap"):
        if units is None and colormap.get("units"):
            units = colormap.get("units")
        for entry in _iter_local(colormap, "ColorMapEntry"):
            rgb = entry.get("rgb")
            if not rgb:
                continue
            try:
                r, g, b = (int(part) for part in rgb.split(","))
            except ValueError as exc:
                raise ColormapError(f"bad rgb {rgb!r} in {name}") from exc
            key = (r << 16) | (g << 8) | b

            excluded = (
                entry.get("nodata", "false").lower() == "true"
                or entry.get("transparent", "false").lower() == "true"
            )
            if excluded:
                # Nodata wins over any value sharing the colour (rule 2).
                by_colour[key] = None
                continue

            raw = entry.get("value") or entry.get("sourceValue")
            if raw is None:
                continue
            value_range = parse_value(raw)
            existing = by_colour.get(key, [])
            if existing is None:
                continue
            existing.append(value_range)
            by_colour[key] = existing

    if not by_colour:
        raise ColormapError(f"{name or 'colormap'} has no ColorMapEntry elements")

    keys = np.array(sorted(by_colour), dtype=np.uint32)
    values = np.full(len(keys), np.nan, dtype=np.float32)
    widths = np.full(len(keys), np.nan, dtype=np.float64)
    for i, key in enumerate(keys.tolist()):
        ranges = by_colour[key]
        if not ranges:
            continue
        if any(r.discrete for r in ranges):
            values[i] = min(r.low for r in ranges)
            widths[i] = 0.0
            continue
        union = ValueRange(
            low=min(r.low for r in ranges), high=max(r.high for r in ranges)
        )
        values[i] = union.midpoint
        widths[i] = union.high - union.low
    return Colormap(name=name, units=units, keys=keys, values=values, widths=widths)


def parse_value(raw: str) -> ValueRange:
    """``"[0.0001,0.0051)"`` -> ValueRange(0.0001, 0.0051); ``"10"`` -> (10, 10);
    ``"0,17"`` -> the discrete codes {0, 17}."""
    text = raw.strip()
    match = _INTERVAL.match(text)
    if match is None:
        if "," in text:
            codes = [_number(part) for part in text.split(",") if part.strip()]
            return ValueRange(min(codes), max(codes), discrete=True)
        number = _number(text)
        return ValueRange(number, number, discrete=True)
    _, low_text, high_text, _ = match.groups()
    low = _number(low_text)
    high = _number(high_text) if high_text is not None else low
    if low > high:
        raise ColormapError(f"range {raw!r} runs backwards")
    return ValueRange(low, high)


def _number(text: str) -> float:
    cleaned = text.strip().upper()
    if cleaned in ("+INF", "INF"):
        return math.inf
    if cleaned == "-INF":
        return -math.inf
    try:
        return float(cleaned)
    except ValueError as exc:
        raise ColormapError(f"{text!r} is not a number") from exc


def _iter_local(element: ET.Element, local_name: str):
    """Elements by local name. GIBS documents carry no namespace today; this
    keeps working the day they gain one."""
    for child in element.iter():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == local_name:
            yield child
