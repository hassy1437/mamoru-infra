# 生成PDFを 150dpi で描画し、ページごとのハッシュを出す。
#
# ■ なぜ PDF のバイトではなく描画結果を比べるか（実測 2026-07-30）
#   pdf-lib は保存のたびに文書IDを変えるため、**同じ端末で2回生成しても
#   バイトは一致しない**（4/4 件とも不一致）。一方、描画結果は一致する
#   （バイトの違うPDFを登録済みPNGと照合して 132ページすべて差分0）。
#   ＝ 環境間の同一性を測るなら描画結果で比べる。バイトで比べると
#   「毎回違う」しか分からない。
#
# ■ 何に使うか
#   ベースライン照合を CI に載せられるか（Linux と Windows で
#   フォント描画が同じピクセルになるか）を判定する材料。
#   ★同じスクリプトを両側で走らせる。別々に書くと、差が環境差なのか
#     実装差なのか分からなくなる。
#
# 解像度は baseline.py と同じ 150dpi（スケールは 150/72 を丸めずに渡す）。
#
# 使い方: python scripts/print-render-hashes.py
import glob
import hashlib
import os
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")

DIRS = ["tmp/pdf-test-bekki234", "tmp/pdf-test-bekki5678", "tmp/pdf-test-bekki9to12",
        "tmp/pdf-test-bekki13to22", "tmp/pdf-test-extra", "tmp/pdf-realistic"]
SCALE = 150 / 72

rows = []
for d in DIRS:
    for p in sorted(glob.glob(os.path.join(d, "*.pdf"))):
        if "debug" in os.path.basename(p):
            continue
        doc = fitz.open(p)
        for i in range(doc.page_count):
            pix = doc[i].get_pixmap(matrix=fitz.Matrix(SCALE, SCALE))
            rows.append((f"{os.path.basename(os.path.dirname(p))}/{os.path.basename(p)}-p{i+1}",
                         hashlib.sha256(pix.samples).hexdigest()[:16]))
        doc.close()

print(f"RENDER_HASHES {len(rows)}")
for name, h in rows:
    print(f"{h}  {name}")
print(f"SUMMARY {hashlib.sha256(''.join(h for _, h in rows).encode()).hexdigest()[:16]}")
