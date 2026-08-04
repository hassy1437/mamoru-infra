#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
見出し行の三者整合検査（ラベル配列 ↔ blankPrintedRows ↔ テンプレートの罫線）

■ なぜこの検査が要るのか
  bekki1 その2 と bekki20 その3 で、点検項目と点検結果が1行ずれたまま
  消防署に提出される PDF が作られていた。★どちらもベースライン照合（52件）を
  すり抜けている。理由は原理的なもので、

      刷り込みは payload.pageN_rows[i] を ROW_BOUNDS[i] の位置に描く。
      ラベル配列は「入力画面の行名」と「⑧のエラー文言」にしか使われない。

  つまり ラベル配列が1つ多い/少ないと、業者が画面で「液面表示」に入れた値が
  紙では「本体容器・内筒等」の行に出る。★描かれるピクセルは以前と1ドットも
  変わらないので、画像を突き合わせても永久に検出できない。
  検出できるのは「テンプレートの帯の数」という外部の事実と突き合わせたときだけ。

■ 検査する不変条件
  1. ラベル配列の長さ == テンプレートの帯（行）の数
  2. ラベルが「見出し行」と宣言している行は blankPrintedRows に入っている
     （入っていない＝入力欄が生きていて、見出しの刷り込みに重ねて印字される）
  3. blankPrintedRows の index はラベル配列の範囲内

■ 測定器の検算（★これが無いと「壊れた物差しで測って緑」になる）
  既知の正解 2 件を毎回測り、合わないなら不変条件の判定に入らず落ちる。
      別記様式第1  page2 : 罫線 22 本 / 帯 21
      別記様式第8  page1 : 罫線 40 本 / 帯 39

実行:
  python scripts/check-header-rows.py
  python scripts/check-header-rows.py --self-test
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import fitz

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
ROUTES = sorted((ROOT / "src" / "app" / "api").glob("generate-*-pdf/route.ts"))
LABELS_TS = ROOT / "src" / "lib" / "bekki-row-labels.ts"

# 測定器の検算に使う既知の正解（手で罫線を数えて確定させた 2 件）。★ここを緩めないこと。
# ★実際の検査と同じ経路（collect() が出した測定値）で検算する。
#   別経路で測ると、検算だけ通って本番の測定が壊れている状態を見逃す。
#   （実際、y 窓を無制限にした検算は表の外の罫線を 8 本拾って 29/47 になった）
MEASURER_CONTROLS = {
    "別記様式第1 page2_rows": (22, 21),
    "別記様式第8 page1_rows": (40, 39),
}

HEADER_MARK = "見出し行"

# ★点検項目の行の型。これ以外の型で宣言された pageN_rows は「対象外」。
#   例: bekki6/7/8 の page5_rows は CylinderRow（容器ごとの表）で、
#   行は容器の通し番号であって点検項目ではない。ラベル配列が存在しないのが
#   設計どおりなので、「ラベルが無い＝未判定」にしてはいけない。
STANDARD_ROW_TYPE = re.compile(r"^Bekki[\w-]*Row$")


# ─────────────────────────────────────────────────────────────
# 測定器: テンプレートの「行区切りの横罫線」を数える
# ─────────────────────────────────────────────────────────────
def _segments(page):
    """描画命令を線分に均す。太さのある矩形も1本の線として扱う。"""
    h_, v_ = [], []
    for it in page.get_drawings():
        for op in it["items"]:
            if op[0] == "l":
                p0, p1 = op[1], op[2]
                if abs(p0.y - p1.y) < 0.9:
                    h_.append((round((p0.y + p1.y) / 2, 2), min(p0.x, p1.x), max(p0.x, p1.x)))
                elif abs(p0.x - p1.x) < 0.9:
                    v_.append((round((p0.x + p1.x) / 2, 2), min(p0.y, p1.y), max(p0.y, p1.y)))
            elif op[0] == "re":
                r = op[1]
                if r.height < 1.5:
                    h_.append((round((r.y0 + r.y1) / 2, 2), r.x0, r.x1))
                elif r.width < 1.5:
                    v_.append((round((r.x0 + r.x1) / 2, 2), r.y0, r.y1))
    return h_, v_


