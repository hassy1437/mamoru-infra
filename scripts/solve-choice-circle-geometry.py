# ★選択肢を囲む○の cx / cy / rx / ry を、テンプレートの実測から★探索で解く。
#
# ■ ★なぜ「モデルで解く」のをやめたか（2026-08-25）
#   最初は「楕円が語の外接長方形の角を含む」条件で解こうとした:
#       (語の半幅/rx)² + (語の半高/ry)² ≦ 1
#   ★対照を取ったら 59 定数中★28 件で予測と実測が食い違った。
#   ★すべて「予測=切る／実測=0px」＝ ★長方形モデルが過剰だった。
#   理由: ★日本語のグリフは外接長方形の角まで埋まっていない。
#     「専」「用」のような字は、角の領域にインクが無い。
#   ＝ ★真実はインクであって長方形ではない。
#
# ■ ★だから探索する
#   ★検査と★同じ測り方（インクの重なり）で、重なりが 0 になる値を探す。
#   ★モデルも係数も使わない。★この repo は補正係数で4回失敗している
#     （*0.90 / *0.85 / *0.98 / headerShiftY=-10。★4例とも症状隠しだった）。
#
# ■ ★守る条件（既存の検査と同じ）
#   1. ○は語を★横に包含する（cx-rx ≦ 語の左端 / 語の右端 ≦ cx+rx）
#   2. ○は★左右の隣の選択肢の語に触れない
#   3. ★刷り込みのインクとの重なりが 0（文字・罫線・図形のすべて）
#
# ■ ★変化は小さいほうを選ぶ
#   ★ベースラインの差分を小さく保つため、いまの値からの動きが
#   ★最小の候補を採る。★「見た目を良くする」ための調整はしない。
#
# ■ ★速い探索 → ★本物で検算
#   探索は解析的な楕円マスク（速い）。★見つけた解は必ず
#   ★PDF に描いて測り直す（check-choice-clearance と同じ関数）。
#   ★対照済み: 速いマスクと PDF は「0 か 0 でないか」が一致する。
#
# 使い方:
#   python scripts/solve-choice-circle-geometry.py            # 解を出すだけ
#   python scripts/solve-choice-circle-geometry.py --apply    # ルートに書き込む
from __future__ import annotations

import glob
import importlib.util
import io
import os
import re
import sys

import fitz
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify_numeric_rows_lib import template_of  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

_d = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("cc", os.path.join(_d, "check-choice-clearance.py"))
cc = importlib.util.module_from_spec(_s)
_s.loader.exec_module(cc)

S = cc.DRAW_SCALE
DEFAULT_BORDER = 0.7
# ★隣の語との間に必ず残す隙間。★0 にすると「触れていないが1画素も空いていない」
#   状態になり、ラスタライズの丸めで接触に転ぶ。
NEIGHBOR_GAP = 0.5
STEP = 0.25          # ★探索の刻み（pt）


def border_of(src: str) -> float:
    m = re.search(r"drawChoiceCircle\([^)]*?,\s*([\d.]+)\s*\)", src, re.S)
    return float(m.group(1)) if m else DEFAULT_BORDER


def fast_overlap(tpl_ink, cx, cy, rx, ry, b) -> int:
    """○の線のインクと、刷り込みのインクが重なる画素数（局所だけ見る）。"""
    ro_x, ro_y = rx + b / 2, ry + b / 2
    ri_x, ri_y = max(rx - b / 2, 1e-6), max(ry - b / 2, 1e-6)
    x0 = max(0, int((cx - ro_x) * S)); x1 = min(tpl_ink.shape[1], int(np.ceil((cx + ro_x) * S)) + 1)
    y0 = max(0, int((cy - ro_y) * S)); y1 = min(tpl_ink.shape[0], int(np.ceil((cy + ro_y) * S)) + 1)
    if x1 <= x0 or y1 <= y0:
        return 0
    sub = tpl_ink[y0:y1, x0:x1]
    ys, xs = np.mgrid[y0:y1, x0:x1]
    px = (xs + 0.5) / S; py = (ys + 0.5) / S
    outer = ((px - cx) / ro_x) ** 2 + ((py - cy) / ro_y) ** 2 <= 1.0
    inner = ((px - cx) / ri_x) ** 2 + ((py - cy) / ri_y) ** 2 < 1.0
    return int((outer & ~inner & sub).sum())


