"""bekki2 page1: 容量等セル (content, 右端 x=343) が判定セルへはみ出していないかを見る。

■ ★2026-07-26 に判明した欠陥（この検査は今まで一度も合格できなかった）
  旧実装は「セル右端の外側 8列を走査し、暗ピクセルが 8px を超えたら overflow」。
  ところが**何も描いていない素のテンプレートでも同じ 36px が出る**。
  正体は横罫線で、18行 × 約2px = 36px が**ページのどの列にも必ず立っている**。
  ＝ しきい値 8 に対して床が 36。判定は入力によらず常に OVERFLOW だった。
  （旧コメントの「境界線(2px)をクリアして +3 から開始」は縦罫線だけを想定していて、
    横罫線が全列に乗ることを見落としていた）

■ 直し方: しきい値ではなく**対照群**で消す
  素のテンプレートを同じ倍率でラスタライズし、
  「生成PDFで暗い ∧ テンプレートで暗くない」画素だけを数える。
  罫線も刷り込み文字も定義から落ちるので、残るのはアプリが描いた墨だけになる。
  ★しきい値をいじって黙らせるのではなく、混入している別物を取り除く。

Usage:
  python scripts/check-bekki2-content-overflow.py <pdf_path> [scale]
  python scripts/check-bekki2-content-overflow.py --self-test   # 陽性対照（両方向）
Exit: 0=OK, 1=overflow
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import fitz
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "public" / "PDF" / "s50_kokuji14_bekki2.pdf"

# content セル右端＝判定セル左端。ともに x=343（テンプレート実測 343.2）
CONTENT_RIGHT = 343.0
ROW_TOP = 312.0     # P1_ROW_BOUNDS 先頭
ROW_BOTTOM = 690.0  # P1_ROW_BOUNDS 末尾

CHECK_OFFSET = 3    # 縦罫線(px 1373-1374 実測)をまたぐぶん
CHECK_WIDTH = 8
MAX_DARK_PER_COL = 8
DARK_THRESH = 160


def _dark_mask(pdf_path: Path | str, scale: float) -> np.ndarray:
    doc = fitz.open(str(pdf_path))
    pix = doc[0].get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    mask = img.mean(axis=2) < DARK_THRESH
    doc.close()
    return mask


def check(pdf_path: str, scale: float = 4.0, quiet: bool = False) -> int:
    got = _dark_mask(pdf_path, scale)
    base = _dark_mask(TEMPLATE, scale)
    if got.shape != base.shape:
        print(f"NG テンプレートと寸法が違う: {got.shape} vs {base.shape}")
        return 2
    # ★アプリが描いた墨だけ = 生成で暗い ∧ テンプレートで暗くない
    drawn = got & ~base

    right_px = int(CONTENT_RIGHT * scale)
    top_px, bot_px = int(ROW_TOP * scale), int(ROW_BOTTOM * scale)

    overflow_cols, max_dark = 0, 0
    for x_off in range(CHECK_OFFSET, CHECK_OFFSET + CHECK_WIDTH):
        col = right_px + x_off
        if col >= drawn.shape[1]:
            break
        dark = int(drawn[top_px:bot_px, col].sum())
        max_dark = max(max_dark, dark)
        if dark > MAX_DARK_PER_COL:
            overflow_cols += 1

    if not quiet:
        if overflow_cols > 0:
            print(f"OVERFLOW: {overflow_cols} col(s) with >{MAX_DARK_PER_COL}px (max={max_dark}px)")
        else:
            print(f"OK: max dark per col={max_dark}px (threshold={MAX_DARK_PER_COL})")
            print("BEKKI2_CONTENT_OVERFLOW_OK")
    return 1 if overflow_cols > 0 else 0


def self_test() -> int:
    """★両方向の対照。片方だけだと『常にOK』な検査も通ってしまう"""
    problems = []

    # 下向き: 素のテンプレート（アプリの描画ゼロ）は必ず OK
    if check(str(TEMPLATE), quiet=True) != 0:
        problems.append("素のテンプレートで OVERFLOW（罫線を数えている）")

    # 上向き: 境界をまたぐ墨を入れたら必ず検出できる
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "mutated.pdf"
        doc = fitz.open(str(TEMPLATE))
        page = doc[0]
        # 判定セル側 x=344〜352 に確実に墨を置く（行帯の中）
        page.draw_rect(fitz.Rect(344, 400, 352, 420), color=(0, 0, 0), fill=(0, 0, 0))
        doc.save(str(out))
        doc.close()
        if check(str(out), quiet=True) != 1:
            problems.append("境界をまたぐ墨を入れたのに検出しない")

    if problems:
        print("SELF_TEST_FAILED")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("SELF_TEST_OK（素テンプレート=OK / はみ出し=検出）")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        raise SystemExit(self_test())
    pdf = sys.argv[1] if len(sys.argv) > 1 else "tmp/pdf-test-bekki234/bekki2_test.pdf"
    sc = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0
    raise SystemExit(check(pdf, sc))
