"""
bekki2 content セルのオーバーフローが解消される pdf-form-helpers.ts の
maxWidth 係数を自動探索するスクリプト。
"""
from __future__ import annotations
import re, subprocess, sys
from pathlib import Path
import fitz
import numpy as np

HELPERS_FILE = Path("src/lib/pdf-form-helpers.ts")
SCRIPT       = Path("scripts/generate-bekki234-route-tests.mjs")
PDF_PATH     = Path("tmp/pdf-test-bekki234/bekki2_test.pdf")
CROP_DIR     = Path("tmp/pdf-test-bekki234")

# P1_ROW_BOUNDS (各行の上端 y 座標 pt)
P1_ROW_BOUNDS = [
    312, 333, 354, 375, 396, 417, 438, 459, 480, 501,
    522, 543, 564, 585, 606, 627, 648, 669, 690,
]
CONTENT_RIGHT = 343.0
SCALE         = 4.0
# ボーダーライン (offset+1,+2 に集中) をスキップして +3 から開始
CHECK_OFFSET  = 3
CHECK_WIDTH   = 8
# 横ボーダー線は1-2px。テキスト overflow なら1行中に10px以上
MAX_DARK_PER_ROW = 10
DARK_THRESH   = 160


def set_factor(factor: float):
    src = HELPERS_FILE.read_text(encoding="utf-8")
    new_src = re.sub(
        r"(const maxWidth = Math\.max\(1, \(cellW - paddingX \* 2\)) \* [\d.]+(\))",
        rf"\g<1> * {factor:.2f}\g<2>",
        src, count=1,
    )
    if new_src == src:
        print(f"  [warn] pattern not found in {HELPERS_FILE}")
    HELPERS_FILE.write_text(new_src, encoding="utf-8")


def generate_pdf():
    r = subprocess.run(["node", str(SCRIPT)], capture_output=True, text=True)
    if r.returncode != 0:
        print("  [error]", r.stderr[:200])
        return False
    return True


def check_overflow(factor: float) -> tuple[bool, int]:
    if not PDF_PATH.exists():
        return True, -1
    doc = fitz.open(str(PDF_PATH))
    page = doc[0]
    mat = fitz.Matrix(SCALE, SCALE)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)

    right_px = int(CONTENT_RIGHT * SCALE)

    # 行ごとにチェック（横ボーダー線を除外するため）
    overflow_rows = 0
    global_max_dark = 0
    for row_idx in range(len(P1_ROW_BOUNDS) - 1):
        row_top_px = int(P1_ROW_BOUNDS[row_idx]     * SCALE) + 4  # ボーダー線をスキップ
        row_bot_px = int(P1_ROW_BOUNDS[row_idx + 1] * SCALE) - 4
        if row_bot_px <= row_top_px:
            continue

        row_max_dark = 0
        for x_off in range(CHECK_OFFSET, CHECK_OFFSET + CHECK_WIDTH):
            col = right_px + x_off
            if col >= pix.width:
                break
            stripe = img[row_top_px:row_bot_px, col, :]
            gray   = stripe.mean(axis=1)
            dark   = int(np.sum(gray < DARK_THRESH))
            row_max_dark = max(row_max_dark, dark)

        global_max_dark = max(global_max_dark, row_max_dark)
        if row_max_dark > MAX_DARK_PER_ROW:
            overflow_rows += 1

    # クロップ保存（全行範囲）
    crop_l = max(0, int((CONTENT_RIGHT - 20) * SCALE))
    crop_r = min(pix.width, int((CONTENT_RIGHT + 20) * SCALE))
    crop_t = max(0, int(P1_ROW_BOUNDS[0]  * SCALE))
    crop_b = min(pix.height, int(P1_ROW_BOUNDS[-1] * SCALE))
    crop = img[crop_t:crop_b, crop_l:crop_r]
    try:
        from PIL import Image as PILImage
        PILImage.fromarray(crop).save(CROP_DIR / f"bekki2_boundary_f{factor:.2f}.png")
    except ImportError:
        pass

    return overflow_rows > 0, global_max_dark


def main():
    factors = [round(f * 0.01, 2) for f in range(90, 64, -2)]  # 0.90, 0.88, ..., 0.66
    found = None
    for factor in factors:
        print(f"\n--- factor={factor:.2f} ---")
        set_factor(factor)
        if not generate_pdf():
            continue
        overflows, max_dark = check_overflow(factor)
        if overflows:
            print(f"  OVERFLOW: max dark={max_dark}px")
        else:
            print(f"  OK: max dark={max_dark}px")
            found = factor
            break

    if found:
        print(f"\n=== Safe factor: {found:.2f} ===")
    else:
        print("\n=== No safe factor found ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
