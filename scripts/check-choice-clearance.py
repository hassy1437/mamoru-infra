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
    # ★2026-10-06（#19）: 点検種別の○を描き始めた様式のうち、行の高さが 13.5〜15pt しかない 3 様式。
    #   罫線と語の間は 11の1 が 0.85pt・15 が 0.73pt・14 が 1.57pt。solve-choice-circle-geometry.py は
    #   「重なり0が見つからない」。縦の中心も ±1.5pt 動かして探しても最小 2〜51px 残った（その最小の値を採った）。
    #   ★○を描かない（＝提出書類で点検種別が分からない）より、わずかに触れても○がある方を選んだ。
    ("jidou-kasai-houchi-bekki11-1", 1, "機器"),
    ("jidou-kasai-houchi-bekki11-1", 1, "総合"),
    ("emergency-alarm-bekki14", 1, "機器"),
    ("emergency-alarm-bekki14", 1, "総合"),
    ("evacuation-equipment-bekki15", 1, "機器"),
    ("evacuation-equipment-bekki15", 1, "総合"),
    # ★2026-11-11（全機能チェック 47）: 隙間 CLEAR_PX を求めるようにして、隙間を残せなくなった 5 つ。
    #   どれも★刷り込みには重ならない（線を 0.5pt にし、solve-choice-circle-geometry.py が解いた）。
    #   行の高さ 11〜13pt に字の高さ 約 10pt の欄で、上下の罫線まで 0.17pt を残す置き方が無い。
    #   ★上の 12 個のうち 第14 の機器・総合／第7・第8・第2 の兼用 の 5 つも、重ならない位置まで直した（隙間は残せない）。
    ("emergency-alarm-bekki14", 1, "再鳴動"),
    ("halogen-bekki7", 2, "専用"),
    ("inert-gas-bekki6", 1, "機器"),
    ("powder-bekki8", 2, "専用"),
    ("shokasen-bekki2", 3, "専用"),
}
KNOWN_TIGHT_REASON = (
    "★罫線が語から 0.8pt 以内にあり、語を囲みながら罫線から隙間（CLEAR_PX）を残すことが"
    "物理的に成立しない欄（2026-08-25・2026-11-11 に探索で確認）。"
    "○を描かない（＝選んだ値が分からない）より、わずかに触れても○がある方を選んだ"
)

# ★重なりの下限。check-printed-overlap と同じ考え方（ノイズ床が無いので 1px）。
#   ★ここを緩めると「かすっている」を見逃す。緩めるなら理由を書くこと。
INK_LIMIT = 1

# ★○の線と刷り込みのインクの間に必ず残す隙間（2026-11-11・全機能チェック 47）。
#   ★それまでは「重ならない」だけを見ていて、隙間 0（線と罫線がぴったり接する）でも通っていた。
#     1200dpi で測ると、描く○ 88 個のうち 54 個が刷り込みから 0.3pt 未満・17 個は重なっていた
#     （432dpi では 1px に満たない重なりが「0」に丸まって見えていた）。印字では「罫線に触れている」と見える。
#   ★刷り込みのインクをこの画素数だけ太らせてから重ねる。432dpi で 1px ＝ 0.167pt（1200dpi の印字で約 3 ドット）。
#   ★2px（0.33pt）も試したが、線を細くしても 21 個が囲めなかった（1px なら 17 個・ほぼ行の高さが足りない欄）。
#   ★緩めるなら理由を書くこと。
CLEAR_PX = 1


def _helpers_src():
    return io.open("src/lib/pdf-form-helpers.ts", encoding="utf-8").read()


def circle_border() -> float:
    """選択肢の○の線の太さ（pdf-form-helpers.ts の CHOICE_CIRCLE_BORDER）。★写しを持たない。"""
    m = re.search(r"export const CHOICE_CIRCLE_BORDER\s*=\s*([\d.]+)", _helpers_src())
    if not m:
        raise SystemExit("★pdf-form-helpers.ts に CHOICE_CIRCLE_BORDER が見つからない")
    return float(m.group(1))


# ★選択肢の○の線の太さ（2026-11-11・全機能チェック 47）。0.7〜0.8 → 0.5。
#   ★線が太いほど、同じ○でも罫線までの隙間が減る。★全様式で 1 つの値（様式ごとに渡さない）。
CIRCLE_BORDER = circle_border()


