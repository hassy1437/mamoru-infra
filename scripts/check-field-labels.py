"""⑧のエラーに出す項目ラベルが、入力画面の表記とズレていないかを検査する。

■ なぜ要るか
  枠に収まらない項目を業者に伝えるとき、表記が入力画面と違うと辿れない。
  入力画面のラベルは JSX に直書きされていて再利用できる定義が無かったため
  FIELD_LABELS を新設したが、放置すると必ずドリフトする。そこで
  「対応表のキーが実際の payload キーとして存在すること」
  「対応表の表記が入力画面の <Label> と一致すること」
  を機械的に固定する。

■ 除外している項目とその理由
  content / bad_content / action_content … 点検結果の行。入力画面では
      {field.label} で動的に描かれるため固定文字列として照合できない。
  equipment_name … 様式別フォーム側にあり、共通フォームには無い。

使い方: python scripts/check-field-labels.py
一致していれば FIELD_LABELS_OK を出力して exit 0。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LABELS_TS = ROOT / "src" / "lib" / "pdf-fit-report.ts"
# ★共通フォームだけを見ると、様式固有フォーム（foam-bekki5-form.tsx 等）にしか無い項目が
#   検査から漏れる。実際 bekki5 の型式番号2欄は共通フォームに存在しない。
# ★"*bekki*-form.tsx" だけだと報告書（第1号様式）の入力画面が丸ごと外れる。
#   報告書の項目は property-form.tsx にあり、FIELD_LABELS に足した瞬間に
#   「画面に無い」と誤って落ちた（＝走査範囲の限定で取りこぼす形をここでも踏んだ）。
# ★総括表（#28・2026-10-06）: 不良内容・措置内容・立会者の入力欄は共有の部品にあり、
#   保存の形（bad_detail / action / witness）は lib/soukatsu-equipment.ts に定義している。
# ★表紙の宛名（2026-10-19）: 入力欄は共有の部品 soukatsu-cover-inputs.tsx にあり、
#   保存の形（fire_department_name）は lib/soukatsu-cover.ts に定義している。
FORM_TSX = sorted([ROOT / "src" / "components" / "bekki-result-form-base.tsx",
                   ROOT / "src" / "components" / "property-form.tsx",
                   ROOT / "src" / "components" / "soukatsu-equipment-details.tsx",
                   ROOT / "src" / "components" / "soukatsu-cover-inputs.tsx",
                   ROOT / "src" / "lib" / "soukatsu-equipment.ts",
                   ROOT / "src" / "lib" / "soukatsu-cover.ts",
                   # ★2026-10-22: 点検者の登録画面（点検者一覧の欄）と、測定の列の見出し
                   ROOT / "src" / "components" / "inspector-master-form.tsx",
                   ROOT / "src" / "components" / "license-editor.tsx",
                   ROOT / "src" / "components" / "measure-header-inputs.tsx",
                   ROOT / "src" / "lib" / "measure-headers.ts"]
                  + list((ROOT / "src" / "components").glob("*bekki*-form.tsx")))

# 入力画面に固定ラベルが無い項目（理由は docstring 参照）
EXEMPT = {"content", "bad_content", "action_content", "equipment_name", "notes",
          # 報告書の欄で、入力画面に固定の <Label> が無いもの
          "equipment_types",        # チェックボックス群で <Label> が動的
          # 測定機器の欄。見出し「測定機器 1」の下に placeholder（型式・製造者名）だけで並び <Label> が無い
          "model", "maker",
          # 別記22 の点検設備の製造者名。入力欄の見出しは設定の一覧から {field.label} で描く（固定の <Label> が無い）
          "cable_maker", "antenna_maker", "amplifier_maker",
          # 点検設備名の欄（別記11の1・11の2・12・14・22）。同じく設定の一覧（extraFields）から {field.label} で描く
          "amplifier_model", "receiver_maker", "receiver_model", "repeater_maker", "repeater_model",
          "ct_maker", "ct_model", "operation_maker", "operation_model",
          # 別記15 の見出しの欄（設置階・設置場所）。同じく extraFields から {field.label} で描く
          "install_floor", "install_place",
          # 別記1 の集計の表の器種名。入力画面では表の見出し（<th>器種名</th>）で、<Label> ではない
          "kind",
          # 測定機器の機器名。payload のキーは "name"（表記を引くキーだけ device_name・CellRef.labelKey）。入力欄は placeholder だけ
          "device_name",
          # ★2026-10-22: 画面の表記が式で組み立てられていて、固定の文字列として照合できないもの
          # 測定機器の校正年月日（aria-label は `${label} 校正年月日`＝「測定機器 N 校正年月日」）
          "calibrated_at",
          # 行の中の 2 つ目の値。placeholder は様式の設定から（既定「電流(A)」・第12・第21 は FORM_FIELD_LABELS）
          "current_value",
          # 別記18 の排煙機。画面は見出し「排煙機（製造者・型式）」の下に「製造者名」「型式等」
          "smoke_machine_maker", "smoke_machine_model",
          # その5 の容器の表の測定の欄（見出しは「測定N<br/>値」、aria-label は `容器N 測定N …`）
          *{f"measure{n}_{k}" for n in range(1, 7) for k in ("value", "date", "temp")},
          # 測定の列の見出し（aria-label は `測定${m + 1} 点検年月日`。どの測定かは CellRef.place）
          "date", "temp",
          # 総括表の設備の行の設備名。payload のキーは "name"（表記を引くキーだけ equipment_row_name）。
          # 画面では入力欄ではなく各行の見出し（{item.name}）として出るので、固定の <Label> が無い
          "equipment_row_name"}


def main() -> int:
    ts = LABELS_TS.read_text(encoding="utf-8")
    block = re.search(r"FIELD_LABELS: Record<string, string> = \{(.*?)\n\}", ts, re.S)
    if not block:
        print("FIELD_LABELS を読み取れない")
        return 2
    labels = dict(re.findall(r'(\w+):\s*"([^"]+)"', block.group(1)))

    form_labels: set[str] = set()
    payload_keys: set[str] = set()
    for f in FORM_TSX:
        form = f.read_text(encoding="utf-8")
        # ★属性つきの <Label htmlFor="..."> も拾う。属性なしだけを見ていたため
        #   property-form.tsx のラベルが1つも拾えず「画面に無い」と誤判定した。
        form_labels |= {t.strip() for t in re.findall(r"<Label[^>]*>([^<{]+)</Label>", form)}
        # ★2026-10-22: 表の見出し・placeholder・aria-label・設定の一覧の表記も画面の表記として読む。
        #   表の中の欄（容器の表・集計の表・行の中の数値）は <Label> を持たず、見出しや placeholder が表記になる
        form_labels |= {t.strip() for t in re.findall(r"<th[^>]*>([^<{]+)</th>", form)}
        form_labels |= {t.strip() for t in re.findall(r'(?:placeholder|aria-label)="([^"]+)"', form)}
        form_labels |= {t.strip() for t in re.findall(r'\b(?:label|first|second):\s*"([^"]+)"', form)}
        # ★省略できるキー（bad_detail?: string）も拾う
        payload_keys |= set(re.findall(r"^\s*(\w+)\??:\s*\w", form, re.M))
        # 設定の一覧（{ key: "body_maker", label: … }）と、行の欄の更新（updateRowField(…, "content_tsuro", e.target.value)）
        payload_keys |= set(re.findall(r'\bkey:\s*"(\w+)"', form))
        payload_keys |= set(re.findall(r'"(\w+)",\s*e\.target\.value', form))

    problems: list[str] = []
    # ★様式ごとの表記（FORM_FIELD_LABELS）も、表記が画面にあるかを見る（キーは様式ごとに違うので見ない）
    form_block = re.search(r"FORM_FIELD_LABELS: Record<string, Record<string, string>> = \{(.*?)\n\}", ts, re.S)
    if not form_block:
        print("FORM_FIELD_LABELS を読み取れない")
        return 2
    for key, label in re.findall(r'(\w+):\s*"([^"]+)"', form_block.group(1)):
        if label not in form_labels:
            problems.append(f"FORM_FIELD_LABELS の {key}: 表記 {label!r} が入力画面に無い")
    for key, label in labels.items():
        if key in EXEMPT:
            continue
        if key not in payload_keys:
            problems.append(f"{key}: payload のキーとして入力画面に見当たらない")
        if label not in form_labels:
            problems.append(f"{key}: 表記 {label!r} が入力画面の <Label> に無い（画面に無い）")

    print(f"対応表 {len(labels)} 項目 / 除外 {len(EXEMPT)} 項目 / 検査 {len(labels) - len(EXEMPT & set(labels))} 項目"
          f" / 走査フォーム {len(FORM_TSX)} 件")
    if problems:
        print("\n不一致:")
        for p in problems:
            print(f"  - {p}")
        print("\n→ 入力画面の表記を変えたら FIELD_LABELS も直すこと。")
        print("  業者は画面の表記でしか項目を辿れないので、ズレるとエラーが役に立たなくなる。")
        return 1

    print("\nFIELD_LABELS_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
