"""切り詰め（末尾「...」）の内訳を出す。＝帳票から静かに消えた情報の一覧。

■ なぜ要るか
  枠に収まらない値は現状 "..." で切り捨てられる。法定の提出書類にとってこれは
  「レイアウトの都合で必須項目が欠落した」状態であり、はみ出しより悪い場合がある。
  はみ出しは目で見えるが、切り詰めは一見きれいに収まっているように見えるため気づけない。
  そこで「どの様式のどの項目が何文字落ちたか」を機械的に数えられる形にする。

■ 何と突き合わせるか
  PDFに描かれた文字列だけでは「何文字落ちたか」が分からないので、生成時の入力
  （tmp/**/<name>.payload.json）と突き合わせる。生成スクリプトが PDF と同じ場所に書き出す。

■ ラン分割への対応
  ①b 以降、1つの値が英数字/日本語のランに分かれて複数スパンになる。
  同一行（yがほぼ同じ）のスパンをx順に連結してから「...」を探す。

使い方: python scripts/check-truncation.py <pdf...>
  切り詰めが無ければ NO_TRUNCATION を出力し exit 0。あれば内訳を出して exit 1。
  --summary を付けると1件ずつの明細を省いて集計だけ出す。
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import fitz

OVERLAY_FONT_HINTS = ("NotoSansJP", "Helvetica", "Arial")
ELLIPSIS = "..."


def is_overlay(font_name: str) -> bool:
    return any(h in font_name for h in OVERLAY_FONT_HINTS)


def normalize(value: str) -> str:
    """ルート側 normalizeText と同じ正規化（空白畳み＋trim）。"""
    return re.sub(r"\s+", " ", value).strip()


def payload_strings(node, path: str = "") -> list[tuple[str, str]]:
    """payload から (項目パス, 文字列) を再帰的に集める。"""
    out: list[tuple[str, str]] = []
    if isinstance(node, dict):
        for k, v in node.items():
            out.extend(payload_strings(v, f"{path}.{k}" if path else k))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out.extend(payload_strings(v, f"{path}[{i}]"))
    elif isinstance(node, str):
        s = normalize(node)
        if s:
            out.append((path, s))
    return out


GAP_TOL = 2.0  # これ以上離れていたら別セルとみなす


def drawn_lines(page) -> list[tuple[float, str]]:
    """1つのセルに描かれた文字列を復元する。

    ①b のラン分割で1つの値が複数スパンに割れるため隣接スパンは連結するが、
    同じ行に並ぶ別セルまで繋げてはいけない（繋げると入力値と対応付けできなくなる）。
    そこで x の隙間が GAP_TOL を超えたら別セルとして切る。
    """
    items: list[tuple[float, float, float, str]] = []
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if not is_overlay(span.get("font", "")):
                    continue
                # ★空白だけのスパンを捨ててはいけない。①b のラン分割で "一番一号 サンプル" の
                #   空白が独立スパンになるため、捨てると隙間が空いて1つの値が別セル扱いになる。
                x0, y0, x1, y1 = span["bbox"]
                items.append((round((y0 + y1) / 2, 1), x0, x1, span["text"]))

    bands: dict[float, list[tuple[float, float, str]]] = {}
    for cy, x0, x1, text in items:
        key = next((k for k in bands if abs(k - cy) < 0.6), cy)
        bands.setdefault(key, []).append((x0, x1, text))

    out: list[tuple[float, str]] = []
    for cy, parts in bands.items():
        parts.sort()
        cur, cur_end = "", None
        for x0, x1, text in parts:
            if cur_end is not None and x0 - cur_end > GAP_TOL:
                out.append((cy, cur))
                cur = ""
            cur += text
            cur_end = x1
        if cur:
            out.append((cy, cur))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdfs", nargs="+")
    ap.add_argument("--summary", action="store_true")
    args = ap.parse_args()

    rows: list[tuple[str, int, str, int, int, str]] = []
    unmatched = 0

    for pdf in args.pdfs:
        p = Path(pdf)
        if not p.exists():
            print(f"  MISSING {pdf}")
            return 2
        payload_path = p.with_suffix(".payload.json")
        values = (
            payload_strings(json.loads(payload_path.read_text(encoding="utf-8")))
            if payload_path.exists()
            else []
        )

        doc = fitz.open(p)
        for pno, page in enumerate(doc, start=1):
            for _, text in drawn_lines(page):
                if not text.rstrip().endswith(ELLIPSIS):
                    continue
                shown = normalize(text)[: -len(ELLIPSIS)].strip()
                if not shown:
                    continue
                # 入力値のうち、描かれた頭の部分から始まるものを探す
                cands = [(k, v) for k, v in values if v.startswith(shown) and len(v) > len(shown)]
                if not cands:
                    unmatched += 1
                    rows.append((p.stem, pno, "(入力と対応付け不可)", len(shown), -1, shown[:24]))
                    continue
                key, full = min(cands, key=lambda kv: len(kv[1]))
                rows.append((p.stem, pno, key, len(shown), len(full) - len(shown), full[len(shown):]))
        doc.close()

    if not rows:
        print(f"NO_TRUNCATION ({len(args.pdfs)} PDFs)")
        return 0

    if not args.summary:
        print(f"{'様式':<16} {'p':>2} {'項目':<28} {'表示':>4} {'欠落':>4}  落ちた末尾")
        print("-" * 100)
        for form, pno, key, shown, lost, tail in sorted(rows):
            lost_s = "?" if lost < 0 else str(lost)
            print(f"{form:<16} {pno:>2} {key:<28} {shown:>4} {lost_s:>4}  {tail[:30]!r}")
        print("-" * 100)

    known = [r for r in rows if r[4] >= 0]
    total_lost = sum(r[4] for r in known)
    by_form: dict[str, int] = {}
    by_field: dict[str, int] = {}
    for form, _, key, _, lost, _ in known:
        by_form[form] = by_form.get(form, 0) + lost
        by_field[key.split("[")[0]] = by_field.get(key.split("[")[0], 0) + lost

    print(f"\n切り詰め {len(rows)} 件 / 欠落文字 {total_lost} 字（対応付け不可 {unmatched} 件）")
    print("  様式別（欠落文字数）:", ", ".join(f"{k}={v}" for k, v in sorted(by_form.items(), key=lambda kv: -kv[1])[:8]))
    print("  項目別（欠落文字数）:", ", ".join(f"{k}={v}" for k, v in sorted(by_field.items(), key=lambda kv: -kv[1])[:8]))
    print("\n→ 切り詰めは「収まっているように見える情報欠落」。⑧（7pt下限＋収まらなければエラー）で解消する。")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
