"""切り詰め（末尾「...」）の内訳を出す。＝帳票から静かに消えた情報の一覧。

■ なぜ要るか
  枠に収まらない値は現状 "..." で切り捨てられる。法定の提出書類にとってこれは
  「レイアウトの都合で必須項目が欠落した」状態であり、はみ出しより悪い場合がある。
  はみ出しは目で見えるが、切り詰めは一見きれいに収まっているように見えるため気づけない。
  そこで「どの様式のどの項目が何文字落ちたか」を機械的に数えられる形にする。

■ 何と突き合わせるか
  PDFに描かれた文字列だけでは「何文字落ちたか」が分からないので、生成時の入力
  （tmp/**/<name>.payload.json）と突き合わせる。生成スクリプトが PDF と同じ場所に書き出す。

■ ラン分割への対応（★2度踏んだ落とし穴）
  ①b 以降、1つの値が英数字/日本語のランに分かれて複数スパンになる。
  連結する際に間違えやすい点が2つある:
   (1) 空白だけのスパンを捨てると、値が隙間で分断されて別セル扱いになる
   (2) ★スパンbboxの中心yで束ねてはいけない。日本語(NotoSansJP)とASCII(Helvetica)は
       上下の張り出しが違うため、同じ1行を描いても bbox 中心が 0.6pt ほどズレる。
       中心yで束ねると「別記3-2点検項目12」が「別記/点検項目」と「3-2/12」に割れ、
       実際には切り詰められていない行を「3文字しか出ていない」と誤報する（実測で発生）。
       文字のベースライン(origin.y)は同じ描画呼び出しなら完全に一致するのでそれで束ねる。

使い方: python scripts/check-truncation.py <pdf...>
  切り詰めが無ければ NO_TRUNCATION を出力し exit 0。あれば内訳を出して exit 1。
  --summary を付けると1件ずつの明細を省いて集計だけ出す。
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
import sys
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
    for block in page.get_text("rawdict").get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if not is_overlay(span.get("font", "")):
                    continue
                chars = span.get("chars", [])
                if not chars:
                    continue
                # ★空白だけのスパンを捨ててはいけない。①b のラン分割で "一番一号 サンプル" の
                #   空白が独立スパンになるため、捨てると隙間が空いて1つの値が別セル扱いになる。
                # ★束ねる基準は bbox 中心ではなくベースライン(origin.y)。フォントごとに
                #   bbox の張り出しが違うので、中心yだと同じ行が2つに割れる。
                baseline = round(chars[0]["origin"][1], 1)
                x0 = min(c["bbox"][0] for c in chars)
                x1 = max(c["bbox"][2] for c in chars)
                items.append((baseline, x0, x1, "".join(c["c"] for c in chars)))

    bands: dict[float, list[tuple[float, float, str]]] = {}
    for cy, x0, x1, text in items:
        key = next((k for k in bands if abs(k - cy) < 0.3), cy)
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


# ★幾何的に解けないと確認済みの切り詰め。(様式, 項目) で照合し、理由を必ず書く。
#   ★暗黙に無視しない。新しい切り詰めが増えたら落ちるし、
#     直った（もう起きない）のに載ったままでも落ちる（両方向）。
# ★2026-08-01: soukatu_test/building_address をここから外した。
#   総括表の drawInCell は自前の切り詰めを持ち、切り詰めても fonts.fit?.report を
#   一度も呼ばなかった（9本目の複製）。そのため PNG を読むこの検査だけが欠落を見ており、
#   ルートは 200 を返して業者には何も伝わっていなかった。
#   共有 truncateRunsToFitWidth に寄せた結果、同じ入力は 422 になる。
#   422 になると総括表が長文セットから丸ごと落ち、その様式の版面を一切測れなくなるため、
#   lib-long-text.mjs の住所の stressLimit を実測の容量 45字 に直した（旧値60は
#   「61字で切り詰め」という測れていなかった頃の見積もりに基づく）。
#   → 長文セットでは切り詰めが起きなくなったので既知一覧から外す。
#   ★「実務でありうる49〜65字の住所が総括表に入らない」ことは本番の所見として残る。
#     総括表は折り返しを1箇所も持たないので、422で止めるか略称かの二択（タスク17-2の調査対象）。
KNOWN_TRUNCATION = {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdfs", nargs="+")
    ap.add_argument("--expect-known", action="store_true",
                    help="既知の切り詰めが起きていなければ失敗する（長文セット用）")
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

    known_seen = set()
    unknown = []
    for r in rows:
        if (r[0], r[2]) in KNOWN_TRUNCATION:
            known_seen.add((r[0], r[2]))
        else:
            unknown.append(r)
    for k in KNOWN_TRUNCATION:
        # ★この検査は呼び出しごとに対象PDFが違う（stress/realistic）ので、
        #   そのPDFが対象に含まれているときだけ「出ていない」を問題にする。
        # ★--expect-known は長文セットの呼び出しにだけ付ける。現実値セットでは
        #   既知の切り詰めは起きない（値が短い）ので、そこで「出ていない」を問題にすると誤検出になる。
        if args.expect_known and k[0] in {p.stem for p in map(Path, args.pdfs)} and k not in known_seen:
            print(f"★NG: 既知の切り詰め {k} が起きていない（直ったなら KNOWN_TRUNCATION から消すこと）")
            return 1
    for k in sorted(known_seen):
        print(f"  既知の切り詰め {k[0]} / {k[1]}")
        print(f"      {KNOWN_TRUNCATION[k]}")
    rows = unknown

    if not rows:
        print(f"NO_TRUNCATION ({len(args.pdfs)} PDFs / 既知 {len(known_seen)} 件を除く)")
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
