// 長文セットのうち bekki1 / 総括表 / 点検者一覧の3件を生成する。
//
// ■ なぜ後から要ったか
//   長文セット25様式のうち、この3件だけ生成元スクリプトがリポジトリに無く、
//   tmp/pdf-test-extra/ に置かれた成果物（gitignore配下）としてしか存在しなかった。
//   ＝ tmp/ を消したら二度と再現できず、ベースライン25件のうち3件が
//      「作り直せないのに退行判定の基準にしている」状態だった。
//   他の22件は generate-bekki{234,5678,9to12,13to22}-route-tests.mjs で作れる。
//
// ■ payload をどこに置くか
//   scripts/fixtures/extra/ にコミットしてある（3件で約12KB）。
//   ★tmp/ から読むと「消えたら終わり」が直らないので、必ず fixtures 側を正とする。
//
// 使い方: node scripts/generate-extra-route-tests.mjs
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const ROOT = process.cwd()
const FIXTURES = path.join(ROOT, "scripts", "fixtures", "extra")
const OUT_DIR = path.join(ROOT, "tmp", "pdf-test-extra")

fs.mkdirSync(OUT_DIR, { recursive: true })

const names = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".job.json"))
    .map((f) => f.replace(/\.job\.json$/, ""))
    .sort()

if (names.length === 0) {
    console.error(`${FIXTURES} に .job.json が無い`)
    process.exit(1)
}

for (const name of names) {
    const job = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.job.json`), "utf8"))
    const payload = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.payload.json`), "utf8"))
    const outPdfPath = path.join(OUT_DIR, `${name}.pdf`)
    await runRoutePdf({ routePath: job.routePath, payload, outPdfPath })
    // ベースライン系スクリプトが参照するので、生成物の隣にも payload を残す
    fs.writeFileSync(path.join(OUT_DIR, `${name}.payload.json`), JSON.stringify(payload, null, 2), "utf8")
    fs.writeFileSync(path.join(OUT_DIR, `${name}.job.json`), JSON.stringify(job, null, 2), "utf8")
    console.log(`${name} ${outPdfPath} ${fs.statSync(outPdfPath).size}`)
}
