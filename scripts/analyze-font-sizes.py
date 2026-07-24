"""生成PDFのオーバーレイ文字サイズ分布を出す（7pt下限の遵守状況を測る）。

枠内収容ルールでは縮小の下限は 7pt。それ未満は「C（要修正）」に該当する。
幅の安全係数（0.85/0.90）で使える幅を削っていると、不必要にフォントが小さくなるため、
係数の撤廃前後でこの分布を比べると効果が数値で見える。

★スパン数で数えてはいけない（2026-07-24 に踏んだ計測の罠）
  ①b のラン分割は「1文字列を英数字/日本語の区間ごとに分けて描く」ので、
  実際の文字サイズが変わらなくてもスパン数が増える。スパン基準だと
  <7pt が 5517→8264（74.9%→81.9%）と悪化したように見えるが、これは数え方の artifact。
  そこで**文字数で重み付けした割合**を主指標にする（分割しても総文字数は不変）。
  スパン基準の値も参考として残すが、ラン分割を挟む前後の比較には使わないこと。

使い方: python scripts/analyze-font-sizes.py <pdf...>
"""
from __future__ import annotations

import sys
from pathlib import Path

import fitz

OVERLAY_FONT_HINTS = ("NotoSansJP", "Helvetica", "Arial")


def is_overlay(font_name: str) -> bool:
    return any(h in font_name for h in OVERLAY_FONT_HINTS)


def main() -> int:
    targets = sys.argv[1:]
    if not targets:
        print("使い方: python scripts/analyze-font-sizes.py <pdf...>")
        return 2

    sizes: list[float] = []
    under7 = 0
    under5 = 0
    chars_total = 0
    chars_under7 = 0
    chars_under5 = 0
    for pdf in targets:
        if not Path(pdf).exists():
            continue
        doc = fitz.open(pdf)
        for page in doc:
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        if not is_overlay(span.get("font", "")):
                            continue
                        if not span["text"].strip():
                            continue
                        s = round(span["size"], 2)
                        sizes.append(s)
                        # 文字数重み: ラン分割で分かれても総文字数は変わらないため前後比較に使える
                        nc = len(span["text"].strip())
                        chars_total += nc
                        if s < 7.0:
                            under7 += 1
                            chars_under7 += nc
                        if s < 5.0:
                            under5 += 1
                            chars_under5 += nc

    if not sizes:
        print("overlay スパンが見つからない")
        return 1

    sizes.sort()
    n = len(sizes)
    print(f"overlay spans   : {n}")
    print(f"  min           : {sizes[0]:.2f}pt")
    print(f"  median        : {sizes[n // 2]:.2f}pt")
    print(f"  max           : {sizes[-1]:.2f}pt")
    print(f"  < 7pt (span)  : {under7}  ({under7 / n * 100:.1f}%)   ← 参考。分割で増減するので前後比較には使わない")
    print(f"  < 5pt (span)  : {under5}  ({under5 / n * 100:.1f}%)   ← 参考")
    print(f"chars           : {chars_total}")
    print(f"  < 7pt (char)  : {chars_under7}  ({chars_under7 / chars_total * 100:.1f}%)   ★主指標: ルール上の下限違反")
    print(f"  < 5pt (char)  : {chars_under5}  ({chars_under5 / chars_total * 100:.1f}%)   ★主指標")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
