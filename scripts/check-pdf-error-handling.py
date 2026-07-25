"""PDF生成の失敗を業者向けに伝える経路が、どこにも漏れていないかを検査する。

■ なぜ要るか（2026-07-25 に見つかった退行）
  ⑧で各様式ルートは 422 に「どの項目が何文字超過か」を載せるようにしたが、
  呼び出し側は `if (!response.ok) throw new Error("PDF generation failed")` のままで
  本文を捨てていた。様式フォームごとのPDF出力は業者の主経路なので、
  「PDF生成に失敗しました」としか出ず、業者は何も直せないまま止まっていた。
  ＝ サーバが正しく返しても、UIが捨てたら意味がない。

  同じことは1箇所直しても他が残れば再発するので、「残り0件」を数えられる形にする。

■ 検査すること
  1. /api/generate-*-pdf を叩くコンポーネントの `!ok` 分岐が
     すべて pdfRequestError() を通っている（生の throw / alert が残っていない）
  2. その失敗を受ける catch が pdfErrorText() を通っている
     （通さないと分類した文言が握り潰され、既定文言に戻る）
  3. 汎用文言（"PDF generation failed" 等）が実コードに残っていない

使い方: python scripts/check-pdf-error-handling.py
全て通れば PDF_ERROR_HANDLING_OK を出力して exit 0。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENTS = ROOT / "src" / "components"
HELPER = "pdf-request-error"

# 実コードに残っていてはいけない汎用文言（ヘルパー内の説明コメントは除く）
GENERIC = (
    'throw new Error("PDF generation failed")',
    'throw new Error("preview failed")',
    'throw new Error("Failed")',
    'alert("PDF生成に失敗しました")',
    'alert("PDF作成に失敗しました")',
)

OK_BRANCH = re.compile(r"if \(!(\w+)\.ok\)")
PDF_CATCH = re.compile(r"catch\s*\(([^)]*)\)\s*\{([\s\S]{0,300}?)(?=\n\s*\}\s*(?:finally|catch)|\n\s*\})")


def main() -> int:
    problems: list[str] = []
    rows: list[tuple[str, int, int, str]] = []

    # ★リテラルの "/api/generate-" だけで絞ってはいけない。16様式を担う
    #   bekki-result-form-base.tsx は apiPath を prop で受けるためリテラルを持たず、
    #   最初その1ファイルだけ検査対象から外れていた（＝最も影響の大きい経路が未検査）。
    targets = sorted(
        p
        for p in COMPONENTS.glob("*.tsx")
        if ("/api/generate-" in p.read_text(encoding="utf-8") or "apiPath" in p.read_text(encoding="utf-8"))
    )
    for f in targets:
        src = f.read_text(encoding="utf-8")
        branches = OK_BRANCH.findall(src)
        if not branches:
            continue  # 共通コンポーネントに委譲しているもの

        # 1. !ok 分岐が分類ヘルパーを通っているか
        raw_branch = len(branches) - src.count("throw await pdfRequestError(")
        if raw_branch > 0:
            problems.append(f"{f.name}: !ok 分岐 {raw_branch} 箇所が pdfRequestError を通っていない")

        # 2. PDF関連の catch が pdfErrorText を通っているか
        bad_catch = 0
        for m in PDF_CATCH.finditer(src):
            body = m.group(2)
            if not re.search(r'(setError|alert)\(\s*"[^"]*PDF', body):
                continue
            bad_catch += 1
        if bad_catch:
            problems.append(f"{f.name}: catch {bad_catch} 箇所が pdfErrorText を通っていない")

        if HELPER not in src:
            problems.append(f"{f.name}: {HELPER} を import していない")

        rows.append((f.name, len(branches), src.count("pdfErrorText("), "OK" if not (raw_branch or bad_catch) else "NG"))

    # 3. 汎用文言が実コードに残っていないか（ヘルパー自身の説明コメントは対象外）
    leaks: list[str] = []
    for f in list(COMPONENTS.glob("*.tsx")) + list((ROOT / "src" / "lib").glob("*.ts")):
        if HELPER in f.name:
            continue
        src = f.read_text(encoding="utf-8")
        for g in GENERIC:
            if g in src:
                leaks.append(f"{f.name}: {g}")

    print(f"{'component':<40} {'!ok':>4} {'catch':>6} {'判定':>5}")
    print("-" * 60)
    for name, b, c, v in rows:
        print(f"{name:<40} {b:>4} {c:>6} {v:>5}")
    print("-" * 60)
    print(f"fetch地点を持つコンポーネント {len(rows)} / 汎用文言の残存 {len(leaks)}")

    if leaks:
        problems += [f"汎用文言が残っている: {x}" for x in leaks]

    if problems:
        print("\nNG:")
        for p in problems:
            print(f"  - {p}")
        print("\n→ 422（業者が直せる）と 5xx/通信断（直せない）を必ず区別すること。")
        print("  区別せず1つの文言に戻すと、⑧で載せた情報が業者に届かなくなる。")
        return 1

    print("\nPDF_ERROR_HANDLING_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