def glyph_y(page, word, cy, cx, rx):
    top = bot = None
    for blk in page.get_text("rawdict")["blocks"]:
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                for ch in sp.get("chars", []):
                    x0, y0, x1, y1 = ch["bbox"]
                    if not ch["c"].strip() or abs((y0 + y1) / 2 - cy) > cc.BAND:
                        continue
                    if not (cx - rx <= (x0 + x1) / 2 <= cx + rx):
                        continue
                    top = y0 if top is None else min(top, y0)
                    bot = y1 if bot is None else max(bot, y1)
    return (top, bot) if top is not None else None


def solve_one(ink, page, label, cx, cy, rx, ry, border, left_x, right_x):
    """重なり0の (cx, cy, rx, ry) を探す。見つからなければ None。

    ★探索の範囲
      cx … 語の左右の中心に寄せる（±1pt まで）
      cy … 語の上下の中心に寄せる（±1pt まで）
      rx … いまの値から、隣に触れない上限まで
      ry … 語を覆える下限から、上下の空きの上限まで
    """
    span = cc.printed_span(page, label, cy)
    ext = glyph_y(page, label, cy, cx, rx)
    if not span or not ext:
        return None, "★語が取れない（座標がずれている）"
    wx0, wx1 = span
    wy0, wy1 = ext

    # ★rx の上限＝隣の語まで（隙間を残す）
    rx_max_l = (cx - (left_x + NEIGHBOR_GAP)) if left_x is not None else 60.0
    rx_max_r = ((right_x - NEIGHBOR_GAP) - cx) if right_x is not None else 60.0
    # ★語より大きく広げすぎない。★隣が無い欄でも、語の外へ 6pt 以上出た○は
    #   「囲み」として不自然。★探索の量も現実的な範囲に収まる
    #   （上限を 60pt にしたら1定数あたり最悪6.5万回で、2時間かかる見積りだった）。
    rx_room = (wx1 - wx0) / 2 + 6.0
    rx_max = min(rx_max_l, rx_max_r, cx - wx0 + 6.0, wx1 - cx + 6.0, rx_room + 6.0)
    # ★rx の下限＝語を横に包含する
    rx_min = max(cx - wx0, wx1 - cx)
    if rx_min > rx_max:
        return None, (f"★決められない: 語を包含する rx={rx_min:.2f} が、"
                      f"隣までの上限 rx={rx_max:.2f} を超える")

    best = None
    cand_cx = sorted({round(cx, 2), round((wx0 + wx1) / 2, 2)})
    cand_cy = sorted({round(cy, 2), round((wy0 + wy1) / 2, 2)})
    n_rx = int((rx_max - rx_min) / STEP) + 1
    for ncx in cand_cx:
        for ncy in cand_cy:
            for i in range(n_rx):
                nrx = round(rx_min + i * STEP, 2)
                if nrx > rx_max:
                    break
                # ★rx を決めたら ry を下から広げ、★最初に重なり0になった値で打ち切る。
                #   ★それ以上広げても「動きが小さい」にはならない（上へ離れるだけ）。
                #   ★打ち切らないと1定数あたり約9.6万回になり、現実的な時間で終わらない
                #     （実際に踏んだ）。
                nry = round(max(1.0, (wy1 - wy0) / 2 - 2.0), 2)
                ry_cap = (wy1 - wy0) / 2 + 8.0   # ★語より縦に 8pt 以上大きい○は不自然
                while nry <= ry_cap:
                    if fast_overlap(ink, ncx, ncy, nrx, nry, border) == 0:
                        # ★速いマスクが0でも、★本物で描くと残ることがある
                        #   （実測: 51件中14件が 1〜12px 残った）。
                        #   ★解析的な楕円と、描画側の線の作り方・にじみが違うため。
                        #   ＝ ★採る前に本物で確かめる。★ここを省くと、
                        #     ★「直したのに検査が赤」で戻ってくる。
                        if cc.circle_overlap_px(page, ncx, ncy, nrx, nry, border) < cc.INK_LIMIT:
                            cost = (abs(nrx - rx) + abs(nry - ry)
                                    + abs(ncx - cx) + abs(ncy - cy))
                            if best is None or cost < best[0]:
                                best = (cost, ncx, ncy, nrx, nry)
                            break
                    nry = round(nry + STEP, 2)
    if best is None:
        return None, "★決められない: 重なり0になる組み合わせが見つからない"
    _, ncx, ncy, nrx, nry = best
    return (ncx, ncy, nrx, nry), (f"語 x{wx0:.1f}〜{wx1:.1f} y{wy0:.1f}〜{wy1:.1f}／"
                                  f"rx上限 {rx_max:.2f}")


