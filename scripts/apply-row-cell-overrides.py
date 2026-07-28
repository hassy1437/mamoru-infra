# 潜在（右端に単位が刷り込まれている行）に contentOverrides を入れる（①の修正・第2段）。
#
# ■ 規則（compute-row-cell-overrides.py と同じ）
#   セルの右端 = 単位の左端。余白は drawWrappedInCell の padding(2.0) が担う。
#   ＝ 新しい定数を作らない。既に「ずらし」で対処済みの61件と同じ実践。
#
# ■ 挿入のしかた
#   引数を位置で特定する（第6引数＝contentOverrides。第1段で全様式この順に揃えた）。
#   既存の中身は残して追記する。正規表現でオブジェクトを探すと、
#   コメント中の `{ x:` や入れ子を掴む（この解析器で何度も踏んだ）。
#
# 使い方: python scripts/apply-row-cell-overrides.py <route.ts> [<route.ts> ...]
import io
import os
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify_numeric_rows_lib import (  # noqa: E402
    call_span, printed_glyphs_in_cell, split_top, template_of,
)

sys.stdout.reconfigure(encoding="utf-8")

# ★contentOverrides は第6引数（0起点で5）。第1段で全様式この順に統一済み。
OVERRIDE_ARG = 5


def compute(route, src):
    """呼び出しごとに {行番号: (x, w, 単位)} を返す（潜在の行だけ）"""
    from classify_numeric_rows_lib import call_sites
    doc = fitz.open(template_of(route))
    out = []
    for c in call_sites(route):
        add = {}
        if c["key"] and c["bounds"] and c["page"] - 1 < doc.page_count:
            page = doc[c["page"] - 1]
            b = c["bounds"]
            for i in range(len(b) - 1):
                if i in c["skips"] or i in c["overrides"]:
                    continue
                g = printed_glyphs_in_cell(page, b[i], b[i + 1], c["cx"], c["cx"] + c["cw"])
                if not g:
                    continue
                add[i] = (c["cx"], round(g[0][0] - c["cx"], 2), "".join(x[2] for x in g), g[0][0])
        out.append(add)
    doc.close()
    return out


def main():
    for route in sys.argv[1:]:
        src = io.open(route, encoding="utf-8").read()
        adds = compute(route, src)
        # 呼び出しを後ろから書き換える（前を書き換えると後ろの位置がずれる）
        starts = []
        idx = src.find("drawResultRows(")
        while idx != -1:
            import re
            if not re.search(r"const\s+$", src[max(0, idx - 40):idx]):
                starts.append(idx)
            idx = src.find("drawResultRows(", idx + 1)
        assert len(starts) == len(adds), f"{route}: 呼び出し数が一致しない {len(starts)} vs {len(adds)}"

        n = 0
        for start, add in sorted(zip(starts, adds), reverse=True):
            if not add:
                continue
            span = call_span(src, start + len("drawResultRows"))
            parts = split_top(span[1:-1])
            assert len(parts) >= OVERRIDE_ARG, f"{route}: 引数が少なすぎる ({len(parts)})"
            lines = [f"            {i}: {{ x: {x}, w: {w} }},   // 刷り込み「{u}」({ux:.2f}) の手前で止める"
                     for i, (x, w, u, ux) in sorted(add.items())]
            body = "\n".join(lines)
            # 既定値で省略している呼び出し（引数5つ）は、そこに新しく足す
            if len(parts) == OVERRIDE_ARG:
                parts.append("")
            cur = parts[OVERRIDE_ARG]
            if cur.strip() in ("", "{}"):
                new = "{\n" + body + "\n        }"
            else:
                assert cur.rstrip().endswith("}"), f"{route}: 第6引数がオブジェクトでない: {cur[:40]}"
                cut = cur.rstrip().rfind("}")
                new = cur.rstrip()[:cut] + body + "\n        }"
            parts[OVERRIDE_ARG] = " " + new.lstrip() if not cur.startswith("\n") else new
            new_span = "(" + ",".join(parts) + ")"
            src = src[:start + len("drawResultRows")] + new_span + src[start + len("drawResultRows") + len(span):]
            n += len(add)
        io.open(route, "w", encoding="utf-8", newline="").write(src)
        print(f"  {os.path.basename(os.path.dirname(route))}: {n} 行に override を追加")


if __name__ == "__main__":
    main()
