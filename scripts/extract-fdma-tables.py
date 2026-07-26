"""消防庁の正典（Word）から表構造とテキストを取り出せることを確かめる。

■ なぜ要るか
  「取得できた＝使える」ではない。Phase 2（欄の型辞書）は Word の表構造に依存するので、
  セル・結合・日本語テキストが実際に取れるところまで先に潰しておく。

■ 形式が2種類ある（実測 2026-07-26）
  bekki5 / bekki10 … 拡張子は .doc だが中身は .docx（ZIP）。そのまま読める
  その他21件      … 本物の .doc（OLE2）。LibreOffice(headless) で .docx に変換してから読む
  ★antiword は表の罫線は読めるが日本語が全て "?" になる（cp932 のマッピングが同梱されていない）。
    構造だけ見て「読めた」と判断すると、テキストが空のまま先に進むことになる。

■ 変換手段
  ローカルに LibreOffice が無いので Docker（linuxserver/libreoffice）で変換する。
  ★Git Bash は -v のパスを Windows パスへ勝手に変換するので MSYS_NO_PATHCONV=1 が要る。

■ ZIP は自前で読まないこと
  最初 Node で ZIP のローカルヘッダを自前で解析したが、Word の出力はローカルヘッダの
  size が 0 でセントラルディレクトリ側にしか入っていないため、23件すべて「表を読めない」
  という誤った結果になった。変換は成功していたので、原因は正典ではなく読み取り側だった。
  ＝ 標準の zipfile を使う。

使い方: python scripts/extract-fdma-tables.py
  変換結果は tmp/fdma-docx/（gitignore 配下。正典そのものではないのでコミットしない）
"""
from __future__ import annotations

import re
import subprocess
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "reference" / "fdma" / "bekki"
WORK = ROOT / "tmp" / "fdma-docx"
IMAGE = "linuxserver/libreoffice:latest"
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
JP = re.compile(r"[぀-ヿ一-龯]")


def is_zip(p: Path) -> bool:
    return p.read_bytes()[:4] == b"PK\x03\x04"


def convert_all(files: list[Path]) -> None:
    """OLE2 の .doc をまとめて .docx へ（コンテナ起動が重いので1回で済ませる）"""
    todo = [f for f in files if not (WORK / f"{f.stem}.docx").exists()]
    for f in todo:
        if is_zip(f):
            (WORK / f"{f.stem}.docx").write_bytes(f.read_bytes())
    todo = [f for f in todo if not (WORK / f"{f.stem}.docx").exists()]
    if not todo:
        return
    win = lambda p: subprocess.run(["cygpath", "-w", str(p)], capture_output=True, text=True).stdout.strip()
    print(f"LibreOffice で {len(todo)} 件を変換中…")
    subprocess.run(
        ["docker", "run", "--rm",
         "-v", f"{win(SRC)}:/in:ro", "-v", f"{win(WORK)}:/out",
         "--entrypoint", "/bin/sh", IMAGE,
         "-c", "soffice --headless --convert-to docx --outdir /out /in/*.doc >/dev/null 2>&1"],
        check=False, env={"MSYS_NO_PATHCONV": "1", "PATH": __import__("os").environ["PATH"]},
    )


def read_tables(docx: Path):
    """表 → 行 → セル（テキストと結合数）"""
    with zipfile.ZipFile(docx) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    tables = []
    for tbl in root.iter(f"{{{NS['w']}}}tbl"):
        rows = []
        for tr in tbl.findall(f"{{{NS['w']}}}tr"):
            cells = []
            for tc in tr.findall(f"{{{NS['w']}}}tc"):
                text = "".join(t.text or "" for t in tc.iter(f"{{{NS['w']}}}t")).strip()
                gs = tc.find(f"{{{NS['w']}}}tcPr/{{{NS['w']}}}gridSpan")
                span = int(gs.get(f"{{{NS['w']}}}val")) if gs is not None else 1
                cells.append({"text": text, "span": span})
            if cells:
                rows.append(cells)
        if rows:
            tables.append(rows)
    return tables


def main() -> int:
    files = sorted(SRC.glob("*.doc"), key=lambda p: p.name)
    if not files:
        print(f"{SRC} が空。先に node scripts/fetch-fdma-reference.mjs")
        return 2
    WORK.mkdir(parents=True, exist_ok=True)
    convert_all(files)

    print(f"{'様式':<10} {'表':>3} {'セル':>5} {'結合':>4} {'日本語':>5}  例")
    print("-" * 66)
    ng = []
    for f in files:
        docx = WORK / f"{f.stem}.docx"
        if not docx.exists():
            print(f"{f.stem:<10} NG docx に変換できていない")
            ng.append(f.stem)
            continue
        tables = read_tables(docx)
        cells = [c for t in tables for r in t for c in r]
        texts = [c["text"] for c in cells if c["text"]]
        jp = [t for t in texts if JP.search(t)]
        merged = sum(1 for c in cells if c["span"] > 1)
        sample = next((t for t in jp), "")
        # ★構造だけでなく日本語が取れていることを合格条件にする
        ok = bool(tables) and bool(jp)
        if not ok:
            ng.append(f.stem)
        print(f"{f.stem:<10} {len(tables):>3} {len(cells):>5} {merged:>4} {len(jp):>5}  {sample[:18]}")

    print("-" * 66)
    print(f"抽出できた様式: {len(files) - len(ng)} / {len(files)}")
    if ng:
        print(f"★読めない様式: {ng}")
        print("  Phase 2（欄の型辞書）の前提が崩れるので先に解決すること。")
        return 1
    print("FDMA_EXTRACT_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