def neighbours(page, marks, label, cy):
    """左右の隣の選択肢の語の、内側の端。"""
    spans = {}
    for lb, cx, cy2, rx, ry in marks:
        sp = cc.printed_span(page, lb, cy2)
        if sp and abs(cy2 - cy) < 0.01:
            spans[lb] = sp
    order = sorted(spans, key=lambda w: spans[w][0])
    if label not in order:
        return (None, None)
    k = order.index(label)
    return (spans[order[k - 1]][1] if k > 0 else None,
            spans[order[k + 1]][0] if k < len(order) - 1 else None)


def run():
    rows = []
    for route in sorted(glob.glob("src/app/api/*-pdf/route.ts")):
        src = io.open(route, encoding="utf-8").read()
        if "drawChoiceCircle(" not in src:
            continue
        name = os.path.basename(os.path.dirname(route)).replace("generate-", "").replace("-pdf", "")
        border = border_of(src)
        doc = fitz.open(template_of(route))
        for pno, marks in cc.call_constants(src):
            page = doc[pno - 1]
            ink = cc._ink(page)
            for label, cx, cy, rx, ry in marks:
                # ★いま重なっていない定数は★触らない。
                #   ★触るとベースラインの差分が増えるだけで、得るものが無い。
                #   ★本物で確かめる（速いマスクだけだと取りこぼす）。
                now = cc.circle_overlap_px(page, cx, cy, rx, ry, border)
                if now < cc.INK_LIMIT:
                    rows.append((route, name, pno, label, border, cx, cy, rx, ry,
                                 (cx, cy, rx, ry), "★いま0なので触らない", 0))
                    continue
                lx, rxn = neighbours(page, marks, label, cy)
                sol, why = solve_one(ink, page, label, cx, cy, rx, ry, border, lx, rxn)
                rows.append((route, name, pno, label, border, cx, cy, rx, ry, sol, why, now))
        doc.close()
    return rows


