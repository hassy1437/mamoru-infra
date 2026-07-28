# いま「数値欄」と推論されている行を全部洗い出し、テンプレートの実測を添えて分類可能にする。
#
# ■ なぜ要るか
#   lib-numeric-rows.mjs は contentOverrides / skipContentRows があれば数値欄と見なしていた。
#   実測すると override の幅は 12〜97pt で連続しており、幅では数値欄と
#   「単に x をずらしただけの欄」を分離できない。結果、現実値セットの100セルに
#   "0.45" が入り、その範囲では切り詰め検査もはみ出し検査も空振りしていた。
#   ＝ 推論をやめて宣言にする。その宣言を作るための材料をここで出す。
#
# 出力: 行ごとに「その行の内容セルにテンプレートが何を刷り込んでいるか」
#       単位（MPa / V / A / ％ / L/min …）があれば数値欄、無ければ文字欄の候補。
#
# 使い方: python scripts/classify-numeric-rows.py [--tsv]
import glob
import io
import os
import re
import sys

import fitz

sys.stdout.reconfigure(encoding="utf-8")

# 単位・数量を示す刷り込み（これがセル内にあれば数値が入る欄）
UNIT = re.compile(
    r"MPa|L/min|kPa|mA|db|dB|ｍ3|m3|㎥|mm|ｍｍ|kg|Ω|Ｖ|Ｗ|Ａ|[VWA](?![a-z])"
    r"|％|%|本|個|台|分|秒|時間|号|回"
)


def call_span(src: str, start: int) -> str:
    depth = 0
    for i in range(start, len(src)):
        if src[i] == "(":
            depth += 1
        elif src[i] == ")":
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
    return ""


def split_top(args: str):
    out, depth, cur = [], 0, ""
    for c in args:
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        if c == "," and depth == 0:
            out.append(cur)
            cur = ""
            continue
        cur += c
    if cur.strip():
        out.append(cur)
    return out


def printed_in_cell(page, top, bot, x0, x1):
    chars = []
    for blk in page.get_text("rawdict")["blocks"]:
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                for ch in sp.get("chars", []):
                    cx0, cy0, cx1, cy1 = ch["bbox"]
                    if top <= (cy0 + cy1) / 2 <= bot and x0 - 2 <= cx0 and cx1 <= x1 + 2 and ch["c"].strip():
                        chars.append((cx0, ch["c"]))
    return "".join(c[1] for c in sorted(chars))


