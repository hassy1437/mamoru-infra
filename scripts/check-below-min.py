# 絶対下限（ABSOLUTE_MIN_FONT_SIZE）を割って描かれた項目が、現実値セットに無いことを検査する。
#
# ■ なぜ「第3の条件」が要るか
#   ⑧は切り詰め（エラー）、⑨は設計値からの逸脱（警告・閾値30%）。
#   その2つの間に落ちるものがある:
#     - 設計値そのものが下限未満（実測: bekki22 の4欄が 4.8pt。逸脱0%なので⑨に出ない）
#     - 逸脱が閾値未満のまま床を割る（実測: bekki5 圧力スイッチ 21.9%縮小で 4.53pt）
#     - buildShrinkWarning は純数値を除外する（実測: 報告書の延べ面積 4.19pt が出なかった）
#   ＝ 相対の網と絶対の床が接続されておらず、隙間に落ちたものが
#      判読困難なサイズのまま黙って法定書類に出ていた。
#
# ■ なぜ現実値セットだけか
#   長文セットは意図的に限界を試すデータで、実測 501 件が下限を割る（2026-08-01 再計測）。
#   それをゲートにすると常時赤になり、検出器が死ぬ（＝誤検出も検出器を殺す）。
#   守るのは「実際に提出される値で判読できること」なので現実値セットを使う。
#   ★ただし長文セットのうち「NUMERIC_ROWS で宣言された欄の中」だけは 2 件しかないので、
#     そこだけ別のゲート（KNOWN_JP_UNFIT）として載せている。下の節を参照。
#
# ■ KNOWN_UNFIT
#   幾何的に解けないと確認済みのものだけを、理由つきで明示的に除外する。
#   ★暗黙に無視しない。件数が増えたら落ちるし、
#     直った（もう出なくなった）のに載ったままでも落ちる（両方向）。
#
# 使い方: python scripts/check-below-min.py [--self-test]
import glob
import io
import os
import re
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OVERLAY_FONT_HINTS = ("NotoSansJP", "Helvetica", "Arial")
REALISTIC = os.path.join(ROOT, "tmp", "pdf-realistic", "*.pdf")

# ★閾値はコードから読む。ここに数値を書くと実装とズレたことに気づけない。
_helpers = io.open(os.path.join(ROOT, "src", "lib", "pdf-form-helpers.ts"), encoding="utf-8").read()
_m = re.search(r"export const ABSOLUTE_MIN_FONT_SIZE = ([\d.]+)", _helpers)
if not _m:
    print("★NG: ABSOLUTE_MIN_FONT_SIZE を読み取れない（実装の書式が変わった）")
    sys.exit(1)
MIN_SIZE = float(_m.group(1))

# 幾何的に解けないと確認済みのもの。(PDF名, ページ, 内容) で照合する。
KNOWN_UNFIT = {
    ("bekki3_test.pdf", 2, "1800"):
        "別記様式第3 ポンプ性能の吐出量。刷り込み「MPa ___ L/min」の空欄はテンプレート実測で "
        "10.56pt しかなく、4桁は 5.0pt 以上では物理的に入らない（4×0.556em×5.0pt = 11.12pt）。"
        "刷り込みが両端を規定しており広げようが無い。実務でどう記入するかを要確認。",
}


# ── 長文セットの「文字種由来」だけをゲートに載せる ──────────────────────────
#
# ■ なぜ長文セット全部を条件にできないか
#   長さ由来の下限割れが実測 500 件出る。それをゲートにすると常時赤で検出器が死ぬ。
#
# ■ なぜ文字種由来だけなら載せられるか
#   数値欄に和文を入れる軸（lib-numeric-rows.mjs の NUMERIC_JP_STANDARD）が生む
#   下限割れは実測 1 件しかない。長さの軸とは別の穴で、いまどのゲートにも掛かっていない。
#
# ■ 由来の決め方（★文字列一致で決めない）
#   「その描画が NUMERIC_ROWS で宣言された欄の中にあるか」を座標で判定する。
#   以前は値の文字列（「不明」）で分けていたが、fixture 側に同じ語が入った瞬間に壊れる。
#   宣言（様式・欄・行）とセル矩形は実装から導けるので、そちらを根拠にする。
STRESS = os.path.join(ROOT, "tmp", "pdf-test-*", "*.pdf")

# 幾何的に解けないと確認済みの「文字種由来」。(PDF名, ページ, 内容) で照合する。
KNOWN_JP_UNFIT = {
    ("bekki12_test.pdf", 2, "不明"):
        "別記様式第12 感度範囲「－ __ ％ ～ ＋ __ ％」。空欄は実測 10.56pt（paddingX 1.0 で "
        "使える幅 8.56pt）で、左「－」・右「％～＋」が 0.00pt まで接しており広げようが無い。"
        "和文2字は 4.28pt でしか入らない。数値2桁を前提にした欄なので、"
        "和文を書かせるなら様式側の運用（別欄に記載）を決める必要がある。",
    ("bekki3_test.pdf", 2, "1800"):
        "別記様式第3 ポンプ性能の吐出量。現実値セットの KNOWN_UNFIT と同一の欠陥"
        "（空欄 10.56pt に4桁が入らない）。★この矩形ゲートは『宣言された数値欄の中の下限割れ』を"
        "見るので、文字種由来だけでなく長さ由来もここに入る。両方とも同じ幾何の問題なので"
        "分けずに扱う。",
}


