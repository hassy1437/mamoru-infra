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
            out.append((np.zeros_like(tpl_masks[min(i, len(tpl_masks) - 1)]), []))
            continue
        merged = b"".join(gen.xref_stream(x) for x in keep)
        xr = gen.get_new_xref()
        gen.update_object(xr, "<<>>")
        gen.update_stream(xr, merged)
        pg.set_contents(xr)
        # ★2つ目にアプリ層の図形を返す。○は文字ではなく図形（drawEllipse）なので、
        #   ★スパンだけを枠にしていると★数える枠がどこにも無く、原理的に0件になる。
        out.append((_mask(pg, scale), [d["rect"] for d in pg.get_drawings()]))
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
    for i, (am, app_shapes) in enumerate(app_masks):
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
        # ★アプリのスパンの矩形の中で both を直接数える。
        #   以前は「テンプレ側のテキストスパンとの交差」の中だけを数えていたので、
        #   罫線・図形との重なりが原理的に検出できなかった（実測: 値を縦罫線に
        #   跨がせてインクが22画素重なっても検出0件）。テンプレ側の候補を
        #   列挙する方式は「列挙し忘れた種類」が穴になるので、列挙をやめて
        #   インクマスクそのものを見る。both = アプリのインク ∧ 刷り込みのインク
        #   なので、罫線でも図形でも網掛けでも同じ1本の判定で捕まる。
        # ★アプリの図形（○）も枠にする。
        #   ★穴2（2026-08-25）: ○は drawEllipse で描かれる図形なので、
        #     ★テキストスパンだけを枠にしていた従来の形では★1件も数えられなかった。
        #     ★正しく囲めている○は重なりが0なので、足しても誤検出は増えない
        #     （実測: 448個の○のうち重なったのは44箇所だけ）。
        frames = list(appspans) + [(r, "○（選択の印）") for r in (app_shapes or [])]
        for ar, at in frames:
            x0, y0 = int(ar.x0 * scale), int(ar.y0 * scale)
            x1, y1 = int(np.ceil(ar.x1 * scale)), int(np.ceil(ar.y1 * scale))
            px = int(both[max(0, y0):y1, max(0, x0):x1].sum())
            if px == 0:
                continue
            # 何に当たったかの帰属。テキストスパンとの交差ぶんを引いて、
            # 残りを「罫線・図形」とする（帰属は報告のためで、判定には使わない）。
            printed, px_text = [], 0
            for tr, tt, _ in (tpl_spans[i] if i < len(tpl_spans) else []):
                it = ar & tr
                if not it.is_valid or it.is_empty or it.width <= 0 or it.height <= 0:
                    continue
                ix0, iy0 = int(it.x0 * scale), int(it.y0 * scale)
                ix1, iy1 = int(np.ceil(it.x1 * scale)), int(np.ceil(it.y1 * scale))
                p = int(both[max(0, iy0):iy1, max(0, ix0):ix1].sum())
                if p:
                    printed.append(tt)
                    px_text += p
            px_other = max(px - px_text, 0)
            if px_other and not printed:
                label = "罫線・図形（テキスト以外の刷り込み）"
            elif px_other:
                label = "・".join(printed) + " ＋罫線・図形"
            else:
                label = "・".join(printed)
            hits.append({
                "page": i + 1, "app": at, "printed": label, "px": px,
                "px_text": px_text, "px_other": px_other,
                "x": round(ar.x0, 1), "y": round(ar.y0, 1),
                # ★帰属のために残すが、★判定からは外さない（下の judge を参照）
                "mark": bool(MARK_ONLY.match(at)),
            })
    return hits


