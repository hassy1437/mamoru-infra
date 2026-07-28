# 分類B-2（単位・ラベルの空欄）の対象行について、値を書く空欄を文字単位で確定する。
#
# ★グループ化した bbox を使わないこと。刷り込みの語には末尾の空白文字が含まれ、
#   「設定圧力 」の右端は 用 の右端より 5pt ほど右に出る。そこを空欄の左端にすると
#   値が刷り込みに寄りすぎる。空白でない文字の右端で測る。
#
# 使い方: python scripts/measure-b2-blanks.py
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")

# (様式, ページ, 行番号, 行のy中心, 左ラベル, 右ラベル or None=列の右端まで)
TARGETS = [
    ("bekki5", 1, 1, 347.0, "種別", None),
    ("bekki5", 2, 4, 164.0, "設定圧力", "MPa"),
    ("bekki5", 2, 6, 211.0, "作動圧力", "MPa"),
    ("bekki9", 1, 0, 343.0, "種別", None),
    ("bekki9", 2, 8, 227.0, "設定圧力", "MPa"),
    ("bekki9", 2, 10, 261.0, "作動圧力", "MPa"),
    ("bekki12", 1, 10, 496.0, "設定値", "mA"),
    ("bekki12", 2, 0, 117.0, "－", "％"),
    ("bekki12", 2, 0, 117.0, "＋", "％"),
    ("bekki21", 1, 6, 392.0, "常用", "V"),
    ("bekki21", 1, 6, 392.0, "非常", "V"),
]


def chars_in_band(page, y, band=11.0):
    out = []
    lo, hi = y - band / 2, y + band / 2
    for blk in page.get_text("rawdict")["blocks"]:
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                for ch in sp.get("chars", []):
                    x0, y0, x1, y1 = ch["bbox"]
                    if lo <= (y0 + y1) / 2 <= hi and ch["c"].strip():
                        out.append((x0, x1, ch["c"]))
    out.sort()
    return out


def find(chars, word, after=0.0):
    """空白を除いた並びの中から word を探し、その左右端を返す"""
    s = "".join(c[2] for c in chars)
    start = 0
    while True:
        i = s.find(word, start)
        if i < 0:
            return None
        seg = chars[i:i + len(word)]
        if seg[0][0] >= after:
            return (seg[0][0], seg[-1][1])
        start = i + 1


print(f"{'様式':<9}{'p':<3}{'行':<4}{'左ラベル':<10}{'空欄 x':<22}{'幅':<8}{'右ラベル'}")
print("-" * 78)
for form, pno, row, y, left, right in TARGETS:
    doc = fitz.open(f"public/PDF/s50_kokuji14_{form}.pdf")
    page = doc[pno - 1]
    chars = chars_in_band(page, y)
    lpos = find(chars, left)
    if not lpos:
        print(f"{form:<9}{pno:<3}{row:<4}{left:<10}★左ラベルが見つからない  並び={''.join(c[2] for c in chars)!r}")
        doc.close()
        continue
    if right:
        rpos = find(chars, right, after=lpos[1])
        if not rpos:
            print(f"{form:<9}{pno:<3}{row:<4}{left:<10}★右ラベル {right} が見つからない")
            doc.close()
            continue
        x0, x1 = lpos[1], rpos[0]
    else:
        # 右ラベルが無い場合は、次の非空白文字か、罫線の右端まで
        nxt = [c for c in chars if c[0] > lpos[1] + 1]
        x0 = lpos[1]
        x1 = nxt[0][0] if nxt else lpos[1] + 60
    print(f"{form:<9}{pno:<3}{row:<4}{left:<10}{x0:8.2f} – {x1:8.2f}  {x1-x0:7.2f}  {right or '(次の文字/列端)'}")
    doc.close()
