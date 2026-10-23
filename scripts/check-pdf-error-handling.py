"""PDF生成の失敗を業者向けに伝える経路が、どこにも漏れていないかを検査する。

■ なぜ要るか（2026-07-25 に見つかった退行）
  ⑧で各様式ルートは 422 に「どの項目が何文字超過か」を載せるようにしたが、
  呼び出し側は `if (!response.ok) throw new Error("PDF generation failed")` のままで
  本文を捨てていた。様式フォームごとのPDF出力は業者の主経路なので、
  「PDF生成に失敗しました」としか出ず、業者は何も直せないまま止まっていた。
  ＝ サーバが正しく返しても、UIが捨てたら意味がない。

■ 2026-10-23: 呼ぶ口を 1 つにした（src/lib/pdf-client.ts の fetchPdf）
  以前はこの検査が「PDF のルートを呼ぶ所」を自分で探し、1 か所ずつ `!ok` の扱いを数えていた。
  探し方がリテラルの "/api/generate-" だったので、apiPath を prop で受ける
  bekki-result-form-base.tsx（16 様式）が一度すり抜けた。
  ＝ 探しに行く形をやめ、「fetch を呼んでよいのは pdf-client.ts だけ」という単純な決まりにする。

■ 検査すること
  1. src/ の画面・ライブラリ（src/app/api と *.test.* を除く）で fetch( を呼ぶのは src/lib/pdf-client.ts だけ
     ★PDF 以外の用途で fetch が要るときは、その行に `// fetch-ok: <理由>` を書く（黙って増やさない）
  2. pdf-client.ts が失敗を分類する（throw await pdfRequestError(）
  3. fetchPdf を使うファイルで、PDF・プレビューの失敗を見せる catch は pdfErrorText() を通す
     （通さないと分類した文言が握り潰され、決まった一言に戻る）
     ★`catch {`（受け取る名前の無い形）も見る。以前は見ておらず、報告書表紙のプレビューが一言に戻っていた
  4. 汎用文言（"PDF generation failed" 等）が実コードに残っていない

使い方: python scripts/check-pdf-error-handling.py [--self-test]
全て通れば PDF_ERROR_HANDLING_OK（自己診断は SELF_TEST_OK）を出力して exit 0。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
CLIENT = SRC / "lib" / "pdf-client.ts"
HELPER = "pdf-request-error"

# 実コードに残っていてはいけない汎用文言（ヘルパー内の説明コメントは除く）
GENERIC = (
    'throw new Error("PDF generation failed")',
    'throw new Error("preview failed")',
    'throw new Error("Failed")',
    'alert("PDF生成に失敗しました")',
    'alert("PDF作成に失敗しました")',
)

FETCH_CALL = re.compile(r"(?<![\w.])fetch\(")
FETCH_OK = "// fetch-ok:"
# catch (e) { … } と catch { … } の両方。本体は次の閉じ括弧の行まで（字下げで終わりを見る）
CATCH = re.compile(r"catch\s*(?:\(([^)]*)\))?\s*\{\n([\s\S]*?)\n(\s*)\}")
SHOWS_PDF_ERROR = re.compile(r"(setError|alert|toast\.error)\(\s*[\"'`][^\"'`]*(PDF|プレビュー)")


def strip_comments(src: str) -> str:
    """行コメントを落とす（★説明文の「fetch(」で落ちないように）。文字列中の // は残る形で十分。"""
    return "\n".join(line.split("//", 1)[0] if line.lstrip().startswith("//") else line for line in src.splitlines())


def raw_fetch_lines(name: str, src: str) -> list[str]:
    """規則 1: pdf-client.ts 以外の fetch( を拾う（// fetch-ok: の行は除く）。"""
    out = []
    for i, line in enumerate(src.splitlines(), 1):
        code = line.split("//", 1)[0] if line.lstrip().startswith("//") else line
        if FETCH_CALL.search(code) and FETCH_OK not in line:
            out.append(f"{name}:{i}: {line.strip()[:80]}")
    return out


def bad_catches(name: str, src: str) -> list[str]:
    """規則 3: PDF・プレビューの失敗を見せる catch が pdfErrorText を通しているか。"""
    out = []
    for m in CATCH.finditer(src):
        body = m.group(2)
        if SHOWS_PDF_ERROR.search(body) and "pdfErrorText(" not in body:
            line = src[: m.start()].count("\n") + 1
            out.append(f"{name}:{line}: catch が pdfErrorText を通していない（{SHOWS_PDF_ERROR.search(body).group(0)[:40]}…）")
    return out


def scan() -> tuple[list[str], dict[str, int]]:
    problems: list[str] = []
    stats = {"files": 0, "users": 0}
    files = sorted(
        p for p in SRC.rglob("*")
        if p.suffix in (".ts", ".tsx") and ".test." not in p.name and "app/api" not in p.as_posix()
    )
    stats["files"] = len(files)
    for f in files:
        src = f.read_text(encoding="utf-8")
        rel = f.relative_to(ROOT).as_posix()
        if f != CLIENT:
            problems += [f"★pdf-client.ts 以外で fetch を呼んでいる: {x}" for x in raw_fetch_lines(rel, src)]
        if '"@/lib/pdf-client"' in src:
            stats["users"] += 1
            problems += bad_catches(rel, src)

    client = CLIENT.read_text(encoding="utf-8") if CLIENT.exists() else ""
    if "export async function fetchPdf" not in client:
        problems.append("src/lib/pdf-client.ts に fetchPdf が無い（呼ぶ口が無い）")
    if client.count("throw await pdfRequestError(") != 1:
        problems.append("pdf-client.ts が失敗を pdfRequestError で分類していない（422 の本文が業者に届かない）")

    # 4. 汎用文言（ヘルパー自身の説明コメントは対象外）
    for f in list((SRC / "components").glob("*.tsx")) + list((SRC / "lib").glob("*.ts")):
        if HELPER in f.name:
            continue
        s = f.read_text(encoding="utf-8")
        for g in GENERIC:
            if g in s:
                problems.append(f"汎用文言が残っている: {f.name}: {g}")
    return problems, stats


def self_test() -> int:
    """陽性・陰性の対照。ここが落ちたら、本番の検査が空振りしている。"""
    bad = []
    # 規則 1
    if not raw_fetch_lines("x.tsx", 'const r = await fetch("/api/generate-pdf", {})'):
        bad.append("生の fetch を拾えない")
    if raw_fetch_lines("x.tsx", 'const r = await fetch("/api/x") // fetch-ok: PDF ではない'):
        bad.append("// fetch-ok: の行まで拾った")
    if raw_fetch_lines("x.tsx", "// fetch( はここでは呼ばない（説明）") or raw_fetch_lines("x.tsx", "const r = await fetchPdf(route, body)"):
        bad.append("説明文や fetchPdf を生の fetch と読んだ")
    # 規則 3（★報告書表紙のプレビューで実際に起きた形: catch { … alert("…プレビュー…") }）
    if not bad_catches("x.tsx", 'try {\n  a()\n} catch {\n  alert("報告書表紙プレビューの生成に失敗しました")\n}'):
        bad.append("catch { … } の一言の文言を拾えない")
    if not bad_catches("x.tsx", 'try {\n  a()\n} catch (err) {\n  setError("PDFプレビューの生成に失敗しました。")\n}'):
        bad.append("catch (err) の一言の文言を拾えない")
    if bad_catches("x.tsx", 'try {\n  a()\n} catch (err) {\n  setError(pdfErrorText(err, "PDFプレビューの生成に失敗しました。"))\n}'):
        bad.append("pdfErrorText を通した catch まで拾った")
    if bad_catches("x.tsx", 'try {\n  a()\n} catch (err) {\n  setError("保存に失敗しました")\n}'):
        bad.append("PDF と関係のない catch まで拾った")
    if bad:
        print("自己診断: NG")
        for b in bad:
            print(f"  - {b}")
        return 1
    print("  陽性対照: 生の fetch・catch { } の一言・catch (err) の一言を拾う")
    print("  陰性対照: // fetch-ok:・説明文・fetchPdf・pdfErrorText を通した catch・PDF と関係のない catch は拾わない")
    print("SELF_TEST_OK")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    problems, stats = scan()
    print(f"src の画面・ライブラリ {stats['files']} ファイル / fetchPdf を使うファイル {stats['users']}")
    if stats["files"] < 50 or stats["users"] < 10:
        problems.append(f"走査の対象が少なすぎる（{stats}）。探索が壊れている可能性")
    if problems:
        print("\nNG:")
        for p in problems:
            print(f"  - {p}")
        print("\n→ PDF のルートは src/lib/pdf-client.ts の fetchPdf から呼ぶこと。")
        print("  422（業者が直せる）と 5xx/通信断（直せない）の区別は、そこで一度だけ行う。")
        return 1
    print("\nPDF_ERROR_HANDLING_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
