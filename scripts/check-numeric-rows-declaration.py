# NUMERIC_ROWS の宣言が実装・テンプレートと合っているかを検査する。
#
# ■ なぜこの検査が要るか
#   宣言は「テストデータのどのセルに数値を入れるか」を決める。ここが嘘だと、
#   現実値セット（＝合否の基準）が偽の値で埋まり、その範囲について
#   切り詰め検査もはみ出し検査も**空振りしたまま緑**になる。実際そうなっていた:
#   推論に頼っていたときは 100セル/14様式が "0.45" で、bekki2 の page3 は
#   drawResultRows の startIndex=22 を無視していたため 22行ずれた場所に入っていた。
#
# ■ 検査すること
#   1. drawResultRows を使う様式は必ず NUMERIC_ROWS を宣言している
#      （数値欄が無いなら空の宣言。「宣言が無い＝未分類」を空と混同しない）
#   2. 宣言した行の内容セルに、テンプレートが実際に何かを刷り込んでいる
#      ★数値欄と判断した根拠は「単位が刷り込まれている」こと。刷り込みが何も無い
#        セルを数値欄と宣言しているなら、その根拠が無い＝分類の誤り
#   3. 宣言したキーがそのルートの payload に存在する
#
# 使い方: python scripts/check-numeric-rows-declaration.py [--self-test]
import glob
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify_numeric_rows_lib import printed_by_row  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")


def declared(src):
    m = re.search(r"export const NUMERIC_ROWS[^=]*=\s*\{([\s\S]*?)\n\}", src) \
        or re.search(r"export const NUMERIC_ROWS[^=]*=\s*(\{\})", src)
    if not m:
        return None
    out = {}
    for mm in re.finditer(r"(page\d+_rows)\s*:\s*\[([^\]]*)\]", m.group(1)):
        out[mm.group(1)] = [int(x) for x in re.findall(r"\d+", mm.group(2))]
    return out


def run():
    problems = []
    total = 0
    for route in sorted(glob.glob("src/app/api/*-pdf/route.ts")):
        src = io.open(route, encoding="utf-8").read()
        name = os.path.basename(os.path.dirname(route))
        uses = "drawResultRows(" in src
        dec = declared(src)
        if uses and dec is None:
            problems.append(f"{name}: drawResultRows を使うのに NUMERIC_ROWS の宣言が無い")
            continue
        if not dec:
            continue
        printed = printed_by_row(route)          # (key, payload添字) -> 刷り込み文字列
        for key, idxs in dec.items():
            for i in idxs:
                total += 1
                if (key, i) not in printed:
                    problems.append(f"{name}: {key}[{i}] を数値欄と宣言しているが、その行が実装に無い")
                    continue
                if not printed[(key, i)]:
                    problems.append(
                        f"{name}: {key}[{i}] を数値欄と宣言しているが、"
                        f"テンプレートはそのセルに何も刷り込んでいない（単位が無い＝根拠が無い）",
                    )
    return problems, total


def self_test():
    """★宣言を壊したら落ちることを確かめる（両方向）。"""
    problems, total = run()
    if problems:
        print("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for p in problems:
            print("   ", p)
        return 1
    # 刷り込みが何も無い行を数値欄として足すと落ちるか
    route = "src/app/api/generate-jidou-kasai-houchi-bekki11-1-pdf/route.ts"
    orig = io.open(route, encoding="utf-8").read()
    try:
        # page1_rows[4] は「刷り込みなし」と分類した行（＝数値欄ではない）
        mutated = orig.replace("    page1_rows: [10, 12],", "    page1_rows: [4, 10, 12],")
        if mutated == orig:
            print("自己診断: 変異を当てる宣言が見つからない（書式が変わった）")
            return 1
        io.open(route, "w", encoding="utf-8", newline="").write(mutated)
        after, _ = run()
        if not any("page1_rows[4]" in p for p in after):
            print("自己診断: 根拠の無い行を数値欄に足しても検出できない")
            return 1
    finally:
        io.open(route, "w", encoding="utf-8", newline="").write(orig)
    print(f"  陰性対照: 現状の宣言 {total} 行 → 問題なし")
    print("  陽性対照: 刷り込みの無い行を数値欄に足す → 検出")
    print("SELF_TEST_OK")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    problems, total = run()
    print(f"NUMERIC_ROWS の宣言 {total} 行を検査")
    if problems:
        print("★NG:")
        for p in problems:
            print("   ", p)
        sys.exit(1)
    print("NUMERIC_ROWS_DECLARATION_OK")
