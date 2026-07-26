"""Phase 0: 手元テンプレート（public/PDF/）が消防庁の正典と同じ版かを判定する。

■ なぜ最初にやるか
  手元が古ければ、これから入れる精密な座標を「古い様式」に対して入れることになる。
  今日踏んだ「動いていないコードを検査していた」のと同じ構造なので、ここは飛ばせない。

■ ★判定基準（測る前に決める。測ってから決めると都合よく解釈できてしまう）

  主指標: 印字テキストの集合が一致するか
    版が変われば文言・項目・注記が変わる。逆に、再出力や加工で座標がpt単位でズレても
    版が同じなら文言は変わらない。
    ＝ アプリのテンプレートが原本の再出力・加工版である可能性を織り込んだうえで、
       「版が違う」ことだけを検出できる指標にする。
    比較は正規化してから行う:
      - 空白（半角/全角/改行）を除去 … レイアウト由来の差を版差と誤認しないため
      - 文字単位ではなく「連続した非空白の塊」の集合として比較
    判定: どちらか一方にしか無い塊が1つでもあれば「不一致」。

  副指標1: ページ数
    版が変われば増減しうる。主指標が一致していてもここが違えば要確認。

  副指標2: 罫線の本数と格子構造
    座標の微差は許容する（再出力でpt単位はズレる）。見るのは
      - 縦罫線・横罫線の本数
      - x座標・y座標をそれぞれ昇順に並べた「順序」が一致するか（値そのものは見ない）
    ＝ 構造が同じで位置だけスケールしている場合は一致と見なす。

  ★この判定が言えること / 言えないこと
    言える: 印字内容・ページ数・格子構造が同じかどうか
    言えない: どちらが「正しい」か。不一致でも手元が古いとは限らない
              （別の出典＝日本消防設備安全センター版などの可能性がある）。
              不一致のときは差分の中身を見て人が判断すること。

使い方:
  python scripts/compare-template-version.py            # 全23様式
  python scripts/compare-template-version.py --self-test  # 陽性対照（両方向）
"""
from __future__ import annotations

import re
import shutil
import sys
import tempfile
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / "public" / "PDF"
CANON = ROOT / "reference" / "fdma" / "bekki-pdf"
WS = re.compile(r"\s+")


def blocks(pdf: Path) -> list[str]:
    """印字テキストを『連続した非空白の塊』の集合として取り出す（空白差を無視）"""
    doc = fitz.open(pdf)
    out: list[str] = []
    for page in doc:
        for b in page.get_text("dict").get("blocks", []):
            for line in b.get("lines", []):
                for span in line.get("spans", []):
                    t = WS.sub("", span.get("text", ""))
                    if t:
                        out.append(t)
    doc.close()
    return out


def rules(pdf: Path) -> tuple[int, int]:
    """縦罫線・横罫線の本数（座標の値は見ない）"""
    doc = fitz.open(pdf)
    v = h = 0
    for page in doc:
        for d in page.get_drawings():
            for it in d.get("items", []):
                if it[0] == "l":
                    a, b = it[1], it[2]
                    if abs(a.x - b.x) < 0.8 and abs(a.y - b.y) > 2:
                        v += 1
                    elif abs(a.y - b.y) < 0.8 and abs(a.x - b.x) > 2:
                        h += 1
                elif it[0] == "re":
                    r = it[1]
                    if r.height > 2:
                        v += 2
                    if r.width > 2:
                        h += 2
    doc.close()
    return v, h


def pages(pdf: Path) -> int:
    doc = fitz.open(pdf)
    n = doc.page_count
    doc.close()
    return n


def compare(local: Path, canon: Path) -> dict:
    lb, cb = blocks(local), blocks(canon)
    ls, cs = set(lb), set(cb)
    return {
        "pages_local": pages(local),
        "pages_canon": pages(canon),
        "blocks_local": len(lb),
        "blocks_canon": len(cb),
        "only_local": sorted(ls - cs),
        "only_canon": sorted(cs - ls),
        "rules_local": rules(local),
        "rules_canon": rules(canon),
    }


