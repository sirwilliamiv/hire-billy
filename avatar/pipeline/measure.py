#!/usr/bin/env python3
"""Measuring tool: quantitative side-by-side comparison of the bust render vs the reference photo.

Classifies pixels into zones (hair, skin, beard, teeth, shirt, background) by nearest-anchor
color matching, then measures landmark rows/widths normalized to head height, so the render
and the photo can be compared regardless of resolution or framing.

Usage:
  python3 measure.py <reference.png> <render.png> [--out report.json]

Outputs per-image metrics + deltas + directional fix hints.
Pure stdlib; reuses forge PNG reader.
"""
import argparse, json, math, sys
from pathlib import Path

FORGE = Path('/private/tmp/claude-501/-Users-b-Desktop-code-hire-billy/caeb0fd5-c664-4197-83aa-7207997a8d34/scratchpad/img2threejs/forge/stage1_intake')
sys.path.insert(0, str(FORGE))
from extract_pbr_evidence import read_png  # noqa: E402

# color anchors (sRGB) per zone; classification = nearest anchor with per-zone threshold
ANCHORS = {
    'hair':  [(107, 74, 47), (138, 98, 56), (169, 124, 75), (94, 65, 41), (74, 50, 32), (197, 154, 99)],
    'skin':  [(230, 181, 150), (240, 200, 173), (211, 177, 155), (201, 144, 111), (188, 151, 125), (245, 221, 200)],
    'beard': [(138, 90, 56), (160, 106, 62), (110, 69, 43), (146, 110, 82)],
    'teeth': [(244, 239, 230), (232, 224, 210)],
    'shirt': [(168, 196, 216), (147, 179, 202), (194, 214, 228), (126, 159, 184), (215, 228, 238)],
    'bg':    [(245, 245, 245), (255, 255, 255), (232, 232, 234)],
}
MAXD = {'hair': 60, 'skin': 48, 'beard': 42, 'teeth': 28, 'shirt': 40, 'bg': 22}


def classify(px):
    best, bestd = None, 1e9
    for zone, anchors in ANCHORS.items():
        for a in anchors:
            d = math.dist(px[:3], a)
            if d < bestd:
                best, bestd = zone, d
    if best and bestd <= MAXD[best]:
        return best
    return 'other'


