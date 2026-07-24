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
FORM_TSX = ROOT / "src" / "components" / "bekki-result-form-base.tsx"

# 入力画面に固定ラベルが無い項目（理由は docstring 参照）
EXEMPT = {"content", "bad_content", "action_content", "equipment_name", "notes"}


def main() -> int:
    ts = LABELS_TS.read_text(encoding="utf-8")
    block = re.search(r"FIELD_LABELS: Record<string, string> = \{(.*?)\n\}", ts, re.S)
    if not block:
        print("FIELD_LABELS を読み取れない")
        return 2
    labels = dict(re.findall(r'(\w+):\s*"([^"]+)"', block.group(1)))

    form = FORM_TSX.read_text(encoding="utf-8")
    form_labels = set(re.findall(r"<Label>([^<{]+)</Label>", form))
    payload_keys = set(re.findall(r"^\s*(\w+):\s*\w", form, re.M))

    problems: list[str] = []
    for key, label in labels.items():
        if key in EXEMPT:
            continue
        if key not in payload_keys:
            problems.append(f"{key}: payload のキーとして入力画面に見当たらない")
        if label not in form_labels:
            problems.append(f"{key}: 表記 {label!r} が入力画面の <Label> に無い（画面: {sorted(form_labels)}）")

    print(f"対応表 {len(labels)} 項目 / 除外 {len(EXEMPT)} 項目 / 検査 {len(labels) - len(EXEMPT & set(labels))} 項目")
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
