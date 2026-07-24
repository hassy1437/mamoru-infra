"""実ルートPDFに「化けた英数字」が残っていないかを走査する（合成テストではなく本番出力を見る層）。

■ 何を見るか
  NotoSansJP の GSUB で英数字が置換されると、数字は CJK統合漢字拡張A（U+3400–U+4DBF）の
  グリフに落ちる（実測: 9 → U+40FA）。日本語の帳票本文に拡張Aが出ることはまず無いので、
  「拡張Aの出現＝化け」とみなせる。ToUnicode 経由の抽出テキストを走査するだけで検出できる。

■ なぜ合成の回帰テストと別に要るか
  回帰テストは「テストが用意した文字列」しか見ない。実データの型番・部屋名・日付などが
  どの経路を通っているかは、実ルートの出力を走査しないと分からない。
  ＝ 網羅の証明は「全様式を機械的に数える」側でしか得られない。

使い方: python scripts/check-mangled-glyphs.py <pdf...>
化けが0なら NO_MANGLED_GLYPHS を出力し exit 0。1件でもあれば該当を列挙して exit 1。
"""
from __future__ import annotations

import sys
from pathlib import Path

import fitz

# CJK統合漢字拡張A。帳票の日本語本文には出現しない領域＝化けの指紋。
EXT_A = range(0x3400, 0x4DC0)


def scan(pdf_path: str) -> list[tuple[int, str, str]]:
    hits: list[tuple[int, str, str]] = []
    doc = fitz.open(pdf_path)
    for pno, page in enumerate(doc, start=1):
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "")
                    if any(ord(ch) in EXT_A for ch in text):
                        hits.append((pno, span.get("font", "?"), text))
    doc.close()
    return hits


def main() -> int:
    targets = sys.argv[1:]
    if not targets:
        print("使い方: python scripts/check-mangled-glyphs.py <pdf...>")
        return 2

    total = 0
    for pdf in targets:
        if not Path(pdf).exists():
            print(f"{pdf}: 見つからない")
            return 2
        hits = scan(pdf)
        total += len(hits)
        if hits:
            print(f"{Path(pdf).stem}: MANGLED x{len(hits)}")
            for pno, font, text in hits[:5]:
                print(f"    p{pno} font={font} text={text!r}")

    print(f"\n走査 {len(targets)} ファイル / 化け {total} 件")
    if total:
        print("→ 英数字が NotoSansJP 側に流れている。ラン分割(splitFontRuns)を経ない描画経路を疑うこと。")
        return 1
    print("NO_MANGLED_GLYPHS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
