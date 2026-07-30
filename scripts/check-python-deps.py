# 検査スクリプトが使う Python の外部依存を**導出**し、requirements.txt と突き合わせる。
#
# ■ なぜ要るか（2026-07-30 に踏んだ）
#   CI に「依存は PyMuPDF だけ」と書いたら、42件中15件が numpy 不足で落ちた。
#   ★依存の調査を `import fitz` の grep でやり、`import numpy` を見ていなかった。
#     ＝ リテラルで絞って取りこぼす形を、検査対象ではなく**環境の調査**でやっていた。
#   ★しかも事前に CI で1本（print-render-hashes.py）だけ走らせて「通った」と
#     判断していた。そのプローブは numpy を使う15本に触れていない。
#     ＝ **プローブの被覆より広い結論を出していた**。
#
#   人が列挙する限り同じことが起きるので、**実際の import から導く**。
#
# ■ 標準ライブラリの判定
#   ★手書きのリストを持たない。それ自体が「列挙」になって同じ問題を再生産する。
#   sys.stdlib_module_names（Python 3.10+）を使う。
#
# ■ 拾える import / 拾えない import
#   ast で**全ての** Import / ImportFrom を歩く。関数の中の import も
#   try/except ImportError の中の import も拾える。
#   ★拾えないのは importlib.import_module() や __import__() のような動的 import。
#     いま使っている箇所は無いが、使ったらここでは検出できない。
#
# 使い方: python scripts/check-python-deps.py [--self-test]
import ast
import glob
import io
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

REQ = "requirements.txt"

# ★import 名とパッケージ名が違うものの対応。**列挙**なので足し忘れうる。
#   ただし漏れても「未宣言」として落ちる側に転ぶ（黙って通らない）。
IMPORT_TO_PACKAGE = {
    "fitz": "pymupdf",
    "PIL": "pillow",
    "yaml": "pyyaml",
    "cv2": "opencv-python",
}


def local_modules():
    """scripts/ 配下の .py 自身（相互 import は外部依存ではない）"""
    return {os.path.basename(p)[:-3] for p in glob.glob("scripts/*.py")}


def imported_packages():
    """scripts/*.py が import する外部パッケージ -> それを使うファイル"""
    stdlib = sys.stdlib_module_names
    local = local_modules()
    used = {}
    for p in sorted(glob.glob("scripts/*.py")):
        try:
            tree = ast.parse(io.open(p, encoding="utf-8").read(), filename=p)
        except SyntaxError as e:
            print(f"★{p}: 構文解析に失敗（{e}）")
            sys.exit(1)
        for node in ast.walk(tree):          # ★walk なので関数内・try内も拾う
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                if node.level:               # 相対 import はローカル
                    continue
                names = [node.module or ""]
            for n in names:
                top = n.split(".")[0]
                if not top or top in stdlib or top in local:
                    continue
                pkg = IMPORT_TO_PACKAGE.get(top, top)
                used.setdefault(pkg, set()).add(os.path.basename(p))
    return used


def declared():
    if not os.path.exists(REQ):
        return None
    out = set()
    for ln in io.open(REQ, encoding="utf-8"):
        ln = ln.split("#")[0].strip()
        if ln:
            out.add(ln.split("==")[0].split(">=")[0].strip().lower())
    return out


def audit():
    used = imported_packages()
    dec = declared()
    problems = []
    if dec is None:
        problems.append(f"{REQ} が無い（CI が何を入れればよいか分からない）")
        return problems, used, set()
    for pkg, files in sorted(used.items()):
        if pkg.lower() not in dec:
            problems.append(f"{pkg} が {REQ} に無い（使用: {', '.join(sorted(files))}）")
    for pkg in sorted(dec - {p.lower() for p in used}):
        # ★余分な宣言も落とす。使っていないものを入れ続けると、
        #   CI の所要が伸びるだけでなく「何が本当に要るのか」が分からなくなる。
        problems.append(f"{pkg} は {REQ} にあるが、どのスクリプトも import していない")
    return problems, used, dec


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        problems, used, dec = audit()
        if problems:
            print("自己診断: 現状が既にNG（陰性対照が成立しない）")
            for p in problems:
                print("   ", p)
            sys.exit(1)
        orig = io.open(REQ, encoding="utf-8").read()
        try:
            # 陽性対照1: 1行消したら「宣言に無い」で落ちるか
            lines = [ln for ln in orig.split("\n") if ln.strip() and not ln.strip().startswith("#")]
            victim = lines[0]
            io.open(REQ, "w", encoding="utf-8", newline="").write(orig.replace(victim + "\n", "", 1))
            if not any("に無い" in p for p in audit()[0]):
                print(f"自己診断: {victim} を消しても検出できない")
                sys.exit(1)
            # 陽性対照2: 使っていないものを足したら落ちるか
            io.open(REQ, "w", encoding="utf-8", newline="").write(orig + "\nnot-used-anywhere\n")
            if not any("import していない" in p for p in audit()[0]):
                print("自己診断: 使っていない宣言を足しても検出できない")
                sys.exit(1)
        finally:
            io.open(REQ, "w", encoding="utf-8", newline="").write(orig)
        print(f"  陰性対照: 外部依存 {len(used)} 件 → {REQ} と一致")
        print(f"  陽性対照: {victim} を消す → 検出 / 使っていない宣言を足す → 検出")
        print("SELF_TEST_OK")
        sys.exit(0)

    problems, used, dec = audit()
    print(f"scripts/*.py の外部依存 {len(used)} 件 / {REQ} の宣言 {len(dec)} 件")
    for pkg, files in sorted(used.items()):
        print(f"  {pkg:<12} {len(files):>2} ファイル")
    if problems:
        print("\n★NG:")
        for p in problems:
            print("   ", p)
        sys.exit(1)
    print("\nPYTHON_DEPS_OK")
