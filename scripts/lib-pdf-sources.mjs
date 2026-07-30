// 「PDF出力に影響するファイル」の集合を**導出**する。
//
// ■ ★なぜ列挙しないか
//   今日、リテラルで絞った定義が原因の取りこぼしを繰り返した:
//     ・check-pdf-error-handling が `/api/generate-` のリテラルで最大の経路を外した
//     ・報告書が job.json に存在せず、26ルート中1件が測定対象から抜けていた
//     ・ランナーの SOURCE_GLOBS は src/lib を /pdf-.*\.ts$/ で拾っており、
//       別の名前の共有モジュール（bekki-row-labels.ts 等）を取りこぼす
//   列挙は「書き忘れたら気づけない」。**26ルートから import を辿って導く**なら、
//   新しい共有モジュールが増えても自動的に入る＝取りこぼしが構造的に起きない。
//
// ■ 集合の定義
//   (1) src/app/api/*-pdf/route.ts（PDFを返すルート。ディレクトリ名で決まる）
//   (2) (1) から辿れるローカル import の推移閉包（@/… と 相対）
//   (3) テンプレートPDF・埋め込みフォント（描画の入力そのもの）
//   (4) テストデータの生成側（generate-*-route-tests / run-route-pdf / fixtures）
//
// ★(1) が空なら例外にする。「0件を正常として通す」と、ディレクトリ構成が
//   変わったときに黙って全部素通りする。
import fs from "fs"
import path from "path"

const ROOT = process.cwd()

const listFiles = (dir, filter) => {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) return []
    const out = []
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name)
            if (e.isDirectory()) walk(p)
            else if (!filter || filter(p)) out.push(path.relative(ROOT, p).replace(/\\/g, "/"))
        }
    }
    walk(abs)
    return out.sort()
}

/** import 指定子をファイルへ解決する（@/… と 相対のみ。node_modules は対象外） */
const resolveImport = (fromFile, spec) => {
    let base
    if (spec.startsWith("@/")) base = path.join(ROOT, "src", spec.slice(2))
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(path.join(ROOT, fromFile)), spec)
    else return null
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
            return path.relative(ROOT, cand).replace(/\\/g, "/")
        }
    }
    return null
}

/** PDF出力に影響するファイルの集合（相対パス・昇順） */
export const pdfSourceFiles = () => {
    const routes = listFiles("src/app/api", (p) =>
        p.endsWith("route.ts") && /[\\/]generate-[\w-]*pdf[\\/]route\.ts$/.test(p))
    if (routes.length === 0) {
        throw new Error("lib-pdf-sources: PDFルートが1件も見つからない（構成が変わった可能性）")
    }

    const seen = new Set(routes)
    const queue = [...routes]
    while (queue.length) {
        const f = queue.pop()
        const src = fs.readFileSync(path.join(ROOT, f), "utf8")
        for (const m of src.matchAll(/from\s+"([^"]+)"/g)) {
            const r = resolveImport(f, m[1])
            if (r && !seen.has(r)) {
                seen.add(r)
                queue.push(r)
            }
        }
    }

    // ★ここから下は**列挙**であって導出ではない。import を辿っても出てこないため。
    //   「導出だから安心」と誤読しないこと——足し忘れたら気づけないのはここだけ。
    //     テンプレートPDF … コードを1行も変えずに出力を変える（bekki5/bekki10 で実際に差し替えた）
    //     フォント        … 同上（DM Sans の self-host で踏んだ）
    //     fixtures        … テストデータ。変えればベースラインは無効になる
    //     生成スクリプト  … payload の組み立てを変えれば出力が変わる
    //   ★reference/fdma（消防庁の正典）は入れていない。テンプレートの**出所**であって
    //     描画の入力ではなく、正典を更新しても public/PDF に反映するまで出力は変わらない。
    //     反映すればテンプレート側が変わるので、そちらで検知される。
    return [
        ...seen,
        ...listFiles("public/PDF", (p) => p.endsWith(".pdf")),
        ...listFiles("public/fonts"),
        ...listFiles("scripts/fixtures"),
        ...listFiles("scripts", (p) =>
            /[\\/](generate-.*-route-tests\.mjs|run-route-pdf\.mjs|lib-(numeric-rows|boundary-rows)\.mjs)$/.test(p)),
    ].sort()
}
