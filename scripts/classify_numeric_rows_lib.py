"""ルート実装とテンプレートを突き合わせて「各行の内容セルに何が刷り込まれているか」を測る。

classify-numeric-rows.py（分類の材料出し）と check-numeric-rows-declaration.py（宣言の検査）が
同じ測り方を使うための共有部品。★測り方が2つに分かれると、分類の根拠と検査の根拠が
ずれても気づけない。

■ 様式ごとに違う書き方を吸収する（実測で分かったものだけ）
    列定義が変数         … bekki20 の commonCols
    第5引数が startIndex … bekki2（payload の添字はそのぶん進む。page3 は 22 ずれる）
    列定義が関数内の既定値 … bekki2（contentOverrides[i]?.x ?? 239）
  ★吸収できない書き方に当たったら、黙って空を返さず例外にする。
"""
from __future__ import annotations

import io
import os
import re

import fitz


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


def split_top(args: str) -> list[str]:
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


def _printed_in_cell(page, top, bot, x0, x1) -> str:
    chars = []
    for blk in page.get_text("rawdict")["blocks"]:
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                for ch in sp.get("chars", []):
                    cx0, cy0, cx1, cy1 = ch["bbox"]
                    if top <= (cy0 + cy1) / 2 <= bot and x0 - 2 <= cx0 and cx1 <= x1 + 2 and ch["c"].strip():
                        chars.append((cx0, ch["c"]))
    return "".join(c[1] for c in sorted(chars))


def call_sites(route: str):
    """drawResultRows の呼び出しごとに (ページ番号, payloadキー, rowBounds, startIndex, cx, cw) を返す"""
    src = io.open(route, encoding="utf-8").read()
    bounds = {}
    for m in re.finditer(r"const\s+(\w*ROW_BOUNDS\w*)\s*(?::[^=]+)?=\s*\[([^\]]*)\]", src):
        bounds[m.group(1)] = [float(x) for x in re.findall(r"[\d.]+", m.group(2))]

    out = []
    idx = src.find("drawResultRows(")
    while idx != -1:
        if re.search(r"const\s+$", src[max(0, idx - 40):idx]):
            idx = src.find("drawResultRows(", idx + 1)
            continue
        parts = split_top(call_span(src, idx + len("drawResultRows"))[1:-1])
        pm = re.search(r"page(\d)", parts[0])
        pno = int(pm.group(1)) if pm else 1

        rows_key = None
        m = re.search(r"page\d+_rows", parts[2])
        if m:
            rows_key = m.group(0)
        else:
            local = re.match(r"\s*([A-Za-z_$][\w$]*)", parts[2].replace("blankPrintedRows(", ""))
            if local:
                decl = re.search(r"const\s+" + local.group(1) + r"\s*=([^\n]*)", src)
                if decl:
                    mm = re.search(r"page\d+_rows", decl.group(1))
                    rows_key = mm.group(0) if mm else None

        bm = re.search(r"\w*ROW_BOUNDS\w*", parts[3])
        b = bounds.get(bm.group(0), []) if bm else []

        cols = parts[4] if len(parts) > 4 else ""
        start_index = 0
        if re.match(r"^\s*\d+\s*$", cols):
            start_index = int(cols.strip())
            cols = ""
        elif re.match(r"^\s*[A-Za-z_$][\w$]*\s*$", cols):
            decl = re.search(r"const\s+" + cols.strip() + r"\s*(?::[^=]+)?=\s*\{([\s\S]*?)\n\s*\}", src)
            cols = decl.group(1) if decl else ""
        cxm = re.search(r"contentX:\s*([\d.]+)", cols)
        cwm = re.search(r"contentW:\s*([\d.]+)", cols)
        if cxm and cwm:
            cx, cw = float(cxm.group(1)), float(cwm.group(1))
        else:
            body = re.search(
                r"contentOverrides\[i\]\?\.x\s*\?\?\s*([\d.]+)[\s\S]{0,120}?\?\.w\s*\?\?\s*([\d.]+)", src)
            if not body:
                raise SystemExit(f"★{route} p{pno}: 内容列を特定できない（測り方の前提が崩れている）")
            cx, cw = float(body.group(1)), float(body.group(2))

        # 行ごとの内容セルの上書き（x/w のずらし）と、描画を止めている行
        overrides, skips = {}, set()
        for part in parts[4:]:
            for mm in re.finditer(r"(\d+):\s*\{\s*x:\s*([\d.]+)\s*,\s*w:\s*([\d.]+)\s*\}", part):
                overrides[int(mm.group(1))] = (float(mm.group(2)), float(mm.group(3)))
            if re.match(r"^\s*new Set\(", part):
                inner = re.search(r"new Set\(\[([\s\S]*)\]\)", part)
                if inner:
                    for mm in re.finditer(r"\d+", re.sub(r"//.*", "", inner.group(1))):
                        skips.add(int(mm.group(0)))
        # 行ごと空にする包み（blankPrintedRows(rows, new Set([...]))）も描画されない
        wrap = re.match(r"\s*blankPrintedRows\(", parts[2])
        if wrap:
            inner = re.search(r"new Set\(\[([^\]]*)\]\)", parts[2])
            if inner:
                for mm in re.finditer(r"\d+", inner.group(1)):
                    skips.add(int(mm.group(0)))
        out.append({
            "page": pno, "key": rows_key, "bounds": b, "start": start_index,
            "cx": cx, "cw": cw, "overrides": overrides, "skips": skips,
        })
        idx = src.find("drawResultRows(", idx + 1)
    return out


def template_of(route: str) -> str | None:
    src = io.open(route, encoding="utf-8").read()
    m = re.search(r'"(s50_kokuji14_[\w.-]+\.pdf)"', src)
    if not m:
        return None
    p = os.path.join("public", "PDF", m.group(1))
    return p if os.path.exists(p) else None


def printed_by_row(route: str) -> dict[tuple[str, int], str]:
    """(payloadキー, payload添字) -> その行の内容セルに刷り込まれた文字列"""
    tpl = template_of(route)
    if not tpl:
        return {}
    doc = fitz.open(tpl)
    out: dict[tuple[str, int], str] = {}
    for c in call_sites(route):
        if not c["key"] or not c["bounds"] or c["page"] - 1 >= doc.page_count:
            continue
        page = doc[c["page"] - 1]
        b = c["bounds"]
        for i in range(len(b) - 1):
            out[(c["key"], i + c["start"])] = _printed_in_cell(page, b[i], b[i + 1], c["cx"], c["cx"] + c["cw"])
    doc.close()
    return out


def printed_glyphs_in_cell(page, top, bot, x0, x1):
    """セル内の刷り込みグリフを (x0, x1, 文字) で返す（x順）"""
    chars = []
    for blk in page.get_text("rawdict")["blocks"]:
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                for ch in sp.get("chars", []):
                    cx0, cy0, cx1, cy1 = ch["bbox"]
                    if top <= (cy0 + cy1) / 2 <= bot and x0 - 2 <= cx0 and cx1 <= x1 + 2 and ch["c"].strip():
                        chars.append((cx0, cx1, ch["c"]))
    return sorted(chars)
