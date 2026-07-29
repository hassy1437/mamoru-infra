# 選択肢を囲む○が、隣の刷り込み語に触れていないことを全様式で確定する。
#
# ■ なぜ専用の検査が要るか（＝測っていない次元）
#   選択肢は 5pt 前後の間隔で並ぶ。○が隣にわずかでも触れると
#   「専用と兼用の両方が選ばれている」ように見え、法定書類として意味が壊れる。
#   はみ出し検査（罫線越え）でも重なり検査（刷り込みへの上書き）でも
#   「隣の語に触れている」は検出されない。
#
# ■ 2段構え
#   (1) ルート定数の静的検算 … drawChoiceCircle の定数すべてをテンプレート実測と照合。
#       ★1つのセルに丸は1つしか付かないので、生成PDFで踏めるのは選択肢の一部だけ。
#         3択・4択の欄は2つのテストセットでも全語を踏めない。使われていない定数こそ
#         黙って壊れるので、ここで全部見る。
#   (2) 生成PDFの実測 … 実際に描かれた楕円を測り、定数の写経ミスを排除する。
#
# ★bekki14 専用だった check-bekki14-choice-clearance.py を全様式に一般化したもの。
#   14箇所の○を新たに描くようにしたので、bekki14 だけ見ていては足りない。
#
# 使い方: python scripts/check-choice-clearance.py [--self-test]
import glob
import io
import os
import re
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify_numeric_rows_lib import template_of  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

# 刷り込み語を探す縦の許容幅（cy はグリフの上下中央付近を指す）
BAND = 9.0


def call_constants(src):
    """drawChoiceCircle(page{n}, ..., [ {label,cx,cy,rx,ry}, ... ]) を読む。

    ★配列の開始は「[ の直後に { label:」だけを狙う。素朴に最初の [ を掴むと
      呼び出し引数の p2Rows[5] の括弧を拾う（bekki11-1 で実際に踏み、
      定数の一括置換がルートの引数列を破壊した。tsc が検出）。
    """
    out = []
    for m in re.finditer(r"drawChoiceCircle\(\s*page(\d)", src):
        i = src.find("[", m.end())
        while i != -1 and not re.match(r"\[\s*\{\s*label:", src[i:]):
            i = src.find("[", i + 1)
        if i == -1:
            continue
        depth, j = 0, i
        for j in range(i, len(src)):
            if src[j] == "[":
                depth += 1
            elif src[j] == "]":
                depth -= 1
                if depth == 0:
                    break
        marks = []
        for mm in re.finditer(
            r'label:\s*"([^"]+)"\s*,\s*cx:\s*([\d.]+)\s*,\s*cy:\s*([\d.]+)\s*,'
            r'\s*rx:\s*([\d.]+)\s*,\s*ry:\s*([\d.]+)', src[i:j],
        ):
            marks.append((mm.group(1), *(float(mm.group(k)) for k in (2, 3, 4, 5))))
        if marks:
            out.append((int(m.group(1)), marks))
    return out


def printed_span(page, word, cy):
    """cy の帯にある word の x 範囲（非空白の文字だけで測る）"""
    chars = []
    for blk in page.get_text("rawdict")["blocks"]:
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                for ch in sp.get("chars", []):
                    x0, y0, x1, y1 = ch["bbox"]
                    if abs((y0 + y1) / 2 - cy) <= BAND and ch["c"].strip():
                        chars.append((x0, x1, ch["c"]))
    chars.sort()
    s = "".join(c[2] for c in chars)
    i = s.find(word)
    if i < 0:
        return None
    seg = chars[i:i + len(word)]
    return (seg[0][0], seg[-1][1])


