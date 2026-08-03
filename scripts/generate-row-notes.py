# 入力画面に出す「※印の条件文」を、正典（様式PDF）から導出して src/lib/bekki-row-notes.ts に書く。
#
# ■ なぜ要るか
#   様式の備考には「票中※印の欄は、自動試験機能を有するものにあっては記入不要」のような
#   条件が書いてある。行ラベルには※が入っている（例「※端子電圧（Ｖ）」）のに、
#   **条件文がアプリのどこにも無い**ため、業者は様式PDFを別途見ないと条件を知りようがない。
#   ＝ ※の欄に条件外で記入できてしまう状態。
#
# ■ ★対象行を列挙しない
#   「どの行に※が付くか」はテンプレートの刷り込みから測る。
#   「その※が何を意味するか」は同じページの備考から取る（原文のまま。言い換えない）。
#   誘導灯のように ※ / ※※ / ※※※ で条件が違う様式があるので、段階ごとに対応付ける。
#
# 使い方: python scripts/generate-row-notes.py [--check]
#   --check … 生成し直して既存と差分が無いことだけ確認する（CI用）
import io
import os
import re
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify_numeric_rows_lib import call_sites, template_of  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "lib", "bekki-row-notes.ts")

# 備考の「票中※…」を段階ごとに拾う。★段階の判定は※の数だけで行い、語で推測しない。
BIKOU_STAR = re.compile(r"(票中(※+)[^。]*。|(※+)印のあるものは[^。]*。)")


def form_key(route_dir):
    """★キーは apiPath に合わせる。入力画面（共有ベース）が持っているのが apiPath なので、
    様式名で持つと『apiPath → 様式名』の対応表がもう1つ要り、そこがドリフトする。"""
    return f"/api/{route_dir}"


def bikou_notes(page_text):
    """そのページの備考から ※ の段階 → 条件文（原文）"""
    i = page_text.find("備考")
    if i < 0:
        return {}
    body = re.sub(r"[ 　]*\n[ 　]*", "", page_text[i + 2:])
    out = {}
    for m in BIKOU_STAR.finditer(body):
        text = m.group(0)
        stars = (m.group(2) or m.group(3) or "").count("※")
        # 「票中」で始まる文はその番号を落として読みやすくする（原文の文そのものは変えない）
        out.setdefault(stars, text.strip())
    return out


def star_rows(route, doc):
    """※ が刷り込まれている行 → (段階, ページ, rowsKey, 行番号)"""
    sites = [c for c in call_sites(route) if c["bounds"] and c["key"]]
    out = []
    for pno in range(doc.page_count):
        for b in doc[pno].get_text("rawdict")["blocks"]:
            for l in b.get("lines", []):
                for s in l["spans"]:
                    t = "".join(c["c"] for c in s.get("chars", [])).strip()
                    if "※" not in t or any(w in t for w in ("この用紙", "票中", "規定する", "印のあるもの")):
                        continue
                    stars = len(re.match(r"※+", t.lstrip()).group(0)) if t.lstrip().startswith("※") else 1
                    y = (s["bbox"][1] + s["bbox"][3]) / 2
                    for c in sites:
                        if c["page"] != pno + 1:
                            continue
                        bb = c["bounds"]
                        for i in range(len(bb) - 1):
                            if bb[i] <= y <= bb[i + 1]:
                                out.append((stars, pno + 1, c["key"], i + c["start"]))
    return out


def label_star_rows():
    """行ラベル（入力画面の表記）から「※が付く行」を取る。
    ★テンプレートの幾何だけでは足りない。※は結合セルに刷り込まれていることがあり
      （例「※火災表示等」が 二信号式/蓄積式/アナログ式/その他 の4行にまたがる）、
      y の一致で拾えるのは1行だけになる。ラベルは様式の表記を写したものなので、
      グループの子行まで含む。★両方を突き合わせて、幾何側が部分集合であることを検査する。"""
    src = io.open(os.path.join(ROOT, "src/lib/bekki-row-labels.ts"), encoding="utf-8").read()
    out = {}
    for fm in re.finditer(r'\n    "([^"]+)": \{([\s\S]*?)\n    \},', src + "\n    },"):
        d = {}
        for km in re.finditer(r"(page\d+_rows): \[([\s\S]*?)\n        \]", fm.group(2)):
            for i, t in enumerate(re.findall(r'"([^"]*)"', km.group(2))):
                m = re.search(r"※+", t)
                if m:
                    d.setdefault(km.group(1), {})[i] = len(m.group(0))
        out[fm.group(1)] = d
    return out


