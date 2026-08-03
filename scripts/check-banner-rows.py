# 全幅の刷り込み見出し行（「機器点検」「総合点検」）に値が描かれていないかを見る。
#
# ■ なぜ要るか
#   これらの行はテンプレート側で全列がひと続きの1セルになっており、
#   内容・判定・不良内容・措置内容のどれを描いても見出しの上に重なる。
#   止め方が3通りに割れていて、うち1つが**内容列しか止めていなかった**:
#     ・blankPrintedRows(rows, Set)      … 行データごと空 → 全列止まる（10箇所）
#     ・drawResultRows の全スキップ引数   … bekki11-1 だけの独自機構（1箇所）
#     ・skipContentRows                   … ★内容列しか止まらない（bekki4 p3 が該当し、
#                                            「総合点検」の上に ×／変形あり／部品交換 が出ていた）
#   コメントで注意するだけでは同じドリフトが再発するので、出力を測って落とす。
#
# ■ 対象行の決め方（★列挙しない）
#   「内容列の左端と右端の**両方**に、その行の高さを覆う縦罫線が無い行」を見出し行とする。
#   ＝ 左右の仕切りが無い ＝ その行は全列がひと続き、という構造から導く。
#   許容値は推測ではなく実測から決める:
#     ・列端の定義値と刷り込み罫線のずれの実測最大 = 1.76pt
#     ・最小の行高 = 10.67pt（半分の 5.33pt を超えると隣の罫線を拾う）
#   → 1.76 < TOL < 5.33 の範囲なら結果は同じ。中央付近の 3.0 を使う。
#
#   「覆えていない」の閾値も実測で決める。不足量は二極に分かれた:
#     ・罫線の端が少し届いていないだけ … 不足 2.05pt（bekki7 p2 1行目、行高 13.33pt）
#     ・本当に仕切りが無い             … 不足が行高そのもの（12件、14.91〜22.67pt）
#   → 行高の半分を境にすれば両者は分離する。★「2pt足りない＝結合」にすると
#     bekki7 の縁を見出し行と誤認する（実際に一度誤認した）。
#
# ■ 判定
#   見出し行の帯に、テンプレートの刷り込みに無い文字が1つでもあれば NG。
#   ★「値が空だった」で緑になるのを防ぐため、入力JSONにその行のデータがあることも確かめる。
#     データが無い行は「未検証」として数え、0件でなければ落とす。
#
# 使い方: python scripts/check-banner-rows.py [--all|--self-test]
import glob
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify_numeric_rows_lib import call_sites, template_of  # noqa: E402

import fitz  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

TOL = 3.0
FONT_HINT = ("NotoSansJP", "Helvetica", "Arial")
PDF_DIR = "tmp/pdf-realistic"


def vrules(page):
    out = []
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                a, b = it[1], it[2]
                if abs(a.x - b.x) < 0.6 and abs(a.y - b.y) > 3:
                    out.append((round((a.x + b.x) / 2, 2), min(a.y, b.y), max(a.y, b.y)))
            elif it[0] == "re":
                r = it[1]
                if r.width < 1.5 and r.height > 3:
                    out.append((round((r.x0 + r.x1) / 2, 2), r.y0, r.y1))
    return out


def union_len(segs, a0, a1):
    cov = sorted((max(a, a0), min(b, a1)) for a, b in segs if min(b, a1) > max(a, a0))
    total, cur = 0.0, None
    for a, b in cov:
        if cur and a <= cur[1] + 0.5:
            cur = (cur[0], max(cur[1], b))
        else:
            if cur:
                total += cur[1] - cur[0]
            cur = (a, b)
    if cur:
        total += cur[1] - cur[0]
    return total


def spans(page, rect, fonts_only):
    out = []
    for blk in page.get_text("dict", clip=rect)["blocks"]:
        for ln in blk.get("lines", []):
            for sp in ln["spans"]:
                if not sp["text"].strip():
                    continue
                if fonts_only and not any(h in sp["font"] for h in FONT_HINT):
                    continue
                out.append((round(sp["bbox"][0], 1), sp["text"].strip()))
    return out


def payload_rows(stem, key):
    path = os.path.join(PDF_DIR, f"{stem}_test.payload.json")
    if not os.path.exists(path):
        return None
    data = json.load(io.open(path, encoding="utf-8"))
    rows = data.get(key)
    if rows is None:
        for v in data.values():
            if isinstance(v, dict) and key in v:
                rows = v[key]
    return rows if isinstance(rows, list) else None


def stem_of(name):
    m = re.search(r"bekki(\d+)(?:-(\d+))?$", name)
    if not m:
        return None
    return f"bekki{m.group(1)}" + (f"_{m.group(2)}" if m.group(2) else "")