def call_constants(src):
    """drawChoiceCircle(page{n}, ..., [ {label,cx,cy,rx,ry}, ... ]) を読む。

    ★配列の開始は「[ の直後に { label:」だけを狙う。素朴に最初の [ を掴むと
      呼び出し引数の p2Rows[5] の括弧を拾う（bekki11-1 で実際に踏み、
      定数の一括置換がルートの引数列を破壊した。tsc が検出）。
    """
    out = []
    # ★page に番号が付かない呼び方もある（drawChoiceCircle(page, ...) ＝ 1頁目）。
    #   ★2026-08-25 まで番号付きしか読んでおらず、★bekki18 の定数を丸ごと
    #     飛ばしていた（★5つ目の穴。生成PDFでは 2px 出ていたのに静的では無傷に見えた）。
    #   ★読み落としは下の call_sites_ok() が件数で捕まえる。
    for m in re.finditer(r"drawChoiceCircle\(\s*page(\d?)", src):
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
            out.append((int(m.group(1)) if m.group(1) else 1, marks))
    return out


def direct_constants(src):
    """★drawChoiceCircle を通さず drawEllipse で描く選択肢の○（const TYPE_CHOICES = [...]・1 頁目の見出し）。

    ★2026-11-11（全機能チェック 47）まで、この○は静的検査の外だった（check-circle-coverage の「届いていない○」）。
      第11の2「総合」は刷り込みに重なっていた。★定数の形は drawChoiceCircle と同じなので、同じ物差しで見る。
    """
    m = re.search(r"const TYPE_CHOICES\s*=\s*\[", src)
    if not m:
        return []
    j = src.find("\n]", m.end())
    marks = []
    for mm in re.finditer(
        r'label:\s*"([^"]+)"\s*,\s*cx:\s*([\d.]+)\s*,\s*cy:\s*([\d.]+)\s*,'
        r'\s*rx:\s*([\d.]+)\s*,\s*ry:\s*([\d.]+)', src[m.end():j],
    ):
        marks.append((mm.group(1), *(float(mm.group(k)) for k in (2, 3, 4, 5))))
    return [(1, marks)] if marks else []


def call_tails(src):
    """drawChoiceCircle(...) の、選択肢の配列より後ろ（線の太さ・at）"""
    out = []
    for m in re.finditer(r"drawChoiceCircle\(", src):
        depth = 0
        for j in range(m.end() - 1, len(src)):
            if src[j] == "(":
                depth += 1
            elif src[j] == ")":
                depth -= 1
                if depth == 0:
                    break
        call = src[m.start():j]
        out.append(call[call.rfind("]") + 1:])
    return out


def all_constants(src):
    """静的に見る○の定数（drawChoiceCircle の呼び出し＋直接描く TYPE_CHOICES）"""
    return call_constants(src) + direct_constants(src)


def has_choice_circles(src) -> bool:
    return "drawChoiceCircle(" in src or bool(direct_constants(src))


def call_sites_ok() -> list[str]:
    """★drawChoiceCircle の呼び出しを1つも読み落としていないこと。

    ★正規表現で拾う形は「書き方が変わると黙って飛ばす」。
      ★実際に踏んだ: page に番号が付かない呼び方を読めていなかった。
    ＝ ★「ソース中の呼び出しの数」と「読めた数」を突き合わせる。
    """
    bad = []
    for route in sorted(glob.glob("src/app/api/*-pdf/route.ts")):
        src = io.open(route, encoding="utf-8").read()
        calls = len(re.findall(r"drawChoiceCircle\s*\(", src))
        if calls == 0:
            continue
        read = len(call_constants(src))
        name = os.path.basename(os.path.dirname(route))
        if read != calls:
            bad.append(f"{name}: 呼び出し {calls} 件のうち★読めたのは {read} 件")
        # ★線の太さを呼び出しごとに渡さない（検査も解く道具も CHOICE_CIRCLE_BORDER で測る・2026-11-11）
        for tail in call_tails(src):
            mm = re.match(r"\s*,\s*([\d.]+)", tail)
            if mm:
                bad.append(f"{name}: drawChoiceCircle に線の太さ {mm.group(1)} を渡している（既定の CHOICE_CIRCLE_BORDER に揃える）")
    # ★直接描く選択肢の○も、線の太さは同じ値（CHOICE_CIRCLE_BORDER）を使う
    for route in sorted(glob.glob("src/app/api/*-pdf/route.ts")):
        src = io.open(route, encoding="utf-8").read()
        if direct_constants(src) and "borderWidth: CHOICE_CIRCLE_BORDER" not in src:
            bad.append(f"{os.path.basename(os.path.dirname(route))}: TYPE_CHOICES の○の線の太さが CHOICE_CIRCLE_BORDER でない")
    return bad


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


