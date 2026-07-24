"""はみ出しの原因を「セル定義が違う」と「本当に長すぎる」に切り分ける。

■ なぜ要るか（2026-07-24 に②③で分かったこと）
  はみ出しを見ると反射的に「折り返す／縮小する」と考えたくなるが、②③で調べたら
  大半は "値セルの座標・幅がテンプレートと違う" だった（値がラベル欄に重なっていた、
  幅が隣のラベル欄まで含んでいた）。原因が違うのに下流の詰め方を設計すると、
  後でセルを直したときに全部やり直しになる。

■ 判定
  テンプレートの縦罫線から、テキスト開始位置 x0 を含むセル [L, R] を求め、
    over = x1 - R … セルの右端をどれだけ超えたか
    room = R - L  … 本来使えるセル幅
  を出す。さらに x0 - L が大きい（＝セルの左端から不自然に離れて描き始めている）場合は
  「別のセルから描き始めている」疑いとして印を付ける。

■ ★印字ラベルを見ないと切り分けられない
  セル内にテンプレートの印字（「氏名」「社名」など）があるとき、値をその右に置くのは正しい。
  逆に印字が無いのにセル左端から離れて描き始めていたら座標ミス。
  幾何だけで判定すると②で直した「ラベルの右に置く」正常ケースを誤って座標ミスと呼ぶので、
  セル内の非オーバーレイ文字（＝テンプレート印字）の右端も併せて出す。

  分類（使える幅 avail = R - max(L, 印字ラベル右端) - 余白）:
    CELL_SHIFTED : 印字ラベルが無いのに x0 がセル左端から 3pt 以上離れている＝座標が違う
    CELL_TOO_WIDE: 超過が avail の 15% 未満＝幅定義が広すぎる可能性
    TOO_LONG     : avail に対して明らかに長い＝折り返し/縮小の設計対象

使い方: python scripts/diagnose-overflow-cells.py <pdf...>
"""
from __future__ import annotations

import sys
from pathlib import Path

import fitz

OVERLAY_FONT_HINTS = ("NotoSansJP", "Helvetica", "Arial")
EDGE_TOL = 0.6
Y_OVERLAP_MIN = 0.5
MERGE_TOL = 1.2  # 二重罫線を1本に畳む


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


def cell_bounds(rules, x0: float, y0: float, y1: float):
    """テキストのy範囲を覆う縦罫線のうち、x0 を挟む左右の罫線を返す。"""
    sh = max(y1 - y0, 0.1)
    xs = sorted(
        {
            round(rx, 1)
            for rx, ry0, ry1 in rules
            if (min(y1, ry1) - max(y0, ry0)) / sh >= Y_OVERLAP_MIN
        }
    )
    merged: list[float] = []
    for x in xs:
        if not merged or x - merged[-1] > MERGE_TOL:
            merged.append(x)
    left = max((x for x in merged if x <= x0 + EDGE_TOL), default=None)
    right = min((x for x in merged if x > x0 + EDGE_TOL), default=None)
    return left, right


def printed_right_in_cell(page, left, right, y0, y1):
    """セル内にあるテンプレート印字の右端（無ければ None）。値はこの右に置くのが正しい。"""
    best = None
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if is_overlay(span.get("font", "")) or not span["text"].strip():
                    continue
                sx0, sy0, sx1, sy1 = span["bbox"]
                if sx0 < left - 0.5 or sx1 > right + 0.5:
                    continue
                if min(y1, sy1) - max(y0, sy0) <= 0:
                    continue
                best = sx1 if best is None else max(best, sx1)
    return best


def main() -> int:
    targets = sys.argv[1:]
    if not targets:
        print("使い方: python scripts/diagnose-overflow-cells.py <pdf...>")
        return 2

    print("-" * 120)
    counts: dict[str, int] = {}

    for pdf in targets:
        p = Path(pdf)
        if not p.exists():
            continue
        doc = fitz.open(p)
        for pno, page in enumerate(doc, start=1):
            rules = vertical_rules(page)
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        if not is_overlay(span.get("font", "")) or not span["text"].strip():
                            continue
                        x0, y0, x1, y1 = span["bbox"]
                        sh = max(y1 - y0, 0.1)
                        crossed = any(
                            x0 + EDGE_TOL < rx < x1 - EDGE_TOL
                            and (min(y1, ry1) - max(y0, ry0)) / sh >= Y_OVERLAP_MIN
                            for rx, ry0, ry1 in rules
                        )
                        if not crossed:
                            continue
                        left, right = cell_bounds(rules, x0, y0, y1)
                        printed = None
                        if left is None or right is None:
                            kind = "UNKNOWN"
                            avail = over = 0.0
                        else:
                            printed = printed_right_in_cell(page, left, right, y0, y1)
                            start = printed + 2.0 if printed is not None else left
                            avail = right - start
                            over = x1 - right
                            if printed is None and x0 - left > 3.0:
                                kind = "CELL_SHIFTED"
                            elif avail > 0 and over / avail < 0.15:
                                kind = "CELL_TOO_WIDE"
                            else:
                                kind = "TOO_LONG"
                        counts[kind] = counts.get(kind, 0) + 1
                        label = span["text"].strip()[:20]
                        pr = f"{printed:.0f}" if printed is not None else "-"
                        print(
                            f"{p.stem:<14} {pno:>2} {kind:<14} {label:<20} "
                            f"[{left if left else 0:6.1f},{right if right else 0:6.1f}] 印字右={pr:>5} "
                            f"使える幅={avail:5.1f} 描画[{x0:6.1f},{x1:6.1f}] 超過={over:5.1f}"
                        )
        doc.close()

    print("-" * 104)
    print("分類:", ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    print("  CELL_SHIFTED / CELL_TOO_WIDE … 座標・幅の定義ミス（②③と同じ原因。実測して直す）")
    print("  TOO_LONG                     … 本当に収まらない（折り返し・縮小の設計対象）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
