"""インク層の検査: 文字が「実際に描かれているか」をラスタライズして確かめる。

■ なぜ必要か（2026-07-24 に踏んだ事故）
  数字化けの真因調査で embedFont(bytes, {subset:true}) を試したところ、
  抽出テキスト(ToUnicode)も幅(/W)も完全に正しいのに、**グリフ実体が欠落**して
  日本語がほぼ空白で描画された。既存の回帰テストは ToUnicode と /W という
  「メタデータの層」しか見ていなかったため、全項目 PASS のまま実物が壊れていた。
  ＝ 検査は「測れと言われた層」しか測らない。テキスト・幅・インクは別の層であり、
     インク層を見る検査が無いと、この種の事故は必ず通り抜ける。

■ 指標（文字数・フォントサイズに依存しない形にする）
  各サンプルの期待矩形（x, apiWidth, フォントサイズから算出）内で
      ink_column_ratio = インクを含むx列の本数 / 矩形の横幅(px)
  を測る。正常に描かれた行はグリフが横方向に分布するので高い値になり、
  グリフ欠落の行はインクが数本の帯にしか無いので極端に低くなる。
  絶対的なインク量（文字数やサイズで変わる）ではなく「横方向の分布」を見るのが要点。

■ 閾値のキャリブレーション（勘で決めない・2026-07-24 実測）
  正常PDF（subset:false＋pickFont）:
    ASCII型番10種   min 0.73 / median 0.82 / max 0.84
    日本語・混在14種 min 0.57 / median 0.80 / max 0.87
      （最小の 0.57 は「ＡＢＣ１２３」= 全角英数。字間が空くため列率が下がる）
  グリフ脱落PDF（subset:true で再現）:
    min 0.06 / median 0.16 / max 0.24
  → 正常の最小 0.57 と 脱落の最大 0.24 の間を取り、既定閾値を 0.40 とする
    （両側におよそ 0.17 の余裕。サンプルを増やしたら --report で再確認すること）

■ ★短い文字列は列率が使えない（実測で判明・誤検出すると検出器が信用を失って死ぬ）
  判定欄の「○ × － ／ ・」や1〜2桁の数値セルは、字送り幅に対してインクが細いため
  列率が下がる: ・=0.19 / 1=0.40 と、閾値 0.40 を割る or 境界に乗る＝誤検出。
  そこで文字数で規則を分ける:
    len<=2  … 絶対インク量で判定（正規化インク = ink画素 / (size*scale)^2）
              実測の最小は － の 0.030、・ 0.034、／ 0.037。グリフ欠落なら 0.000。
              → floor 0.010 とする（実グリフの1/3・欠落とは明確に分離）
    len>=3  … 列率で判定（長文で一部グリフだけ残るケースを取り逃さないため、
              絶対量ではなく分布で見る必要がある）

使い方:
  node scripts/digit-mangling-regression.mjs   # tmp/digit-regression.{pdf,json} を作る
  python scripts/check-ink-coverage.py [--threshold 0.30] [--report]
    --report を付けると閾値判定せず全行の実測値を出す（キャリブレーション用）
成功で INK_COVERAGE_PASSED を出力し exit 0。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import fitz
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DPI = 200
SCALE = DPI / 72.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", default=str(ROOT / "tmp" / "digit-regression.pdf"))
    ap.add_argument("--meta", default=str(ROOT / "tmp" / "digit-regression.json"))
    ap.add_argument("--threshold", type=float, default=0.40, help="長文(3文字以上)の列率しきい値")
    ap.add_argument("--ink-floor", type=float, default=0.010, help="短文(2文字以下)の正規化インクしきい値")
    ap.add_argument("--report", action="store_true", help="判定せず実測値のみ出す")
    args = ap.parse_args()

    pdf_path, meta_path = Path(args.pdf), Path(args.meta)
    if not pdf_path.exists() or not meta_path.exists():
        print("先に node scripts/digit-mangling-regression.mjs を実行すること")
        return 2

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    page = fitz.open(pdf_path)[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    dark = img.min(axis=2) < 128          # インク（暗いピクセル）

    size = meta["size"]
    page_h = meta["pageHeight"]
    x_left = meta["x"]

    hdr = f"{'text':<34} {'width':>7} {'ink列率':>8}"
    print(hdr + (f" {'ink_px':>8} {'ink正規':>8}" if args.report else "  判定"))
    print("-" * (66 + (18 if args.report else 0)))

    failures = []
    ratios = []
    for row in meta["rows"]:
        api_w = row.get("apiWidth") or row.get("pickApi") or 0.0
        if api_w <= 0:
            continue
        # ★空白のみの文字列は advance を持つのにインクが無いので、そのままだと必ず誤検出になる。
        #   本番経路では normalizeText が trim するため発生しないが、検出器側でも明示的に除外する
        #   （誤検出する検出器は使われなくなって死ぬ）。空文字は上の api_w<=0 で既に除外済み。
        if not row["text"].strip():
            continue
        # pdf-lib は下原点。ベースライン y から上下に余裕を取って矩形を作る
        top = page_h - (row["y"] + size * 0.95)
        bot = page_h - (row["y"] - size * 0.35)
        x0, x1 = x_left, x_left + api_w

        px0, px1 = int(x0 * SCALE), int(np.ceil(x1 * SCALE))
        py0, py1 = int(top * SCALE), int(np.ceil(bot * SCALE))
        px0, py0 = max(px0, 0), max(py0, 0)
        px1, py1 = min(px1, pix.width), min(py1, pix.height)
        if px1 <= px0 or py1 <= py0:
            continue

        region = dark[py0:py1, px0:px1]
        cols_with_ink = int((region.any(axis=0)).sum())
        ratio = cols_with_ink / region.shape[1]
        ink_px = int(region.sum())
        # サイズ非依存にするため「1pt四方あたりのインク画素数」に正規化する
        ink_norm = ink_px / ((size * SCALE) ** 2)
        ratios.append((row["text"], ratio))

        label = row["text"] if len(row["text"]) <= 32 else row["text"][:31] + "…"
        if args.report:
            print(f"{label:<34} {api_w:>7.1f} {ratio:>8.2f} {ink_px:>8} {ink_norm:>8.3f}")
        else:
            # ★短文字列は列率が構造的に低くなるので絶対インク量で判定する
            if len(row["text"]) <= 2:
                ok = ink_norm >= args.ink_floor
                detail = f"ink={ink_norm:.3f}(短文規則)"
            else:
                ok = ratio >= args.threshold
                detail = f"列率={ratio:.2f}"
            print(f"{label:<34} {api_w:>7.1f} {ratio:>8.2f}  {'OK' if ok else '★グリフ欠落の疑い ' + detail}")
            if not ok:
                failures.append((row["text"], detail))

    print("-" * 66)
    if ratios:
        vals = [r for _, r in ratios]
        print(f"ink列率: min={min(vals):.2f} median={sorted(vals)[len(vals)//2]:.2f} max={max(vals):.2f}")

    if args.report:
        return 0

    if failures:
        print("\nインク不足を検出:")
        for text, detail in failures:
            print(f"  - {text}: {detail}")
        print("\n→ テキスト抽出や幅が正しくても、グリフ実体が埋め込まれていない可能性がある。")
        print("  embedFont の subset 設定を疑うこと（subset:true は CJK グリフを脱落させる実績あり）。")
        return 1

    print(f"\nINK_COVERAGE_PASSED (threshold={args.threshold})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
