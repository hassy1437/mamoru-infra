"""digit-mangling-regression.mjs が出力したPDFを検査し、型番の字形化けと幅乖離を判定する。

判定:
  (1) 抽出テキスト == 入力テキスト（化けの直接検出。閾値に依存しない主判定）
  (2) |実描画幅 - 計測幅| / 計測幅 < TOL（収まり判定が信用できるか）

TOL は 5%。グリフのインク幅と送り幅の差で数%出ることがあるため（実測: Helvetica で最大2.9%）、
化け時の乖離（実測 +28.9〜+41.6%）とは十分に離れている。

使い方:
  node scripts/digit-mangling-regression.mjs && python scripts/digit-mangling-regression.py
成功で DIGIT_MANGLING_REGRESSION_PASSED を出力し exit 0。失敗は該当行を出して exit 1。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz

TOL = 0.05

ROOT = Path(__file__).resolve().parents[1]
pdf_path = ROOT / "tmp" / "digit-regression.pdf"
meta_path = ROOT / "tmp" / "digit-regression.json"

if not pdf_path.exists() or not meta_path.exists():
    print("先に node scripts/digit-mangling-regression.mjs を実行すること")
    sys.exit(2)

meta = json.loads(meta_path.read_text(encoding="utf-8"))
doc = fitz.open(pdf_path)
page = doc[0]
page_h = page.rect.height

spans = []
for block in page.get_text("rawdict")["blocks"]:
    for line in block.get("lines", []):
        for span in line.get("spans", []):
            chars = span.get("chars", [])
            if not chars:
                continue
            spans.append({
                "x0": min(c["bbox"][0] for c in chars),
                "x1": max(c["bbox"][2] for c in chars),
                "y": span["origin"][1],
                "text": "".join(c["c"] for c in chars),
            })

print(f"{'text':<16} {'font':<6} {'api':>8} {'actual':>8} {'diff%':>8}  {'extracted'}")
print("-" * 78)

failures = []
for row in meta["rows"]:
    # pdf-lib は下原点・PyMuPDF は上原点
    target_y = meta["pageHeight"] - row["y"]
    cand = [s for s in spans if abs(s["y"] - target_y) < 3 and s["x0"] >= meta["x"] - 6]
    if not cand:
        print(f"{row['text']:<16} {row['font']:<6} {'-':>8} {'NOT_FOUND':>8}")
        failures.append((row["text"], "PDFから該当テキストを抽出できない"))
        continue

    # 化けると複数スパンに割れるので、行内の全スパンを集約して総幅を測る
    cand.sort(key=lambda s: s["x0"])
    extracted = "".join(s["text"] for s in cand)
    actual = max(s["x1"] for s in cand) - min(s["x0"] for s in cand)
    api = row["apiWidth"]
    diff = (actual - api) / api if api else 0.0

    print(f"{row['text']:<16} {row['font']:<6} {api:>8.2f} {actual:>8.2f} {diff * 100:>7.1f}%  {extracted!r}")

    if extracted != row["text"]:
        failures.append((row["text"], f"字形化け: 抽出={extracted!r}（数字がCJKグリフに置換された疑い）"))
    elif abs(diff) >= TOL:
        failures.append((row["text"], f"幅乖離 {diff * 100:.1f}% >= {TOL * 100:.0f}%（収まり判定が信用できない）"))

print("-" * 78)
if failures:
    print("\n再発検出:")
    for text, why in failures:
        print(f"  - {text}: {why}")
    print("\n→ 描画/計測が latin フォントを経由していない可能性が高い。")
    print("  pdf-form-helpers.pickFont を通すこと（customFont 直描画に戻すと再発する）。")
    print("  網羅性は python scripts/check-latin-font-coverage.py でも確認できる。")
    sys.exit(1)

print("\nDIGIT_MANGLING_REGRESSION_PASSED")
