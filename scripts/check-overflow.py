"""枠内収容チェック: オーバーレイ描画のテキストが罫線を越えていないか。

原型は検証エージェントが tmp/ に作ったものだが、そのままだと ①フォント修正後に偽陰性になる:
  旧版は overlay を「フォント名に NotoSansJP を含むスパン」で判定していた。①以降 ASCII は
  Helvetica で描くため、まさに修正対象だった型式セルが検査対象から外れて "0件" に見えてしまう。
  ここでは overlay = テンプレート由来でないフォント（＝我々が埋め込んだ NotoSansJP / Helvetica）
  として判定する。

罫線はテンプレートのベクター描画から取る。

★スパンのbboxで判定してはいけない（2026-07-24 に踏んだ誤検出）
  隣り合うセルの文字が隙間なく並ぶと PyMuPDF は同一フォント・同一サイズなら
  1つのスパンに連結する。実測: bekki3 p5 で「…10日」(472.63で終端) と
  「試験機メーカー」(475.00から開始) が連結し、スパンbboxが罫線 474.1 を跨いで見えた。
  だが罫線をまたぐ文字は1つも無く、どちらの文字も正しい側にある＝はみ出しではない。
  そこで文字単位のbbox（rawdict）で「罫線の上に実際に載っている文字」があるかを見る。

  この判定で取りこぼす場合: 本当にはみ出しているが、文字の境界がたまたま罫線と
  一致しているケース。幾何だけでは隣接セルと区別できないため、ここは誤検出ゼロを優先し、
  抑制した件数を SUPPRESSED として必ず表示する（黙って落とさない）。

使い方: python scripts/check-overflow.py <pdf...>
  全PDFではみ出し0なら OVERFLOW_NONE を出力し exit 0、あれば一覧して exit 1。
"""
from __future__ import annotations

import sys
from pathlib import Path

import fitz

# 我々が pdf-lib で埋め込むフォント（テンプレートの MS-Mincho 等と区別する）
OVERLAY_FONT_HINTS = ("NotoSansJP", "Helvetica", "Arial")
EDGE_TOL = 0.6        # 罫線とスパン端の許容（アンチエイリアス・接触）
Y_OVERLAP_MIN = 0.5   # 罫線がスパンのy範囲をこの割合以上覆う場合のみ対象


def is_overlay(font_name: str) -> bool:
    return any(h in font_name for h in OVERLAY_FONT_HINTS)


def vertical_rules(page):
    rules = []
    for d in page.get_drawings():
        for item in d.get("items", []):
            if item[0] == "l":
                p1, p2 = item[1], item[2]
                if abs(p1.x - p2.x) < 0.8 and abs(p1.y - p2.y) > 2:
                    rules.append((p1.x, min(p1.y, p2.y), max(p1.y, p2.y)))
            elif item[0] == "re":
                r = item[1]
                if r.height > 2:
                    rules.append((r.x0, r.y0, r.y1))
                    rules.append((r.x1, r.y0, r.y1))
    return rules


CHAR_TOL = 0.3  # 文字が罫線に「載っている」と見なす最小のはみ量


def check(pdf_path: str) -> tuple[list[str], int]:
    doc = fitz.open(pdf_path)
    name = Path(pdf_path).stem
    hits: list[str] = []
    suppressed = 0
    for pno, page in enumerate(doc, start=1):
        rules = vertical_rules(page)
        for block in page.get_text("rawdict").get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if not is_overlay(span.get("font", "")):
                        continue
                    chars = [c for c in span.get("chars", []) if c["c"].strip()]
                    if not chars:
                        continue
                    # rawdict のスパンには "text" が無いので文字から復元する
                    text = "".join(c["c"] for c in span.get("chars", []))
                    x0, y0, x1, y1 = span["bbox"]
                    sh = max(y1 - y0, 0.1)
                    for (rx, ry0, ry1) in rules:
                        if rx <= x0 + EDGE_TOL or rx >= x1 - EDGE_TOL:
                            continue
                        if (min(y1, ry1) - max(y0, ry0)) / sh < Y_OVERLAP_MIN:
                            continue
                        # ★スパンbboxではなく「罫線の上に載っている文字」で判定する
                        on_rule = next(
                            (
                                c
                                for c in chars
                                if c["bbox"][0] + CHAR_TOL < rx < c["bbox"][2] - CHAR_TOL
                            ),
                            None,
                        )
                        if on_rule is None:
                            # 罫線は文字と文字の隙間にある＝隣接セルの連結。はみ出しではない
                            suppressed += 1
                            continue
                        hits.append(
                            f"  {name} p{pno} {span['size']:.1f}pt "
                            f"x=[{x0:.1f},{x1:.1f}] crosses_rule_x={rx:.1f} "
                            f"font={span['font']} text={text[:28]!r}"
                        )
                        break
    return hits, suppressed


def main() -> int:
    targets = sys.argv[1:]
    if not targets:
        print("使い方: python scripts/check-overflow.py <pdf...>  （対象PDFを必ず渡すこと）")
        return 2

    all_hits: list[str] = []
    total_suppressed = 0
    for pdf in targets:
        if not Path(pdf).exists():
            print(f"  MISSING {pdf}")
            return 2
        hits, suppressed = check(pdf)
        total_suppressed += suppressed
        print(f"{Path(pdf).stem}: {'OVERFLOW x%d' % len(hits) if hits else 'clean'}")
        all_hits.extend(hits)

    if total_suppressed:
        print(f"\n（隣接セルの連結として抑制: {total_suppressed} 件。罫線をまたぐ文字が無いもの）")

    if all_hits:
        print(f"\nはみ出し {len(all_hits)} 件:")
        for h in all_hits[:40]:
            print(h)
        if len(all_hits) > 40:
            print(f"  ... 他 {len(all_hits) - 40} 件")
        return 1

    print(f"\nOVERFLOW_NONE ({len(targets)} PDFs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
