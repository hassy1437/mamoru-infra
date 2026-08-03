# 8pt 未満で描かれた項目を数える（★実装の前に件数を測るための調査スクリプト）。
#
# ■ なぜ先に測るか
#   8pt 警告を入れても、常時鳴る件数なら検出器として死ぬ（＝誤検出も検出器を殺す）。
#   入れる/入れないの判断材料を出すのがこのスクリプトの役目で、ゲートではない。
#
# ■ 閾値はコードから読む（check-below-min.py と同じ作法）
#   5.0 は ABSOLUTE_MIN_FONT_SIZE、8.0 は READABLE_MIN_FONT_SIZE（未定義なら 8.0 を仮置き）。
#
# 使い方: python scripts/measure-below-8pt.py [--all]
import glob
import io
import os
import re
import sys
from collections import defaultdict

import fitz

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OVERLAY_FONT_HINTS = ("NotoSansJP", "Helvetica", "Arial")
REALISTIC = os.path.join(ROOT, "tmp", "pdf-realistic", "*.pdf")
STRESS = os.path.join(ROOT, "tmp", "pdf-test-*", "*.pdf")

_helpers = io.open(
    os.path.join(ROOT, "src", "lib", "pdf-form-helpers.ts"), encoding="utf-8"
).read()
_m = re.search(r"export const ABSOLUTE_MIN_FONT_SIZE = ([\d.]+)", _helpers)
if not _m:
    print("★NG: ABSOLUTE_MIN_FONT_SIZE を読み取れない")
    sys.exit(1)
ABS_MIN = float(_m.group(1))

_r = re.search(r"export const READABLE_MIN_FONT_SIZE = ([\d.]+)", _helpers)
READABLE_MIN = float(_r.group(1)) if _r else 8.0
DECLARED = _r is not None


def scan(pattern):
    """(pdf名, ページ, テキスト, pt) を、overlay フォントで描かれた span から拾う。"""
    out = []
    for path in sorted(glob.glob(pattern)):
        name = os.path.basename(path)
        with fitz.open(path) as doc:
            for pno, page in enumerate(doc, start=1):
                d = page.get_text("rawdict")
                for block in d.get("blocks", []):
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            font = span.get("font", "")
                            if not any(h in font for h in OVERLAY_FONT_HINTS):
                                continue
                            size = round(float(span.get("size", 0)), 2)
                            text = "".join(
                                c.get("c", "") for c in span.get("chars", [])
                            ).strip()
                            if not text:
                                continue
                            out.append((name, pno, text, size))
    return out


def report(label, pattern, show_all):
    rows = [r for r in scan(pattern) if r[3] < READABLE_MIN]
    below_abs = [r for r in rows if r[3] < ABS_MIN]
    band = [r for r in rows if ABS_MIN <= r[3] < READABLE_MIN]

    print(f"\n=== {label} ===")
    print(f"  {READABLE_MIN}pt 未満: {len(rows)} 件")
    print(f"    うち {ABS_MIN}pt 未満（既存の下限割れ）: {len(below_abs)} 件")
    print(f"    うち {ABS_MIN}〜{READABLE_MIN}pt（今回の新しい帯）: {len(band)} 件")

    # 様式ごとの内訳
    by_form = defaultdict(list)
    for r in band:
        by_form[r[0]].append(r)
    if by_form:
        print(f"  -- 様式別（{ABS_MIN}〜{READABLE_MIN}pt の帯）--")
        for form in sorted(by_form, key=lambda f: -len(by_form[f])):
            sizes = sorted({x[3] for x in by_form[form]})
            print(
                f"    {form:<34} {len(by_form[form]):>4} 件  pt={sizes[0]}〜{sizes[-1]}"
            )

    limit = None if show_all else 40
    if band:
        print(f"  -- 明細（{'全件' if show_all else f'先頭{limit}件'}）--")
        for r in sorted(band, key=lambda x: (x[3], x[0]))[:limit]:
            print(f"    {r[3]:>5.2f}pt  {r[0]:<30} p{r[1]}  {r[2][:44]}")
    return rows, band


if __name__ == "__main__":
    show_all = "--all" in sys.argv
    print(f"ABSOLUTE_MIN_FONT_SIZE = {ABS_MIN}")
    print(
        f"READABLE_MIN_FONT_SIZE = {READABLE_MIN}"
        f"{'（コードから）' if DECLARED else '（未定義のため 8.0 を仮置き）'}"
    )
    r1, b1 = report("現実値セット", REALISTIC, show_all)
    r2, b2 = report("長文セット", STRESS, show_all)
    print("\n=== まとめ ===")
    print(f"  現実値セット: {READABLE_MIN}pt未満 {len(r1)} 件 / うち新帯 {len(b1)} 件")
    print(f"  長文セット  : {READABLE_MIN}pt未満 {len(r2)} 件 / うち新帯 {len(b2)} 件")
