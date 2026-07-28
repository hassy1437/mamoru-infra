"""指定様式のヘッダ帯を実測し、セル定義と突き合わせて表示する（修正の下ごしらえ用）。

■ なぜ要るか
  セル定義の修正では毎回同じことを測る:
    - 刷り込みラベルの実位置（前置ラベルか後続の障害物か）
    - 行境界（帯ごとずれていないか）
    - 列境界（値をどこまで伸ばせるか）
    - ★flagged のセルだけでなく、同じ帯の他のセルも同じだけずれていないか
  bekki7 では flagged 4箇所の外側にも同じずれがあり、帯全体を見て初めて確定した。
  目視で毎回やると取りこぼすので、道具にする。

使い方:
  python scripts/inspect-header-band.py bekki1 [y下限 y上限]
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


def route_of(form: str) -> Path | None:
    for p in API.glob("generate-*/route.ts"):
        if p.parent.name.replace("generate-", "").replace("-pdf", "").endswith(form):
            return p
    return None


def call_span(src: str, start: int) -> str:
    depth, i = 0, src.index("(", start)
    for j in range(i, min(len(src), i + 4000)):
        if src[j] == "(":
            depth += 1
        elif src[j] == ")":
            depth -= 1
            if depth == 0:
                return src[start:j + 1]
    return src[start:start + 400]


def merged(vals, tol=1.5):
    out = []
    for v in sorted(vals):
        if not out or v - out[-1] > tol:
            out.append(v)
    return out


def rules(page, horizontal: bool, lo: float, hi: float, span_lo: float, span_hi: float):
    """lo..hi の範囲にあり、span_lo..span_hi を貫く罫線"""
    got = set()
    for d in page.get_drawings():
        for it in d.get("items", []):
            if it[0] == "l":
                p, q = it[1], it[2]
                if horizontal and abs(p.y - q.y) < 0.8 and lo <= p.y <= hi \
                        and min(p.x, q.x) <= span_lo and max(p.x, q.x) >= span_hi:
                    got.add(round(p.y, 1))
                if not horizontal and abs(p.x - q.x) < 0.8 and lo <= p.x <= hi \
                        and min(p.y, q.y) <= span_lo and max(p.y, q.y) >= span_hi:
                    got.add(round(p.x, 1))
            elif it[0] == "re":
                r = it[1]
                if horizontal and r.x0 <= span_lo and r.x1 >= span_hi:
                    for y in (r.y0, r.y1):
                        if lo <= y <= hi:
                            got.add(round(y, 1))
                if not horizontal and r.y0 <= span_lo and r.y1 >= span_hi:
                    for x in (r.x0, r.x1):
                        if lo <= x <= hi:
                            got.add(round(x, 1))
    return merged(got)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    form = sys.argv[1]
    y0 = float(sys.argv[2]) if len(sys.argv) > 2 else 60.0
    y1 = float(sys.argv[3]) if len(sys.argv) > 3 else 270.0

    tpl = TPL / f"s50_kokuji14_{form}.pdf"
    route = route_of(form)
    if not tpl.exists() or route is None:
        print(f"見つからない: {tpl if not tpl.exists() else form}")
        return 2
    doc = fitz.open(str(tpl))
    page = doc[0]

    print(f"═══ {form} p1  y={y0}-{y1} ═══")
    print("── 刷り込み（スパン単位）──")
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l.get("spans", []):
                t = s["text"].strip()
                if t and y0 <= s["bbox"][1] <= y1:
                    print(f"   [{t[:22]:<22}] x={s['bbox'][0]:6.1f}-{s['bbox'][2]:6.1f} "
                          f"y={s['bbox'][1]:6.1f}-{s['bbox'][3]:6.1f}")

    print("── 帯を貫く横罫（左ブロック / 右ブロック）──")
    print(f"   x=110-200: {rules(page, True, y0, y1, 110, 200)}")
    print(f"   x=300-430: {rules(page, True, y0, y1, 300, 430)}")

    print("── コードのセル定義と行境界の照合 ──")
    src = route.read_text(encoding="utf-8")
    for c in CALL.finditer(src):
        seg = call_span(src, c.start())
        h = HEAD.match(seg)
        if not h or PAGE_INDEX.get(h.group(1)) != 0:
            continue
        x, y, w, hh = map(float, h.group(4, 5, 6, 7))
        if not (y0 <= y <= y1):
            continue
        po = re.search(r"paddingX:\s*([\d.]+)", seg)
        px = float(po.group(1)) if po else None
        band = rules(page, True, y - 40, y + hh + 40, x + 2, min(x + w - 2, 528))
        near = min(band, key=lambda v: abs(v - y)) if band else None
        diff = (y - near) if near is not None else None
        mark = "  " if (diff is not None and abs(diff) <= 1.5) else "★"
        cols = rules(page, False, x - 60, x + w + 60, y + 1, y + hh - 1)
        print(f" {mark} {h.group(3).strip().replace('body.', '')[:26]:<26} "
              f"({x},{y},{w},{hh}){'' if px is None else f' padX={px}'}")
        print(f"     行境界{band} 最寄り={near} 差={'' if diff is None else f'{diff:+.2f}'} / 列境界{cols}")
    doc.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
