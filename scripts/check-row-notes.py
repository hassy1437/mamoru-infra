# ※印の条件文が、正典どおりの行にだけ出ているかを検査する。
#
# ■ 両方向で見る
#   上向き … 行ラベルに※がある行には必ず条件文があること（出ていない＝業者に条件が届かない）
#   下向き … 行ラベルに※が無い行には条件文が無いこと（出ている＝関係ない行に注意書きが出る）
#   さらに、生成物が正典と同期していること（再生成して差分0）。
#
# ■ ★表示側（データがあっても画面に出ていなければ意味がない）
#   データ側しか見ていなかったため、専用フォームの bekki6/7/8 が
#   **1文字も表示していない状態で 39/39 の緑**になっていた。
#   check-warning-consumers.mjs と同じ考え方で、条件文を持つ様式の
#   入力画面が BEKKI_ROW_NOTES に到達していることを検査する:
#     ・共有ベース (bekki-result-form-base.tsx) を使う様式 … ベースが参照していること
#     ・専用フォームの様式                                  … その画面自身が参照していること
#   ★様式の一覧は列挙せず、BEKKI_ROW_NOTES のキーから導く（条件文を足せば自動で対象になる）。
#
# 使い方: python scripts/check-row-notes.py [--self-test]
import io
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def parse_ts(path, name):
    s = io.open(path, encoding="utf-8").read()
    m = re.search(rf"{name}[^=]*=\s*(\{{[\s\S]*\n\}})", s)
    if not m:
        return None
    out = {}
    for fm in re.finditer(r'\n    "([^"]+)": \{([\s\S]*?)\n    \},', m.group(1) + "\n    },"):
        d = {}
        for km in re.finditer(r"(page\d+_rows): \{([\s\S]*?)\n        \}", fm.group(2)):
            for im in re.finditer(r"(\d+): \"((?:[^\"\\]|\\.)*)\"", km.group(2)):
                d.setdefault(km.group(1), {})[int(im.group(1))] = im.group(2)
        for km in re.finditer(r"(page\d+_rows): \[([\s\S]*?)\n        \]", fm.group(2)):
            d[km.group(1)] = re.findall(r'"((?:[^"\\]|\\.)*)"', km.group(2))
        out[fm.group(1)] = d
    return out


