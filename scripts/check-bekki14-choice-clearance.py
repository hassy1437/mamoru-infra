# bekki14「鳴動方式」の○が、隣の刷り込み語に触れていないことを数値で確定する。
#
# ■ なぜ専用の検査が要るか（＝測っていない次元）
#   一斉/区分/相互/再鳴動 は 5pt 前後の間隔で並ぶ。○が隣にわずかでも触れると
#   「一斉と区分の両方が選ばれている」ように見え、法定書類として意味が壊れる。
#   はみ出し検査（罫線越え）でも重なり検査（刷り込み文字への上書き）でも、
#   「隣の語に触れている」は検出されない。専用に測る。
#
# ■ 2段構え
#   (1) 生成PDF   … 実際に描かれた楕円を実測。ルートの定数を写経すると写経ミスが素通りする
#   (2) ルート定数 … 8定数すべて（各ページ4語×2ページ）。1ページに丸は1つしか付かないので、
#                    生成PDFで踏めるのは半分だけ。使われていない定数こそ黙って壊れる
#
# 使い方: python scripts/check-bekki14-choice-clearance.py [--self-test]
import io
import re
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")

TEMPLATE = "public/PDF/s50_kokuji14_bekki14.pdf"
ROUTE = "src/app/api/generate-emergency-alarm-bekki14-pdf/route.ts"
WORDS = ["一斉", "区分", "相互", "再鳴動"]
CASES = [
    ("長文", "tmp/pdf-test-bekki13to22/bekki14_test.pdf", 0, "一斉"),
    ("長文", "tmp/pdf-test-bekki13to22/bekki14_test.pdf", 1, "相互"),
    ("現実値", "tmp/pdf-realistic/bekki14_test.pdf", 0, "区分"),
    ("現実値", "tmp/pdf-realistic/bekki14_test.pdf", 1, "再鳴動"),
]
BANDS = {0: (665.0, 685.0), 1: (590.0, 610.0)}      # 鳴動方式の行（top基準）
COLS = {0: (221.16, 221.16 + 112.92), 1: (221.16, 221.16 + 105.84)}  # 内容列


def printed_spans(page_no):
    """テンプレートから、鳴動方式の行に刷り込まれた4語の範囲を実測する。"""
    doc = fitz.open(TEMPLATE)
    page = doc[page_no]
    lo, hi = BANDS[page_no]
    chars = []
    for blk in page.get_text("rawdict")["blocks"]:
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                for ch in sp.get("chars", []):
                    x0, y0, x1, y1 = ch["bbox"]
                    if lo <= y0 <= hi:
                        chars.append((x0, x1, y0, y1, ch["c"]))
    chars.sort()
    doc.close()
    out = {}
    s = "".join(c[4] for c in chars)
    for w in WORDS:
        i = s.find(w)
        if i < 0:
            raise SystemExit(f"刷り込み語が見つからない: {w} (p{page_no+1}) 実際の並び={s!r}")
        seg = chars[i:i + len(w)]
        out[w] = (min(c[0] for c in seg), max(c[1] for c in seg),
                  min(c[2] for c in seg), max(c[3] for c in seg))
    return out


def app_ellipses(pdf_path, page_no):
    """生成PDFの「アプリが足した分だけ」から楕円の bbox を実測する。

    テンプレート由来のストリームを外さないと、罫線が混ざって楕円を特定できない。
    """
    doc = fitz.open(pdf_path)
    tmpl = fitz.open(TEMPLATE)
    page, tp = doc[page_no], tmpl[page_no]
    tmpl_bodies = {tmpl.xref_stream(x) for x in tp.get_contents()}
    keep = [x for x in page.get_contents() if doc.xref_stream(x) not in tmpl_bodies]
    if not keep:
        doc.close(); tmpl.close()
        return []
    if len(keep) > 1:
        doc.update_stream(keep[0], b"\n".join(doc.xref_stream(x) for x in keep))
    page.set_contents(keep[0])
    # 楕円は4本のベジェ曲線。罫線(l)や矩形(re)と区別する
    ells = [(d["rect"].x0, d["rect"].x1, d["rect"].y0, d["rect"].y1)
            for d in page.get_drawings() if any(it[0] == "c" for it in d["items"])]
    doc.close(); tmpl.close()
    return ells


def route_constants(src):
    """ルートから drawChoiceCircle の定数を読む（ページ番号 -> 語 -> (cx,cy,rx,ry)）"""
    blocks = re.findall(r"drawChoiceCircle\(page(\d)[^[]*\[(.*?)\]\)", src, re.S)
    if len(blocks) != 2:
        raise SystemExit(f"drawChoiceCircle の呼び出しが {len(blocks)} 箇所（期待2）")
    out = {}
    for pno_s, body in blocks:
        consts = {}
        for m in re.finditer(
            r'label:\s*"([^"]+)"\s*,\s*cx:\s*([\d.]+)\s*,\s*cy:\s*([\d.]+)\s*,'
            r'\s*rx:\s*([\d.]+)\s*,\s*ry:\s*([\d.]+)', body,
        ):
            consts[m.group(1)] = tuple(float(m.group(i)) for i in (2, 3, 4, 5))
        if set(consts) != set(WORDS):
            raise SystemExit(f"p{pno_s}: 定数の語が一致しない {sorted(consts)}")
        out[int(pno_s) - 1] = consts
    return out


