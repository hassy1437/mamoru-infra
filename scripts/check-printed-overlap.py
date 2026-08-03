"""アプリが描いた文字が、テンプレートの刷り込み文字に重なっていないかを検出する。

■ なぜ要るか
  user が実機で見つけた欠陥（別記様式12で名称の値がラベルに重なる、選択肢欄に
  点検項目名が描き込まれる）は、既存の検査を全部すり抜けた。
  はみ出し検査・切り詰め検査・字化け検査は**どれも罫線を基準にしている**ので、
  「罫線の内側で、刷り込み文字の上に重ねて描く」は正常と判定される。
  ＝ 測っていない次元だった。

■ ★判定基準（実装・測定の前に言語化する。測ってから決めると都合よく解釈できる）

  主判定: アプリが描いた**インク**が、刷り込み文字の**インク**と同じ画素を占めているか。

  (1) アプリ由来の描画を分離する
      pdf-lib はテンプレートのコンテンツストリームを保ったまま、自分の描画を
      別ストリームとして追記する（実測: bekki12 p1 は テンプレ8本 + アプリ3本）。
      テンプレートPDFに存在しないストリームだけを残したページを描画すれば、
      **アプリのインクだけ**が得られる。フォント名で分ける方法より確実
      （実測でテンプレ側スパン数が生成前後で不変なことも確認済み）。

  (2) ★送り幅ではなくインクで測る
      最初はスパンの外接矩形（＝文字送り幅）の交差で判定したが、
      **両集団が同じ幅の帯に混在して分離できなかった**。実測:
        正当な隣接  [2026]×[年] 0.52pt / [26]×[日] 0.63pt / [123]×[（泡第] 0.04pt
        実害        [外形・設置状況]×[器] 1.14pt / [03-1234-5678]×[TEL] 1.40pt
      送り幅にはサイドベアリングが含まれるので、隣に置いただけで矩形が触れる。
      ＝ 幅にしきい値を置いても正しい配置を巻き込む。インクなら触れない。
      （bekki5 の空欄幅を測ったときと同じ教訓: 送り幅 ≠ インク）

  (3) ★○印は除外する
      選択肢を○で囲むのは**正しい描き方**で、刷り込みと重なって当然。
      実測でも [○]×[検] のような重なりが出る。アプリ側が ○ △ □ ▽ の
      記号だけなら「意図した重なり」として除外する。

  ★正当な配置は原理的に落ちる（誤検出の設計）
    「刷り込みラベルの隣に値を置く」「刷り込みの空欄に値を入れる」は
    インクが重ならないので検出されない。②で直した配置や、bekki5 の
    「（泡第 __ ～ __ 号）」の空欄への描画がその例。

  閾値: 重なり画素数の下限。**両集団の実測分布から決める**（--report で出す）。
    ラスタライズのアンチエイリアスで1〜数画素は触れうるため。

  ★この判定が言えること / 言えないこと
    言える: 描いた文字が刷り込み文字と物理的に重なっている
    言えない: 重なっていなければ配置が正しい、とは言えない
              （刷り込みの無い誤ったセルに描いている場合は別の検査が要る）

使い方:
  python scripts/check-printed-overlap.py <pdf...>            # 判定
  python scripts/check-printed-overlap.py --report <pdf...>   # 重なり量の分布のみ
  python scripts/check-printed-overlap.py --self-test         # 陽性対照（両方向）
"""
from __future__ import annotations

import re
import sys
import tempfile
from pathlib import Path

import fitz
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
TPL_DIR = ROOT / "public" / "PDF"
APP_FONT_FILE = ROOT / "public" / "fonts" / "NotoSansJP-Regular.ttf"

SCALE = 6.0        # 432dpi。1画素 = 0.167pt
DARK = 160
MIN_OVERLAP_PX = 1  # インクが1画素でも重なったら該当。理由は DECISION を参照

# ★選択肢を囲む記号。刷り込みと重なるのが正しいので除外する
MARK_ONLY = re.compile(r"^[○◯〇△□▽◎×\s]+$")

# DECISION（2026-07-27・長文25様式＋現実値25様式を実測して決めた）
#   ★ノイズ床が存在しないので下限は 1px（＝インクが重なったら全部該当）。
#   根拠:
#     正当な隣接は 0px … 合成対照（刷り込みの隣の空白に描く）も、実データで
#       送り幅では触れていた [2026]×[年] [26]×[日] [5.2]×[Ｖ] [123]×[（泡第] も、
#       インクでは 1画素も重ならなかった（該当0件）。
#     実害は 1px から連続 … 最小の 1〜5px も [外形・設置状況]×[器]
#       [株式会社…]×[TEL] で、大きい方と同じ欠陥。アンチエイリアスではない。
#   ＝ 8px などに置くと実害を落とす。しきい値で調整する余地は無い問題だった。


