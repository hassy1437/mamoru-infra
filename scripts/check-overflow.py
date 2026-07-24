"""枠内収容チェック: オーバーレイ描画のテキストが罫線を越えていないか。

原型は検証エージェントが tmp/ に作ったものだが、そのままだと ①フォント修正後に偽陰性になる:
  旧版は overlay を「フォント名に NotoSansJP を含むスパン」で判定していた。①以降 ASCII は
  Helvetica で描くため、まさに修正対象だった型式セルが検査対象から外れて "0件" に見えてしまう。
  ここでは overlay = テンプレート由来でないフォント（＝我々が埋め込んだ NotoSansJP / Helvetica）
  として判定する。

罫線はテンプレートのベクター描画から取り、スパンが縦罫を跨いだら「はみ出し」とみなす。

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


def check(pdf_path: str) -> list[str]:
    doc = fitz.open(pdf_path)
    name = Path(pdf_path).stem
    hits = []
    for pno, page in enumerate(doc, start=1):
        rules = vertical_rules(page)
        for block in page.get_text("dict").get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if not is_overlay(span.get("font", "")):
                        continue
                    if not span["text"].strip():
                        continue
                    x0, y0, x1, y1 = span["bbox"]
                    sh = max(y1 - y0, 0.1)
                    for (rx, ry0, ry1) in rules:
                        if rx <= x0 + EDGE_TOL or rx >= x1 - EDGE_TOL:
                            continue
                        if (min(y1, ry1) - max(y0, ry0)) / sh >= Y_OVERLAP_MIN:
                            hits.append(
                                f"  {name} p{pno} {span['size']:.1f}pt "
                                f"x=[{x0:.1f},{x1:.1f}] crosses_rule_x={rx:.1f} "
                                f"font={span['font']} text={span['text'][:28]!r}"
                            )
                            break
    return hits


def main() -> int:
    targets = sys.argv[1:]
    if not targets:
        print("使い方: python scripts/check-overflow.py <pdf...>  （対象PDFを必ず渡すこと）")
        return 2

    all_hits: list[str] = []
    for pdf in targets:
        if not Path(pdf).exists():
            print(f"  MISSING {pdf}")
            return 2
        hits = check(pdf)
        print(f"{Path(pdf).stem}: {'OVERFLOW x%d' % len(hits) if hits else 'clean'}")
        all_hits.extend(hits)

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