def audit():
    """(様式, ページ, 語, 問題) のリストと、検査した定数の数を返す"""
    problems, total = [], 0
    for route in sorted(glob.glob("src/app/api/*-pdf/route.ts")):
        src = io.open(route, encoding="utf-8").read()
        if "drawChoiceCircle(" not in src:
            continue
        name = os.path.basename(os.path.dirname(route)).replace("generate-", "").replace("-pdf", "")
        tpl = template_of(route)
        if not tpl:
            raise SystemExit(f"★{name}: テンプレートPDFを特定できない")
        doc = fitz.open(tpl)
        for pno, marks in call_constants(src):
            if pno - 1 >= doc.page_count:
                raise SystemExit(f"★{name}: p{pno} がテンプレートに無い")
            page = doc[pno - 1]
            spans = {}
            for label, cx, cy, rx, ry in marks:
                sp = printed_span(page, label, cy)
                if sp is None:
                    problems.append(f"{name} p{pno}「{label}」: 刷り込みが見つからない（座標がずれている）")
                    continue
                spans[label] = sp
            order = sorted(spans, key=lambda w: spans[w][0])
            for label, cx, cy, rx, ry in marks:
                if label not in spans:
                    continue
                total += 1
                ex0, ex1 = cx - rx, cx + rx
                px0, px1 = spans[label]
                if px0 - ex0 < 0 or ex1 - px1 < 0:
                    problems.append(
                        f"{name} p{pno}「{label}」: 楕円が語を包含していない "
                        f"(語 {px0:.2f}–{px1:.2f} / 楕円 {ex0:.2f}–{ex1:.2f})")
                k = order.index(label)
                if k > 0:
                    gap = ex0 - spans[order[k - 1]][1]
                    if gap <= 0:
                        problems.append(
                            f"{name} p{pno}「{label}」: 左隣「{order[k-1]}」に接触 ({gap:+.2f}pt)")
                if k < len(order) - 1:
                    gap = spans[order[k + 1]][0] - ex1
                    if gap <= 0:
                        problems.append(
                            f"{name} p{pno}「{label}」: 右隣「{order[k+1]}」に接触 ({gap:+.2f}pt)")
        doc.close()
    return problems, total


def margins():
    """余白の分布（報告用）"""
    out = []
    for route in sorted(glob.glob("src/app/api/*-pdf/route.ts")):
        src = io.open(route, encoding="utf-8").read()
        if "drawChoiceCircle(" not in src:
            continue
        name = os.path.basename(os.path.dirname(route)).replace("generate-", "").replace("-pdf", "")
        doc = fitz.open(template_of(route))
        for pno, marks in call_constants(src):
            page = doc[pno - 1]
            spans = {}
            for label, cx, cy, rx, ry in marks:
                sp = printed_span(page, label, cy)
                if sp:
                    spans[label] = sp
            order = sorted(spans, key=lambda w: spans[w][0])
            for label, cx, cy, rx, ry in marks:
                if label not in spans:
                    continue
                k = order.index(label)
                gl = (cx - rx) - spans[order[k - 1]][1] if k > 0 else None
                gr = spans[order[k + 1]][0] - (cx + rx) if k < len(order) - 1 else None
                out.append((name, pno, label, gl, gr))
        doc.close()
    return out


def self_test():
    problems, total = audit()
    if problems:
        print("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for p in problems:
            print("   ", p)
        return 1
    # 陽性対照: どれか1つの rx を太らせたら接触を検出するか
    victim = "src/app/api/generate-foam-bekki5-pdf/route.ts"
    orig = io.open(victim, encoding="utf-8").read()
    m = re.search(r'(\{ label: "専用", cx: [\d.]+, cy: [\d.]+, rx: )([\d.]+)', orig)
    if not m:
        print("自己診断: 変異を当てる定数が見つからない（書式が変わった）")
        return 1
    try:
        io.open(victim, "w", encoding="utf-8", newline="").write(
            orig[:m.start(2)] + str(float(m.group(2)) + 40.0) + orig[m.end(2):])
        after, _ = audit()
        if not any("接触" in p or "包含していない" in p for p in after):
            print("自己診断: rx を +40pt 太らせても検出できない")
            return 1
    finally:
        io.open(victim, "w", encoding="utf-8", newline="").write(orig)
    print(f"  陰性対照: 定数 {total} 個 → 問題なし")
    print("  陽性対照: bekki5「専用」の rx を +40pt → 検出")
    print("SELF_TEST_OK")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    problems, total = audit()
    if "--margins" in sys.argv:
        print(f"{'様式':<28}{'p':<3}{'語':<8}{'左隣まで':>10}{'右隣まで':>10}")
        for name, pno, label, gl, gr in margins():
            f = lambda v: "   ----" if v is None else f"{v:+7.2f}"
            print(f"{name:<28}{pno:<3}{label:<8}{f(gl):>10}{f(gr):>10}")
        print()
    print(f"drawChoiceCircle の定数 {total} 個を検査")
    if problems:
        print("★NG:")
        for p in problems:
            print("   ", p)
        sys.exit(1)
    print("CHOICE_CLEARANCE_OK")
