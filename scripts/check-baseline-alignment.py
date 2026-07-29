# 刷り込みの文字と、その隣にアプリが描く値の**ベースラインのズレ**を検査する。
#
# ■ なぜ要るか（＝また「測っていない次元」）
#   点検年月日で、アプリが描く数字が刷り込みの「年」「月」「日」と高さが揃って
#   いなかった（実測 23様式すべて・最大 -5.19pt）。罫線は越えず、刷り込みにも
#   重ならず、切り詰めも起きないので**全検査が緑**。実機で見て初めて分かった。
#   ＝ 1箇所ずつ目視で潰すのではなく、同じ構造の欄をまとめて測る。
#
# ■ 何を「隣」とみなすか（★誤検出の設計）
#   素朴に「同じ帯・近い x」で対にすると、別の行・別の列と組んで無意味な数字が出る
#   （最初にそれで 3761件・±6.99pt という測定にならない結果を出した）。
#   絞り込み:
#     (a) ベースラインの差が BAND 未満 … 同じ行に属する候補だけ
#     (b) 横の隙間が GAP 以下         … 「並べて描いている」と言える近さ
#     (c) 刷り込み側が1〜4文字        … ラベル・単位（年/月/日/MPa/Ｖ/本…）に絞る。
#         長い刷り込みは見出しや文章で、値と並べているわけではない
#     (d) アプリ側の文字が読める      … ストリーム分離でフォント対応が失われた
#         スパンは除く（文字化けした断片を測っても意味がない）
#
# ■ 閾値
#   ★両分布の実測から決める。日付を直した後の「揃っている」側は 0.00pt。
#   ズレていた側は 0.4〜5.2pt。1桁離れているので 0.3pt に引く。
#
# 使い方: python scripts/check-baseline-alignment.py [--list] [--self-test]
import glob
import os
import re
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")

BAND = 5.0       # 同じ行とみなすベースライン差の上限
GAP = 14.0       # 「並べて描いている」とみなす横の隙間の上限
MAX_LABEL = 4    # 刷り込み側の文字数の上限（ラベル・単位に絞る）
THRESHOLD = 0.3  # これを超えるズレを不良とする

READABLE = re.compile(r"^[\w　-ヿ一-鿿＀-￯ ./():：－〜~×-]+$")


def template_for(pdf_path):
    m = re.search(r"(bekki[\w-]*?)(?:_test)?\.pdf$", os.path.basename(pdf_path))
    if not m:
        return None
    for c in (m.group(1), m.group(1).replace("-", "_")):
        p = os.path.join("public", "PDF", f"s50_kokuji14_{c}.pdf")
        if os.path.exists(p):
            return p
    return None


def spans(page):
    out = []
    for blk in page.get_text("dict")["blocks"]:
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                t = sp["text"].strip()
                if t:
                    out.append({"t": t, "x0": sp["bbox"][0], "x1": sp["bbox"][2],
                                "b": sp["origin"][1]})
    return out


def app_only(doc, pno, tmpl):
    page, tp = doc[pno], tmpl[pno]
    bodies = {tmpl.xref_stream(x) for x in tp.get_contents()}
    keep = [x for x in page.get_contents() if doc.xref_stream(x) not in bodies]
    if not keep:
        return None
    if len(keep) > 1:
        doc.update_stream(keep[0], b"\n".join(doc.xref_stream(x) for x in keep))
    page.set_contents(keep[0])
    return page


def measure(pdf_path):
    tpl = template_for(pdf_path)
    if not tpl:
        return []
    doc, tmpl = fitz.open(pdf_path), fitz.open(tpl)
    rows = []
    for pno in range(min(doc.page_count, tmpl.page_count)):
        printed = [p for p in spans(tmpl[pno]) if 1 <= len(p["t"]) <= MAX_LABEL]
        page = app_only(doc, pno, tmpl)
        if page is None:
            continue
        for a in spans(page):
            if not READABLE.match(a["t"]):
                continue
            near = [p for p in printed
                    if abs(p["b"] - a["b"]) <= BAND
                    and (0 <= p["x0"] - a["x1"] <= GAP or 0 <= a["x0"] - p["x1"] <= GAP)]
            if not near:
                continue
            p = min(near, key=lambda p: min(abs(p["x0"] - a["x1"]), abs(a["x0"] - p["x1"])))
            rows.append({
                "form": os.path.basename(pdf_path).replace("_test.pdf", ""),
                "page": pno + 1, "app": a["t"][:16], "printed": p["t"],
                "gap": round(a["b"] - p["b"], 2), "x": round(a["x0"], 1),
            })
    doc.close(); tmpl.close()
    return rows


def audit(paths):
    rows = []
    for p in paths:
        rows += measure(p)
    return rows


PDFS = sorted(glob.glob("tmp/pdf-realistic/*.pdf"))

if "--self-test" in sys.argv:
    rows = audit(PDFS)
    bad = [r for r in rows if abs(r["gap"]) > THRESHOLD]
    if bad:
        print(f"自己診断: 現状が既にNG（{len(bad)} 件）")
        for r in bad[:5]:
            print(f"    {r['form']} p{r['page']} {r['app']!r} vs {r['printed']!r} {r['gap']:+.2f}")
        sys.exit(1)
    # ★陽性対照: 閾値を 0 にすれば「揃っている」ものも拾えるか（＝測れていること）
    if not rows:
        print("自己診断: 対を1件も見つけられない（絞り込みが強すぎる）")
        sys.exit(1)
    print(f"  陰性対照: 対 {len(rows)} 件すべて |差| <= {THRESHOLD}pt")
    print(f"  陽性対照: 対が {len(rows)} 件見つかっている＝測れている（0件なら検出力ゼロ）")
    print("SELF_TEST_OK")
    sys.exit(0)

rows = audit(PDFS)
bad = sorted((r for r in rows if abs(r["gap"]) > THRESHOLD), key=lambda r: -abs(r["gap"]))
print(f"刷り込みと並べて描いている箇所: {len(rows)} 件 / {len({r['form'] for r in rows})} 様式")
if rows:
    v = sorted(abs(r["gap"]) for r in rows)
    print(f"  |ベースライン差|: 最小 {v[0]:.2f} / 中央 {v[len(v)//2]:.2f} / 最大 {v[-1]:.2f}")
if "--list" in sys.argv:
    print(f"\n{'様式':<12}{'p':<3}{'差':>7}  {'アプリ':<18}{'刷り込み':<8}x")
    for r in sorted(rows, key=lambda r: -abs(r["gap"])):
        print(f"{r['form']:<12}{r['page']:<3}{r['gap']:>+7.2f}  {r['app']:<18}{r['printed']:<8}{r['x']}")
print()
if bad:
    print(f"★NG: |差| > {THRESHOLD}pt が {len(bad)} 件")
    for r in bad[:20]:
        print(f"    {r['form']} p{r['page']} {r['app']!r} vs 刷り込み{r['printed']!r} {r['gap']:+.2f}pt")
    sys.exit(1)
print(f"すべて |差| <= {THRESHOLD}pt")
print("BASELINE_ALIGNMENT_OK")
