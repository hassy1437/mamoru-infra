# 刷り込みの文字と、その隣にアプリが描く値の**ベースラインのズレ**を測る。
#
# ■ なぜ要るか（＝また「測っていない次元」）
#   点検年月日の行で、アプリが描く数字が刷り込みの「年」「月」「日」と
#   高さが揃っていない、と実機で指摘された。
#   罫線は越えず、刷り込みにも重ならず、切り詰めも起きないので**全検査が緑**。
#
# ■ 測り方
#   ★bbox の上下ではなくベースライン（span の origin.y）を使う。
#     bbox は日本語と英数字でフォントの上下方向の寸法が違うため、
#     同じベースラインでも上下端はズレる。揃えたいのはベースライン。
#   テンプレート由来のコンテンツストリームを外して「アプリが描いた分」だけを取り、
#   同じ行にある刷り込み文字と origin.y を比べる。
#
# 使い方: python scripts/measure-baseline-gap.py <pdf> [<pdf> ...] [--all]
import os
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")

# 「同じ行」とみなす縦の許容幅。行の高さは 16〜32pt なので、その半分未満にする
SAME_ROW = 7.0
# 「隣」とみなす横の距離。これを超えると別の欄
NEAR_X = 60.0


def template_for(pdf_path):
    """生成PDFに対応するテンプレートを探す（ファイル名の bekkiN から）"""
    import re
    m = re.search(r"(bekki[\w-]*?)(?:_test)?\.pdf$", os.path.basename(pdf_path))
    if not m:
        return None
    for cand in (m.group(1), m.group(1).replace("-", "_")):
        p = os.path.join("public", "PDF", f"s50_kokuji14_{cand}.pdf")
        if os.path.exists(p):
            return p
    return None


def spans_of(page):
    out = []
    for blk in page.get_text("dict")["blocks"]:
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                if sp["text"].strip():
                    out.append({
                        "text": sp["text"].strip(),
                        "x0": sp["bbox"][0], "x1": sp["bbox"][2],
                        "base": sp["origin"][1], "size": sp["size"],
                    })
    return out


def app_only(doc, page_no, tmpl):
    """テンプレート由来のストリームを外し、アプリが描いた分だけにする"""
    page, tp = doc[page_no], tmpl[page_no]
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
        printed = spans_of(tmpl[pno])
        page = app_only(doc, pno, tmpl)
        if page is None:
            continue
        for a in spans_of(page):
            # 同じ行にあり、横に近い刷り込みを探す（左右どちらでも）
            near = [p for p in printed
                    if abs(p["base"] - a["base"]) <= SAME_ROW
                    and (abs(p["x0"] - a["x1"]) <= NEAR_X or abs(a["x0"] - p["x1"]) <= NEAR_X)]
            if not near:
                continue
            # いちばん近いものと比べる
            p = min(near, key=lambda p: min(abs(p["x0"] - a["x1"]), abs(a["x0"] - p["x1"])))
            rows.append({
                "pdf": os.path.basename(pdf_path), "page": pno + 1,
                "app": a["text"][:14], "printed": p["text"][:14],
                "gap": round(a["base"] - p["base"], 2),
                "app_size": round(a["size"], 1), "printed_size": round(p["size"], 1),
                "x": round(a["x0"], 1),
            })
    doc.close(); tmpl.close()
    return rows


args = [a for a in sys.argv[1:] if not a.startswith("--")]
allrows = []
for p in args:
    allrows += measure(p)

if not allrows:
    print("測定対象なし")
    raise SystemExit(0)

gaps = sorted(r["gap"] for r in allrows)
print(f"隣接する刷り込みを持つアプリ描画: {len(allrows)} 件")
print(f"  ベースライン差: 最小 {gaps[0]:+.2f} / 中央 {gaps[len(gaps)//2]:+.2f} / 最大 {gaps[-1]:+.2f}")
for th in (0.5, 1.0, 2.0, 3.0):
    print(f"    |差| > {th}pt : {sum(1 for g in gaps if abs(g) > th):>4} 件")

show = sorted(allrows, key=lambda r: -abs(r["gap"]))
if "--all" not in sys.argv:
    show = show[:25]
print(f"\n{'PDF':<22}{'p':<3}{'差':>7}  {'アプリ':<16}{'刷り込み':<16}{'pt':>5}/{'pt':<5} x")
print("-" * 96)
for r in show:
    print(f"{r['pdf']:<22}{r['page']:<3}{r['gap']:>+7.2f}  {r['app']:<16}{r['printed']:<16}"
          f"{r['app_size']:>5}/{r['printed_size']:<5}{r['x']}")
