# 重なりが出たセルについて、テンプレート側の実体を測る。
#
# ■ なぜ要るか
#   check-printed-overlap は「アプリの文字が刷り込みに重なった」ことしか言わない。
#   直し方はそこから決まらない:
#       単位欄（「設定圧力 ___ MPa」）  → 空欄の位置に値だけ描く
#       選択肢欄（「常用・非常用」）    → 該当する語を○で囲む
#   どちらかはテンプレートを見ないと決まらないので、必ずここで測ってから直す。
#
# ■ 出すもの
#   ・その行に刷り込まれている文字列（x順・座標つき）
#   ・文字の隙間（＝値を書く空欄の候補。幅つき）
#   ・その行の罫線（セルの左右端）
#
# 使い方: python scripts/inspect-printed-cell.py <template.pdf> <page> <yTop> [--band 12]
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    band = 12.0
    if "--band" in sys.argv:
        band = float(sys.argv[sys.argv.index("--band") + 1])
    path, page_no, y = args[0], int(args[1]) - 1, float(args[2])

    doc = fitz.open(path)
    page = doc[page_no]
    lo, hi = y - band / 2, y + band / 2

    chars = []
    for blk in page.get_text("rawdict")["blocks"]:
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                for ch in sp.get("chars", []):
                    x0, y0, x1, y1 = ch["bbox"]
                    if lo <= (y0 + y1) / 2 <= hi:
                        chars.append((x0, x1, y0, y1, ch["c"]))
    chars.sort()

    print(f"■ {path} p{page_no+1}  y {lo:.1f}–{hi:.1f}")
    print("\n刷り込み文字（x順・隣接文字はまとめる）")
    groups = []
    for c in chars:
        if groups and c[0] - groups[-1][1] < 1.5:
            g = groups[-1]
            groups[-1] = (g[0], c[1], min(g[2], c[2]), max(g[3], c[3]), g[4] + c[4])
        else:
            groups.append(c)
    for g in groups:
        print(f"  x {g[0]:7.2f} – {g[1]:7.2f}  y {g[2]:7.2f} – {g[3]:7.2f}   {g[4]!r}")

    print("\n文字の隙間（＝値を書く空欄の候補）")
    for a, b in zip(groups, groups[1:]):
        w = b[0] - a[1]
        if w >= 3.0:
            print(f"  x {a[1]:7.2f} – {b[0]:7.2f}   幅 {w:6.2f}   「{a[4]}」と「{b[4]}」の間")

    print("\nこの帯を横切る罫線")
    verts, horis = [], []
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                p, q = it[1], it[2]
                if abs(p.x - q.x) < 0.6 and min(p.y, q.y) <= lo and max(p.y, q.y) >= hi:
                    verts.append(round(p.x, 2))
                elif abs(p.y - q.y) < 0.6 and lo - band <= p.y <= hi + band:
                    horis.append((round(p.y, 2), round(min(p.x, q.x), 2), round(max(p.x, q.x), 2)))
            elif it[0] == "re":
                r = it[1]
                # 細い矩形は罫線として描かれていることがある
                if r.width < 1.2 and r.y0 <= lo and r.y1 >= hi:
                    verts.append(round((r.x0 + r.x1) / 2, 2))
                elif r.height < 1.2 and lo - band <= r.y0 <= hi + band:
                    horis.append((round((r.y0 + r.y1) / 2, 2), round(r.x0, 2), round(r.x1, 2)))
    print("  縦罫(x):", sorted(set(verts)))
    print("  横罫(y):", sorted({h[0] for h in horis}))
    doc.close()


if __name__ == "__main__":
    main()