def apply_all(rows) -> int:
    """★定数ごとに、その1つだけを書き換える。★一括置換はしない。

    ★数字は「文字列」ではなく「値」で突き合わせる。
      ★ソースは cx: 258.0 / rx: 14 のように書き方が揃っていない。
      ★f"{258.0:g}" は "258" になるので、文字列で作った正規表現は当たらない
      （実際に踏んだ: 40件のうち16件が「0 件に当たる」で書けなかった）。
    """
    OBJ = re.compile(
        r'\{\s*label:\s*"([^"]+)"\s*,\s*cx:\s*(-?[\d.]+)\s*,\s*cy:\s*(-?[\d.]+)'
        r'\s*,\s*rx:\s*(-?[\d.]+)\s*,\s*ry:\s*(-?[\d.]+)\s*\}')
    changed = 0
    by_route = {}
    for r in rows:
        by_route.setdefault(r[0], []).append(r)
    for route, items in by_route.items():
        src = io.open(route, encoding="utf-8").read()
        want = {}
        for _, name, pno, label, _b, cx, cy, rx, ry, sol, _w, _n in items:
            if sol is None:
                continue
            ncx, ncy, nrx, nry = sol
            if (abs(ncx - cx) < 0.005 and abs(ncy - cy) < 0.005
                    and abs(nrx - rx) < 0.005 and abs(nry - ry) < 0.005):
                continue
            want.setdefault((label, round(cx, 2), round(cy, 2), round(rx, 2), round(ry, 2)),
                            []).append(sol)

        def sub(m):
            nonlocal changed
            key = (m.group(1), round(float(m.group(2)), 2), round(float(m.group(3)), 2),
                   round(float(m.group(4)), 2), round(float(m.group(5)), 2))
            if key not in want or not want[key]:
                return m.group(0)
            ncx, ncy, nrx, nry = want[key].pop(0)
            changed += 1
            return (f'{{ label: "{m.group(1)}", cx: {ncx:g}, cy: {ncy:g}, '
                    f'rx: {nrx:g}, ry: {nry:g} }}')

        src = OBJ.sub(sub, src)
        for key, left in want.items():
            if left:
                print(f"★書き換えられなかった: {os.path.basename(os.path.dirname(route))} {key}")
        io.open(route, "w", encoding="utf-8", newline="").write(src)
    return changed


def main() -> int:
    rows = run()
    print(f"{'様式':<24}{'p':>2} {'語':<7}{'いま':>6}{'cx':>8}{'cy':>8}{'rx':>7}{'ry':>7}"
          f" → {'cx':>8}{'cy':>8}{'rx':>7}{'ry':>7}")
    solved = same = undecidable = 0
    for _, name, pno, label, b, cx, cy, rx, ry, sol, why, now in rows:
        if sol is None:
            undecidable += 1
            print(f"{name:<24}{pno:>2} {label:<7}{now:>6}{cx:>8.2f}{cy:>8.2f}{rx:>7.2f}{ry:>7.2f}"
                  f"   ★{why}")
            continue
        ncx, ncy, nrx, nry = sol
        if (abs(ncx - cx) < 0.005 and abs(ncy - cy) < 0.005
                and abs(nrx - rx) < 0.005 and abs(nry - ry) < 0.005):
            same += 1
            continue
        solved += 1
        print(f"{name:<24}{pno:>2} {label:<7}{now:>6}{cx:>8.2f}{cy:>8.2f}{rx:>7.2f}{ry:>7.2f}"
              f" → {ncx:>8.2f}{ncy:>8.2f}{nrx:>7.2f}{nry:>7.2f}")
    print(f"\n定数 {len(rows)} 個 / ★変える {solved} / 変えない（すでに0） {same} / "
          f"★決められない {undecidable}")

    # ★本物の描画で検算（速いマスクを信用しきらない）
    print("\n── ★見つけた解を、PDF に描いて測り直す ──")
    ng = 0
    for route, name, pno, label, b, cx, cy, rx, ry, sol, _w, _n in rows:
        if sol is None:
            continue
        ncx, ncy, nrx, nry = sol
        doc = fitz.open(template_of(route))
        px = cc.circle_overlap_px(doc[pno - 1], ncx, ncy, nrx, nry, b)
        doc.close()
        if px >= cc.INK_LIMIT:
            ng += 1
            print(f"  ★PDF では残る: {name} p{pno}「{label}」 {px}px")
    print(f"  ★PDF で残る重なり: {ng} 件")

    if "--apply" in sys.argv:
        if ng:
            print("\n★検算が通らないので書き込まない。")
            return 1
        n = apply_all(rows)
        print(f"\n★{n} 個の定数を書き換えました。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
