# 稼働中の版が「単位の手前で止める」修正（①）を含むかを、挙動で確かめる。
#
# ■ 識別子
#   bekki7 p1行3 の内容セルに長い日本語を入れて生成し、描かれた文字の右端を測る。
#   テンプレートは「本」を x=317.64 に刷り込んでいる。
#     旧版 … 内容列いっぱい（232.0–331.33）に描くので「本」を越える
#     新版 … セル右端が 317.64 なので手前で折り返して止まる
#
# 使い方: python scripts/probe-deployed-bekki7.py [https://app.mamoruinfra.com]
import json
import sys
import urllib.request

import fitz

sys.stdout.reconfigure(encoding="utf-8")

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://app.mamoruinfra.com"
URL = f"{BASE}/api/generate-halogen-bekki7-pdf"
TEMPLATE = "public/PDF/s50_kokuji14_bekki7.pdf"
UNIT_X = 317.64          # 刷り込み「本」の左端（テンプレート実測）
CELL_X = 232.0           # 内容列の左端
ROW = 3

rows = [{"content": "", "judgment": "", "bad_content": "", "action_content": ""} for _ in range(37)]
rows[ROW] = {"content": "あいうえおかきくけこさしすせそたちつてとなにぬねの",
             "judgment": "良", "bad_content": "", "action_content": ""}
data = json.dumps({"form_name": "稼働確認", "page1_rows": rows}, ensure_ascii=False).encode("utf-8")

req = urllib.request.Request(URL, data=data, headers={"Content-Type": "application/json; charset=utf-8"})
with urllib.request.urlopen(req, timeout=180) as res:
    pdf = res.read()
print(f"HTTP {res.status} / {len(pdf):,} bytes")
open("tmp/_probe7.pdf", "wb").write(pdf)

doc = fitz.open("tmp/_probe7.pdf")
tmpl = fitz.open(TEMPLATE)
page, tp = doc[0], tmpl[0]
bodies = {tmpl.xref_stream(x) for x in tp.get_contents()}
keep = [x for x in page.get_contents() if doc.xref_stream(x) not in bodies]
if len(keep) > 1:
    doc.update_stream(keep[0], b"\n".join(doc.xref_stream(x) for x in keep))
page.set_contents(keep[0])

# 行3の帯を rowBounds から取らず、投入した文字で特定する（版に依存しない）
spans = [s for blk in page.get_text("dict")["blocks"] for ln in blk.get("lines", [])
         for s in ln.get("spans", []) if "あいうえお" in s["text"] or "かきくけこ" in s["text"]
         or (s["text"].strip() and CELL_X - 1 <= s["bbox"][0] < CELL_X + 110)]
band = [s for s in spans if "あ" in s["text"] or "さ" in s["text"] or "た" in s["text"] or "な" in s["text"]]
if not band:
    print("判定: 投入した文字が見つからない（識別できない）")
    sys.exit(2)
right = max(s["bbox"][2] for s in band)
print(f"\n  刷り込み「本」の左端: {UNIT_X:.2f}")
print(f"  アプリが描いた右端  : {right:.2f}   （差 {UNIT_X - right:+.2f}）")
for s in sorted(band, key=lambda s: s["bbox"][0]):
    print(f"    {s['text'][:20]!r}  x {s['bbox'][0]:7.2f} – {s['bbox'][2]:7.2f}")

print()
if right > UNIT_X:
    print("判定: 旧版が稼働中（刷り込み「本」を越えて描いている）")
    sys.exit(1)
print("判定: 新版が稼働中（「本」の手前で止まっている）")
print("PROBE_NEW_VERSION")