def static_check(src, verbose=True):
    """8定数すべてを、テンプレート実測と突き合わせる。問題のリストを返す。"""
    bad_all = []
    for page_no, consts in sorted(route_constants(src).items()):
        printed = printed_spans(page_no)
        cl, cr = COLS[page_no]
        order = sorted(WORDS, key=lambda w: printed[w][0])
        if verbose:
            print(f"\n  ページ{page_no+1}  内容列 x: {cl:.2f} – {cr:.2f}")
        for w in order:
            cx, _cy, rx, _ry = consts[w]
            ex0, ex1 = cx - rx, cx + rx
            px0, px1 = printed[w][0], printed[w][1]
            k = order.index(w)
            gl = (ex0 - printed[order[k - 1]][1]) if k > 0 else None
            gr = (printed[order[k + 1]][0] - ex1) if k < len(order) - 1 else None
            bad = []
            if px0 - ex0 < 0 or ex1 - px1 < 0:
                bad.append("語をはみ出す")
            if gl is not None and gl <= 0:
                bad.append("左隣に接触")
            if gr is not None and gr <= 0:
                bad.append("右隣に接触")
            if ex0 < cl or ex1 > cr:
                bad.append("内容列をはみ出す")
            if verbose:
                f = lambda v: " ---- " if v is None else f"{v:+6.2f}"
                print(f"    {w:<4}  楕円 {ex0:7.2f} – {ex1:7.2f}   "
                      f"包含 左{px0-ex0:+5.2f}/右{ex1-px1:+5.2f}   "
                      f"隣まで 左{f(gl)} 右{f(gr)}   {'OK' if not bad else '★' + '・'.join(bad)}")
            if bad:
                bad_all.append((page_no + 1, w, bad))
    return bad_all


def self_test():
    """★検出器が本当に落ちるかを確かめる。両方向で見る。"""
    src = io.open(ROUTE, encoding="utf-8").read()
    if static_check(src, verbose=False):
        print("自己診断: 現状のルート定数が既にNG（陰性対照が成立しない）")
        return 1
    # 隣までの余白（最小 1.82pt）を食い潰す太さに変える
    mutated = src.replace('cx: 258.36, cy: 601.39, rx: 11.50', 'cx: 258.36, cy: 601.39, rx: 13.45')
    if mutated == src:
        print("自己診断: 変異を当てる定数が見つからない（ルートの書式が変わった）")
        return 1
    found = static_check(mutated, verbose=False)
    if not any(w == "区分" and p == 2 for p, w, _ in found):
        print("自己診断: rx を +1.95pt 太らせても接触を検出できない")
        return 1
    print("  陰性対照: 現状の8定数 → 問題なし")
    print("  陽性対照: p2「区分」の rx を +1.95pt → 左右とも接触を検出")
    print("SELF_TEST_OK")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())

    print("=" * 78)
    print("bekki14 鳴動方式 ○の接触検査（テンプレート実測 vs 生成PDF実測）")
    print("=" * 78)
    ng = 0
    for setname, pdf_path, page_no, word in CASES:
        printed = printed_spans(page_no)
        ells = app_ellipses(pdf_path, page_no)
        if len(ells) != 1:
            print(f"\n[{setname}] p{page_no+1}: ★楕円が {len(ells)} 個（期待1個）"
                  f" — 値が選択肢と一致せず○が描かれていない可能性")
            ng += 1
            continue
        ex0, ex1, ey0, ey1 = ells[0]
        px0, px1, py0, py1 = printed[word]
        print(f"\n[{setname}] ページ{page_no+1} 「{word}」")
        print(f"  刷り込み語 x: {px0:7.2f} – {px1:7.2f}  (幅 {px1-px0:5.2f})   y: {py0:7.2f} – {py1:7.2f}")
        print(f"  描いた楕円 x: {ex0:7.2f} – {ex1:7.2f}  (幅 {ex1-ex0:5.2f})   y: {ey0:7.2f} – {ey1:7.2f}")
        print(f"  語を包含: 左{px0-ex0:+5.2f} / 右{ex1-px1:+5.2f} / 上{py0-ey0:+5.2f} / 下{ey1-py1:+5.2f}")
        order = sorted(WORDS, key=lambda w: printed[w][0])
        k = order.index(word)
        for side, nb in (("左", order[k - 1] if k > 0 else None),
                         ("右", order[k + 1] if k < len(order) - 1 else None)):
            if nb is None:
                print(f"  {side}隣: なし（両端）")
                continue
            gap = (printed[nb][0] - ex1) if side == "右" else (ex0 - printed[nb][1])
            print(f"  {side}隣「{nb}」との実距離: {gap:+6.2f} pt   {'OK' if gap > 0 else '★接触'}")
            if gap <= 0:
                ng += 1

    print("\n" + "-" * 78)
    print("ルート定数の静的検算（8定数すべて。実データが来て初めて使われる4つを含む）")
    print("-" * 78)
    ng += len(static_check(io.open(ROUTE, encoding="utf-8").read()))

    print("\n" + "=" * 78)
    if ng:
        print(f"判定: ★NG {ng} 件")
        sys.exit(1)
    print("判定: OK — 4語すべて、8定数すべてで隣に触れていない")
    print("CHOICE_CLEARANCE_OK")
