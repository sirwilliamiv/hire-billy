#!/usr/bin/env python3
"""Camera-alignment normalizer: re-frame the render so its foreground bounding box
matches the reference's, so Tier-1 IoU measures SHAPE difference, not framing.
This is the 2D equivalent of solving the reference camera (likeness_maximization (b)).

Usage: align_render.py <reference.png> <render.png> <out.png>
"""
import sys
from pathlib import Path

FORGE = Path('/private/tmp/claude-501/-Users-b-Desktop-code-hire-billy/caeb0fd5-c664-4197-83aa-7207997a8d34/scratchpad/img2threejs/forge')
sys.path.insert(0, str(FORGE / 'stage4_review'))
sys.path.insert(0, str(FORGE / 'stage1_intake'))
from diagnose_render import load_image, build_foreground_mask  # noqa: E402
from extract_pbr_evidence import write_png_rgb  # noqa: E402


def fg_bbox(path):
    w, h, px, _ = load_image(Path(path))
    mask, _d, _w = build_foreground_mask(w, h, px)
    xs = [i % w for i, v in enumerate(mask) if v]
    ys = [i // w for i, v in enumerate(mask) if v]
    return w, h, px, (min(xs), min(ys), max(xs), max(ys))


def main():
    ref_path, ren_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    rw, rh, _rpx, rbox = fg_bbox(ref_path)
    sw, sh, spx, sbox = fg_bbox(ren_path)
    rx0, ry0, rx1, ry1 = rbox
    sx0, sy0, sx1, sy1 = sbox
    ref_h = ry1 - ry0 + 1
    src_h = sy1 - sy0 + 1
    scale = src_h / ref_h  # source pixels per output pixel (uniform, height-matched)
    ref_cx = (rx0 + rx1) / 2
    src_cx = (sx0 + sx1) / 2

    # the reference is a circular avatar crop — apply the same circle so the
    # comparison happens inside the same composition (framing normalization)
    ccx, ccy, cr2 = rw / 2, rh / 2, (min(rw, rh) / 2 - 2) ** 2
    out = bytearray(rw * rh * 3)
    for y in range(rh):
        sy = int(sy0 + (y - ry0) * scale)
        for x in range(rw):
            o = (y * rw + x) * 3
            dx, dy = x - ccx, y - ccy
            sx = int(src_cx + (x - ref_cx) * scale)
            if dx * dx + dy * dy <= cr2 and 0 <= sx < sw and 0 <= sy < sh:
                p = spx[sy * sw + sx]
                out[o:o + 3] = bytes(p[:3])
            else:
                out[o:o + 3] = b'\xf5\xf5\xf5'
    write_png_rgb(Path(out_path), rw, rh, bytes(out))
    print(f'aligned: scale={scale:.3f} refbox={rbox} srcbox={sbox} -> {out_path}')


if __name__ == '__main__':
    main()