def build():
    import glob
    data = {}
    unmatched = []
    by_label = label_star_rows()
    for route in sorted(glob.glob(os.path.join(ROOT, "src/app/api/*/route.ts"))):
        dn = os.path.basename(os.path.dirname(route))
        if not re.fullmatch(r"generate-[A-Za-z0-9_-]*pdf", dn):
            continue
        tpl = template_of(route)
        if not tpl:
            continue
        form = form_key(dn)
        src = io.open(route, encoding="utf-8").read()
        fm = re.search(r'buildFitError\(\s*"([^"]+)"', src)
        label_rows = by_label.get(fm.group(1), {}) if fm else {}
        doc = fitz.open(tpl)
        geo = star_rows(route, doc)
        # ★行の集合はラベル側（結合セルの子行まで含む）。段階はラベルの※の数。
        rows = [(lv, None, k, i) for k, d in label_rows.items() for i, lv in d.items()]
        # 幾何側がラベル側の部分集合であることを確かめる（片方だけ増えたら気づけるように）
        geo_set = {(k, i) for _, _, k, i in geo}
        lab_set = {(k, i) for _, _, k, i in rows}
        for miss in sorted(geo_set - lab_set):
            unmatched.append((form, "幾何にはあるがラベルに※が無い", miss))
        if not rows:
            doc.close()
            continue
        notes_by_page = {p + 1: bikou_notes(doc[p].get_text("text")) for p in range(doc.page_count)}
        for stars, page, key, idx in rows:
            note = notes_by_page.get(page, {}).get(stars) if page else None
            if not note:
                # ★同じページに条件文が無い様式がある（bekki11_1 のその1は6番、その2は7番）。
                #   段階が一致する文を他ページから探す。それも無ければ「未対応」として出す。
                for p2, m in notes_by_page.items():
                    if stars in m:
                        note = m[stars]
                        break
            if not note:
                unmatched.append((form, page, key, idx, stars))
                continue
            data.setdefault(form, {}).setdefault(key, {})[idx] = note
        doc.close()
    return data, unmatched


def render(data):
    lines = [
        "// ★このファイルは scripts/generate-row-notes.py が生成する。手で編集しないこと。",
        "//   （scripts/check-row-notes.py が「再生成して差分0」を検査する）",
        "//",
        "// 入力画面に出す「※印の条件文」。出典は各様式の備考の**原文**。",
        "// 行ラベルには※が入っているのに条件がどこにも無く、業者は様式PDFを見ないと",
        "// 判断できなかった。言い換えると意味が変わるので原文のまま持つ。",
        "",
        "export const BEKKI_ROW_NOTES: Record<string, Record<string, Record<number, string>>> = {",
    ]
    for form in sorted(data):
        lines.append(f'    "{form}": {{')
        for key in sorted(data[form]):
            lines.append(f"        {key}: {{")
            for idx in sorted(data[form][key]):
                lines.append(f'            {idx}: "{data[form][key][idx]}",')
            lines.append("        },")
        lines.append("    },")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    data, unmatched = build()
    total = sum(len(v) for f in data.values() for v in f.values())
    text = render(data)
    if "--check" in sys.argv:
        cur = io.open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if cur != text:
            print("★NG: 再生成すると差分が出る（正典かテンプレートが変わった）。"
                  "python scripts/generate-row-notes.py で作り直すこと")
            sys.exit(1)
        print(f"※の条件文 {total} 行 / {len(data)} 様式 → 再生成しても差分0")
        print("ROW_NOTES_OK")
        sys.exit(0)
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(text)
    print(f"{OUT} に {total} 行 / {len(data)} 様式 を書き出し")
    for form in sorted(data):
        n = sum(len(v) for v in data[form].values())
        print(f"   {form}: {n} 行")
    if unmatched:
        print(f"★条件文を対応付けられなかった行 {len(unmatched)} 件")
        for u in unmatched:
            print(f"     {u}")
