"""①フォント修正の網羅性チェック（invariants.sql と同じ思想の「壊されていないこと」検査）。

なぜ必要か:
  bekki2 は drawInCellWithFont という「フォントを受け取れる関数」を定義していながら、
  全呼び出しで customFont を渡していた。＝関数の存在は対策の証明にならない。
  そこで「英数字を描きうる経路が latin フォントを選べる状態か」を数えられる形にする。

判定（全ルートについて）:
  1. latinFont を埋め込んでいる（StandardFonts.Helvetica）
  2. fonts: ReportFonts を定義している
  3. 生の customFont が「埋め込み行」「fonts定義行」「型注釈(typeof customFont)」以外に残っていない
     ＝ 描画・計測が必ず pickFont / fonts 経由になっている
  4. ★単一フォントでの計測が残っていない（*.widthOfTextAtSize を直接呼ばない）
  5. ★単一フォントでの描画が残っていない（*.drawText を直接呼ばない）

4・5 がなぜ要るか（①b の網羅性）:
  ① で「文字列ごとにフォントを選ぶ」ようにしても、日本語と英数字が混じった1文字列は
  必ず jp 側に落ち、その中の英数字が化ける（例: "27-P2 点検項目"）。
  ①b は文字列を英数字/日本語の区間（ラン）に割って区間ごとに測る・描くことで直したが、
  ルート内にローカルの描画ヘルパーが17個あり、そこは単一フォントのままだった。
  ＝ 共有ヘルパーを直しただけでは網羅されない。ルート側に生の widthOfTextAtSize /
     drawText が1つでも残っていれば、その経路だけ静かに再発する。
  measureRuns / drawTextRuns 以外の入口を機械的に禁止するのがこの2項目。

使い方: python scripts/check-latin-font-coverage.py
全ルート合格なら LATIN_FONT_COVERAGE_OK を出力して exit 0、欠落があれば一覧して exit 1。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "src" / "app" / "api"

routes = sorted(
    p / "route.ts"
    for p in API.iterdir()
    if p.is_dir() and p.name.startswith("generate-") and p.name.endswith("-pdf")
)

# customFont の「正当な」残存パターン（埋め込み・fontsへの格納・型注釈）
ALLOWED = (
    re.compile(r"const\s+customFont\s*="),
    re.compile(r"jp:\s*customFont"),
    re.compile(r"typeof\s+customFont"),
)

failures: list[str] = []
rows: list[tuple[str, str, str, str, str]] = []

for route in routes:
    if not route.exists():
        continue
    name = route.parent.name.replace("generate-", "").replace("-pdf", "")
    src = route.read_text(encoding="utf-8")

    # PDF を作らないルート（customFont を使わない）は対象外
    if "customFont" not in src and "embedFont" not in src:
        continue

    has_latin = "StandardFonts.Helvetica" in src
    has_fonts = re.search(r"const\s+fonts\s*:\s*ReportFonts", src) is not None

    raw_leaks = 0
    for line in src.splitlines():
        if "customFont" not in line:
            continue
        if any(p.search(line) for p in ALLOWED):
            continue
        raw_leaks += 1

    # ①b: ラン分割を経ない入口（単一フォントでの計測・描画）が残っていないか
    single_measure = len(re.findall(r"\.widthOfTextAtSize\(", src))
    single_draw = len(re.findall(r"(?<!drawText)(?<!Runs)\.drawText\(", src))
    single = single_measure + single_draw

    ok = has_latin and has_fonts and raw_leaks == 0 and single == 0
    rows.append((name, "OK" if has_latin else "NG", "OK" if has_fonts else "NG",
                 "OK" if raw_leaks == 0 else f"NG({raw_leaks})",
                 "OK" if single == 0 else f"NG(計測{single_measure}/描画{single_draw})"))
    if not ok:
        failures.append(name)

print(f"{'route':<40} {'latin':>6} {'fonts':>6} {'no-raw-custom':>14} {'run-aware only':>22}")
print("-" * 92)
for name, a, b, c, d in rows:
    print(f"{name:<40} {a:>6} {b:>6} {c:>14} {d:>22}")
print("-" * 92)
print(f"routes={len(rows)}  passed={len(rows) - len(failures)}  failed={len(failures)}")

if failures:
    print("\nNG:", ", ".join(failures))
    print("→ latinFont 埋め込み / fonts 定義 / 生 customFont の除去 /")
    print("  単一フォントでの計測・描画の除去（measureRuns・drawTextRuns 経由）のいずれかが未対応。")
    print("  1つでも残っていると、その経路だけ字形化けと幅誤判定が静かに再発する。")
    sys.exit(1)

print(f"\nLATIN_FONT_COVERAGE_OK ({len(rows)}/{len(rows)})")