def dilate(mask, r):
    """インクを r 画素だけ太らせる（円盤）。★隙間 CLEAR_PX を「太らせた刷り込みに重ならない」で見るため"""
    if r <= 0:
        return mask
    h, w = mask.shape
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if (dx == 0 and dy == 0) or dx * dx + dy * dy > r * r:
                continue
            sh = np.zeros_like(mask)
            sh[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = \
                mask[max(0, -dy):h + min(0, -dy), max(0, -dx):w + min(0, -dx)]
            out |= sh
    return out


_TPL_CACHE = {}


def tpl_ink(tpl_page, clear=None):
    """刷り込みのインク（clear 画素だけ太らせたもの）。★定数ごとに描き直すと遅いので頁ごとに覚える"""
    clear = CLEAR_PX if clear is None else clear
    key = (tpl_page.parent.name, tpl_page.number, clear)
    if key not in _TPL_CACHE:
        _TPL_CACHE[key] = dilate(_ink(tpl_page), clear)
    return _TPL_CACHE[key]


def circle_overlap_px(tpl_page, cx, cy, rx, ry, border=None, clear=None):
    """その○を描いたとき、刷り込みのインク（clear 画素だけ太らせたもの）と何画素重なるか。

    ★ルートと同じ描き方（drawEllipse 相当・線だけ・塗り無し）で、
      ★白紙に描いて重ねる。テンプレートに直接描くと、
      ★刷り込みのインクと区別がつかなくなる。
    ★既定は CIRCLE_BORDER と CLEAR_PX（＝隙間を残せているか）。clear=0 で「重なるか」だけを見る。
    """
    border = CIRCLE_BORDER if border is None else border
    tpl_mask = tpl_ink(tpl_page, clear)
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
        if not has_choice_circles(src):
            continue
        name = os.path.basename(os.path.dirname(route)).replace("generate-", "").replace("-pdf", "")
        tpl = template_of(route)
        if not tpl:
            raise SystemExit(f"★{name}: テンプレートPDFを特定できない")
        doc = fitz.open(tpl)
        for pno, marks in all_constants(src):
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
                            f"{name} p{pno}「{label}」: ★○が刷り込みに重なる・{CLEAR_PX}px の隙間が無い（{px}px）。"
                            f"縦（cy={cy} ry={ry}）か罫線を見直すこと"
                            "（scripts/solve-choice-circle-geometry.py --apply が解く）")
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
        if not has_choice_circles(src):
            continue
        name = os.path.basename(os.path.dirname(route)).replace("generate-", "").replace("-pdf", "")
        doc = fitz.open(template_of(route))
        for pno, marks in all_constants(src):
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
    # ★隙間の陽性対照（2026-11-11・全機能チェック 47）: ○を少しずつ縦に広げ、
    #   「まだ重ならない（clear=0 で 0）のに、隙間が無い（CLEAR_PX で 1 以上）」所で検出すること。
    #   ★ここが取れないなら、隙間を見ていない（＝接するだけの○を通す）
    ok_c = False
    for pno, ms in marks:
        if pno != 1:
            continue
        for label, cx, cy, rx, ry in ms:
            for k in range(1, 60):
                r2 = ry + 0.02 * k
                raw = circle_overlap_px(page, cx, cy, rx, r2, clear=0)
                if raw >= INK_LIMIT:
                    break
                if circle_overlap_px(page, cx, cy, rx, r2) >= INK_LIMIT:
                    ok_c = True
                    break
            if ok_c:
                break
        break
    doc.close()
    if not ok_v:
        print("自己診断: ★ry を +6pt 太らせても縦の重なりが増えない（縦を見ていない）")
        return 1
    if not ok_c:
        print("自己診断: ★重ならないが隙間の無い○を検出できない（隙間を見ていない）")
        return 1

    print(f"  陽性対照1: bekki5「専用」の rx を +40pt → 横の検査が反応（{len(before)} → 増えた）")
    print("  陽性対照2: ★ry を +6pt → 縦の重なりが増える（縦を見ている）")
    print(f"  陽性対照3: ★重ならないが {CLEAR_PX}px の隙間が無い○ → 検出（隙間を見ている）")
    print("SELF_TEST_OK")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    # ★呼び出しを1つも読み落としていないこと（★正規表現で拾う形の弱点を塞ぐ）
    missed = call_sites_ok()
    if missed:
        print("★drawChoiceCircle の呼び出しを読み落としている:")
        for m in missed:
            print("   ", m)
        print("   ★call_constants の読み方を直すこと。★読めていない定数は検査されない。")
        sys.exit(1)

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
