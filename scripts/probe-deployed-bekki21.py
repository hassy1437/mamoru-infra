# 稼働中の版が B-2 の座標修正を含むかを、挙動で確かめる。
#
# ■ 識別子
#   bekki21 p1行6「端子電圧 常用 ___ V 非常 ___ V」に値を入れて生成し、
#   アプリが描いた文字の x 範囲を測る。
#     旧版 … 常用値 x=222.36 起点（刷り込み「常用」232.92–254.04 に重なる）
#             非常値 x=287 起点（刷り込み「非常」280.21–301.33 に重なる）
#     新版 … 常用値 254.04–275.04 / 非常値 301.33–322.33（どちらも空欄の中）
#   ★「重なっているか」で判定する。座標そのものは描画位置により多少動くため。
#
# 使い方: python scripts/probe-deployed-bekki21.py <url>
import json
import sys
import urllib.request

import fitz

sys.stdout.reconfigure(encoding="utf-8")

URL = sys.argv[1] if len(sys.argv) > 1 else "https://app.mamoruinfra.com/api/generate-emergency-power-outlet-bekki21-pdf"
TEMPLATE = "public/PDF/s50_kokuji14_bekki21.pdf"
# テンプレート実測（文字単位）
PRINTED = {"常用": (232.92, 254.04), "V(1)": (275.04, 280.32), "非常": (280.21, 301.33), "V(2)": (322.33, 327.61)}
BAND = (382.0, 400.0)

rows = [{"content": "", "judgment": "", "bad_content": "", "action_content": ""} for _ in range(12)]
rows[6] = {"content": "100", "judgment": "良", "bad_content": "", "action_content": "", "current_value": "24"}
payload = json.dumps({"form_name": "稼働確認", "page1_rows": rows}, ensure_ascii=False).encode("utf-8")

req = urllib.request.Request(URL, data=payload, headers={"Content-Type": "application/json; charset=utf-8"})
with urllib.request.urlopen(req, timeout=120) as res:
    pdf = res.read()
print(f"HTTP {res.status} / {len(pdf):,} bytes")

open("tmp/_probe21.pdf", "wb").write(pdf)
doc = fitz.open("tmp/_probe21.pdf")
tmpl = fitz.open(TEMPLATE)
page, tp = doc[0], tmpl[0]
bodies = {tmpl.xref_stream(x) for x in tp.get_contents()}
keep = [x for x in page.get_contents() if doc.xref_stream(x) not in bodies]
if len(keep) > 1:
    doc.update_stream(keep[0], b"\n".join(doc.xref_stream(x) for x in keep))
page.set_contents(keep[0])

spans = []
for blk in page.get_text("dict")["blocks"]:
    for ln in blk.get("lines", []):
        for sp in ln.get("spans", []):
            x0, y0, x1, y1 = sp["bbox"]
            if BAND[0] <= (y0 + y1) / 2 <= BAND[1] and sp["text"].strip():
                spans.append((x0, x1, sp["text"].strip()))
spans.sort()
print("\nアプリが描いた文字:")
hits = []
for x0, x1, t in spans:
    over = [k for k, (px0, px1) in PRINTED.items() if x0 < px1 and px0 < x1]
    print(f"  {t!r:>8}  x {x0:7.2f} – {x1:7.2f}   {'★刷り込み[' + '/'.join(over) + ']に重なる' if over else 'OK（空欄内）'}")
    hits += over

print()
if not spans:
    print("判定: 値が描かれていない（識別できない）")
    sys.exit(2)
if hits:
    print(f"判定: 旧版が稼働中（刷り込みに重なっている: {', '.join(sorted(set(hits)))}）")
    sys.exit(1)
print("判定: 新版が稼働中（2値とも空欄の中に収まっている）")
print("PROBE_NEW_VERSION")
