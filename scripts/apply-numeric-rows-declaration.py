# 「数値しか入らない欄」の宣言を各ルートに埋め込む（②の一括適用・1回限り）。
#
# 分類の根拠は scripts/classify-numeric-rows.py の実測（内容セルの刷り込み）。
#   数値   … 単位が刷り込まれている（MPa / L/min / V / A / ％ / mA / ｍ³ / 本 / mm …）
#   選択肢 … 語が刷り込まれている（専用・兼用／差動・定温／一斉・区分…）→ CHOICE_ROWS の領域
#   文字   … 刷り込みが文字（種別・種接地）、見出し、または刷り込み無し（単なる x ずらし）
# ★迷ったら「文字」に倒す。文字はレイアウト上きびしい側なので、測れるものが増える方に倒れる。
#   数値に倒すと "0.45" が入って検査が空振りする（それが今回の問題）。
import io
import sys

sys.stdout.reconfigure(encoding="utf-8")

# 様式ディレクトリ -> { payloadキー: [数値欄の行番号] }
NUMERIC = {
    "generate-doryoku-pump-bekki10-pdf": {"page2_rows": [3]},
    "generate-emergency-power-outlet-bekki21-pdf": {"page1_rows": [6]},
    "generate-foam-bekki5-pdf": {"page1_rows": [11], "page2_rows": [4, 6, 19], "page3_rows": [1, 12, 21]},
    "generate-jidou-kasai-houchi-bekki11-1-pdf": {"page1_rows": [10, 12]},
    "generate-leakage-fire-alarm-bekki12-pdf": {"page1_rows": [10], "page2_rows": [0]},
    "generate-okugai-shokasen-bekki9-pdf": {"page1_rows": [10], "page2_rows": [8, 10, 21], "page3_rows": [3]},
    "generate-shokasen-bekki2-pdf": {
        "page1_rows": [1, 10, 12],
        "page2_rows": [11, 12, 13, 24, 25, 31, 32],
        "page3_rows": [8, 9, 24, 26, 27, 29, 30],
    },
    "generate-smoke-control-bekki18-pdf": {"page1_rows": [15, 17]},
    "generate-sprinkler-bekki3-pdf": {
        "page1_rows": [1, 10, 11, 13],
        "page2_rows": [4, 5, 6, 20, 21, 31, 32],
        "page3_rows": [15, 17, 25],
        "page4_rows": [2, 4, 7, 9, 13],
        "page5_rows": [2, 4, 5, 8, 9],
    },
    "generate-standpipe-bekki20-pdf": {"page1_rows": [7, 17], "page2_rows": [18]},
    "generate-water-spray-bekki4-pdf": {
        "page1_rows": [1, 10, 12],
        "page2_rows": [4, 5, 6, 19, 20, 26, 27],
        "page3_rows": [3, 5, 15],
    },
}

# drawResultRows を使うが数値欄が1つも無い様式（★空でも宣言する。
# 「宣言が無い＝未分類」と「空＝分類した結果ゼロ」を区別できないと、
# 新しい様式が黙って未分類のまま通るため）
EMPTY = [
    "generate-connected-sprinkler-bekki19-pdf",
    "generate-emergency-alarm-bekki14-pdf",
    "generate-evacuation-equipment-bekki15-pdf",
    "generate-fire-department-notification-bekki13-pdf",
    "generate-fire-water-bekki17-pdf",
    "generate-gas-leak-fire-alarm-bekki11-2-pdf",
    "generate-guidance-lights-signs-bekki16-pdf",
    "generate-halogen-bekki7-pdf",
    "generate-inert-gas-bekki6-pdf",
    "generate-powder-bekki8-pdf",
    "generate-radio-communication-support-bekki22-pdf",
]

DOC = """/**
 * テストデータ生成が読む「数値しか入らない欄」の宣言。
 *
 * ★推論してはいけない。以前は contentOverrides / skipContentRows があれば数値欄と
 *   見なしていたが、override の幅は実測で 12〜97pt に連続しており、数値欄と
 *   「単に x をずらしただけの文字欄」を分離できない。その結果、現実値セットの
 *   100セル/14様式に "0.45" が入り、その範囲では切り詰めもはみ出しも測れていなかった。
 *   ＝ ここに書いてあるものだけが数値欄。書き忘れは検査データが甘くなるだけで
 *   済まないので、宣言が無いとテストデータ生成が失敗する。
 *
 * 添字は payload 配列の添字（drawResultRows の startIndex を適用した後の値）。
 * 分類は scripts/classify-numeric-rows.py が出す「内容セルの刷り込み」の実測による。
 */
"""


def fmt(obj):
    if not obj:
        return "export const NUMERIC_ROWS: Record<string, number[]> = {}\n"
    lines = ["export const NUMERIC_ROWS: Record<string, number[]> = {"]
    for k, v in obj.items():
        lines.append(f"    {k}: [{', '.join(str(x) for x in v)}],")
    lines.append("}")
    return "\n".join(lines) + "\n"


n = 0
for d, obj in list(NUMERIC.items()) + [(k, {}) for k in EMPTY]:
    p = f"src/app/api/{d}/route.ts"
    s = io.open(p, encoding="utf-8").read()
    if "NUMERIC_ROWS" in s:
        print(f"  skip(既にある) {d}")
        continue
    # import 群の直後に置く（型定義より前）
    idx = s.rindex('from "')
    idx = s.index("\n", idx) + 1
    s = s[:idx] + "\n" + DOC + fmt(obj) + s[idx:]
    io.open(p, "w", encoding="utf-8", newline="").write(s)
    n += 1
print(f"{n} ルートに NUMERIC_ROWS を追加")
