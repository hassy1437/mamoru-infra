"""
型式セルのはみ出し検出スクリプト。
PDF page2 の device1.model セル (x=136.7〜192.8, y=524.6〜541.7) を
高解像度レンダリングし、右境界線の外側に暗いピクセルがないか検査する。

Usage: python scripts/check-model-cell-overflow.py <pdf_path> [scale]
Exit code 0 = OK, 1 = overflow detected
"""

from __future__ import annotations
import sys
from pathlib import Path

import fitz
import numpy as np

# PDF上の座標（pt）
CELL_LEFT   = 136.7
CELL_RIGHT  = 192.8   # 型式セルの右境界
CELL_TOP    = 524.6
CELL_BOTTOM = 541.7   # = 524.6 + 17.1

# 右境界の外側をこのピクセル幅だけ検査（テキストがはみ出ているかチェック）
CHECK_WIDTH_PX = 7

# この輝度以下を「暗いピクセル（テキスト）」とみなす
DARK_THRESHOLD = 180


def check(pdf_path: str, scale: float = 4.0) -> int:
    doc = fitz.open(pdf_path)
    page = doc[1]  # page 2 (0-indexed)
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, alpha=False)

    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)

    # PDF座標 → ピクセル座標（x はそのまま、y は上から）
    right_px  = int(CELL_RIGHT  * scale)
    top_px    = int(CELL_TOP    * scale)
    bot_px    = int(CELL_BOTTOM * scale)

    # ボーダーライン（2px幅）をスキップして、その直後からチェック
    # 1列ずつ検査し、最大暗ピクセル数が閾値を超えた列があればオーバーフロー判定
    MAX_DARK_PER_COL = 8  # アンチエイリアシング(3px)は無視、実オーバーフロー(10px+)を検出
    overflow_cols = 0
    dark_count = 0
    for x_offset in range(3, 3 + CHECK_WIDTH_PX):
        col = right_px + x_offset
        if col >= pix.width:
            break
        stripe = img[top_px:bot_px, col, :]
        gray_col = stripe.mean(axis=1)
        col_dark = int(np.sum(gray_col < DARK_THRESHOLD))
        dark_count = max(dark_count, col_dark)
        if col_dark > MAX_DARK_PER_COL:
            overflow_cols += 1

    # デバッグ用クロップ画像を保存
    out_dir = Path(pdf_path).parent
    # 少し広めに型式セル全体を切り出す
    crop_left  = max(0, int((CELL_LEFT  - 5) * scale))
    crop_right = min(pix.width, int((CELL_RIGHT + 15) * scale))
    crop_top   = max(0, int((CELL_TOP   - 2) * scale))
    crop_bot   = min(pix.height, int((CELL_BOTTOM + 2) * scale))
    crop = img[crop_top:crop_bot, crop_left:crop_right]

    try:
        from PIL import Image as PILImage
        PILImage.fromarray(crop).save(out_dir / "model_cell_crop.png")
    except ImportError:
        pass

    if overflow_cols > 0:
        print(f"OVERFLOW: {overflow_cols} column(s) with >{MAX_DARK_PER_COL} dark px (max col={dark_count}px)")
        return 1
    else:
        print(f"OK: no overflow (max dark per col={dark_count}px, threshold={MAX_DARK_PER_COL})")
        return 0


if __name__ == "__main__":
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "tmp/pdf-test-fixed/bekki1_debug_test.pdf"
    scale    = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0
    raise SystemExit(check(pdf_path, scale))
