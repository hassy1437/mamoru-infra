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
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify_numeric_rows_lib import template_of  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

# 刷り込み語を探す縦の許容幅（cy はグリフの上下中央付近を指す）
BAND = 9.0

# ★既知の例外（2026-08-25 確定）。★名指しで登録する。
#
# ■ ★なぜ例外にするか
#   この6つの欄は★罫線が語から 0.8pt 以内にある。
#   ＝ ★語を囲みながら罫線に触れないことが★物理的に成立しない。
#   ★探索でも「重なり0になる組み合わせが見つからない」と出た
#   （scripts/solve-choice-circle-geometry.py）。
#
# ■ ★「6件までなら何でもよい」にしない
#   ★様式・頁・語で名指しする。★別の場所が新しく重なったら落ちる。
#   ★件数も固定する。★増えたら落ちる。
#
# ■ ★なぜ「赤のまま」にしないか
#   ★常に赤いと、本物の失敗が埋もれる。
#   ★今日「未適用なら落とさない」「MARK_ONLY を除外しない」でも同じ判断をした。
#
# ■ ★これを消してよいとき
#   ★様式のテンプレートが変わって、罫線と語の間隔が広がったとき。
#   ★そのときは solve-choice-circle-geometry.py が解を出せるようになる。
KNOWN_TIGHT_CELLS = {
    ("halogen-bekki7", 2, "兼用"),
    ("powder-bekki8", 1, "全域"),
    ("powder-bekki8", 1, "局所"),
    ("powder-bekki8", 1, "移動"),
    ("powder-bekki8", 2, "兼用"),
    ("shokasen-bekki2", 3, "兼用"),
}
KNOWN_TIGHT_REASON = (
    "★罫線が語から 0.8pt 以内にあり、語を囲みながら罫線に触れないことが"
    "物理的に成立しない欄（2026-08-25 に探索で確認）"
)

# ★重なりの下限。check-printed-overlap と同じ考え方（ノイズ床が無いので 1px）。
#   ★ここを緩めると「かすっている」を見逃す。緩めるなら理由を書くこと。
INK_LIMIT = 1


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


# ★2026-08-25 に足した（★穴2）。それまで★横しか見ていなかった。
#   ・cx±rx が語を包含するか
#   ・左右の隣の語に触れないか
#   ＝ ★縦（cy・ry）を1度も見ておらず、★罫線も見ていなかった。
#     実際に「○の下側が次の行の刷り込みを突き抜ける」「○が縦罫線を跨ぐ」が
#     ★44箇所あった（check-printed-overlap で実測）。
#
# ★ここでは「インクが重なるか」で見る。check-printed-overlap と★同じ基準。
#   ★生成PDFでは1セルに1つしか丸が付かないので、★踏めない定数が必ず残る。
#   ＝ ★定数を1つずつ自前で描いて、テンプレートのインクと重ねる。
DRAW_SCALE = 6.0     # 432dpi。check-printed-overlap と同じ
DRAW_DARK = 160


def _ink(page, scale=DRAW_SCALE):
    pm = page.get_pixmap(matrix=fitz.Matrix(scale, scale),
                         colorspace=fitz.csGRAY, alpha=False)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.stride)[:, : pm.width]
    return a < DRAW_DARK


def circle_overlap_px(tpl_page, cx, cy, rx, ry, border=0.7):
    """その○を描いたとき、刷り込みのインクと何画素重なるか。

    ★ルートと同じ描き方（drawEllipse 相当・線だけ・塗り無し）で、
      ★白紙に描いて重ねる。テンプレートに直接描くと、
      ★刷り込みのインクと区別がつかなくなる。
    """
    tpl_mask = _ink(tpl_page)
    blank = fitz.open()
    pg = blank.new_page(width=tpl_page.rect.width, height=tpl_page.rect.height)
    # ★cy はルートと同じく「上からの座標」。pdf-lib 側は pageHeight - cy を渡すので、
    #   ★PyMuPDF の座標系（上原点）ではそのまま cy でよい。
    pg.draw_oval(fitz.Rect(cx - rx, cy - ry, cx + rx, cy + ry),
                 color=(0, 0, 0), fill=None, width=border)
    mask = _ink(pg)
    blank.close()
    h = min(mask.shape[0], tpl_mask.shape[0])
    w = min(mask.shape[1], tpl_mask.shape[1])
    return int((mask[:h, :w] & tpl_mask[:h, :w]).sum())