def count_bands(page, ylo: float, yhi: float) -> tuple[int, int, list[float]]:
    """
    行区切り＝「ページ右端の縦罫線まで達している横罫線」。
    ★判定欄の x を実装ソースから拾うのは誤り（bekki1 で 317.76 と 323.04 を
      取り違えて 26 件の偽の不一致を出した）。テンプレートの罫線だけから導く。
    返り値 = (罫線の本数, 帯の数)
    """
    h_, v_ = _segments(page)
    if not v_:
        return (0, 0, [])
    right = max(x for x, _, _ in v_)
    ys = sorted(
        y for y, x0, x1 in h_
        if x1 >= right - 2 and x0 <= right - 60 and ylo <= y <= yhi
    )
    # 1.5pt 以内は同じ罫線（二重線・太線の上下辺）とみなす
    clustered: list[float] = []
    for y in ys:
        if not clustered or y - clustered[-1] > 1.5:
            clustered.append(y)
    return (len(clustered), max(len(clustered) - 1, 0), clustered)


def measure(template: str, page_index: int, ylo: float, yhi: float) -> tuple[int, int, list[float]]:
    pdf = ROOT / "public" / "PDF" / template
    if not pdf.exists():
        return (-1, -1, [])
    with fitz.open(pdf) as doc:
        if page_index >= doc.page_count:
            return (-1, -1, [])
        return count_bands(doc[page_index], ylo, yhi)


def run_measurer_selfcheck(judged) -> list[str]:
    by_tag = {p["tag"]: p for p in judged}
    bad = []
    for tag, (want_rules, want_bands) in MEASURER_CONTROLS.items():
        p = by_tag.get(tag)
        if p is None:
            bad.append(f"{tag}: 検算対象が測定できていない（未判定に落ちている）")
            continue
        if (p["rules"], p["bands"]) != (want_rules, want_bands):
            bad.append(
                f"{tag}: 罫線 {p['rules']}/帯 {p['bands']} "
                f"（正解 罫線 {want_rules}/帯 {want_bands}）"
            )
    return bad


# ─────────────────────────────────────────────────────────────
# ソースから読む
# ─────────────────────────────────────────────────────────────
def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def parse_labels() -> dict[str, dict[str, list[str]]]:
    src = LABELS_TS.read_text(encoding="utf-8")
    out: dict[str, dict[str, list[str]]] = {}
    for m in re.finditer(r'"(別記様式第[^"]+)":\s*\{', src):
        form = m.group(1)
        # 対応する } までを深さで切り出す
        i, depth = m.end() - 1, 0
        while i < len(src):
            if src[i] == "{":
                depth += 1
            elif src[i] == "}":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        body = src[m.end():i]
        pages: dict[str, list[str]] = {}
        for pm in re.finditer(r"(page\d+_rows):\s*\[(.*?)\]", body, re.S):
            pages[pm.group(1)] = re.findall(r'"((?:[^"\\]|\\.)*)"', pm.group(2))
        out[form] = pages
    return out


def payload_row_types(route: Path) -> dict[str, str]:
    """payload の型宣言から pageN_rows の要素型を拾う（page1_rows?: Bekki6Row[] → Bekki6Row）"""
    src = strip_comments(route.read_text(encoding="utf-8"))
    return {m.group(1): m.group(2)
            for m in re.finditer(r"(page\d+_rows)\s*\??\s*:\s*(\w+)\s*\[\]", src)}


def form_name_for(route: Path) -> str | None:
    """generate-<slug>-bekki<N>-pdf → 別記様式第<N>（11-1 → 第11の1）。"""
    m = re.search(r"-bekki(\d+)(?:-(\d+))?-pdf$", route.parent.name)
    if not m:
        return None
    return f"別記様式第{m.group(1)}" + (f"の{m.group(2)}" if m.group(2) else "")


