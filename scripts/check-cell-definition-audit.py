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

  ★2026-07-28: この但し書きがコメントにしか無かったため「0件＝安全」と読めていた。
    実際 B-2 で直した9箇所（刷り込みラベルへの重ね書き）は全部この対象外にあり、
    この監査は一度も鳴っていない。いまは対象外の件数を実行時に必ず出す。
    行ループ（drawResultRows）が描くセルは scripts/audit-row-cells.py が見る。

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

# ★page5 を落としていた。bekki3 の 5箇所が監査対象外だった（実測）。
PAGE_INDEX = {"page1": 0, "page": 0, "page2": 1, "page3": 2, "page4": 3, "page5": 4}
CALL = re.compile(r"drawInCell\(")
NUM = r"\s*([\d.]+)\s*"
HEAD = re.compile(r"drawInCell\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(.+?),{n},{n},{n},{n}".replace("{n}", NUM), re.S)
# ★リテラルだけでなく、const と オブジェクトのメンバも解決する。
#   実測: リテラルのみだと 469箇所中 231箇所(49%)しか監査できていなかった。
TOK = r"\s*([A-Za-z0-9_.]+)\s*"
HEAD_TOK = re.compile(r"drawInCell\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(.+?),{t},{t},{t},{t}".replace("{t}", TOK), re.S)


def resolvable_consts(src: str) -> dict:
    """const X = 12.3 と const X = { a: 1, b: 2 } の両方を数値表に入れる"""
    out = {}
    for m in re.finditer(r"const\s+(\w+)\s*=\s*(-?[\d.]+)\s*\n", src):
        out[m.group(1)] = float(m.group(2))
    for m in re.finditer(r"const\s+(\w+)\s*=\s*\{([^{}]*)\}", src):
        for mm in re.finditer(r"(\w+)\s*:\s*(-?[\d.]+)", m.group(2)):
            out[f"{m.group(1)}.{mm.group(1)}"] = float(mm.group(2))
    return out