def audit():
    """(問題, 検査した定数の数, 既知の例外) を返す"""
    problems, total, known = [], 0, []
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
                # ★インクで見る（縦も罫線もこれ1本で捕まる）。
                #   ★横の包含・隣接の検査は残す ―― あちらは「隣の語と紛れないか」で、
                #     ★意味が違う（触れていなくても近すぎれば紛れる）。
                px = circle_overlap_px(page, cx, cy, rx, ry)
                if px >= INK_LIMIT:
                    if (name, pno, label) in KNOWN_TIGHT_CELLS:
                        known.append(f"{name} p{pno}「{label}」({px}px)")
                    else:
                        problems.append(
                            f"{name} p{pno}「{label}」: ★○が刷り込みに重なる（{px}px）。"
                            f"縦（cy={cy} ry={ry}）か罫線を見直すこと")
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
    return problems, total, known


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
    """★陽性対照だけで成立する形にする（2026-08-25）。

    ★以前は「★現状にNGが無いこと」を陰性対照にしていた。
      ★縦と罫線を見るようにしたら★実際の欠陥が45件出て、
      ★陰性対照が成立しなくなった（＝自己診断そのものが回らない）。
    ＝ ★「現状が綺麗か」ではなく★「壊したら**増える**か」で見る。
      ★これなら、直している途中でも自己診断が回る。
    ★直し終えて0件になったら、★陰性対照（現状0件）も足し直してよい。
    """
    before, total, _known = audit()
    print(f"  現状: 定数 {total} 個中 {len(before)} 件が NG（★直している途中は 0 でなくてよい）")
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
        after, _t, _k = audit()
        # ★横（接触・包含）で増えること
        if len(after) <= len(before):
            print(f"自己診断: rx を +40pt 太らせても NG が増えない（{len(before)} → {len(after)}）")
            return 1
        if not any("接触" in p or "包含していない" in p for p in after):
            print("自己診断: rx を +40pt 太らせても、横の検査が反応しない")
            return 1
    finally:
        io.open(victim, "w", encoding="utf-8", newline="").write(orig)

    # ★縦の陽性対照。★横だけ見ていたのが穴だったので、★縦でも増えることを見る。
    #   ★ファイルを触らずに測る（インクの重なりを直に見る関数がある）。
    doc = fitz.open(template_of("src/app/api/generate-foam-bekki5-pdf/route.ts"))
    page = doc[0]
    marks = call_constants(io.open(
        "src/app/api/generate-foam-bekki5-pdf/route.ts", encoding="utf-8").read())
    ok_v = False
    for pno, ms in marks:
        if pno != 1:
            continue
        for label, cx, cy, rx, ry in ms:
            base = circle_overlap_px(page, cx, cy, rx, ry)
            fat = circle_overlap_px(page, cx, cy, rx, ry + 6.0)   # ★縦にだけ太らせる
            if fat > base:
                ok_v = True
                break
        break
    doc.close()
    if not ok_v:
        print("自己診断: ★ry を +6pt 太らせても縦の重なりが増えない（縦を見ていない）")
        return 1

    print(f"  陽性対照1: bekki5「専用」の rx を +40pt → 横の検査が反応（{len(before)} → 増えた）")
    print("  陽性対照2: ★ry を +6pt → 縦の重なりが増える（縦を見ている）")
    print("SELF_TEST_OK")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    problems, total, known = audit()
    if "--margins" in sys.argv:
        print(f"{'様式':<28}{'p':<3}{'語':<8}{'左隣まで':>10}{'右隣まで':>10}")
        for name, pno, label, gl, gr in margins():
            f = lambda v: "   ----" if v is None else f"{v:+7.2f}"
            print(f"{name:<28}{pno:<3}{label:<8}{f(gl):>10}{f(gr):>10}")
        print()
    print(f"drawChoiceCircle の定数 {total} 個を検査")

    # ★既知の例外は、件数と顔ぶれの両方を固定する。
    #   ★増えたら落ちる。★名指しの登録に無いものが来ても落ちる（上の分岐）。
    #   ★減ったときも落とす ―― 直ったなら★登録から消すのが正しい。
    #     消さずに置くと「例外がある」という誤った記録が残る。
    if len(known) != len(KNOWN_TIGHT_CELLS):
        print(f"★既知の例外の件数が合わない（登録 {len(KNOWN_TIGHT_CELLS)} / 実際 {len(known)}）")
        for k in known:
            print("   ", k)
        print("   ", KNOWN_TIGHT_REASON)
        print("   ★増えたなら、その欄を直すこと。★減ったなら KNOWN_TIGHT_CELLS から消すこと。")
        sys.exit(1)
    if known:
        print(f"  既知の例外 {len(known)} 件（★件数と顔ぶれを固定している）:")
        for k in known:
            print("     ", k)
        print("   ", KNOWN_TIGHT_REASON)

    if problems:
        print("★NG:")
        for p in problems:
            print("   ", p)
        sys.exit(1)
    print("CHOICE_CLEARANCE_OK")