def parse_route(route: Path):
    """
    route から (rowsKey, PDFページindex, ROW_BOUNDS, blankPrintedRows の index集合) を拾う。
    ★blankPrintedRows で包んでいない呼び出しは「見出し行の宣言なし」として空集合。
    """
    raw = route.read_text(encoding="utf-8")
    src = strip_comments(raw)

    tm = re.search(r'"public",\s*"PDF",\s*"([^"]+\.pdf)"', src)
    template = tm.group(1) if tm else None

    bounds: dict[str, list[float]] = {}
    for m in re.finditer(r"(\w*P(\d+)_ROW_BOUNDS)\s*(?::[^=]*)?=\s*\[(.*?)\]", src, re.S):
        bounds[m.group(1)] = [float(x) for x in re.findall(r"-?[\d.]+", m.group(3))]

    # ★drawResultRows を起点にしない。bekki1 は共通ヘルパを使わず自前で描いており、
    #   呼び出しを起点にすると bekki1（実際に事故が起きた様式）が丸ごと検査から消える。
    #   起点は P<k>_ROW_BOUNDS そのもの。規約は page<k>_rows / PDFページ k-1 で、
    #   その規約が正しいことは下の「宣言した境界が実測の罫線に載っているか」で毎回確かめる。
    calls = []
    for name, vals in sorted(bounds.items()):
        k = int(re.search(r"P(\d+)_ROW_BOUNDS", name).group(1))
        rows_key = f"page{k}_rows"
        # blankPrintedRows で包んでいるか。
        # ★rowsKey で探してはいけない。bekki5 は `blankPrintedRows(p1Rows5, …)` と
        #   変数を渡しており、rowsKey で探すと「包んでいない」と誤判定する
        #   （実際それで偽の不一致を1件出した）。同じ呼び出しの中を見る。
        blanks: set[int] = set()
        for cm in re.finditer(r"drawResultRows\((.*?)" + name + r"\s*,", src, re.S):
            seg = cm.group(1)
            if len(seg) > 600:          # 別の呼び出しをまたいで拾わない
                seg = seg[-600:]
            # ★最後の一致を取る。最初の一致だと、直前のページの呼び出しの
            #   blankPrintedRows を拾ってしまう（bekki6 の 21 が 0 に化けた）。
            ms = list(re.finditer(r"blankPrintedRows\(.*?new Set\(\[([^\]]*)\]\)", seg, re.S))
            if ms:
                blanks |= {int(x) for x in re.findall(r"\d+", ms[-1].group(1))}
        calls.append({
            "rows_key": rows_key,
            "page_index": k - 1,
            "bounds": vals,
            "bounds_name": name,
            "blanks": blanks,
        })
    return template, calls


