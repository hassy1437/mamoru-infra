# 行ループ（drawResultRows）が描く内容セルを、値に依存せず監査する。
#
# ■ なぜ要るか — 既存の監査の盲点
#   check-cell-definition-audit.py は座標がリテラルの drawInCell だけを見る。
#   行ループのセルは座標が cols.contentX 由来なので**対象外**で、そこが
#   様式全体のセルの大半を占める。冒頭コメントに書いてあるだけだったので、
#   「監査0件＝安全」と読めてしまっていた。実際 B-2 で直した9箇所は
#   すべてこの盲点の中にあり、監査は一度も鳴っていない。
#
# ■ 分類（②と同じ軸）
#   実害   … 刷り込みが内容セルの左端側にある。左詰めで描くので**値が短くても重なる**
#   潜在   … 刷り込みが右端側だけ（単位）。値が短いから離れているだけで、長ければ重なる
#   対処済 … 描画を止めている（skip）か、空欄へずらしてある（override）ので刷り込みに掛からない
#   なし   … 内容セルに刷り込みが無い
#
# ★測れない呼び出しは黙って無視せず落とす（②で分類器が bekki2/bekki20 を
#   測れないまま「刷り込みなし」と誤報した轍）。
#
# ■ 既知の一覧（KNOWN_LATENT）について
#   潜在77件はまだ直していない。★KNOWN_UNEXERCISED と同じ扱いにする:
#     ・増えたら落ちる（新しい潜在が入るのを止める）
#     ・直したのに一覧に残っていても落ちる（一覧が嘘にならない）
#   ＝ いまは緑。退行が無いのは事実で、緑の意味も濁らない。
#   ★修正まで登録を待たない。待つと登録自体を忘れる（検査12本が全部
#     孤立していた原因がそれ）。
#
# 使い方: python scripts/check-row-cells.py [--all|--tsv|--self-test]
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify_numeric_rows_lib import call_sites, printed_glyphs_in_cell, template_of  # noqa: E402

import fitz  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

# drawWrappedInCell の既定 paddingX（src/lib/pdf-form-helpers.ts）。
# 実際に文字が入りうる領域は矩形を左右 paddingX だけ内側に縮めたもの。
PADDING_X = 2.0
# 「左端側」の幅。ここに刷り込みがあれば1文字目から重なる（本文6pt前後＝1文字約6pt）
LEFT_ZONE = 8.0


def audit():
    rows = []
    for route in sorted(glob.glob("src/app/api/*-pdf/route.ts")):
        name = os.path.basename(os.path.dirname(route)).replace("generate-", "").replace("-pdf", "")
        sites = call_sites(route)
        if not sites:
            continue
        tpl = template_of(route)
        if not tpl:
            raise SystemExit(f"★{name}: テンプレートPDFを特定できない（監査の前提が崩れている）")
        doc = fitz.open(tpl)
        for c in sites:
            if not c["key"] or not c["bounds"]:
                raise SystemExit(f"★{name} p{c['page']}: rows/rowBounds を特定できない（測れない呼び出し）")
            if c["page"] - 1 >= doc.page_count:
                raise SystemExit(f"★{name}: p{c['page']} がテンプレートに無い")
            page = doc[c["page"] - 1]
            b = c["bounds"]
            for i in range(len(b) - 1):
                pi = i + c["start"]
                ox, ow = c["overrides"].get(i, (c["cx"], c["cw"]))
                tx0, tx1 = ox + PADDING_X, ox + ow - PADDING_X
                glyphs = printed_glyphs_in_cell(page, b[i], b[i + 1], c["cx"], c["cx"] + c["cw"])
                if not glyphs:
                    continue
                text = "".join(g[2] for g in glyphs)
                # 実際に描く領域（override 後）と刷り込みが交差するか
                hit = [g for g in glyphs if g[0] < tx1 and tx0 < g[1]]
                if i in c["skips"]:
                    kind = "対処済(skip)"
                elif not hit:
                    kind = "対処済(ずらし)"
                elif min(g[0] for g in hit) <= tx0 + LEFT_ZONE:
                    kind = "実害"
                else:
                    kind = "潜在"
                rows.append((name, c["page"], c["key"], pi, kind, round(tx0, 1), round(tx1, 1),
                             round(min(g[0] for g in hit), 1) if hit else None, text))
        doc.close()
    return rows