def template_for(pdf: Path) -> Path | None:
    """生成PDF → 元テンプレート。名前で対応させる"""
    # ★同じ様式の派生ケースは "<base>_test__<variant>" と命名する規約。
    #   変種ごとにテンプレートの対応表を増やさないための一般則で、
    #   "__" より後ろを落としてから "_test" を外す。
    #   （bekki11_1_test__autotest = 自動試験機能ありのケース）
    stem = pdf.stem.split("__")[0].replace("_test", "")
    cand = {
        "soukatu": "bekki_soukatu", "itiran": "bekki_itiran", "houkoku": "bekki_houkoku",
    }.get(stem, f"s50_kokuji14_{stem}")
    p = TPL_DIR / f"{cand}.pdf"
    return p if p.exists() else None


def _mask(page, scale: float) -> np.ndarray:
    pm = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csGRAY, alpha=False)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.stride)[:, : pm.width]
    return a < DARK


def app_only_masks(gen_path: Path, tpl_path: Path, scale: float):
    """アプリ由来のストリームだけを残したページのインクマスクを頁ごとに返す"""
    tpl = fitz.open(str(tpl_path))
    tpl_streams = set()
    for i in range(tpl.page_count):
        for x in tpl[i].get_contents():
            tpl_streams.add(tpl.xref_stream(x))
    tpl_masks = [_mask(tpl[i], scale) for i in range(tpl.page_count)]
    tpl.close()

    gen = fitz.open(str(gen_path))
    out = []
    for i in range(gen.page_count):
        pg = gen[i]
        keep = [x for x in pg.get_contents() if gen.xref_stream(x) not in tpl_streams]
        if not keep:
            out.append((np.zeros_like(tpl_masks[min(i, len(tpl_masks) - 1)]), None))
            continue
        merged = b"".join(gen.xref_stream(x) for x in keep)
        xr = gen.get_new_xref()
        gen.update_object(xr, "<<>>")
        gen.update_stream(xr, merged)
        pg.set_contents(xr)
        out.append((_mask(pg, scale), None))
    gen.close()
    return out, tpl_masks


def spans_of(pdf: Path):
    """頁ごとの全スパン（テキスト＋外接矩形）"""
    doc = fitz.open(str(pdf))
    out = []
    for page in doc:
        items = []
        for b in page.get_text("dict").get("blocks", []):
            for line in b.get("lines", []):
                for s in line.get("spans", []):
                    t = s.get("text", "").strip()
                    if t:
                        items.append((fitz.Rect(s["bbox"]), t, s["font"]))
        out.append(items)
    doc.close()
    return out


def overlaps(gen_path, scale: float = SCALE):
    """重なりを列挙する。判定はせず事実だけ返す"""
    gen_path = Path(gen_path)
    tpl_path = template_for(gen_path)
    if tpl_path is None:
        return None
    app_masks, tpl_masks = app_only_masks(gen_path, tpl_path, scale)
    gen_spans = spans_of(gen_path)
    tpl_spans = spans_of(tpl_path)

    hits = []
    for i, (am, _) in enumerate(app_masks):
        if i >= len(tpl_masks):
            break
        tm = tpl_masks[i]
        if am.shape != tm.shape:
            continue
        both = am & tm
        if not both.any():
            continue
        tset = {(round(r.x0, 2), round(r.y0, 2), t) for r, t, _ in tpl_spans[i]} if i < len(tpl_spans) else set()
        # アプリのスパン＝生成側にあってテンプレ側に無いもの
        appspans = [(r, t) for r, t, _ in gen_spans[i]
                    if (round(r.x0, 2), round(r.y0, 2), t) not in tset] if i < len(gen_spans) else []
        for ar, at in appspans:
            for tr, tt, _ in (tpl_spans[i] if i < len(tpl_spans) else []):
                it = ar & tr
                if not it.is_valid or it.is_empty or it.width <= 0 or it.height <= 0:
                    continue
                x0, y0 = int(it.x0 * scale), int(it.y0 * scale)
                x1, y1 = int(np.ceil(it.x1 * scale)), int(np.ceil(it.y1 * scale))
                px = int(both[max(0, y0):y1, max(0, x0):x1].sum())
                if px == 0:
                    continue
                hits.append({
                    "page": i + 1, "app": at, "printed": tt, "px": px,
                    "x": round(it.x0, 1), "y": round(it.y0, 1),
                    "mark": bool(MARK_ONLY.match(at)),
                })
    return hits


def judge(hits):
    return [h for h in hits if h["px"] >= MIN_OVERLAP_PX and not h["mark"]]


