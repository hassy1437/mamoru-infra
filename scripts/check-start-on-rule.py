"""アプリが描いた字の「描き始め」が、雛形の縦罫線の上に乗っていないかを検査する（2026-10-07）。

■ なぜ要るか（2026-10-06 の印字テスト）
  別記2/3 の測定機器 1 の製造者名が x=251.0 から描かれ、縦罫線（250.56〜251.04 / 250.68〜251.16）の上に
  乗っていた。同じ表の型式・日付・機器名2 は以前「罫線の右端 +0.10pt から描く」に直してあり、これだけ漏れていた。
  ★字の左側には余白（サイドベアリング）があるので、インクはほとんど罫線に載らない。
    インクの重なりを測る check-printed-overlap.py は鳴らず、セル定義の監査（check-cell-definition-audit.py）は
    drawInCell だけを読むので、専用の描画関数（drawDeviceMaker）は対象外だった。

■ 何を見るか
  生成PDFの字を 1 字ずつ取り（rawdict）、雛形に無い字（＝アプリが描いた字）の左端 x が、
  同じ高さを通る縦罫線の [左端 - 0.05, 右端 + 0.05] に入っていたら「罫線に乗る」とする。
  ★スパン単位では見ない。隣の欄の字（日付の「日」など）と 1 つのスパンにまとめて取り出され、
    先頭の位置が別の欄の字になる（実際それで別記3 を見落とした）。

使い方:
  python scripts/check-start-on-rule.py <生成PDF>...
  python scripts/check-start-on-rule.py --self-test
問題が無ければ NO_START_ON_RULE を出力して exit 0。
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
TPL_DIR = ROOT / "public" / "PDF"
APP_FONT_FILE = ROOT / "public" / "fonts" / "NotoSansJP-Regular.ttf"
EPS = 0.05


def template_for(pdf: Path) -> Path | None:
    """生成PDF → 元テンプレート（check-printed-overlap.py と同じ命名規約）"""
    stem = pdf.stem.split("__")[0].replace("_test", "")
    cand = {"soukatu": "bekki_soukatu", "itiran": "bekki_itiran", "houkoku": "bekki_houkoku"}.get(stem, f"s50_kokuji14_{stem}")
    p = TPL_DIR / f"{cand}.pdf"
    return p if p.exists() else None


def vertical_rules(page: fitz.Page) -> list[fitz.Rect]:
    out = []
    for dr in page.get_drawings():
        for it in dr["items"]:
            if it[0] == "re" and it[1].width < 1.3 and it[1].height > 4:
                out.append(fitz.Rect(it[1]))
            elif it[0] == "l" and abs(it[1].x - it[2].x) < 0.3 and abs(it[1].y - it[2].y) > 4:
                w = (dr.get("width") or 0.5) / 2
                out.append(fitz.Rect(min(it[1].x, it[2].x) - w, min(it[1].y, it[2].y),
                                     max(it[1].x, it[2].x) + w, max(it[1].y, it[2].y)))
    return out


def chars(page: fitz.Page):
    for b in page.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                text = "".join(c["c"] for c in s["chars"])
                for c in s["chars"]:
                    if c["c"].strip():
                        yield c, text


def starts_on_rule(pdf: Path) -> list[str] | None:
    tpl = template_for(pdf)
    if tpl is None:
        return None
    td, od = fitz.open(str(tpl)), fitz.open(str(pdf))
    hits = []
    for pi in range(od.page_count):
        # （その2）を足した総括表などは雛形より紙が多い。足した紙は雛形の最後の紙の写し
        tp, op = td[min(pi, td.page_count - 1)], od[pi]
        printed = {(round(c["bbox"][0], 1), round(c["bbox"][1], 1)) for c, _ in chars(tp)}
        rules = vertical_rules(tp)
        for c, text in chars(op):
            x0, y0, _, y1 = c["bbox"]
            if (round(x0, 1), round(y0, 1)) in printed:
                continue
            ym = (y0 + y1) / 2
            r = next((r for r in rules if r.y0 < ym < r.y1 and r.x0 - EPS <= x0 <= r.x1 + EPS), None)
            if r is not None:
                hits.append(f"{pdf.name} p{pi + 1}: 「{c['c']}」（{text[:16]}）の描き始め x={x0:.2f} が縦罫線 {r.x0:.2f}〜{r.x1:.2f} に乗る（y={y0:.1f}）")
    return hits


def self_test() -> int:
    """両方向の対照: 描画ゼロは 0 件／罫線の上から描くと検出／罫線の右 0.3pt から描くと 0 件"""
    problems = []
    tpl = TPL_DIR / "s50_kokuji14_bekki2.pdf"
    with tempfile.TemporaryDirectory() as td:
        plain = Path(td) / "bekki2_test.pdf"
        plain.write_bytes(tpl.read_bytes())
        if starts_on_rule(plain):
            problems.append("描画ゼロで検出した（刷り込みの字を数えている）")

        # 刷り込みの字が近くに無い縦罫線を選ぶ（測定機器の表・その3）
        doc = fitz.open(str(tpl))
        page = doc[2]
        rule = next((r for r in vertical_rules(page) if 240 < r.x0 < 260 and r.y0 < 656 < r.y1), None)
        doc.close()
        if rule is None:
            problems.append("対照に使う縦罫線が見つからない（対照として不適）")
        else:
            for name, x, want in [("bekki2_test.pdf", rule.x1 - 0.2, True), ("bekki2_test.pdf", rule.x1 + 0.3, False)]:
                d = fitz.open(str(tpl))
                pg = d[2]
                # ★対照はアプリと同じフォントで描く
                pg.insert_font(fontname="notojp", fontfile=str(APP_FONT_FILE))
                pg.insert_text((x, 662), "計測器製作所", fontname="notojp", fontsize=7.2)
                out = Path(td) / ("on" if want else "off") / name
                out.parent.mkdir(exist_ok=True)
                d.save(str(out))
                d.close()
                got = bool(starts_on_rule(out))
                if got != want:
                    problems.append(f"罫線の右端 {rule.x1:.2f} に対して x={x:.2f} から描いたのに"
                                    + ("検出しない" if want else "検出した（誤検出）"))
    if problems:
        print("自己診断NG:")
        for p in problems:
            print("  -", p)
        return 1
    print("  陰性対照: 描画ゼロ・罫線の右 0.3pt からの描画 → 0 件")
    print("  陽性対照: 罫線の上（右端 -0.2pt）から描く → 検出")
    print("SELF_TEST_OK")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    paths = [Path(a) for a in sys.argv[1:] if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    total, skipped = [], []
    for p in paths:
        h = starts_on_rule(p)
        if h is None:
            skipped.append(p.stem)
            continue
        total += h
    print(f"描き始めが縦罫線に乗る字を検査: {len(paths) - len(skipped)} 件の PDF（雛形が無く対象外 {len(skipped)} 件）")
    if total:
        print("★NG:")
        for t in total:
            print("  ", t)
        return 1
    print("NO_START_ON_RULE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
