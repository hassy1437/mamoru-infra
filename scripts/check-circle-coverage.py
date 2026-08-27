# ★描かれた○を「全部」拾い、★静的検査が届いていない範囲を明るみに出す。
#
# ■ ★なぜ要るか — 同じ穴が4回開いた（2026-08-25）
#   穴1 … テンプレートの罫線・図形を見ていなかった
#   穴2 … アプリの図形（○）を数える枠が無かった
#   穴3 … 記号だけのスパンを判定から外していた
#   穴4 … ★静的検査が drawChoiceCircle の定数しか見ておらず、
#          ★直接 drawEllipse を呼ぶ○を1つも見ていなかった
#   ＝ ★どれも「列挙し忘れた種類が穴になる」。★列挙をやめる形が要る。
#
# ■ ★列挙をやめられるのは「描画の結果」を見る側だけ
#   ★静的検査（check-choice-clearance）は★原理的に列挙から逃げられない。
#     理由: ★直接 drawEllipse を呼ぶ箇所は★値を実行時に計算している。
#       例（generate-soukatu-pdf）:
#           const radiusX = isGood ? 9 : 13
#           const centerY = pageHeight - (rowTop + (rowBottom - rowTop) / 2)
#       ＝ ★ソースからは座標が決まらない。★入力データで変わる。
#   ★描画の結果（生成PDF）を見る側は、★アプリ層の図形をそのまま拾えるので
#     「○として描かれたものを全部」で済む（check-printed-overlap が既にその形）。
#
# ■ ★だからこの検査は「食い違い」を見る
#   ★生成PDFに現れた○のうち、★静的検査が知っている位置に無いものを挙げる。
#   ＝ ★静的検査の守りが届いていない○が、どれだけあるかが分かる。
#   ★件数を固定する。★増えたら落ちる。
#
#   ★あわせて★描画の入口の数も固定する。★drawEllipse を呼ぶ箇所が増えたら落ちる。
#   ★「入口が増えたのに検査を足し忘れた」を、そこで止める。
#
# 使い方: python scripts/check-circle-coverage.py
from __future__ import annotations

import glob
import importlib.util
import io
import os
import re
import sys
from pathlib import Path

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")

_d = os.path.dirname(os.path.abspath(__file__))
_c = importlib.util.spec_from_file_location("cc", os.path.join(_d, "check-choice-clearance.py"))
cc = importlib.util.module_from_spec(_c)
_c.loader.exec_module(cc)
_p = importlib.util.spec_from_file_location("cpo", os.path.join(_d, "check-printed-overlap.py"))
cpo = importlib.util.module_from_spec(_p)
_p.loader.exec_module(cpo)

# ★描画の入口（drawEllipse を呼ぶ箇所）の数。★増えたら落ちる。
#   ★内訳（2026-08-25 実測）
#     lib/pdf-form-helpers.ts        1 … drawChoiceCircle（★静的検査が見ている）
#     generate-fire-department-…13   1 … ★計算した値（静的には読めない）
#     generate-gas-leak-…11-2        1 … 同上
#     generate-leakage-…12           1 … 同上
#     generate-soukatu               3 … 同上
EXPECTED_DRAW_SITES = 7

# ★静的検査が届いていない○の数。★増えたら落ちる。★減ったら登録を直すこと。
#
# ★2026-08-25 実測で★72個。★最初 8 と見積もったのは誤りだった
#   （★重なっている分だけを数えていた。★ここで数えるのは「静的に読めない○」
#     そのもので、重なっているかどうかとは別）。
#   ★内訳はほぼ soukatu の「良／不良」の○（行ごとに描かれる）。
# ★この数字が大きいこと自体が、★静的検査だけでは足りない証拠になっている。
EXPECTED_UNCOVERED = 72

SET_DIRS = ["tmp/pdf-test-bekki234", "tmp/pdf-test-bekki5678", "tmp/pdf-test-bekki9to12",
            "tmp/pdf-test-bekki13to22", "tmp/pdf-test-extra", "tmp/pdf-realistic"]


def draw_sites() -> list[tuple[str, int]]:
    """drawEllipse を呼ぶ箇所を数える。★ここが増えたら検査を足すこと。"""
    out = []
    for f in sorted(glob.glob("src/**/*.ts", recursive=True)):
        n = len(re.findall(r"\.drawEllipse\s*\(", io.open(f, encoding="utf-8").read()))
        if n:
            out.append((f.replace("\\", "/"), n))
    return out


def known_circles() -> set[tuple[str, int, int, int]]:
    """★静的検査が知っている○（drawChoiceCircle の定数）。様式・頁・座標。"""
    out = set()
    for route in sorted(glob.glob("src/app/api/*-pdf/route.ts")):
        src = io.open(route, encoding="utf-8").read()
        if "drawChoiceCircle(" not in src:
            continue
        name = os.path.basename(os.path.dirname(route)).replace("generate-", "").replace("-pdf", "")
        for pno, marks in cc.call_constants(src):
            for _lb, cx, cy, _rx, _ry in marks:
                out.add((name, pno, round(cx), round(cy)))
    return out