# 直していない「潜在」の既知一覧。テンプレートの実測から生成した。
KNOWN_LATENT = {
    ("doryoku-pump-bekki10", 1, "page1_rows", 2),   # ｍ3
    ("doryoku-pump-bekki10", 1, "page1_rows", 10),   # L
    ("doryoku-pump-bekki10", 1, "page1_rows", 14),   # Ｖ
    ("emergency-alarm-bekki14", 1, "page1_rows", 2),   # Ｖ
    ("emergency-alarm-bekki14", 1, "page1_rows", 12),   # Ｖ
    ("emergency-alarm-bekki14", 1, "page1_rows", 14),   # Ａ
    ("emergency-alarm-bekki14", 2, "page2_rows", 8),   # Ｖ
    ("emergency-alarm-bekki14", 2, "page2_rows", 11),   # Ａ
    ("fire-department-notification-bekki13", 1, "page1_rows", 3),   # Ｖ
    ("fire-department-notification-bekki13", 1, "page1_rows", 9),   # Ａ
    ("fire-water-bekki17", 1, "page1_rows", 2),   # ｍP3
    ("foam-bekki5", 1, "page1_rows", 2),   # ｍ3
    ("foam-bekki5", 1, "page1_rows", 13),   # Ａ
    ("foam-bekki5", 1, "page1_rows", 17),   # 種接地
    ("foam-bekki5", 2, "page2_rows", 5),   # MPa
    ("foam-bekki5", 2, "page2_rows", 20),   # L
    ("foam-bekki5", 2, "page2_rows", 26),   # MPa
    ("foam-bekki5", 2, "page2_rows", 27),   # MPa
    ("foam-bekki5", 3, "page3_rows", 2),   # MPa
    ("foam-bekki5", 3, "page3_rows", 10),   # MPa
    ("foam-bekki5", 4, "page4_rows", 3),   # Ａ
    ("foam-bekki5", 4, "page4_rows", 16),   # Ａ
    ("gas-leak-fire-alarm-bekki11-2", 1, "page1_rows", 3),   # Ｖ
    ("gas-leak-fire-alarm-bekki11-2", 1, "page1_rows", 11),   # Ｖ
    ("gas-leak-fire-alarm-bekki11-2", 1, "page1_rows", 13),   # Ａ
    ("gas-leak-fire-alarm-bekki11-2", 2, "page2_rows", 17),   # db
    ("halogen-bekki7", 1, "page1_rows", 3),   # 本
    ("halogen-bekki7", 1, "page1_rows", 17),   # kg
    ("halogen-bekki7", 1, "page1_rows", 26),   # 本
    ("halogen-bekki7", 2, "page2_rows", 2),   # 本
    ("halogen-bekki7", 2, "page2_rows", 35),   # Ｖ
    ("halogen-bekki7", 2, "page2_rows", 37),   # Ａ
    ("halogen-bekki7", 2, "page2_rows", 42),   # 秒
    ("halogen-bekki7", 3, "page3_rows", 15),   # Ｖ
    ("halogen-bekki7", 3, "page3_rows", 21),   # ｍ
    ("halogen-bekki7", 4, "page4_rows", 1),   # 秒
    ("inert-gas-bekki6", 1, "page1_rows", 4),   # 本
    ("inert-gas-bekki6", 1, "page1_rows", 12),   # kg
    ("inert-gas-bekki6", 1, "page1_rows", 24),   # 本
    ("inert-gas-bekki6", 2, "page2_rows", 28),   # Ｖ
    ("inert-gas-bekki6", 2, "page2_rows", 30),   # Ａ
    ("inert-gas-bekki6", 2, "page2_rows", 35),   # 秒
    ("inert-gas-bekki6", 3, "page3_rows", 24),   # Ｖ
    ("inert-gas-bekki6", 3, "page3_rows", 30),   # ｍ
    ("inert-gas-bekki6", 4, "page4_rows", 2),   # 秒
    ("jidou-kasai-houchi-bekki11-1", 1, "page1_rows", 2),   # Ｖ
    ("leakage-fire-alarm-bekki12", 1, "page1_rows", 5),   # Ａ
    ("leakage-fire-alarm-bekki12", 1, "page1_rows", 15),   # Ａ
    ("leakage-fire-alarm-bekki12", 1, "page1_rows", 21),   # Ａ
    ("leakage-fire-alarm-bekki12", 2, "page2_rows", 2),   # db
    ("okugai-shokasen-bekki9", 1, "page1_rows", 1),   # ｍP3
    ("okugai-shokasen-bekki9", 1, "page1_rows", 12),   # Ａ
    ("okugai-shokasen-bekki9", 1, "page1_rows", 16),   # 種接地
    ("okugai-shokasen-bekki9", 2, "page2_rows", 9),   # MPa
    ("okugai-shokasen-bekki9", 2, "page2_rows", 22),   # L
    ("okugai-shokasen-bekki9", 2, "page2_rows", 28),   # MPa
    ("okugai-shokasen-bekki9", 2, "page2_rows", 29),   # MPa
    ("okugai-shokasen-bekki9", 3, "page3_rows", 14),   # Ａ
    ("okugai-shokasen-bekki9", 3, "page3_rows", 16),   # MPa
    ("okugai-shokasen-bekki9", 3, "page3_rows", 17),   # L/min
    ("okugai-shokasen-bekki9", 3, "page3_rows", 19),   # MPa
    ("okugai-shokasen-bekki9", 3, "page3_rows", 20),   # L/min
    ("powder-bekki8", 1, "page1_rows", 3),   # 本
    ("powder-bekki8", 1, "page1_rows", 11),   # MPa
    ("powder-bekki8", 1, "page1_rows", 18),   # kg
    ("powder-bekki8", 1, "page1_rows", 27),   # 本
    ("powder-bekki8", 2, "page2_rows", 2),   # 本
    ("powder-bekki8", 2, "page2_rows", 35),   # Ｖ
    ("powder-bekki8", 2, "page2_rows", 37),   # Ａ
    ("powder-bekki8", 2, "page2_rows", 42),   # 秒
    ("powder-bekki8", 3, "page3_rows", 13),   # Ｖ
    ("powder-bekki8", 3, "page3_rows", 19),   # ｍ
    ("powder-bekki8", 4, "page4_rows", 1),   # 秒
    ("smoke-control-bekki18", 2, "page2_rows", 16),   # Ａ
    ("standpipe-bekki20", 1, "page1_rows", 19),   # Ａ
    ("standpipe-bekki20", 1, "page1_rows", 23),   # 種接地
    ("standpipe-bekki20", 3, "page3_rows", 1),   # Ａ
}


