# 潜在（右端に単位が刷り込まれている行）に入れる contentOverrides を計算する。
#
# ■ 規則（既存の実践から取った。定数を勘で置かない）
#   セルの右端 = 単位の左端。余白は drawWrappedInCell の padding(2.0) が担う。
#   実測: 既に「ずらし」で対処済みの61件は、描画域の右端から単位までが
#   中央 2.2〜2.9pt ＝ セル右端はほぼ単位の左端に一致している。
#   ★単位の種類による差は無い（bekki7 では 本/kg/秒/Ｖ/Ａ/ｍ がページごとに同じ x）。
#
# 使い方: python scripts/compute-row-cell-overrides.py <route.ts>
import os
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify_numeric_rows_lib import call_sites, printed_glyphs_in_cell, template_of  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

route = sys.argv[1]
doc = fitz.open(template_of(route))
for c in call_sites(route):
    if not c["key"] or not c["bounds"]:
        continue
    page = doc[c["page"] - 1]
    b = c["bounds"]
    lines = []
    for i in range(len(b) - 1):
        if i in c["skips"] or i in c["overrides"]:
            continue
        g = printed_glyphs_in_cell(page, b[i], b[i + 1], c["cx"], c["cx"] + c["cw"])
        if not g:
            continue
        unit = "".join(x[2] for x in g)
        w = round(g[0][0] - c["cx"], 2)
        lines.append(f"            {i}: {{ x: {c['cx']}, w: {w} }},   // 刷り込み「{unit}」({g[0][0]:.2f}) の手前まで")
    if lines:
        print(f"// --- p{c['page']} ({c['key']}) 内容列 {c['cx']}–{c['cx']+c['cw']:.2f}")
        print("\n".join(lines))
doc.close()
