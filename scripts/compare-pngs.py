"""2つのディレクトリの同名PNGをピクセル比較する（ImageMagick compare -metric AE の代替）。

このマシンには pdftoppm / ImageMagick が無いため、レンダリングと同じ PyMuPDF で比較まで完結させる。
使い方: python scripts/compare-pngs.py <baseline_dir> <current_dir> [diff_out_dir]
出力: ファイルごとに「差分ピクセル数」。全一致なら ALL_MATCH、差分があれば DIFF_FOUND で exit 1。
diff_out_dir を渡すと、差分箇所を赤でハイライトした画像を書き出す（目視用）。
"""
from __future__ import annotations

import sys
from pathlib import Path

import fitz  # PyMuPDF


def load_rgb(path: Path) -> fitz.Pixmap:
    pix = fitz.Pixmap(str(path))
    if pix.alpha:  # 比較はRGBに正規化
        pix = fitz.Pixmap(fitz.csRGB, pix)
    return pix


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2

    base_dir = Path(sys.argv[1])
    cur_dir = Path(sys.argv[2])
    diff_dir = Path(sys.argv[3]) if len(sys.argv) >= 4 else None
    if diff_dir:
        diff_dir.mkdir(parents=True, exist_ok=True)

    base_files = {p.name: p for p in base_dir.glob("*.png")}
    cur_files = {p.name: p for p in cur_dir.glob("*.png")}

    only_base = sorted(set(base_files) - set(cur_files))
    only_cur = sorted(set(cur_files) - set(base_files))
    for name in only_base:
        print(f"MISSING_IN_CURRENT {name}")
    for name in only_cur:
        print(f"MISSING_IN_BASELINE {name}")

    any_diff = bool(only_base or only_cur)
    for name in sorted(set(base_files) & set(cur_files)):
        a = load_rgb(base_files[name])
        b = load_rgb(cur_files[name])
        if (a.width, a.height) != (b.width, b.height):
            print(f"SIZE_MISMATCH {name} {a.width}x{a.height} vs {b.width}x{b.height}")
            any_diff = True
            continue

        sa = a.samples
        sb = b.samples
        n = a.width * a.height
        stride = a.n  # bytes per pixel (RGB=3)
        diff_count = 0
        diff_positions = []
        for i in range(n):
            off = i * stride
            if sa[off:off + 3] != sb[off:off + 3]:
                diff_count += 1
                if diff_dir and len(diff_positions) < 2_000_000:
                    diff_positions.append(i)

        print(f"{name} diff_px={diff_count}")
        if diff_count:
            any_diff = True
            if diff_dir:
                # 差分箇所を赤で塗った current コピーを出力（目視用）
                buf = bytearray(b.samples)
                for i in diff_positions:
                    off = i * stride
                    buf[off:off + 3] = b"\xff\x00\x00"
                marked = fitz.Pixmap(fitz.csRGB, b.width, b.height, bytes(buf), False)
                marked.save(diff_dir / f"diff_{name}")

    if any_diff:
        print("DIFF_FOUND")
        return 1
    print("ALL_MATCH")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