# ─────────────────────────────────────────────────────────────
# 検査本体
# ─────────────────────────────────────────────────────────────
def collect(labels_by_form):
    """(判定できたページ, 未判定ページ, 対象外ページ) を返す。

    ★「未判定」と「対象外」を混ぜないこと。
      未判定 = 測ろうとしたが測れなかった（直せば測れるようになりうる）
      対象外 = この検査の不変条件が適用されない（永久に測らない）
    混ぜると、対象外のものが「いつか測れるようになるもの」に見える。
    """
    judged, unjudged, skipped = [], [], []
    for route in ROUTES:
        form = form_name_for(route)
        template, calls = parse_route(route)
        row_types = payload_row_types(route)
        rel = route.relative_to(ROOT).as_posix()
        for c in calls:
            tag = f"{form or route.parent.name} {c['rows_key'] or c['bounds_name']}"
            # ★対象外の判定を先に置く。ラベルが無い理由が「そもそも点検項目の
            #   行ではない」なら、未判定に落としてはいけない。
            rtype = row_types.get(c["rows_key"] or "")
            if rtype and not STANDARD_ROW_TYPE.match(rtype):
                skipped.append((tag, rel, rtype))
                continue
            reason = None
            if form is None:
                reason = "route 名から様式番号を導けない"
            elif form not in labels_by_form:
                reason = f"BEKKI_ROW_LABELS に {form} が無い"
            elif c["rows_key"] is None:
                reason = "drawResultRows に rowsKey が無い"
            elif c["rows_key"] not in labels_by_form[form]:
                reason = f"ラベルに {c['rows_key']} が無い"
            elif template is None:
                reason = "テンプレート PDF のパスを導けない"
            elif c["bounds"] is None or len(c["bounds"]) < 2:
                reason = f"{c['bounds_name']} を読めない"
            if reason:
                unjudged.append((tag, rel, reason))
                continue

            b = c["bounds"]
            # ★窓は ±3.0pt。±1.0 では表の一番下の罫線を取りこぼす。
            #   実測: 宣言した最終境界より罫線が 1.00〜1.24pt 下にある様式があり
            #   （bekki2 p1 1.20 / bekki2 p2 1.24 / bekki3 p2 1.04 / bekki7 p2 1.01）、
            #   ±1.0 だと窓の外に落ちて「載らない境界1本」として未判定になっていた。
            #   広げすぎると表の外の罫線を拾うので、±3.0 で既存の判定が
            #   1件も変わらないことを確認して決めた値（±5.0 でも変わらない）。
            # ★狭めないこと。この 1pt のずれは実測したうえで採用しなかったもので
            #   （各 route の ROW_BOUNDS のコメント参照）、境界の側が動くことは無い。
            #   ±1.0 に戻すと、この4ページが理由も分からず未判定に戻る。
            rules, bands, ys = measure(template, c["page_index"], min(b) - 3.0, max(b) + 3.0)
            if bands <= 0:
                unjudged.append((tag, rel, f"{template} p{c['page_index'] + 1} の罫線を測れない"))
                continue
            # ★規約（P<k>_ROW_BOUNDS ↔ page<k>_rows ↔ PDFページ k-1）が
            #   本当にそのページを指しているかを、宣言した境界が実測の罫線に
            #   載っているかで確かめる。載らないなら測っている場所が違う＝未判定。
            off = [v for v in b if not any(abs(v - y) <= 1.5 for y in ys)]
            if off:
                unjudged.append((
                    tag, rel,
                    f"{template} p{c['page_index'] + 1} の罫線に載らない境界が "
                    f"{len(off)}/{len(b)} 本（{', '.join(f'{v:.1f}' for v in off[:4])}"
                    f"{' …' if len(off) > 4 else ''}）＝別のページを測っている疑い",
                ))
                continue
            judged.append({
                "tag": tag, "route": rel, "form": form, "rows_key": c["rows_key"],
                "labels": labels_by_form[form][c["rows_key"]],
                "bands": bands, "rules": rules, "blanks": c["blanks"],
            })
    return judged, unjudged, skipped


def check(judged) -> list[str]:
    ng = []
    for p in judged:
        labels, n = p["labels"], p["bands"]
        # 不変条件1: ラベル数 == 帯数
        if len(labels) != n:
            ng.append(
                f"[行数] {p['tag']}: ラベル {len(labels)} 行 / テンプレートの帯 {n} 本"
                f"（罫線 {p['rules']} 本）  → 入力と刷り込みが "
                f"{abs(len(labels) - n)} 行ずれる  {p['route']}"
            )
        # 不変条件2: 「見出し行」宣言 → blankPrintedRows に入っている
        for i, lab in enumerate(labels):
            if HEADER_MARK in lab and i not in p["blanks"]:
                ng.append(
                    f"[見出し] {p['tag']}[{i}] 「{lab}」は見出し行と宣言しているが "
                    f"blankPrintedRows に無い → 入力欄が生きており、"
                    f"入力すると見出しの刷り込みに重ねて印字される  {p['route']}"
                )
        # 不変条件3: blankPrintedRows の index が範囲内
        for i in sorted(p["blanks"]):
            if i >= len(labels):
                ng.append(
                    f"[範囲] {p['tag']}: blankPrintedRows の {i} が "
                    f"ラベル {len(labels)} 行の範囲外  {p['route']}"
                )
    return ng