def summarize(rows):
    return {k: sum(1 for r in rows if r[4] == k)
            for k in ("実害", "潜在", "対処済(skip)", "対処済(ずらし)")}


def check(rows):
    problems = []
    for r in rows:
        if r[4] == "実害":
            problems.append(f"★実害: {r[0]} p{r[1]} {r[2]}[{r[3]}] 刷り込み[{r[8]}] に左端から重なる")
    got = {(r[0], r[1], r[2], r[3]) for r in rows if r[4] == "潜在"}
    want = {(k[0], k[1], k[2], k[3]) for k in KNOWN_LATENT}
    for a in sorted(got - want):
        problems.append(f"★新しい潜在が増えた: {a[0]} p{a[1]} {a[2]}[{a[3]}]")
    for f in sorted(want - got):
        problems.append(f"{f[0]} p{f[1]} {f[2]}[{f[3]}] は解消済み。KNOWN_LATENT から外すこと（一覧が嘘になる）")
    return problems


def self_test():
    """★両方向。一覧を固定しただけで検出力が無い、を防ぐ"""
    rows = audit()
    if check(rows):
        print("自己診断: 現状が既にNG（陰性対照が成立しない）")
        return 1
    saved = set(KNOWN_LATENT)
    try:
        KNOWN_LATENT.discard(next(iter(sorted(KNOWN_LATENT))))
        if not any("新しい潜在が増えた" in p for p in check(rows)):
            print("自己診断: 一覧から外しても検出できない")
            return 1
        KNOWN_LATENT.clear()
        KNOWN_LATENT.update(saved)
        KNOWN_LATENT.add(("__存在しない様式__", 1, "page1_rows", 0))
        if not any("解消済み" in p for p in check(rows)):
            print("自己診断: 実体の無い項目が一覧に残っていても落ちない")
            return 1
    finally:
        KNOWN_LATENT.clear()
        KNOWN_LATENT.update(saved)
    print(f"  陰性対照: 現状 潜在 {summarize(rows)['潜在']} 件 → 一覧と一致")
    print("  陽性対照: 一覧から1件外す → 検出 / 実体の無い項目を足す → 検出")
    print("SELF_TEST_OK")
    return 0


if "--self-test" in sys.argv:
    sys.exit(self_test())

rows = audit()
if "--tsv" in sys.argv:
    # ★桁揃えの表は様式名が長いと列が食い込む。集計は必ずこちらを使う
    for name, pno, key, i, kind, tx0, tx1, first, text in rows:
        print("\t".join(str(x) for x in (kind, name, pno, key, i, tx0, tx1, first, text)))
    raise SystemExit(0)
show_all = "--all" in sys.argv
order = {"実害": 0, "潜在": 1, "対処済(skip)": 2, "対処済(ずらし)": 3}
rows.sort(key=lambda r: (order[r[4]], r[0], r[1], r[3]))

print(f"行ループの内容セルのうち、テンプレートに刷り込みがある行: {len(rows)} 件\n")
print(f"{'分類':<14}{'様式':<26}{'p':<3}{'rows':<13}{'行':<5}{'描画域':<18}{'刷り込み開始':<12}刷り込み")
print("-" * 124)
for name, pno, key, i, kind, tx0, tx1, first, text in rows:
    if not show_all and kind.startswith("対処済"):
        continue
    print(f"{kind:<14}{name:<26}{pno:<3}{key:<13}{i:<5}{tx0:7.1f}–{tx1:<9.1f}"
          f"{(f'{first:.1f}' if first is not None else '-'):<12}{text}")

print()
for k in ("実害", "潜在", "対処済(skip)", "対処済(ずらし)"):
    n = sum(1 for r in rows if r[4] == k)
    forms = len({r[0] for r in rows if r[4] == k})
    print(f"  {k:<14} {n:>4} 件 / {forms:>2} 様式")

problems = check(rows)
if problems:
    print()
    print("★NG:")
    for p in problems:
        print("   ", p)
    sys.exit(1)
print()
print(f"既知の潜在 {len(KNOWN_LATENT)} 件と一致 / 実害 0 件")
print("ROW_CELLS_OK")
