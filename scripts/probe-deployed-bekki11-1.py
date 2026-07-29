# 稼働中の版が bekki11-1 の○の座標修正を含むかを、挙動で確かめる。
#
# ■ 識別子
#   p2行9「スポット型（煙）イオン・光電・アナログ」に「光電」を入れて生成し、
#   描かれた楕円の左端を測る。
#     旧版 … cx/rx が丸め値で、左隣「イオン」(233.28–264.96) に -0.96pt 食い込む
#     新版 … テンプレート実測なので +2.67pt 手前で止まる
#   ★この差は「どちらの選択肢を選んだか分からない」に直結する。
#
# 使い方: python scripts/probe-deployed-bekki11-1.py [https://app.mamoruinfra.com]
import json
import sys
import urllib.request

import fitz

sys.stdout.reconfigure(encoding="utf-8")

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://app.mamoruinfra.com"
URL = f"{BASE}/api/generate-jidou-kasai-houchi-bekki11-1-pdf"
TEMPLATE = "public/PDF/s50_kokuji14_bekki11_1.pdf"
LEFT_WORD_RIGHT = 264.96      # 刷り込み「イオン」の右端（テンプレート実測）
ROW = 9

rows = [{"content": "", "judgment": "", "bad_content": "", "action_content": ""} for _ in range(25)]
rows[ROW] = {"content": "光電", "judgment": "良", "bad_content": "", "action_content": ""}
data = json.dumps({"form_name": "稼働確認", "page2_rows": rows}, ensure_ascii=False).encode("utf-8")

req = urllib.request.Request(URL, data=data, headers={"Content-Type": "application/json; charset=utf-8"})
with urllib.request.urlopen(req, timeout=180) as res:
    pdf = res.read()
print(f"HTTP {res.status} / {len(pdf):,} bytes")
open("tmp/_probe11.pdf", "wb").write(pdf)

doc = fitz.open("tmp/_probe11.pdf")
tmpl = fitz.open(TEMPLATE)
page, tp = doc[1], tmpl[1]
bodies = {tmpl.xref_stream(x) for x in tp.get_contents()}
keep = [x for x in page.get_contents() if doc.xref_stream(x) not in bodies]
if len(keep) > 1:
    doc.update_stream(keep[0], b"\n".join(doc.xref_stream(x) for x in keep))
page.set_contents(keep[0])

# その行の帯にある楕円（4本のベジェ曲線）
ells = [d["rect"] for d in page.get_drawings()
        if any(it[0] == "c" for it in d["items"]) and 290 <= (d["rect"].y0 + d["rect"].y1) / 2 <= 315]
if len(ells) != 1:
    print(f"判定: 楕円が {len(ells)} 個（期待1個）— 識別できない")
    sys.exit(2)
r = ells[0]
gap = r.x0 - LEFT_WORD_RIGHT
print(f"\n  刷り込み「イオン」の右端: {LEFT_WORD_RIGHT:.2f}")
print(f"  「光電」の楕円 x        : {r.x0:.2f} – {r.x1:.2f}")
print(f"  左隣までの実距離        : {gap:+.2f} pt")

print()
if gap <= 0:
    print("判定: 旧版が稼働中（○が左隣「イオン」に食い込んでいる）")
    sys.exit(1)
print("判定: 新版が稼働中（左隣に触れていない）")
print("PROBE_NEW_VERSION")