def stem_to_form(stem: str) -> str:
    """生成PDFの名前 → 様式の名前（静的側と突き合わせるため）。"""
    return stem.split("__")[0].replace("_test", "")


def drawn_circles():
    """★生成PDFに実際に現れた○を全部拾う（★列挙しない）。"""
    seen = {}
    for d in SET_DIRS:
        for p in sorted(glob.glob(os.path.join(d, "*.pdf"))):
            if "debug" in os.path.basename(p):
                continue
            tpl = cpo.template_for(Path(p))
            if tpl is None:
                continue
            t = fitz.open(str(tpl))
            tpl_streams = {t.xref_stream(x) for i in range(t.page_count)
                           for x in t[i].get_contents()}
            t.close()
            g = fitz.open(p)
            form = stem_to_form(os.path.basename(p)[:-4])
            for i in range(g.page_count):
                pg = g[i]
                keep = [x for x in pg.get_contents() if g.xref_stream(x) not in tpl_streams]
                if not keep:
                    continue
                xr = g.get_new_xref(); g.update_object(xr, "<<>>")
                g.update_stream(xr, b"".join(g.xref_stream(x) for x in keep))
                pg.set_contents(xr)
                for dr in pg.get_drawings():
                    r = dr["rect"]
                    seen.setdefault((form, i + 1, round((r.x0 + r.x1) / 2),
                                     round((r.y0 + r.y1) / 2)), os.path.basename(p))
            g.close()
    return seen


def main() -> int:
    sites = draw_sites()
    total_sites = sum(n for _f, n in sites)
    print("── ○を描く入口 ──")
    for f, n in sites:
        print(f"  {f}: {n}")
    print(f"  計 {total_sites}（登録 {EXPECTED_DRAW_SITES}）")
    ng = False
    if total_sites != EXPECTED_DRAW_SITES:
        print("★○を描く入口の数が変わった。★増えたなら、その○も検査に載せること。"
              "★減ったなら EXPECTED_DRAW_SITES を直すこと。")
        ng = True

    known = known_circles()
    drawn = drawn_circles()
    if not drawn:
        print("\n★生成PDFが1つも読めない。★先に生成すること（検査が空振りする）")
        return 1

    uncovered = []
    for (form, pno, cx, cy), src in sorted(drawn.items()):
        # ★座標は丸めで1pt ずれることがあるので、近傍を許す
        if any((form, pno, cx + dx, cy + dy) in known
               for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
            continue
        uncovered.append((form, pno, cx, cy, src))

    print(f"\n── ★静的検査が届いていない○ ──")
    for form, pno, cx, cy, src in uncovered:
        print(f"  {form} p{pno} ({cx},{cy})  ← {src}")
    print(f"  計 {len(uncovered)}（登録 {EXPECTED_UNCOVERED}）")
    print("  ★これらは★値を実行時に計算しているため、静的には読めない。"
          "★生成PDFの検査（check-printed-overlap）だけが見ている。")
    if len(uncovered) != EXPECTED_UNCOVERED:
        print("★静的検査が届いていない○の数が変わった。"
              "★増えたなら、その○の重なりを check-printed-overlap で確かめること。"
              "★減ったなら EXPECTED_UNCOVERED を直すこと。")
        ng = True

    # ★既知の例外の登録が古びていないこと（★全セットまとめてでしか見られない）
    #   ★check-printed-overlap はセットごとに走るので、あちらでは総数を固定できない。
    #   ★直ったのに登録が残っていると「例外がある」という誤った記録になる。
    stale = []
    for f, pno, kx, ky in sorted(cpo.KNOWN_TIGHT_CIRCLES):
        # ★登録は○の左上、drawn は○の中心。★半径ぶん（最大22pt）ずれるので広めに見る
        if not any(form == f and page == pno and abs(cx - kx) <= 30 and abs(cy - ky) <= 30
                   for (form, page, cx, cy) in drawn):
            stale.append(f"{f} p{pno} ({kx},{ky})")
    print(f"\n── ★既知の例外の登録 {len(cpo.KNOWN_TIGHT_CIRCLES)} 件 ──")
    if stale:
        print("★登録されているのに、生成PDFに1つも現れない:")
        for t in stale:
            print("   ", t)
        print("   ★直ったなら KNOWN_TIGHT_CIRCLES から消すこと。"
              "★消さずに置くと「例外がある」という誤った記録が残る。")
        ng = True
    else:
        print("  ★すべて生成PDFに現れている（登録が古びていない）")

    if ng:
        return 1
    print("\nCIRCLE_COVERAGE_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