rows_out = []
for route in sorted(glob.glob("src/app/api/*-pdf/route.ts")):
    src = io.open(route, encoding="utf-8").read()
    name = os.path.basename(os.path.dirname(route)).replace("generate-", "").replace("-pdf", "")
    tm = re.search(r'"(s50_kokuji14_[\w.-]+\.pdf)"', src)
    if not tm:
        continue
    tpl = os.path.join("public", "PDF", tm.group(1))
    if not os.path.exists(tpl):
        continue
    bounds = {}
    for m in re.finditer(r"const\s+(\w*ROW_BOUNDS\w*)\s*(?::[^=]+)?=\s*\[([^\]]*)\]", src):
        bounds[m.group(1)] = [float(x) for x in re.findall(r"[\d.]+", m.group(2))]

    doc = fitz.open(tpl)
    idx = src.find("drawResultRows(")
    while idx != -1:
        if re.search(r"const\s+$", src[max(0, idx - 40):idx]):
            idx = src.find("drawResultRows(", idx + 1)
            continue
        args = call_span(src, idx + len("drawResultRows"))
        parts = split_top(args[1:-1])
        pno = int((re.search(r"page(\d)", parts[0]) or re.match(r".*?(\d)", parts[0])).group(1)) if parts else 1
        rows_key = (re.search(r"page\d+_rows", parts[2]) or [None])
        rows_key = rows_key.group(0) if hasattr(rows_key, "group") else None
        if not rows_key:
            local = re.match(r"\s*([A-Za-z_$][\w$]*)", parts[2].replace("blankPrintedRows(", ""))
            if local:
                decl = re.search(r"const\s+" + local.group(1) + r"\s*=([^\n]*)", src)
                if decl:
                    mm = re.search(r"page\d+_rows", decl.group(1))
                    rows_key = mm.group(0) if mm else None
        bname = (re.search(r"\w*ROW_BOUNDS\w*", parts[3]) or [None])
        bname = bname.group(0) if hasattr(bname, "group") else None
        # ★列定義の渡し方が様式ごとに違う。素朴に parts[4] を見ると測れない:
        #     bekki20 … commonCols という変数（const を辿る）
        #     bekki2  … 第5引数が startIndex（数値）で、列は関数内の既定値
        #   測れないものを黙って「刷り込みなし」にすると分類を誤る（実際に誤った）。
        cols = parts[4] if len(parts) > 4 else ""
        start_index = 0
        rest = parts[5:]
        if re.match(r"^\s*\d+\s*$", cols):          # bekki2: startIndex
            start_index = int(cols.strip())
            cols = ""
        elif re.match(r"^\s*[A-Za-z_$][\w$]*\s*$", cols):   # 変数参照
            decl = re.search(r"const\s+" + cols.strip() + r"\s*(?::[^=]+)?=\s*\{([\s\S]*?)\n\s*\}", src)
            cols = decl.group(1) if decl else ""
        cx = re.search(r"contentX:\s*([\d.]+)", cols)
        cw = re.search(r"contentW:\s*([\d.]+)", cols)
        if not cx:
            # 関数内の既定値（bekki2: contentOverrides[i]?.x ?? 239 / ?.w ?? 104）
            body = re.search(r"contentOverrides\[i\]\?\.x\s*\?\?\s*([\d.]+)[\s\S]{0,120}?\?\.w\s*\?\?\s*([\d.]+)", src)
            if not body:
                raise SystemExit(f"★{name} p{pno}: 内容列を特定できない（分類の前提が崩れている）")
            cx, cw = float(body.group(1)), float(body.group(2))
        else:
            cx, cw = float(cx.group(1)), float(cw.group(1))

        inferred = {}
        for part in rest:
            for m in re.finditer(r"(\d+):\s*\{\s*x:\s*([\d.]+)\s*,\s*w:\s*([\d.]+)\s*\}", part):
                inferred[int(m.group(1))] = ("override", float(m.group(2)), float(m.group(3)))
            if re.match(r"^\s*new Set\(", part):
                inner = re.search(r"new Set\(\[([\s\S]*)\]\)", part)
                if inner:
                    for m in re.finditer(r"\d+", re.sub(r"//.*", "", inner.group(1))):
                        inferred.setdefault(int(m.group(0)), ("skip", cx, cw))

        b = bounds.get(bname, [])
        page = doc[pno - 1] if pno - 1 < doc.page_count else None
        for i, (kind, ox, ow) in sorted(inferred.items()):
            # ★添字は rowBounds 基準。payload の添字は startIndex を足したもの。
            #   bekki2 の page3 は startIndex=22 で、22ずれる。
            pi = i + start_index
            if not b or i + 1 >= len(b) or page is None:
                rows_out.append((name, pno, rows_key, pi, kind, ow, "?境界不明"))
                continue
            txt = printed_in_cell(page, b[i], b[i + 1], cx, cx + cw)
            rows_out.append((name, pno, rows_key, pi, kind, ow, txt))
        idx = src.find("drawResultRows(", idx + 1)
    doc.close()

if "--tsv" in sys.argv:
    for r in rows_out:
        print("\t".join(str(x) for x in r))
    raise SystemExit(0)

print(f"推論で「数値欄」とされている行: {len(rows_out)} 件\n")
print(f"{'様式':<26}{'p':<3}{'rows':<13}{'行':<5}{'由来':<10}{'幅':<8}{'単位':<5}刷り込み")
print("-" * 110)
num = txtn = unk = 0
for name, pno, key, i, kind, ow, txt in rows_out:
    has = "数値" if UNIT.search(txt) else ("文字" if txt else "なし")
    if has == "数値":
        num += 1
    elif has == "文字":
        txtn += 1
    else:
        unk += 1
    print(f"{name:<26}{pno:<3}{str(key):<13}{i:<5}{kind:<10}{ow:<8.1f}{has:<5}{txt!r}")
print(f"\n単位あり(数値欄) {num} / 刷り込みはあるが単位なし {txtn} / 刷り込みなし {unk}")