def measure(path):
    w, h, px = read_png(Path(path))
    rows = []  # per row: dict zone -> count, plus min/max x of fg
    for y in range(h):
        counts = {}
        x0 = x1 = None
        base = y * w
        for x in range(w):
            z = classify(px[base + x])
            if z in ('bg',):
                continue
            counts[z] = counts.get(z, 0) + 1
            if z != 'other':
                if x0 is None:
                    x0 = x
                x1 = x
        rows.append((counts, x0, x1))

    def rowfrac(y, zone):
        c, x0, x1 = rows[y]
        width = (x1 - x0 + 1) if x0 is not None else 0
        return (c.get(zone, 0) / width) if width > 20 else 0.0

    # central-band fraction: only pixels within the middle `band` of the row's fg span.
    # Excludes temple hair / frame edges so face landmarks are measured on the face itself.
    def centerfrac(y, zone, band=0.4):
        _, x0, x1 = rows[y]
        if x0 is None or (x1 - x0) < 20:
            return 0.0
        cx = (x0 + x1) / 2
        half = (x1 - x0) * band / 2
        lo, hi = int(cx - half), int(cx + half)
        base = y * w
        n = hit = 0
        for x in range(max(0, lo), min(w, hi + 1)):
            z = classify(px[base + x])
            if z == 'bg':
                continue
            n += 1
            if z == zone:
                hit += 1
        return (hit / n) if n > 8 else 0.0

    fg_rows = [y for y in range(h) if rows[y][1] is not None and (rows[y][2] - rows[y][1]) > w * 0.04]
    if not fg_rows:
        raise SystemExit(f'no foreground found in {path}')
    top = fg_rows[0]

    # shoulder row: first row (scanning down) where shirt occupies >45% of image width
    shoulder = None
    for y in range(h):
        if rows[y][0].get('shirt', 0) > w * 0.45:
            shoulder = y
            break
    # chin: bottom edge of the beard (the beard wraps the chin in both reference and
    # render, while center-skin continues down the neck and would false-anchor there)
    chin = None
    limit = shoulder if shoulder else h
    for y in range(limit - 1, top, -1):
        if centerfrac(y, 'beard', 0.5) > 0.25:
            chin = y
            break
    if chin is None:  # fallback: last strongly-skin center row
        for y in range(limit - 1, top, -1):
            if centerfrac(y, 'skin', 0.3) > 0.45:
                chin = y
                break
    if chin is None:
        chin = limit - 1
    head_h = max(1, chin - top)

    # hairline: first row whose CENTER is dominated by skin (3 consecutive rows to skip gaps)
    hairline = None
    run = 0
    for y in range(top, chin):
        if centerfrac(y, 'skin') > 0.55:
            run += 1
            if run >= 3:
                hairline = y - 2
                break
        else:
            run = 0
    # beard top: first row below mid-face whose CENTER band shows beard consistently
    beard_top = None
    run = 0
    for y in range(top + int(head_h * 0.55), chin):
        if centerfrac(y, 'beard', 0.5) > 0.30:
            run += 1
            if run >= 3:
                beard_top = y - 2
                break
        else:
            run = 0
    # teeth (mouth line): central teeth pixels between beard rows
    teeth_rows = [
        y for y in range(top + int(head_h * 0.6), chin)
        if centerfrac(y, 'teeth', 0.3) > 0.15 and centerfrac(y, 'beard', 0.6) > 0.1
    ]
    mouth = (sum(teeth_rows) // len(teeth_rows)) if teeth_rows else None

    # widths (in px) measured over head region
    def zone_width(zone, y_from, y_to):
        best = 0
        for y in range(max(0, y_from), min(h, y_to)):
            c = rows[y][0].get(zone, 0)
            best = max(best, c)
        return best

    hair_w = zone_width('hair', top, chin)
    skin_w = zone_width('skin', top, chin)
    shoulder_w = 0
    if shoulder:
        for y in range(shoulder, min(h, shoulder + int(head_h * 0.35))):
            _, x0, x1 = rows[y]
            if x0 is not None:
                shoulder_w = max(shoulder_w, x1 - x0 + 1)

    hair_above = (hairline - top) / head_h if hairline else None
    m = {
        'image': str(path), 'width': w, 'height': h,
        'headTopRow': top, 'chinRow': chin, 'shoulderRow': shoulder,
        'headHeightPx': head_h,
        'headHeightFracOfImage': head_h / h,
        'hairlineFrac': round(hair_above, 3) if hair_above is not None else None,
        'mouthFrac': round((mouth - top) / head_h, 3) if mouth else None,
        'beardTopFrac': round((beard_top - top) / head_h, 3) if beard_top else None,
        'chinToShoulderFracOfHead': round((shoulder - chin) / head_h, 3) if shoulder else None,
        'headWidthToHeightIncHair': round(max(hair_w, skin_w) / head_h, 3),
        'faceWidthToHeadHeight': round(skin_w / head_h, 3),
        'hairWidthToHeadHeight': round(hair_w / head_h, 3),
        'shoulderSpanToHeadHeight': round(shoulder_w / head_h, 3) if shoulder_w else None,
    }
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('reference')
    ap.add_argument('render')
    ap.add_argument('--out')
    args = ap.parse_args()
    ref = measure(args.reference)
    ren = measure(args.render)
    deltas, hints = {}, []
    for key in ('headHeightFracOfImage', 'hairlineFrac', 'mouthFrac', 'beardTopFrac',
                'chinToShoulderFracOfHead', 'headWidthToHeightIncHair', 'faceWidthToHeadHeight',
                'hairWidthToHeadHeight', 'shoulderSpanToHeadHeight'):
        a, b = ref.get(key), ren.get(key)
        if a is not None and b is not None:
            deltas[key] = round(b - a, 3)
    H = deltas
    if abs(H.get('headHeightFracOfImage', 0)) > 0.04:
        hints.append(f"framing: render head is {'larger' if H['headHeightFracOfImage']>0 else 'smaller'} in frame than reference by {abs(H['headHeightFracOfImage']):.0%} of image height -> adjust camera dist/ty")
    if abs(H.get('hairlineFrac', 0)) > 0.05:
        hints.append(f"hairline: render hairline sits {'lower' if H['hairlineFrac']>0 else 'higher'} ({H['hairlineFrac']:+.3f} of head height) -> move front hair clumps {'up' if H['hairlineFrac']>0 else 'down'}")
    if abs(H.get('mouthFrac', 0)) > 0.05:
        hints.append(f"mouth line off by {H['mouthFrac']:+.3f} of head height -> move mouth pivot {'up' if H['mouthFrac']>0 else 'down'}")
    if abs(H.get('headWidthToHeightIncHair', 0)) > 0.08:
        hints.append(f"head width incl hair off by {H['headWidthToHeightIncHair']:+.3f} -> {'slim' if H['headWidthToHeightIncHair']>0 else 'widen'} hair/temple clumps")
    if abs(H.get('chinToShoulderFracOfHead', 0)) > 0.08:
        hints.append(f"neck length off by {H['chinToShoulderFracOfHead']:+.3f} of head height -> {'shorten' if H['chinToShoulderFracOfHead']>0 else 'lengthen'} neck / raise shoulders")
    if H.get('shoulderSpanToHeadHeight') is not None and abs(H['shoulderSpanToHeadHeight']) > 0.15:
        hints.append(f"shoulder span off by {H['shoulderSpanToHeadHeight']:+.3f} head heights -> scale shirt profile")
    report = {'reference': ref, 'render': ren, 'deltas': deltas, 'hints': hints}
    text = json.dumps(report, indent=1)
    print(text)
    if args.out:
        Path(args.out).write_text(text)


if __name__ == '__main__':
    main()