def judge(hits, min_px: int = MIN_OVERLAP_PX):
    """★重なった画素が min_px 以上のものを該当とする。

    ★2026-08-25 に MARK_ONLY の除外をやめた（★穴3）。
      以前は「○ △ □ ▽ の記号だけのスパン」を★判定から外していた。
      理由は「選択肢を○で囲むのは正しい描き方だから」だったが、
      ★その○は文字ではなく★図形で描かれており、この除外に掛かっていなかった。
      ＝ ★除外していたのは★別物 ―― 点検結果の欄に描く ○ / × の判定記号
        （実測 2793件）で、★あれが刷り込みに重なるのは正しくない。
      ★除外をやめても検出は増えない（実測: 判定記号の重なりは0件）。
      ＝ ★いま0件でも、原理的に見ていない状態を残さない。
    """
    return [h for h in hits if h["px"] >= min_px]


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

        # 上向き2: ★罫線の真上に描いたら必ず検出（穴1の対照）
        #   これが無いと「テンプレ側のテキストスパンとしか交差を取らない」実装に
        #   戻っても気づけない。実際その実装では、値を縦罫線に跨がせて
        #   インクが22画素重なっても検出0件だった。
        doc = fitz.open(str(tpl))
        page = doc[0]
        rule = None
        for it in page.get_drawings():
            for op in it["items"]:
                r = None
                if op[0] == "l" and abs(op[1].y - op[2].y) < 0.9:
                    r = fitz.Rect(min(op[1].x, op[2].x), op[1].y - 0.3, max(op[1].x, op[2].x), op[1].y + 0.3)
                elif op[0] == "re" and op[1].height < 1.5:
                    r = fitz.Rect(op[1])
                # 長い横罫線で、テキストから十分離れているものを選ぶ
                if r is not None and r.width > 60:
                    probe = fitz.Rect(r.x0 + 5, r.y0 - 4, r.x0 + 25, r.y1 + 4)
                    if not any(probe.intersects(fitz.Rect(s["bbox"]))
                               for b in page.get_text("dict")["blocks"]
                               for l in b.get("lines", []) for s in l.get("spans", [])
                               if s["text"].strip()):
                        rule = r
                        break
            if rule is not None:
                break
        if rule is None:
            problems.append("重ねる罫線が見つからない（対照として不適）")
        else:
            page.insert_font(fontname="notojp", fontfile=str(APP_FONT_FILE))
            # 罫線の y にベースラインを置くので、文字のインクが必ず罫線に載る
            page.insert_text((rule.x0 + 8, rule.y0 + 2.5), "罫線上", fontname="notojp", fontsize=7.0)
            onrule = Path(td) / "bekki17_test.pdf"
            doc.save(str(onrule), incremental=False)
            doc.close()
            hits_rule = judge(overlaps(onrule))
            if not hits_rule:
                problems.append("罫線の真上に描いたのに検出しない（★穴1が空いている）")
            elif not any(h["px_other"] > 0 for h in hits_rule):
                problems.append("罫線への重なりをテキスト由来として数えている（帰属が誤り）")

        # 上向き3: 刷り込みの「すぐ隣の空白」に描いたものは検出しない
        #   ＝ ②で直した「ラベルの隣に値を置く」配置を巻き込まないことの確認。
        #   ★置き場所は実測で選ぶ。最初は適当に右隣へ置いたが、そこには別の刷り込み
        #     （別記様式第「17」）があり、検出されたのは正しかった＝対照の側が誤りだった。
        doc = fitz.open(str(tpl))
        page = doc[0]
        allspans = [fitz.Rect(s["bbox"]) for b in page.get_text("dict")["blocks"]
                    for l in b.get("lines", []) for s in l.get("spans", []) if s["text"].strip()]
        # ★空白の判定を「テキストが無い」から「インクが無い」に変える。
        #   罫線を見るようにした以上、テキストだけ避けた場所は罫線に載りうる。
        #   実際この対照は罫線を避けていなかった。
        tpl_ink = _mask(page, SCALE)
        def is_blank(r: fitz.Rect) -> bool:
            x0, y0 = int(r.x0 * SCALE), int(r.y0 * SCALE)
            x1, y1 = int(np.ceil(r.x1 * SCALE)), int(np.ceil(r.y1 * SCALE))
            return not tpl_ink[max(0, y0):y1, max(0, x0):x1].any()
        size = 8.0
        spot = None
        for r in sorted(allspans, key=lambda x: (x.y0, x.x0)):
            probe = fitz.Rect(r.x1 + 0.5, r.y0, r.x1 + 0.5 + size, r.y1)
            if probe.x1 > page.rect.x1:
                continue
            if any(probe.intersects(o) for o in allspans):
                continue
            if not is_blank(probe):
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
    print("SELF_TEST_OK（描画ゼロ=0件 / 文字への重ね書き=検出 / 罫線への重ね書き=検出 / 隣接=検出しない）")
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