def collect():
    found = []
    for route in sorted(glob.glob("src/app/api/*/route.ts")):
        dn = os.path.basename(os.path.dirname(route))
        if not re.fullmatch(r"generate-[A-Za-z0-9_-]*pdf", dn):
            continue
        tpl = template_of(route)
        if not tpl:
            continue
        name = dn.replace("generate-", "").replace("-pdf", "")
        stem = stem_of(name)
        doc = fitz.open(tpl)
        gen_path = os.path.join(PDF_DIR, f"{stem}_test.pdf") if stem else None
        gen = fitz.open(gen_path) if gen_path and os.path.exists(gen_path) else None
        for c in call_sites(route):
            if not c["key"] or not c["bounds"] or c["page"] - 1 >= doc.page_count:
                continue
            page = doc[c["page"] - 1]
            ver = vrules(page)
            b, x0, x1 = c["bounds"], c["cx"], c["cx"] + c["cw"]
            for i in range(len(b) - 1):
                h = b[i + 1] - b[i]
                bare = True
                for x in (x0, x1):
                    segs = [(y0, y1) for rx, y0, y1 in ver if abs(rx - x) <= TOL]
                    if union_len(segs, b[i], b[i + 1]) >= h / 2:
                        bare = False
                if not bare:
                    continue
                row = i + c["start"]
                printed = set(spans(page, fitz.Rect(20, b[i] + 0.5, 580, b[i + 1] - 0.5), False))
                drawn, has_input = None, None
                if gen and c["page"] - 1 < gen.page_count:
                    cur = spans(gen[c["page"] - 1], fitz.Rect(20, b[i] + 0.5, 580, b[i + 1] - 0.5), True)
                    drawn = [t for t in cur if t not in printed]
                    rows = payload_rows(stem, c["key"])
                    has_input = bool(rows and row < len(rows) and any(
                        str(v).strip() for v in (rows[row] or {}).values()))
                found.append({
                    "form": name, "page": c["page"], "key": c["key"], "row": row,
                    "label": "".join(t for _, t in sorted(printed))[:20],
                    "drawn": drawn, "has_input": has_input,
                })
        doc.close()
        if gen:
            gen.close()
    return found


def check(found):
    bad, unverified = [], []
    for f in found:
        if f["drawn"] is None:
            unverified.append(f"{f['form']} p{f['page']} {f['row'] + 1}行 — 生成PDFが無く測れなかった")
        elif f["drawn"]:
            bad.append(f"{f['form']} p{f['page']} {f['row'] + 1}行「{f['label']}」に "
                       + "／".join(f"「{t}」" for _, t in f["drawn"][:4]))
        elif not f["has_input"]:
            unverified.append(f"{f['form']} p{f['page']} {f['row'] + 1}行 — "
                              "入力側にこの行のデータが無く、空なのか止まったのか区別できない")
    return bad, unverified


if "--self-test" in sys.argv:
    found = collect()
    live = [f for f in found if f["drawn"] is not None]
    print(f"見出し行 {len(found)} 件 / うち生成PDFで実際に測れたもの {len(live)} 件")
    fails = []
    # ★測れていなければ、緑は「異常が無い」ではなく「見ていない」を意味する
    if not live:
        fails.append("1件も測れていない（検査が実質動いていない）")

    def one(drawn, has_input):
        return {"form": "x", "page": 1, "key": "page1_rows", "row": 0, "label": "総合点検",
                "drawn": drawn, "has_input": has_input}

    b, u = check([one([(1.0, "×")], True)])
    if len(b) != 1:
        fails.append("陽性: 見出し行に値があるのに落ちない")
    b, u = check([one([], True)])
    if b or u:
        fails.append("陰性: 値が無く入力もあるのに落ちる")
    b, u = check([one([], False)])
    if len(u) != 1:
        fails.append("陰性の偽装: 入力が無いのに『異常なし』として通してしまう")
    b, u = check([one(None, None)])
    if len(u) != 1:
        fails.append("測れなかったものを黙って通してしまう")
    for f in fails:
        print("★NG:", f)
    if fails:
        sys.exit(1)
    print("BANNER_ROWS_SELFTEST_OK")
    sys.exit(0)

found = collect()
print(f"{'様式':<30}{'p':>2}{'行':>4}  {'刷り込み':<12}{'入力':<6}見出し行に描かれた値")
print("-" * 96)
for f in sorted(found, key=lambda r: (r["form"], r["page"], r["row"])):
    if f["drawn"] is None:
        state = "測れず"
    elif f["drawn"]:
        state = "／".join(f"「{t}」" for _, t in f["drawn"][:4])
    else:
        state = "（刷り込みのみ）"
    print(f"{'★' if f['drawn'] else ' '}{f['form']:<29}{f['page']:>2}{f['row'] + 1:>4}  "
          f"{f['label']:<12}{('あり' if f['has_input'] else '無し' if f['has_input'] is not None else '-'):<6}{state}")

bad, unverified = check(found)
print()
print(f"  見出し行 {len(found)} 件（構造から導出: 内容列の左右に縦罫線が無い行）")
if bad or unverified:
    print()
    print("★NG:")
    for p in bad + unverified:
        print("   ", p)
    sys.exit(1)
print(f"  値が描かれているもの 0 件 / 未検証 0 件")
print("BANNER_ROWS_OK")
