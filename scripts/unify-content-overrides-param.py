# drawResultRows の引数順序を全様式で揃える（①の修正の第1段・出力は変えない）。
#
# ■ 規則
#   contentOverrides は必ず skipContentRows の直前（cols/sizes の後）。
#   実測で bekki5/9/3/4/12/2 は既にこの順。bekki11-1 だけ skip の後ろにあり逸脱していた。
#
# ■ なぜ順序を揃えるか
#   末尾に足すと様式間で順序が2種類に分かれ、「方針が一部に届かない」を
#   分かっていて新規に作ることになる（このリポジトリで既に5回起きている型）。
#   型が Record と Set で違うので、取り違えは tsc が検出する＝リスクは有界。
#
# ★この段では contentOverrides に値を入れない。出力が変わらないこと
#   （ベースライン差分0）を先に証明するため。
import io
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

PARAM = "            contentOverrides: Record<number, {{ x: number; w: number }}> = {{}},\n"

# (ディレクトリ, 列引数名, skip引数の宣言行 or None, 内容描画行のフォントサイズ)
TARGETS = [
    ("generate-powder-bekki8-pdf", "columns", "skipContentRows", "6.6"),
    ("generate-inert-gas-bekki6-pdf", "columns", "skipContentRows", "6.6"),
    ("generate-doryoku-pump-bekki10-pdf", "columns", "skipContentRows", "6.4"),
    ("generate-halogen-bekki7-pdf", "columns", "skipContentRows", None),
    ("generate-emergency-alarm-bekki14-pdf", "cols", "skipContentRows", "6.2"),
    ("generate-standpipe-bekki20-pdf", "cols", "skipContentRows", "6.0"),
    ("generate-gas-leak-fire-alarm-bekki11-2-pdf", "cols", None, "6.2"),
    ("generate-fire-water-bekki17-pdf", "cols", None, "6.1"),
    ("generate-fire-department-notification-bekki13-pdf", "cols", None, "6.3"),
]


def add_param(src, cols_name, skip_name):
    """contentOverrides を skipContentRows の直前（無ければ cols の直後）に入れる"""
    m = re.search(r"const drawResultRows = \(([\s\S]*?)\) => \{", src)
    if not m:
        raise SystemExit("drawResultRows の定義が見つからない")
    params = m.group(1)
    if "contentOverrides" in params:
        return src, False
    line = "            contentOverrides: Record<number, { x: number; w: number }> = {},\n"
    if skip_name:
        anchor = re.search(r"\n(\s*)" + skip_name + r"\s*[:?]", params)
        if not anchor:
            raise SystemExit(f"{skip_name} の宣言が見つからない")
        new_params = params[:anchor.start() + 1] + line + params[anchor.start() + 1:]
    else:
        anchor = re.search(r"\n(\s*)" + cols_name + r"\s*:[^\n]*\n", params)
        if not anchor:
            raise SystemExit(f"{cols_name} の宣言が見つからない")
        new_params = params[:anchor.end()] + line + params[anchor.end():]
    return src[:m.start(1)] + new_params + src[m.end(1):], True


def use_param(src, cols_name, size):
    """内容描画で cols.contentX/W ではなく override を見る"""
    # ★size は「期待するフォントサイズ」の確認用。指定があれば一致を強制し、
    #   違っていたら（＝別の描画行を掴んでいたら）見つからず落ちる。
    size_pat = r"([\d.]+)" if size is None else f"({re.escape(size)})"
    pat = re.compile(
        r"( *)drawWrappedInCell\(page, pageHeight, row\.content, " + cols_name
        + r"\.contentX, top, " + cols_name + r"\.contentW, h, " + size_pat + r"\)")
    m = pat.search(src)
    if not m:
        raise SystemExit("内容列の描画行が見つからない")
    indent, sz = m.group(1), m.group(2)
    rep = (f"{indent}const cx = contentOverrides[i]?.x ?? {cols_name}.contentX\n"
           f"{indent}const cw = contentOverrides[i]?.w ?? {cols_name}.contentW\n"
           f"{indent}drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, {sz})")
    return src[:m.start()] + rep + src[m.end():]


for d, cols_name, skip_name, size in TARGETS:
    p = f"src/app/api/{d}/route.ts"
    src = io.open(p, encoding="utf-8").read()
    src, added = add_param(src, cols_name, skip_name)
    if not added:
        print(f"  skip(既にある) {d}")
        continue
    src = use_param(src, cols_name, size)
    io.open(p, "w", encoding="utf-8", newline="").write(src)
    print(f"  {d}: contentOverrides を {skip_name or cols_name} の{'直前' if skip_name else '直後'}に追加")