def self_test() -> int:
    """★両方向の陽性対照。片方だけだと『常に0件』な検出器も通ってしまう"""
    problems = []
    tpl = TPL_DIR / "s50_kokuji14_bekki17.pdf"

    with tempfile.TemporaryDirectory() as td:
        # 下向き: テンプレートをそのまま複製した「アプリの描画ゼロ」は必ず0件
        plain = Path(td) / "bekki17_test.pdf"
        plain.write_bytes(tpl.read_bytes())
        h = overlaps(plain)
        if h is None:
            problems.append("テンプレートを対応付けられない（対照として不適）")
        elif judge(h):
            problems.append(f"描画ゼロで {len(judge(h))} 件検出（刷り込み同士を数えている）")

        # 上向き1: 刷り込みの真上に描いたら必ず検出
        doc = fitz.open(str(tpl))
        page = doc[0]
        target = next((s for b in page.get_text("dict")["blocks"] for l in b.get("lines", [])
                       for s in l.get("spans", []) if len(s["text"].strip()) >= 3), None)
        if target is None:
            problems.append("重ねる対象が見つからない（対照として不適）")
        else:
            r = fitz.Rect(target["bbox"])
            # ★対照はアプリと同じフォントで描かないと意味がない。
            #   最初 china-s で描いたところ分類が変わって検出できず、
            #   検出器ではなく対照の作り方が誤っていた（記録として残す）。
            page.insert_font(fontname="notojp", fontfile=str(APP_FONT_FILE))
            page.insert_text((r.x0, r.y1 - 1), "重ね書き", fontname="notojp", fontsize=r.height * 0.8)
            bad = Path(td) / "bekki17_test.pdf"
            doc.save(str(bad), incremental=False)
            doc.close()
            if not judge(overlaps(bad)):
                problems.append("刷り込みの真上に描いたのに検出しない")

        # 上向き2: 刷り込みの「すぐ隣の空白」に描いたものは検出しない
        #   ＝ ②で直した「ラベルの隣に値を置く」配置を巻き込まないことの確認。
        #   ★置き場所は実測で選ぶ。最初は適当に右隣へ置いたが、そこには別の刷り込み
        #     （別記様式第「17」）があり、検出されたのは正しかった＝対照の側が誤りだった。
        doc = fitz.open(str(tpl))
        page = doc[0]
        allspans = [fitz.Rect(s["bbox"]) for b in page.get_text("dict")["blocks"]
                    for l in b.get("lines", []) for s in l.get("spans", []) if s["text"].strip()]
        size = 8.0
        spot = None
        for r in sorted(allspans, key=lambda x: (x.y0, x.x0)):
            probe = fitz.Rect(r.x1 + 0.5, r.y0, r.x1 + 0.5 + size, r.y1)
            if probe.x1 > page.rect.x1:
                continue
            if any(probe.intersects(o) for o in allspans):
                continue
            spot = probe
            break
        if spot is None:
            problems.append("隣接の対照を置ける空白が見つからない（対照として不適）")
        else:
            page.insert_font(fontname="notojp", fontfile=str(APP_FONT_FILE))
            page.insert_text((spot.x0, spot.y1 - 1), "隣", fontname="notojp", fontsize=size)
            ok = Path(td) / "bekki17_test.pdf"
            doc.save(str(ok), incremental=False)
            doc.close()
            bad_hits = judge(overlaps(ok))
            if bad_hits:
                problems.append(f"隣の空白に置いただけで検出した（誤検出）: {bad_hits[:2]}")

    if problems:
        print("SELF_TEST_FAILED")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("SELF_TEST_OK（描画ゼロ=0件 / 重ね書き=検出 / 隣接=検出しない）")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not argv:
        print(__doc__)
        return 2

    report = "--report" in sys.argv
    total, files_ng, dist, skipped = 0, [], [], []
    for p in argv:
        hits = overlaps(p)
        if hits is None:
            skipped.append(Path(p).stem)
            continue
        for h in hits:
            h["form"] = Path(p).stem
        dist += hits
        judged = judge(hits)
        if judged and not report:
            files_ng.append(Path(p).stem)
            total += len(judged)
            print(f"\n★{Path(p).stem}: {len(judged)} 件")
            for h in sorted(judged, key=lambda x: (-x["px"]))[:40]:
                print(f"    p{h['page']} ({h['x']},{h['y']}) {h['px']:>5}px  "
                      f"アプリ[{h['app'][:26]}] × 刷り込み[{h['printed'][:26]}]")

    if report:
        print("── 重なり画素数の分布（判定せず実測のみ）──")
        for h in sorted(dist, key=lambda x: x["px"]):
            kind = "○印" if h["mark"] else "  "
            print(f"  {h['px']:>6}px {kind} {h['form']:<15} [{h['app'][:22]}] × [{h['printed'][:22]}]")
        print(f"  計 {len(dist)} 件")
        return 0

    if skipped:
        # ★黙って飛ばさない
        print(f"\n対応テンプレートが見つからず判定できない: {', '.join(skipped)}")
    print(f"\n走査 {len(argv) - len(skipped)} ファイル / 重なり {total} 件 / 該当 {len(files_ng)} 様式")
    if files_ng or skipped:
        if files_ng:
            print(f"  該当: {', '.join(files_ng)}")
            print("\n→ 罫線は越えていないので既存のはみ出し検査では出ない。")
            print("  刷り込みのある位置に描いている＝選択肢欄・単位欄・ラベルへの重ね書き。")
        return 1
    print("\nNO_PRINTED_OVERLAP")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
