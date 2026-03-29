"""
bekki2 page1: 容量等セル (content, x=239, w=104, 右端x=343) が
判定セル (x=343) にはみ出していないかチェック。

各行の content セル右端（x≈343）の外側をスキャンし、
1列あたりの暗ピクセル数がMAX_DARK_PER_COLを超えたら overflow と判定。

Usage: python scripts/check-bekki2-content-overflow.py <pdf_path> [scale]
Exit: 0=OK, 1=overflow
"""
from __future__ import annotations
import sys
from pathlib import Path

import fitz
import numpy as np

# content セル右端と判定セル左端が同じ x=343
CONTENT_RIGHT = 343.0
ROW_TOP       = 312.0   # P1_ROW_BOUNDS 最初の行
ROW_BOTTOM    = 690.0   # P1_ROW_BOUNDS 最後の行

CHECK_OFFSET     = 3    # 境界線(2px)をクリアして +3 から開始
CHECK_WIDTH      = 8    # 何列チェックするか
MAX_DARK_PER_COL = 8    # この値超えで overflow 判定（アンチエイリアシング3px は無視）
DARK_THRESH      = 160


def check(pdf_path: str, scale: float = 4.0) -> int:
    doc = fitz.open(pdf_path)
    page = doc[0]  # page 1 (0-indexed)
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)

    right_px  = int(CONTENT_RIGHT * scale)
    top_px    = int(ROW_TOP       * scale)
    bot_px    = int(ROW_BOTTOM    * scale)

    overflow_cols = 0
    max_dark = 0
    for x_off in range(CHECK_OFFSET, CHECK_OFFSET + CHECK_WIDTH):
        col = right_px + x_off
        if col >= pix.width:
            break
        stripe = img[top_px:bot_px, col, :]
        gray = stripe.mean(axis=1)
        dark = int(np.sum(gray < DARK_THRESH))
        max_dark = max(max_dark, dark)
        if dark > MAX_DARK_PER_COL:
            overflow_cols += 1

    # デバッグ用クロップ: 容量等→判定の境界付近
    crop_l = max(0, int((CONTENT_RIGHT - 20) * scale))
    crop_r = min(pix.width, int((CONTENT_RIGHT + 20) * scale))
    crop_t = max(0, int(ROW_TOP    * scale))
    crop_b = min(pix.height, int(ROW_BOTTOM * scale))
    crop = img[crop_t:crop_b, crop_l:crop_r]
    out_dir = Path(pdf_path).parent
    try:
        from PIL import Image as PILImage
        PILImage.fromarray(crop).save(out_dir / "bekki2_content_boundary.png")
    except ImportError:
        pass

    if overflow_cols > 0:
        print(f"OVERFLOW: {overflow_cols} col(s) with >{MAX_DARK_PER_COL}px (max={max_dark}px)")
        return 1
    else:
        print(f"OK: max dark per col={max_dark}px (threshold={MAX_DARK_PER_COL})")
        return 0


if __name__ == "__main__":
    pdf = sys.argv[1] if len(sys.argv) > 1 else "tmp/pdf-test-bekki234/bekki2_test.pdf"
    sc  = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0
    raise SystemExit(check(pdf, sc))
