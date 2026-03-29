"""
型式セルがはみ出さない最大の安全係数を自動探索するスクリプト。
factor を 0.93 から 0.02 ずつ下げながら、
  1. generate-bekki1-test-pdf.mjs の drawInCell maxWidth 係数を書き換え
  2. node でPDF生成
  3. 型式セルの右境界外ピクセルをチェック
  4. はみ出しなし → その係数を採用して終了
"""
from __future__ import annotations
import re
import subprocess
import sys
from pathlib import Path

import fitz
import numpy as np

SCRIPT   = Path("scripts/generate-bekki1-test-pdf.mjs")
PDF_PATH = Path("tmp/pdf-test-fixed/bekki1_debug_test.pdf")
CROP_DIR = Path("tmp/pdf-test-fixed")

# PDF座標（pt）
CELL_LEFT   = 136.7
CELL_RIGHT  = 192.8
CELL_TOP    = 524.6
CELL_BOTTOM = 541.7
SCALE       = 4.0
CHECK_OFFSET = 3   # 右境界から何px外から開始（境界線自体を除外）
CHECK_WIDTH  = 10  # 何px幅チェックするか
DARK_THRESH  = 160


def set_draw_in_cell_factor(factor: float):
    src = SCRIPT.read_text(encoding="utf-8")
    # drawInCell の maxWidth 行だけ置換（drawWrappedInCell の行は変えない）
    # drawInCell は "cellW - paddingX * 2) * N.NN" パターン
    new_src = re.sub(
        r"(const maxWidth = Math\.max\(1, \(cellW - paddingX \* 2\)) \* [\d.]+(\);)",
        rf"\g<1> * {factor:.2f}\g<2>",
        src,
        count=1,
    )
    if new_src == src:
        print(f"  [warn] pattern not found in {SCRIPT}")
    SCRIPT.write_text(new_src, encoding="utf-8")


def generate_pdf():
    result = subprocess.run(
        ["node", str(SCRIPT)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print("  [error] node failed:", result.stderr[:200])
        return False
    return True


def check_overflow(factor: float) -> tuple[bool, int]:
    if not PDF_PATH.exists():
        return True, -1

    doc = fitz.open(str(PDF_PATH))
    page = doc[1]
    mat = fitz.Matrix(SCALE, SCALE)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)

    right_px = int(CELL_RIGHT * SCALE)
    top_px   = int(CELL_TOP   * SCALE)
    bot_px   = int(CELL_BOTTOM * SCALE)

    start_x = right_px + CHECK_OFFSET
    end_x   = right_px + CHECK_OFFSET + CHECK_WIDTH

    region = img[top_px:bot_px, start_x:end_x]
    gray = region.mean(axis=2)
    dark_count = int(np.sum(gray < DARK_THRESH))

    # クロップ画像を保存
    crop_l = max(0, int((CELL_LEFT - 5) * SCALE))
    crop_r = min(pix.width, int((CELL_RIGHT + 20) * SCALE))
    crop_t = max(0, int((CELL_TOP - 2) * SCALE))
    crop_b = min(pix.height, int((CELL_BOTTOM + 2) * SCALE))
    crop = img[crop_t:crop_b, crop_l:crop_r]
    try:
        from PIL import Image as PILImage
        PILImage.fromarray(crop).save(CROP_DIR / f"model_cell_factor_{factor:.2f}.png")
    except ImportError:
        pass

    return dark_count > 0, dark_count


def main():
    factors = [round(f * 0.01, 2) for f in range(93, 64, -2)]  # 0.93, 0.91, ..., 0.65
    found = None

    for factor in factors:
        print(f"\n--- Testing factor={factor:.2f} ---")
        set_draw_in_cell_factor(factor)

        if not generate_pdf():
            continue

        overflows, count = check_overflow(factor)
        if overflows:
            print(f"  OVERFLOW: {count} dark px")
        else:
            print(f"  OK: no overflow")
            found = factor
            break

    if found is not None:
        print(f"\n=== Found safe factor: {found:.2f} ===")
        # 最終的な係数で確定済み（SCRIPT は already updated）
    else:
        print("\n=== No safe factor found in range 0.93..0.65 ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
