# 稼働中の全PDFルートが 200 を返すことを確かめる（デプロイ後のスモーク）。
#
# ■ なぜ要るか
#   引数順序の統一のように「出力が変わらない」変更は、挙動で新旧を判別できない。
#   その代わり **22ルートのシグネチャを触っている**ので、壊れていれば 500 になる。
#   ＝ 判別子が作れないときは、壊れていないことの確認までは必ずやる。
#
# 使い方: python scripts/smoke-deployed-routes.py [https://app.mamoruinfra.com]
import glob
import json
import os
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://app.mamoruinfra.com"

# 最小の payload。行を1つ入れて行ループを必ず通す
PAYLOAD = {
    "form_name": "スモーク",
    "building_name": "スモーク",
    "page1_rows": [{"content": "外形", "judgment": "良", "bad_content": "", "action_content": ""}] * 3,
    "page2_rows": [{"content": "外形", "judgment": "良", "bad_content": "", "action_content": ""}] * 3,
    "page3_rows": [{"content": "外形", "judgment": "良", "bad_content": "", "action_content": ""}] * 3,
    "page4_rows": [{"content": "外形", "judgment": "良", "bad_content": "", "action_content": ""}] * 3,
    "page5_rows": [{"content": "外形", "judgment": "良", "bad_content": "", "action_content": ""}] * 3,
    "equipment_results": [],
    "equipment_types": [],
}

routes = sorted(os.path.basename(os.path.dirname(p)) for p in glob.glob("src/app/api/*-pdf/route.ts"))
data = json.dumps(PAYLOAD, ensure_ascii=False).encode("utf-8")

ng = []
for r in routes:
    url = f"{BASE}/api/{r}"
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            body = res.read()
        status, size = res.status, len(body)
        head = body[:5] == b"%PDF-"
    except urllib.error.HTTPError as e:
        body = e.read()
        status, size, head = e.code, len(body), False
        # 422（枠に収まらない）は実装が意図して返すもの。壊れているわけではない
        if status == 422:
            print(f"  {r:<48} {status} FIT_FAILED（実装どおり）")
            continue
    except Exception as e:  # noqa: BLE001
        print(f"  {r:<48} ★{type(e).__name__}: {e}")
        ng.append(r)
        continue
    mark = "OK" if (status == 200 and head and size > 10000) else "★"
    print(f"  {r:<48} {status} {size:>10,} bytes {'PDF' if head else '非PDF'} {mark}")
    if mark == "★":
        ng.append(r)

print(f"\n{len(routes)} ルート / 異常 {len(ng)} 件")
if ng:
    print("  ★", ", ".join(ng))
    sys.exit(1)
print("SMOKE_OK")
