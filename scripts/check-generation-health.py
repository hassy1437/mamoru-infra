# 生成そのものの健全性を見る（画素比較ではないので CI に載る）。
#
# ■ なぜベースライン照合と別に要るか
#   ベースライン照合は「前回と同じ絵か」を画素で見る検査で、差分が出たら
#   **人が目で見て承認する**。CI に載せると赤いまま放置されるか無条件更新される。
#   一方こちらは「生成が成功し、想定どおりの構造になっているか」を見るだけで、
#   人の承認を必要としない。＝ CI に載る性質のもの。
#
#   ★今日、報告書が26ルート中1件だけテストセットに存在せず、はみ出しだけでなく
#     全検査が見ていなかった。生成そのものの健全性を機械で見る価値は実証済み。
#
# ■ ★期待値は導出する（固定値を置かない）
#   ページ数は正当な変更でも動く。固定の 132 を置くと、次に変わったとき
#   「壊れたのか正しく変わったのか」が判断できない。
#   生成PDFのページ数は**テンプレートのページ数と等しい**はずなので、
#   テンプレートから導く。ずれたら「テンプレートと違う」と具体的に言える。
#
# 検査すること:
#   1. PDFを返すルートが全部テストセットに入っている（26ルート＝26PDF/セット）
#   2. 各PDFのページ数がテンプレートと一致する
#   3. 各PDFが %PDF- で始まり、空でない
#
# 使い方: python scripts/check-generation-health.py
import glob
import io
import json
import os
import re
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")

SETS = {
    "stress": ["tmp/pdf-test-bekki234", "tmp/pdf-test-bekki5678", "tmp/pdf-test-bekki9to12",
               "tmp/pdf-test-bekki13to22", "tmp/pdf-test-extra"],
    "realistic": ["tmp/pdf-realistic"],
}

problems = []


def template_of_route(route_path):
    src = io.open(route_path, encoding="utf-8").read()
    m = re.search(r'"([\w.-]+\.pdf)"', src)
    if not m:
        return None
    p = os.path.join("public", "PDF", m.group(1))
    return p if os.path.exists(p) else None


# ルート -> テンプレートのページ数
# ★"generate-*-pdf" のグロブだと generate-pdf（報告書）が一致しない。
#   今日「26ルート中1件だけ測定対象に存在しなかった」のと同じ取りこぼしを
#   検査自身がやっていた。lib-pdf-sources.mjs と同じ判定（ディレクトリ名が
#   generate- で始まり pdf で終わる）に揃える。
routes = sorted(
    r for r in glob.glob("src/app/api/*/route.ts")
    if re.fullmatch(r"generate-[\w-]*pdf", os.path.basename(os.path.dirname(r)))
)
if not routes:
    print("★PDFルートが1件も見つからない（構成が変わった可能性）")
    sys.exit(1)
expect = {}
for r in routes:
    tpl = template_of_route(r)
    if not tpl:
        problems.append(f"{os.path.basename(os.path.dirname(r))}: テンプレートPDFを特定できない")
        continue
    doc = fitz.open(tpl)
    expect[os.path.basename(os.path.dirname(r))] = (os.path.basename(tpl), doc.page_count)
    doc.close()

print(f"PDFルート {len(routes)} 件 / テンプレートから導いた期待ページ数の合計 "
      f"{sum(n for _, n in expect.values())}")

# 生成物 -> ルート（job.json から引く）
job_of = {}
for j in glob.glob("tmp/**/*.job.json", recursive=True):
    rp = json.load(io.open(j, encoding="utf-8")).get("routePath", "")
    if rp:
        job_of[os.path.basename(j).replace(".job.json", "")] = os.path.basename(os.path.dirname(rp))

for set_name, dirs in SETS.items():
    seen_routes = set()
    total = 0
    for d in dirs:
        for p in sorted(glob.glob(os.path.join(d, "*.pdf"))):
            base = os.path.basename(p)
            if "debug" in base:
                continue
            name = base.replace(".pdf", "")
            route = job_of.get(name)
            if not route:
                problems.append(f"{set_name}/{base}: 対応する job.json が無い（どのルートの生成物か不明）")
                continue
            seen_routes.add(route)
            with open(p, "rb") as fh:
                head = fh.read(5)
            if head != b"%PDF-":
                problems.append(f"{set_name}/{base}: PDFヘッダが無い")
                continue
            doc = fitz.open(p)
            n = doc.page_count
            doc.close()
            total += n
            tplname, want = expect.get(route, (None, None))
            if want is None:
                problems.append(f"{set_name}/{base}: 期待ページ数が求められない")
            elif n != want:
                problems.append(
                    f"{set_name}/{base}: {n} ページ（テンプレート {tplname} は {want} ページ）")
    missing = sorted(set(expect) - seen_routes)
    print(f"  {set_name}: {len(seen_routes)} ルート / 合計 {total} ページ")
    for m in missing:
        problems.append(f"{set_name}: {m} の生成物が無い（テストセットに入っていない）")

print()
if problems:
    print(f"★NG: {len(problems)} 件")
    for p in problems[:20]:
        print("   ", p)
    sys.exit(1)
print("GENERATION_HEALTH_OK")
