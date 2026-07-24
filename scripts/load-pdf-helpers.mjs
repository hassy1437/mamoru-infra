// pdf-form-helpers.ts（本番コード）をそのまま実行時に読み込むためのローダ。
//
// なぜコピーではなく本物を読むか:
//   回帰テストがロジックの「写し」を検査していると、本番側だけ差し戻されたときに
//   テストは通り続ける＝退行を検出できない。①(pickFont) も ①b(ラン分割) も
//   「誰かが元に戻すと静かに再発する」種類の修正なので、検査対象は本番実体でなければ意味がない。
import fs from "fs"
import path from "path"
import ts from "typescript"
import { pathToFileURL } from "url"

const ROOT = process.cwd()

export async function loadPdfFormHelpers() {
    const src = fs.readFileSync(path.join(ROOT, "src", "lib", "pdf-form-helpers.ts"), "utf8")
    const js = ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const outDir = path.join(ROOT, "tmp")
    fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, "pdf-form-helpers.generated.mjs")
    fs.writeFileSync(outPath, js)
    return import(pathToFileURL(outPath).href)
}