def numeric_cell_rects():
    """NUMERIC_ROWS で宣言された欄の矩形を、実装から導く。
    返り値: {PDF名: [(page, x0, x1, y0, y1), ...]}"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from classify_numeric_rows_lib import call_sites  # noqa: E402

    out = {}
    for route in sorted(glob.glob(os.path.join(ROOT, "src/app/api/*/route.ts"))):
        src = io.open(route, encoding="utf-8").read()
        decl = re.search(r"export const NUMERIC_ROWS[^=]*=\s*\{([\s\S]*?)\n\}", src)
        if not decl:
            continue
        rows_by_key = {}
        for m in re.finditer(r"(page\d+_rows)\s*:\s*\[([^\]]*)\]", decl.group(1)):
            rows_by_key[m.group(1)] = {int(x) for x in re.findall(r"\d+", m.group(2))}
        dirname = os.path.basename(os.path.dirname(route))
        m = re.search(r"bekki([\d-]+)$", dirname.replace("-pdf", ""))
        if not m:
            continue
        pdf = "bekki" + m.group(1).replace("-", "_") + "_test.pdf"
        rel = os.path.relpath(route, ROOT).replace("\\", "/")
        for c in call_sites(rel):
            want = rows_by_key.get(c["key"])
            if not want or not c["bounds"]:
                continue
            for r in want:
                i = r - c["start"]
                if not (0 <= i < len(c["bounds"]) - 1):
                    continue
                # ★x は内容列。専用コードが描く狭いセルも内容列の内側にある（実測で確認）。
                out.setdefault(pdf, []).append(
                    (c["page"], c["cx"], c["cx"] + c["cw"], c["bounds"][i], c["bounds"][i + 1]))
    return out


def scan_stress():
    """長文セットのうち、宣言された数値欄の中で下限を割ったものだけを返す"""
    rects = numeric_cell_rects()
    hits = []
    files = sorted(glob.glob(STRESS))
    for f in files:
        name = os.path.basename(f)
        cells = rects.get(name)
        if not cells:
            continue
        doc = fitz.open(f)
        for pno in range(doc.page_count):
            for b in doc[pno].get_text("dict")["blocks"]:
                for l in b.get("lines", []):
                    for s in l["spans"]:
                        if not any(h in s["font"] for h in OVERLAY_FONT_HINTS):
                            continue
                        if s["size"] >= MIN_SIZE - 1e-6:
                            continue
                        t = s["text"].strip()
                        if not t:
                            continue
                        x0, y0, x1, y1 = s["bbox"]
                        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
                        if any(pno + 1 == p and px0 - 1 <= cx <= px1 + 1 and py0 - 1 <= cy <= py1 + 1
                               for p, px0, px1, py0, py1 in cells):
                            hits.append((name, pno + 1, t, round(s["size"], 2)))
        doc.close()
    return files, hits


def audit_stress():
    files, hits = scan_stress()
    seen = {(f, p, t) for f, p, t, _ in hits}
    problems = []
    for f, p, t, size in hits:
        if (f, p, t) in KNOWN_JP_UNFIT:
            continue
        problems.append(f"[文字種由来] {f} p{p} 「{t[:24]}」 {size}pt が下限 {MIN_SIZE}pt を割っている")
    for key in KNOWN_JP_UNFIT:
        if key not in seen:
            problems.append(
                f"[文字種由来] {key[0]} p{key[1]} 「{key[2]}」 は KNOWN_JP_UNFIT にあるが、"
                "もう下限を割っていない（直ったなら一覧から消すこと）")
    return files, hits, problems


def scan():
    hits = []
    files = sorted(glob.glob(REALISTIC))
    if not files:
        print(f"★NG: 現実値セットが見つからない（{REALISTIC}）。先に生成すること")
        sys.exit(1)
    for f in files:
        doc = fitz.open(f)
        for pno in range(doc.page_count):
            for b in doc[pno].get_text("dict")["blocks"]:
                for l in b.get("lines", []):
                    for s in l["spans"]:
                        if not any(h in s["font"] for h in OVERLAY_FONT_HINTS):
                            continue
                        if s["size"] >= MIN_SIZE - 1e-6:
                            continue
                        t = s["text"].strip()
                        if not t:
                            continue
                        hits.append((os.path.basename(f), pno + 1, t, round(s["size"], 2)))
        doc.close()
    return files, hits


def audit():
    files, hits = scan()
    seen = {(f, p, t) for f, p, t, _ in hits}
    problems = []
    for f, p, t, size in hits:
        if (f, p, t) in KNOWN_UNFIT:
            continue
        problems.append(f"{f} p{p} 「{t[:24]}」 {size}pt が下限 {MIN_SIZE}pt を割っている")
    for key in KNOWN_UNFIT:
        if key not in seen:
            problems.append(
                f"{key[0]} p{key[1]} 「{key[2]}」 は KNOWN_UNFIT にあるが、もう下限を割っていない"
                "（直ったなら一覧から消すこと）")
    return files, hits, problems


if __name__ == "__main__":
    files, hits, problems = audit()
    if "--self-test" in sys.argv:
        if problems:
            print("自己診断: 現状が既にNG（陰性対照が成立しない）")
            for p in problems:
                print("   ", p)
            sys.exit(1)
        # 陽性対照1: 既知の1件を一覧から外すと「想定外の下限割れ」で落ちるか
        victim = next(iter(KNOWN_UNFIT))
        saved = KNOWN_UNFIT.pop(victim)
        got1 = any("下限" in p and "KNOWN_UNFIT" not in p for p in audit()[2])
        KNOWN_UNFIT[victim] = saved
        # 陽性対照2: 起きていないものを一覧に載せると落ちるか
        KNOWN_UNFIT[("no_such_file.pdf", 9, "存在しない値")] = "陽性対照"
        got2 = any("もう下限を割っていない" in p for p in audit()[2])
        del KNOWN_UNFIT[("no_such_file.pdf", 9, "存在しない値")]
        if not got1:
            print("自己診断: 既知の1件を外しても検出できない")
            sys.exit(1)
        if not got2:
            print("自己診断: 起きていないものを一覧に載せても検出できない")
            sys.exit(1)
        # ── 文字種ゲート（長文セット・宣言された数値欄の中）も両方向で見る
        sfiles, shits, sproblems = audit_stress()
        if sproblems:
            print("自己診断: 文字種ゲートが現状で既にNG（陰性対照が成立しない）")
            for p in sproblems:
                print("   ", p)
            sys.exit(1)
        jvictim = ("bekki12_test.pdf", 2, "不明")
        if jvictim not in KNOWN_JP_UNFIT:
            print("自己診断: 陽性対照に使う既知（bekki12 の1件）が一覧に無い")
            sys.exit(1)
        jsaved = KNOWN_JP_UNFIT.pop(jvictim)
        got3 = any("bekki12" in p and "下限" in p for p in audit_stress()[2])
        KNOWN_JP_UNFIT[jvictim] = jsaved
        KNOWN_JP_UNFIT[("no_such_file.pdf", 9, "存在しない値")] = "陽性対照"
        got4 = any("もう下限を割っていない" in p for p in audit_stress()[2])
        del KNOWN_JP_UNFIT[("no_such_file.pdf", 9, "存在しない値")]
        if not got3:
            print("自己診断: 文字種ゲート — bekki12 の1件を一覧から外しても捕まえられない")
            sys.exit(1)
        if not got4:
            print("自己診断: 文字種ゲート — 起きていないものを載せても検出できない")
            sys.exit(1)
        print(f"  陰性対照: 現実値セット {len(files)} 件 / 下限割れ {len(hits)} 件 → 全て KNOWN_UNFIT と一致")
        print("  陽性対照: 既知を一覧から外す → 検出 / 起きていないものを載せる → 検出")
        print(f"  陰性対照(文字種): 長文セット {len(sfiles)} 件 / 宣言欄の中の下限割れ {len(shits)} 件 → 全て既知")
        print("  陽性対照(文字種): bekki12 を外す → 検出 / 起きていないものを載せる → 検出")
        print("SELF_TEST_OK")
        sys.exit(0)

    sfiles, shits, sproblems = audit_stress()
    problems = problems + sproblems
    print(f"現実値セット {len(files)} 件を検査 / 下限 {MIN_SIZE}pt 未満の描画 {len(hits)} 件"
          f"（うち既知 {len(KNOWN_UNFIT)} 件）")
    print(f"長文セット {len(sfiles)} 件のうち★文字種由来（NUMERIC_ROWS 宣言欄の中）: {len(shits)} 件"
          f"（うち既知 {len(KNOWN_JP_UNFIT)} 件）")
    for f, p_, t, size in sorted(shits, key=lambda x: x[3]):
        print(f"  {'既知' if (f, p_, t) in KNOWN_JP_UNFIT else '★'} [文字種] {f} p{p_} {size}pt 「{t[:24]}」")
    for f, p, t, size in sorted(hits, key=lambda x: x[3]):
        mark = "既知" if (f, p, t) in KNOWN_UNFIT else "★"
        print(f"  {mark} {f} p{p} {size}pt 「{t[:24]}」")
    if problems:
        print("\n★NG:")
        for p in problems:
            print("   ", p)
        sys.exit(1)
    print("\nBELOW_MIN_OK")
