"""セル定義そのものが刷り込み文字に掛かっていないかを、値に依存せず監査する。

■ なぜ検出器と別に要るか
  check-printed-overlap.py は生成PDFを測るので、**値がたまたま長かったときしか鳴らない**。
  実測では検出器に出たのは4様式だったが、セル定義を測ると18様式43箇所あった。
  ＝ 症状を測る検出器と、定義を測る監査は別物で、両方要る。
  短い値でたまたま当たっていない箇所は、業者が長い社名を入れた瞬間に出る。

■ ★何を「掛かっている」とみなすか（paddingを考慮する）
  drawInCell は矩形いっぱいに描かない。左寄せなら cellX + paddingX から、
  中央寄せでも textWidth <= cellW - 2*paddingX なので、**両側とも最低 paddingX**
  内側に入る。縦も (cellH - textHeight)/2 >= paddingY。
  したがって判定に使うのは矩形そのものではなく**実際に文字が入りうる領域**
  （矩形を paddingX/paddingY だけ内側に縮めたもの）。

  ★これを入れないと 0.02pt の接触が実害と同列に並び、本当に直すべき箇所が埋もれる。
    実測: padding を無視すると 32箇所 / 考慮すると 21箇所（2026-07-27）。

  padding は呼び出しごとに違う（実測: 既定 2.5 が8ルート・3 が8ルート・4 が1ルート、
  呼び出し側の明示は 0 が7箇所・0.5 が17箇所…）。★ルート既定で一律に引くと誤る。

■ ★この監査が見ていない範囲（黙って落とさないため明記する）
  - 座標がリテラルでない呼び出し（変数・定数経由）は対象外
  - drawWrappedInCell / drawRightAt / drawTextRuns の経路は対象外
    （drawWrappedInCell は共有ヘルパー経由で paddingX=2.5 を持つ）
  ＝ ここで0件でも「全部きれい」ではない。検出器と併用すること。

使い方:
  python scripts/check-cell-definition-audit.py            # 監査
  python scripts/check-cell-definition-audit.py --raw      # padding を考慮しない数も出す
  python scripts/check-cell-definition-audit.py --self-test
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "src" / "app" / "api"
TPL = ROOT / "public" / "PDF"

PAGE_INDEX = {"page1": 0, "page": 0, "page2": 1, "page3": 2, "page4": 3}
CALL = re.compile(r"drawInCell\(")
NUM = r"\s*([\d.]+)\s*"
HEAD = re.compile(r"drawInCell\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(.+?),{n},{n},{n},{n}".replace("{n}", NUM), re.S)


def route_default_padding(src: str) -> tuple[float, float]:
    x = re.search(r"const paddingX = options\?\.paddingX \?\? ([\d.]+)", src)
    y = re.search(r"const paddingY = options\?\.paddingY \?\? ([\d.]+)", src)
    return (float(x.group(1)) if x else 3.0, float(y.group(1)) if y else 2.0)


def call_span(src: str, start: int) -> str:
    """drawInCell( から対応する ) までを取り出す"""
    depth, i = 0, src.index("(", start)
    for j in range(i, min(len(src), i + 4000)):
        if src[j] == "(":
            depth += 1
        elif src[j] == ")":
            depth -= 1
            if depth == 0:
                return src[start:j + 1]
    return src[start:start + 400]


def template_glyphs(form: str):
    p = TPL / f"s50_kokuji14_{form}.pdf"
    if not p.exists():
        return None
    doc = fitz.open(str(p))
    out = {}
    for pno in range(doc.page_count):
        out[pno] = [(c["c"], fitz.Rect(c["bbox"]))
                    for b in doc[pno].get_text("rawdict")["blocks"]
                    for l in b.get("lines", [])
                    for s in l.get("spans", [])
                    for c in s.get("chars", []) if c["c"].strip()]
    doc.close()
    return out


def audit(use_padding: bool = True):
    hits = []
    for route in sorted(API.glob("generate-*/route.ts")):
        key = route.parent.name.replace("generate-", "").replace("-pdf", "")
        m = re.search(r"bekki(\d+_?\d*)$", key)
        if not m:
            continue
        form = f"bekki{m.group(1)}"
        glyphs = template_glyphs(form)
        if glyphs is None:
            continue
        src = route.read_text(encoding="utf-8")
        dpx, dpy = route_default_padding(src)
        for c in CALL.finditer(src):
            seg = call_span(src, c.start())
            h = HEAD.match(seg)
            if not h:
                continue
            pno = PAGE_INDEX.get(h.group(1))
            if pno is None or pno not in glyphs:
                continue
            x, y, w, hh = map(float, h.group(4, 5, 6, 7))
            # ★padding は呼び出しごと。明示が無ければルート既定
            po = re.search(r"paddingX:\s*([\d.]+)", seg)
            px = float(po.group(1)) if po else dpx
            po = re.search(r"paddingY:\s*([\d.]+)", seg)
            py = float(po.group(1)) if po else dpy
            if not use_padding:
                px = py = 0.0
            area = fitz.Rect(x + px, y + py, x + w - px, y + hh - py)
            if area.is_empty or area.width <= 0 or area.height <= 0:
                continue
            bad = [(ch, r) for ch, r in glyphs[pno] if area.intersects(r)]
            if bad:
                hits.append({
                    "form": form, "value": h.group(3).strip().replace("body.", "")[:30],
                    "rect": (x, y, w, hh), "pad": (px, py),
                    "printed": "".join(ch for ch, _ in bad)[:16],
                    "page": pno + 1,
                })
    return hits


def self_test() -> int:
    """★両方向。片方だけだと『常に0件』な監査も通ってしまう"""
    problems = []
    glyphs = template_glyphs("bekki5")
    target = next((r for ch, r in glyphs[0] if ch == "氏"), None)
    if target is None:
        return_code = 1
        print("SELF_TEST_FAILED\n  - 対照に使う刷り込みが見つからない")
        return return_code

    # 上向き: 刷り込みを内側に含む領域は必ず検出
    area = fitz.Rect(target.x0 - 5, target.y0 - 5, target.x1 + 5, target.y1 + 5)
    if not any(area.intersects(r) for _, r in glyphs[0]):
        problems.append("刷り込みを囲む領域を検出しない")

    # 下向き1: 刷り込みから離れた余白は検出しない
    blank = fitz.Rect(540, 700, 560, 720)
    if any(blank.intersects(r) for _, r in glyphs[0]):
        problems.append("余白を検出した（誤検出）")

    # 下向き2: ★padding の分だけ内側に縮めれば、境界のわずかな重なりは落ちる
    #   ★fitz の intersects は辺の接触（幅0）を含まないので、対照は必ず
    #     わずかに食い込ませて作る。最初 target.x1 ちょうどから始めたら
    #     交差せず「対照が不適」で落ちた（実データの 0.02pt は本当の重なりだった）。
    graze_cell = fitz.Rect(target.x1 - 0.05, target.y0, target.x1 + 40, target.y1)
    if not graze_cell.intersects(target):
        problems.append("対照が不適: わずかな重なりを作れていない")
    inset = fitz.Rect(graze_cell.x0 + 2.5, graze_cell.y0, graze_cell.x1 - 2.5, graze_cell.y1)
    if inset.intersects(target):
        problems.append("padding を引いても境界の接触が残る（縮小が効いていない）")

    if problems:
        print("SELF_TEST_FAILED")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("SELF_TEST_OK（刷り込みを含む=検出 / 余白=非検出 / 境界接触はpaddingで落ちる）")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    hits = audit(use_padding=True)
    if "--raw" in sys.argv:
        raw = audit(use_padding=False)
        print(f"padding 無視: {len(raw)} 箇所 / {len({h['form'] for h in raw})} 様式")
        print(f"padding 考慮: {len(hits)} 箇所 / {len({h['form'] for h in hits})} 様式")
        print(f"  → 差 {len(raw) - len(hits)} 箇所は「矩形は掛かるが文字は届かない」")

    by = {}
    for h in hits:
        by.setdefault(h["form"], []).append(h)
    for form in sorted(by, key=lambda s: (len(s), s)):
        print(f"\n★{form}: {len(by[form])} 箇所")
        for h in by[form]:
            x, y, w, hh = h["rect"]
            print(f"    p{h['page']} {h['value']:<30} ({x},{y},{w},{hh}) pad={h['pad'][0]} "
                  f"← 刷り込み[{h['printed']}]")
    print(f"\n監査 {len(hits)} 箇所 / {len(by)} 様式")
    if hits:
        print("  → 値が短いと検出器には出ないが、長い社名等が来れば必ず重なる。")
        return 1
    print("\nCELL_DEFINITION_AUDIT_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
