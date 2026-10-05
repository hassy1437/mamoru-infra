# 点検種別に「機器・総合」の選択肢がある別記様式で、ルートが点検種別の○を描いているかを検査する。
#
# ■ なぜ要るか（#19・2026-10-05 の通し確認）
#   様式2・3・4・7・11の1・14・15・20 の 8 本は「テンプレートに『機器・総合』が印刷済みのため描画しない」
#   として○を描いていなかった。刷ってあるのは選択肢で、どちらかに○を付けるのが様式の決まり
#   ＝提出書類で点検種別が分からなかった。★○が無いだけでピクセルは正常なので、ベースラインでは出ない。
#
# ■ 決まり（★対象は列挙せず、テンプレートから導く）
#   テンプレートの 1 ページ目で「点検種別」と同じ行に「機」「器」「総」「合」が刷ってある様式は、
#   ルートが drawChoiceCircle を body.inspection_type で呼び、選択肢に「機器」と「総合」がある。
#   ★「機器」だけが刷ってある様式（総合点検の無い様式）は対象外。
#   ○の位置が刷り込みに触れていないかは check-choice-clearance.py が見る（ここでは見ない）。
#
# 使い方: python scripts/check-inspection-type-circle.py [--self-test]
from __future__ import annotations

import glob
import io
import os
import re
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify_numeric_rows_lib import template_of  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
ROUTES = sorted(glob.glob(os.path.join("src", "app", "api", "generate-*bekki*-pdf", "route.ts")))
CALL = re.compile(r"drawChoiceCircle\([^,]+,[^,]+,\s*fonts,\s*body\.inspection_type\b[^\[]*\[([^\]]*)\]", re.S)


def has_choice(template: str) -> bool | None:
    """テンプレートの点検種別の行に機器・総合の両方があるか（行が見つからなければ None）"""
    p = fitz.open(template)[0]
    lab = [w for w in p.get_text("words") if "点検種別" in w[4]]
    if not lab:
        return None
    y = lab[0][1]
    chars = set()
    for b in p.get_text("rawdict")["blocks"]:
        for line in b.get("lines", []):
            for s in line["spans"]:
                for c in s["chars"]:
                    if abs(c["bbox"][1] - y) < 6:
                        chars.add(c["c"])
    return {"機", "器", "総", "合"} <= chars


TYPE_TABLE = re.compile(r"const TYPE_CHOICES = \[([\s\S]*?)\n\]")


def draws_circle(src: str) -> bool:
    for m in CALL.finditer(src):
        labels = set(re.findall(r'label:\s*"([^"]+)"', m.group(1)))
        if {"機器", "総合"} <= labels:
            return True
    # ★様式11の2・12 は drawChoiceCircle を使わず、TYPE_CHOICES の表を回して drawEllipse で描く
    m = TYPE_TABLE.search(src)
    if m and {"機器", "総合"} <= set(re.findall(r'label:\s*"([^"]+)"', m.group(1))):
        loop = re.search(r"normalizeText\(body\.inspection_type\)[\s\S]{0,200}?for \(const choice of TYPE_CHOICES\)"
                         r"[\s\S]{0,200}?\.drawEllipse\(", src)
        if loop:
            return True
    return False


def judge(sources: dict[str, str]):
    need, problems, skipped = [], [], []
    for route, src in sources.items():
        tpl = template_of(route)
        name = route.split(os.sep)[-2]
        if not tpl:
            skipped.append(f"{name}（テンプレートが引けない）")
            continue
        choice = has_choice(tpl)
        if choice is None:
            skipped.append(f"{name}（点検種別の欄が無い）")
            continue
        if not choice:
            continue
        need.append(name)
        if not draws_circle(src):
            problems.append(f"{name}: テンプレートに「機器・総合」があるのに、点検種別の○を描いていない（{route}）")
    return need, problems, skipped


def main() -> int:
    sources = {r: io.open(r, encoding="utf-8").read() for r in ROUTES}
    need, problems, skipped = judge(sources)
    if "--self-test" in sys.argv:
        if problems:
            print("自己診断: 現状が既にNG（陰性対照が成立しない）")
            for p in problems:
                print("   ", p)
            return 1
        # 陽性対照: 1 本から○の呼び出しを消したら検出できるか（#19 を元に戻した形）
        victim = next(r for r in ROUTES if "standpipe-bekki20" in r)
        mutated = dict(sources)
        mutated[victim] = CALL.sub("/* 消した */", sources[victim])
        _, bad, _ = judge(mutated)
        if not any("standpipe-bekki20" in p for p in bad):
            print("自己診断: 様式20 の○を消しても検出できない")
            return 1
        print(f"  陰性対照: 対象 {len(need)} 様式すべてが○を描く")
        print("  陽性対照: 様式20 の○の呼び出しを消す → 検出")
        print("SELF_TEST_OK")
        return 0
    print(f"点検種別の○を検査: 別記 {len(sources)} 本のうち、機器・総合の選択肢がある {len(need)} 様式")
    for s in skipped:
        print("   対象外:", s)
    # ★空振りで緑にしない（テンプレートの読み取りが壊れたら 0 様式で通ってしまう）
    if len(need) < 10:
        problems.append(f"対象が {len(need)} 様式しかない（読み取りが壊れていないか）")
    if problems:
        print("★NG:")
        for p in problems:
            print("   ", p)
        return 1
    print("INSPECTION_TYPE_CIRCLE_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