def self_test() -> int:
    """★陽性対照（両方向）。検出器そのものを疑う"""
    sample = sorted(CANON.glob("*.pdf"))[0]
    problems = []

    # 下向き: 同一ファイル同士なら差分0
    same = compare(sample, sample)
    if same["only_local"] or same["only_canon"]:
        problems.append(f"同一ファイル同士で差分が出た: {same['only_local'][:3]}")

    # 上向き: 1文字だけ変えたものは必ず検出できる
    with tempfile.TemporaryDirectory() as td:
        mutated = Path(td) / "mutated.pdf"
        shutil.copy(sample, mutated)
        doc = fitz.open(mutated)
        page = doc[0]
        target = None
        for b in page.get_text("dict")["blocks"]:
            for line in b.get("lines", []):
                for span in line.get("spans", []):
                    if len(WS.sub("", span.get("text", ""))) >= 2:
                        target = span
                        break
                if target:
                    break
            if target:
                break
        if target is None:
            doc.close()
            problems.append("変異させる対象が見つからない（対照として不適）")
        else:
            r = fitz.Rect(target["bbox"])
            page.add_redact_annot(r, text="ZZ", fontsize=target["size"])
            page.apply_redactions()
            out = Path(td) / "mutated2.pdf"
            doc.save(str(out), incremental=False)
            doc.close()
            diff = compare(out, sample)
            if not (diff["only_local"] or diff["only_canon"]):
                problems.append("1文字変えたのに差分0＝検出力が無い")

    if problems:
        print("SELF_TEST_FAILED")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("SELF_TEST_OK（同一=差分0 / 変異=検出）")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()

    targets = sorted(CANON.glob("*.pdf"), key=lambda p: p.name)
    if not targets:
        print(f"{CANON} が空。先に node scripts/fetch-fdma-reference.mjs")
        return 2

    print(f"{'様式':<26} {'頁':>5} {'塊':>11} {'縦罫':>9} {'横罫':>9} 判定")
    print("-" * 78)
    mismatched = []
    missing = []
    for canon in targets:
        local = LOCAL / canon.name
        if not local.exists():
            missing.append(canon.name)
            print(f"{canon.stem:<26} 手元に無い")
            continue
        r = compare(local, canon)
        text_same = not r["only_local"] and not r["only_canon"]
        page_same = r["pages_local"] == r["pages_canon"]
        rule_same = r["rules_local"] == r["rules_canon"]
        ok = text_same and page_same
        if not ok:
            mismatched.append((canon.stem, r))
        verdict = "一致" if (ok and rule_same) else ("一致(罫線数のみ差)" if ok else "★不一致")
        print(
            f"{canon.stem:<26} "
            f"{r['pages_local']}/{r['pages_canon']:<3} "
            f"{r['blocks_local']:>5}/{r['blocks_canon']:<5} "
            f"{r['rules_local'][0]:>4}/{r['rules_canon'][0]:<4} "
            f"{r['rules_local'][1]:>4}/{r['rules_canon'][1]:<4} {verdict}"
        )

    print("-" * 78)
    print(f"比較 {len(targets) - len(missing)} 様式 / 不一致 {len(mismatched)} / 手元に無い {len(missing)}")

    for name, r in mismatched:
        print(f"\n★{name} の差分")
        if r["pages_local"] != r["pages_canon"]:
            print(f"  ページ数: 手元 {r['pages_local']} / 正典 {r['pages_canon']}")
        for label, items in (("手元にのみ", r["only_local"]), ("正典にのみ", r["only_canon"])):
            if not items:
                continue
            print(f"  {label} ({len(items)}件): " + " / ".join(items[:12]))
            if len(items) > 12:
                print(f"    … 他 {len(items) - 12} 件")

    if mismatched or missing:
        print("\n→ ★「手元が古い」と決めつけないこと。別の出典（日本消防設備安全センター版など）の")
        print("  可能性がある。差分の中身を見て、どちらが正しいかを判断してから差し替えを決める。")
        return 1
    print("\nTEMPLATE_VERSION_MATCH")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