# ★既に判明している定義上の重なり。理由つきで宣言し、両方向で守る。
#   （新しく増えたら落ちる／直したのに残っていても落ちる）
# ★periodText のフォールバックは削除済み（点検期間が年月日に分解できないときは 422 で止める）。
#   ここを空にしておくと、同種の「刷り込みの上に生の文字列を描く」枝が新たに入ったとき
#   即座に落ちる。既知として登録し直す前に、まず消せないかを検討すること。
KNOWN_OVERLAP: dict[str, str] = {}


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
    # ★対象外にした呼び出しを数える。「0件＝安全」と読めてしまうのを防ぐ。
    #   実際 B-2 で直した9箇所は全部この外側にあり、この監査は一度も鳴っていない。
    skipped = {"座標を解決できない(式・関数)": 0, "ページ変数を解決できない": 0,
               "行ループ(drawWrappedInCell)": 0}
    # ★様式名で除外したルートの呼び出しも分母に入れる。
    #   除外分を分母から落とすと被覆率が実際より良く見える（453 と 469 で 80% と 77%）。
    excluded_routes = {}
    audited = 0
    known = []
    for route in sorted(API.glob("generate-*/route.ts")):
        key = route.parent.name.replace("generate-", "").replace("-pdf", "")
        # ★ハイフン付き（bekki11-1 / bekki11-2）を拾えていなかった。テンプレート名は
        #   s50_kokuji14_bekki11_1.pdf なのでアンダースコアに直して引く。
        #   実測: この2様式の drawInCell 33箇所が、この監査に**一度も掛かっていなかった**。
        m = re.search(r"bekki([\d_-]+)$", key)
        if not m:
            n = len(CALL.findall(route.read_text(encoding="utf-8")))
            if n:
                excluded_routes[key] = n
            continue
        form = "bekki" + m.group(1).replace("-", "_")
        glyphs = template_glyphs(form)
        if glyphs is None:
            continue
        src = route.read_text(encoding="utf-8")
        dpx, dpy = route_default_padding(src)
        consts_tbl = resolvable_consts(src)
        for c in CALL.finditer(src):
            seg = call_span(src, c.start())
            h = HEAD.match(seg)
            vals = None
            if h:
                vals = list(map(float, h.group(4, 5, 6, 7)))
            else:
                h = HEAD_TOK.match(seg)
                if h:
                    got = []
                    for t in h.group(4, 5, 6, 7):
                        try:
                            got.append(float(t))
                        except ValueError:
                            got.append(consts_tbl.get(t))
                    if None not in got:
                        vals = got
            if vals is None:
                skipped["座標を解決できない(式・関数)"] += 1
                continue
            pno = PAGE_INDEX.get(h.group(1))
            if pno is None or pno not in glyphs:
                skipped["ページ変数を解決できない"] += 1
                continue
            x, y, w, hh = vals
            # ★padding は呼び出しごと。明示が無ければルート既定
            po = re.search(r"paddingX:\s*([\d.]+)", seg)
            px = float(po.group(1)) if po else dpx
            po = re.search(r"paddingY:\s*([\d.]+)", seg)
            py = float(po.group(1)) if po else dpy
            if not use_padding:
                px = py = 0.0
            audited += 1
            area = fitz.Rect(x + px, y + py, x + w - px, y + hh - py)
            if area.is_empty or area.width <= 0 or area.height <= 0:
                continue
            bad = [(ch, r) for ch, r in glyphs[pno] if area.intersects(r)]
            if bad:
                if h.group(3).strip() in KNOWN_OVERLAP:
                    known.append(h.group(3).strip())
                    continue
                hits.append({
                    "form": form, "value": h.group(3).strip().replace("body.", "")[:30],
                    "rect": (x, y, w, hh), "pad": (px, py),
                    "printed": "".join(ch for ch, _ in bad)[:16],
                    "page": pno + 1,
                })
        skipped["行ループ(drawWrappedInCell)"] += len(re.findall(r"drawWrappedInCell\(", src))
    return hits, skipped, audited, known, excluded_routes


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
    hits, skipped, audited, known, excluded = audit(use_padding=True)
    if "--raw" in sys.argv:
        raw, _, _, _, _ = audit(use_padding=False)
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
    # ★この監査が見ていない範囲を数値で出す。冒頭コメントにしか書いていないと
    #   「0件＝安全」と誤読される（B-2 で直した9箇所は全部この外側だった）。
    total = (audited + skipped["座標を解決できない(式・関数)"] + skipped["ページ変数を解決できない"]
             + sum(excluded.values()))
    print(f"  監査できた drawInCell: {audited} / {total} 箇所（{audited / max(1, total) * 100:.0f}%）")
    print(f"  ★対象外 {total - audited} 箇所:")
    print(f"      座標が式・関数呼び出しで解決できない … {skipped['座標を解決できない(式・関数)']} 箇所")
    print(f"      ページ変数を解決できない            … {skipped['ページ変数を解決できない']} 箇所")
    print(f"      様式名で除外したルート              … {sum(excluded.values())} 箇所"
          f"（{', '.join(f'{k}:{v}' for k, v in sorted(excluded.items()))}）"
          " ★テンプレート名が s50_kokuji14_* でないため引けない")
    print(f"      drawWrappedInCell（別経路）          … {skipped['行ループ(drawWrappedInCell)']} 箇所（分母外・別経路）")
    print("  → 行ループ（drawResultRows）が描くセルは scripts/audit-row-cells.py が見る")
    print("  ★対象外の箇所については、この監査は何も言っていない（0件＝安全ではない）")
    for name, reason in KNOWN_OVERLAP.items():
        n = known.count(name)
        if n == 0:
            print(f"\n★NG: 既知の重なり {name} が1件も出ていない（直したなら宣言を消すこと）")
            return 1
        print(f"\n  既知の重なり {name}: {n} 箇所（★定義上の重なり。フォールバック経路）")
        print(f"      {reason}")
    if hits:
        print("  → 値が短いと検出器には出ないが、長い社名等が来れば必ず重なる。")
        return 1
    print("\nCELL_DEFINITION_AUDIT_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
