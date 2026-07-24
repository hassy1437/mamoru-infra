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
rows: list[tuple[str, str, str, str, int]] = []

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

    ok = has_latin and has_fonts and raw_leaks == 0
    rows.append((name, "OK" if has_latin else "NG", "OK" if has_fonts else "NG",
                 "OK" if raw_leaks == 0 else f"NG({raw_leaks})", raw_leaks))
    if not ok:
        failures.append(name)

print(f"{'route':<44} {'latin':>6} {'fonts':>6} {'no-raw-customFont':>20}")
print("-" * 80)
for name, a, b, c, _ in rows:
    print(f"{name:<44} {a:>6} {b:>6} {c:>20}")
print("-" * 80)
print(f"routes={len(rows)}  passed={len(rows) - len(failures)}  failed={len(failures)}")

if failures:
    print("\nNG:", ", ".join(failures))
    print("→ latinFont 埋め込み / fonts 定義 / 生 customFont の除去 のいずれかが未対応。")
    print("  生の customFont が残っていると、その経路だけ字形化けと幅誤判定が再発する。")
    sys.exit(1)

print(f"\nLATIN_FONT_COVERAGE_OK ({len(rows)}/{len(rows)})")
