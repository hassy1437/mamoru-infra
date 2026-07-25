"""ベースラインPNGの登録と照合。長文セットと現実値セットを別々に持つ。

■ ★退行検知はこの端末限定（2026-07-25 時点の割り切り）
  ベースラインPNGは .tmp/ 配下（gitignore対象・130枚31MB）に置いており、リポジトリには
  含まれない。＝ 別の端末やCIでは照合できない。
  コミットしない理由: フォント描画は環境差が出るため、別マシンでは「正しい変更」まで
  全面差分になりうる。ハッシュにしても同じ。持ち運べる形にしても問題を解かない可能性が
  高いので、いまローカルで機能しているものを作り直す価値は薄いと判断した。
  ＝ 環境が変わったら register し直してから使うこと。差分が全面に出たら、まず環境差を疑う。

■ なぜ2系統要るか
  長文セット   … 全項目に意図的な長文を入れたストレステスト。
                 「レイアウトの限界」が退行していないかを見る。
  現実値セット … 実際に提出される値。「出荷品質」が退行していないかを見る。
  用途が違うので片方だけでは「どちらの意味で壊れたか」が分からない。

■ 使い方
  python scripts/baseline.py register [stress|realistic|all]
      現在の生成物を .tmp/baseline/<set>/ に登録する（承認後にのみ実行すること）
  python scripts/baseline.py check [stress|realistic|all]
      現在の生成物とベースラインを比較し、差分ピクセル数を出す

  PDFの生成は先に済ませておくこと:
      node scripts/generate-bekki*-route-tests.mjs / tmp/run-extra-routes.mjs   （長文）
      node scripts/generate-realistic-route-tests.mjs                           （現実値）

■ 解像度
  150dpi 固定。スケールは 150/72 を必ず割り切らずに渡す
  （4.1666 のように丸めた値を使うとサブピクセルのズレで全面が差分になる。実際に踏んだ）。
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import fitz
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE_DIR = ROOT / ".tmp" / "baseline"
DPI = 150
SCALE = DPI / 72  # ★丸めないこと

SETS = {
    # 長文セット: 各生成スクリプトの出力先に散らばっている
    "stress": [ROOT / "tmp" / d for d in
               ("pdf-test-bekki234", "pdf-test-bekki5678", "pdf-test-bekki9to12",
                "pdf-test-bekki13to22", "pdf-test-extra")],
    "realistic": [ROOT / "tmp" / "pdf-realistic"],
}


def pdfs(set_name: str) -> list[Path]:
    out: list[Path] = []
    for d in SETS[set_name]:
        if d.exists():
            out += [p for p in sorted(d.glob("*.pdf")) if "debug" not in p.name]
    return out


def render(pdf: Path, out_dir: Path) -> list[Path]:
    made = []
    doc = fitz.open(pdf)
    for pno, page in enumerate(doc, start=1):
        out = out_dir / f"{pdf.stem}-p{pno}.png"
        page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), alpha=False).save(out)
        made.append(out)
    doc.close()
    return made


def register(set_name: str) -> int:
    files = pdfs(set_name)
    if not files:
        print(f"  {set_name}: PDFが見つからない。先に生成すること")
        return 1
    out_dir = BASE_DIR / set_name
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    n = sum(len(render(p, out_dir)) for p in files)
    print(f"  {set_name}: {len(files)} PDF / {n} ページを登録 → {out_dir}")
    return 0


def check(set_name: str) -> int:
    base = BASE_DIR / set_name
    if not base.exists():
        print(f"  {set_name}: ベースライン未登録")
        return 2
    cur_dir = ROOT / "tmp" / f"_baseline_check_{set_name}"
    if cur_dir.exists():
        shutil.rmtree(cur_dir)
    cur_dir.mkdir(parents=True)
    for p in pdfs(set_name):
        render(p, cur_dir)

    base_files = {p.name for p in base.glob("*.png")}
    cur_files = {p.name for p in cur_dir.glob("*.png")}
    diffs: list[tuple[str, int]] = []
    for name in sorted(base_files & cur_files):
        a = fitz.Pixmap(str(base / name))
        b = fitz.Pixmap(str(cur_dir / name))
        if (a.width, a.height) != (b.width, b.height):
            diffs.append((name, -1))
            continue
        ia = np.frombuffer(a.samples, dtype=np.uint8)
        ib = np.frombuffer(b.samples, dtype=np.uint8)
        d = int((ia != ib).sum())
        if d:
            diffs.append((name, d))

    only_base = sorted(base_files - cur_files)
    only_cur = sorted(cur_files - base_files)
    print(f"  {set_name}: 比較 {len(base_files & cur_files)} ページ / 差分 {len(diffs)} ページ")
    for name, d in diffs[:20]:
        print(f"    {name}: {'サイズ不一致' if d < 0 else f'{d} px'}")
    if only_base:
        print(f"    ベースラインにのみ存在: {len(only_base)} ({only_base[:3]})")
    if only_cur:
        print(f"    現在にのみ存在: {len(only_cur)} ({only_cur[:3]})")
    shutil.rmtree(cur_dir)
    return 1 if (diffs or only_base or only_cur) else 0


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] not in ("register", "check"):
        print(__doc__)
        return 2
    mode = sys.argv[1]
    target = sys.argv[2] if len(sys.argv) > 2 else "all"
    names = list(SETS) if target == "all" else [target]
    rc = 0
    for name in names:
        rc |= (register(name) if mode == "register" else check(name))
    if mode == "check" and rc == 0:
        print("BASELINE_MATCH")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