def self_test() -> int:
    """★両方向。ラベルを足しても消しても、宣言を消しても落ちること。"""
    labels_by_form = parse_labels()
    judged, _, _ = collect(labels_by_form)
    if run_measurer_selfcheck(judged):
        print("SELF_TEST_FAILED: 測定器の検算が通らない")
        return 1
    if not judged:
        print("SELF_TEST_FAILED: 判定できたページが 0（検査が何も見ていない）")
        return 1
    # ★素の状態が全て緑である必要はない（本物の不一致が残っていても
    #   自己診断は成立する）。今 緑のページを1枚選び、それを壊して落ちるか見る。
    clean = [p for p in judged if not check([p])]
    if not clean:
        print("SELF_TEST_FAILED: 緑のページが1枚も無く、壊す対象を選べない")
        return 1
    victim = next((p for p in clean if p["blanks"]), clean[0])
    cases = []

    # (a) ラベルを1つ足す → 行数がずれて落ちる
    plus = dict(victim, labels=list(victim["labels"]) + ["★自己診断で足した行"])
    cases.append(("ラベルを1行足す", plus))
    # (b) ラベルを1つ消す → 行数がずれて落ちる
    minus = dict(victim, labels=list(victim["labels"])[:-1])
    cases.append(("ラベルを1行消す", minus))
    # (c) 見出し行の宣言を残したまま blankPrintedRows から外す → 落ちる
    idx = sorted(victim["blanks"])[0] if victim["blanks"] else 0
    labs = list(victim["labels"])
    if idx < len(labs):
        labs[idx] = labs[idx] + f"（{HEADER_MARK}）"
    drop = dict(victim, labels=labs, blanks=set())
    cases.append(("見出し行を blankPrintedRows から外す", drop))

    for name, mutated in cases:
        if not check([mutated]):
            print(f"SELF_TEST_FAILED: 「{name}」で落ちなかった（検査が効いていない）")
            return 1
        print(f"  ○ 「{name}」で落ちる")

    print("SELF_TEST_OK")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()

    labels_by_form = parse_labels()
    judged, unjudged, skipped = collect(labels_by_form)

    # ★未判定は検算より先に出す。検算で止まったときにも全件見えるようにする。
    print(f"── 未判定 {len(unjudged)} ページ（★黙って飛ばさず全件出す）")
    for tag, rel, reason in unjudged:
        print(f"  - {tag}: {reason}  ({rel})")

    print("\n── 測定器の検算（既知の正解）")
    for tag, (wr, wb) in MEASURER_CONTROLS.items():
        print(f"  {tag}: 罫線 {wr} / 帯 {wb}")
    bad = run_measurer_selfcheck(judged)
    if bad:
        print("\n★測定器が壊れている。不変条件の判定に入らない:")
        for b in bad:
            print(f"    {b}")
        print("HEADER_ROWS_FAILED")
        return 1
    print("  → 一致")

    print(f"\n── 未判定 {len(unjudged)} ページ（★黙って飛ばさず全件出す）")
    for tag, rel, reason in unjudged:
        print(f"  - {tag}: {reason}  ({rel})")

    # ★対象外は未判定と分けて出す。未判定は「測ろうとして測れなかった」、
    #   対象外は「この検査の不変条件が適用されない」。混ぜると、対象外のものが
    #   「いつか測れるようになるもの」に見える。
    #   件数を出すのは、黙って増えたときに気づけるようにするため。
    print(f"\n── 対象外 {len(skipped)} ページ"
          f"（点検項目の行ではなく、ラベル配列が存在しないのが設計どおり）")
    for tag, rel, rtype in skipped:
        print(f"  - {tag}: 行の型が {rtype}（容器ごとの表など。行は容器の通し番号で"
              f"点検項目ではない）  ({rel})")

    ng = check(judged)
    print(f"\n── 判定 {len(judged)} ページ / 不一致 {len(ng)} 件")
    for line in ng:
        print(f"  ★{line}")

    if ng:
        print("HEADER_ROWS_FAILED")
        return 1
    print("HEADER_ROWS_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