def main():
    # 0) 生成物が正典と同期しているか
    r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "generate-row-notes.py"), "--check"],
                       capture_output=True, text=True, encoding="utf-8", cwd=ROOT)
    if r.returncode != 0:
        print(r.stdout.strip() or r.stderr.strip())
        return 1

    notes = parse_ts(os.path.join(ROOT, "src/lib/bekki-row-notes.ts"), "BEKKI_ROW_NOTES")
    labels = parse_ts(os.path.join(ROOT, "src/lib/bekki-row-labels.ts"), "BEKKI_ROW_LABELS")
    if notes is None or labels is None:
        print("★NG: 生成物を読めない")
        return 1

    # apiPath -> 様式名（行ラベル側のキー）。ルートの buildFitError から引く
    api_to_form = {}
    import glob
    for route in glob.glob(os.path.join(ROOT, "src/app/api/*/route.ts")):
        dn = os.path.basename(os.path.dirname(route))
        m = re.search(r'buildFitError\(\s*"([^"]+)"', io.open(route, encoding="utf-8").read())
        if m:
            api_to_form[f"/api/{dn}"] = m.group(1)

    problems = []
    n_noted = n_star = 0
    for api, keys in notes.items():
        form = api_to_form.get(api)
        if not form:
            problems.append(f"{api}: 対応する様式名を引けない")
            continue
        for key, rows in keys.items():
            for idx in rows:
                n_noted += 1
                lab = labels.get(form, {}).get(key, [])
                if idx >= len(lab):
                    problems.append(f"{form} {key}[{idx}]: 行ラベルが無い（行数がずれている）")
                elif "※" not in lab[idx]:
                    problems.append(f"{form} {key}[{idx}]「{lab[idx]}」: ※が無い行に条件文が出ている")
    # 下向き: ラベルに※がある行に条件文が付いているか
    for api, form in api_to_form.items():
        for key, lab in labels.get(form, {}).items():
            if not isinstance(lab, list):
                continue
            for idx, t in enumerate(lab):
                if "※" not in t:
                    continue
                n_star += 1
                if idx not in notes.get(api, {}).get(key, {}):
                    problems.append(f"{form} {key}[{idx}]「{t}」: ※があるのに条件文が無い")

    print(f"※の条件文 {n_noted} 行 / 行ラベルに※がある行 {n_star} 行")

    # ── 表示側: 条件文を持つ様式の入力画面が BEKKI_ROW_NOTES に到達しているか
    base_path = os.path.join(ROOT, "src/components/bekki-result-form-base.tsx")
    base_src = io.open(base_path, encoding="utf-8").read()
    base_ok = "BEKKI_ROW_NOTES" in base_src
    if not base_ok:
        problems.append("共有ベース bekki-result-form-base.tsx が BEKKI_ROW_NOTES を参照していない")
    n_shown = 0
    for api in sorted(notes):
        screens = []
        for f in glob.glob(os.path.join(ROOT, "src/components/*.tsx")) + \
                 glob.glob(os.path.join(ROOT, "src/app/**/*.tsx"), recursive=True):
            src = io.open(f, encoding="utf-8").read()
            if f'"{api}"' in src:
                screens.append((os.path.relpath(f, ROOT).replace("\\", "/"), src))
        if not screens:
            problems.append(f"{api}: 入力画面を特定できない（この様式の条件文は誰にも表示されない）")
            continue
        reached = False
        for rel, src in screens:
            uses_base = "BekkiResultFormBase" in src
            renders_inline = bool(re.search(r"\blabels\.map\(", src))
            if not uses_base and not renders_inline:
                continue  # 行を描かない画面（設定ファイル等）は対象外
            if uses_base and base_ok:
                reached = True
            elif renders_inline and "BEKKI_ROW_NOTES" in src:
                # ★参照しているだけでは足りない。条件文を持つ欄名がその画面に
                #   渡っていないと、その欄の注記だけ静かに出ない。
                missing = [k for k in notes[api] if f'"{k}"' not in src]
                if missing:
                    problems.append(f"{api}: {rel} に欄名 {missing} が渡っていない"
                                    "（その欄の条件文だけ画面に出ない）")
                else:
                    reached = True
            else:
                problems.append(f"{api}: {rel} が行を描いているのに BEKKI_ROW_NOTES に到達しない"
                                "（データはあるが画面に出ない）")
        if reached:
            n_shown += 1
        elif not problems or api not in problems[-1]:
            problems.append(f"{api}: 行を描く入力画面が見つからない（条件文が表示されない）")
    print(f"条件文を持つ様式 {len(notes)} 件 / 表示に到達している入力画面 {n_shown} 件"
          f"（共有ベース参照 {'あり' if base_ok else '★なし'}）")

    if problems:
        print("\n★NG:")
        for p in problems:
            print("   ", p)
        return 1
    print("\nROW_NOTES_OK")
    return 0


def self_test():
    """★両方向。注記の描画を1つ外したら落ちること、戻したら緑になること。
    ソースを一時的に書き換えるので check-pdf-all では排他で走らせる。"""
    cases = [
        ("src/components/inert-gas-bekki6-form.tsx",
         'import { BEKKI_ROW_NOTES } from "@/lib/bekki-row-notes"', "専用フォーム(bekki6)"),
        ("src/components/bekki-result-form-base.tsx",
         'import { BEKKI_ROW_NOTES } from "@/lib/bekki-row-notes"', "共有ベース"),
    ]
    if main() != 0:
        print("★NG: 現状で緑にならない（陰性方向）")
        return 1
    print("  陰性方向: 現状は緑 OK")
    fails = []
    for rel, needle, label in cases:
        path = os.path.join(ROOT, rel)
        original = io.open(path, encoding="utf-8").read()
        if needle not in original:
            fails.append(f"{label}: 目印の import が見つからず陽性対照を作れない")
            continue
        try:
            io.open(path, "w", encoding="utf-8", newline="").write(
                original.replace(needle, "// (self-test) removed", 1).replace("BEKKI_ROW_NOTES", "__REMOVED__"))
            rc = main()
        finally:
            io.open(path, "w", encoding="utf-8", newline="").write(original)
        if rc == 0:
            fails.append(f"{label}: 注記の参照を消しても落ちない")
        else:
            print(f"  陽性方向: {label} の参照を消すと落ちる OK")
    for f in fails:
        print("★NG:", f)
    if fails:
        return 1
    print("SELF_TEST_OK")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv else main())
