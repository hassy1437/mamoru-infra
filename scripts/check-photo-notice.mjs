// =============================================================
// scripts/check-photo-notice.mjs — 「写真は報告書に付きません」の一言が、実装と食い違わないこと
//
// ■ ★なぜ要るか（2026-09-23・先行利用の前の総点検 A3）
//   点検写真は端末の IndexedDB にしか入らない（Storage にも DB にも上がらず、PDF にも他端末にも出ない）。
//   画面には「点検写真」としか無く、現場で「撮った＝報告書に付いた」と誤解する。
//   ＝ 撮影欄に一言を足した。★一言は「実装していない約束」の逆で、「実装していないこと」を言っている。
//   だから将来、写真を報告書に付ける仕組みを作ったら、★この一言のほうが嘘になる。両方向を見張る。
//
// ■ 見るもの
//   ①文言: camera-input.tsx に一言がある
//   ②実装: 写真を読む口（getPhotos / LocalPhoto）を使うのは camera-input.tsx だけ
//          （PDF の組み立て・納品・他の画面が写真を読み始めたら、一言を変えるまで落とす）
//   ③実装: camera-input.tsx は Supabase（DB / Storage）に触らない
//
// 使い方: node scripts/check-photo-notice.mjs [--self-test]
// =============================================================
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const SRC = path.join(ROOT, "src")
const CAMERA = "src/components/camera-input.tsx"
const STORE = "src/lib/local-draft.ts"
const NOTICE = "端末内の控えです。報告書には付きません"

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/")

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p, out)
        else if (/\.tsx?$/.test(e.name)) out.push(p)
    }
    return out
}

function check(cameraText) {
    const problems = []
    if (!cameraText.includes(NOTICE)) problems.push(`${CAMERA}: 「${NOTICE}」の一言が無い`)
    if (/supabase|storage\.from\(/.test(cameraText)) problems.push(`${CAMERA}: Supabase に触っている（写真が端末の外に出るなら一言を変えること）`)
    const readers = walk(SRC)
        .filter((f) => rel(f) !== CAMERA && rel(f) !== STORE)
        .filter((f) => /\bgetPhotos\b|\bLocalPhoto\b|\bsavePhoto\b/.test(fs.readFileSync(f, "utf8")))
        .map(rel)
    for (const r of readers) problems.push(`${r}: 写真を読んでいる。報告書に付くようになったなら ${CAMERA} の一言を変えること`)
    return problems
}

const cameraText = fs.readFileSync(path.join(ROOT, CAMERA), "utf8")

if (process.argv.includes("--self-test")) {
    // ★陰性
    const p0 = check(cameraText)
    if (p0.length) { console.log("自己診断: 現状が既にNG（陰性対照が成立しない）"); for (const p of p0) console.log("   ", p); process.exit(1) }
    // ★陽性①: 一言を消す
    const noNotice = cameraText.replace(NOTICE, "")
    if (noNotice === cameraText) { console.log("自己診断: 注入先（一言）が無い"); process.exit(1) }
    if (!check(noNotice).some((p) => p.includes("一言が無い"))) { console.log("自己診断: 一言を消しても落ちない"); process.exit(1) }
    // ★陽性②: 別のファイルが写真を読む（一時ファイルを src に置き、必ず消す）
    const stray = path.join(SRC, "lib", "_photo-notice-self-test.ts")
    let caught2 = false
    try {
        fs.writeFileSync(stray, 'import { getPhotos } from "@/lib/local-draft"\nexport const x = getPhotos\n', "utf8")
        if (!fs.existsSync(stray)) throw new Error("注入が書き込まれていない")
        caught2 = check(cameraText).some((p) => p.includes("_photo-notice-self-test.ts") && p.includes("写真を読んでいる"))
    } finally {
        fs.rmSync(stray, { force: true })
    }
    if (!caught2) { console.log("自己診断: 別のファイルが写真を読んでも落ちない"); process.exit(1) }
    // ★陽性③: 撮影欄が Storage に上げる
    const uploads = cameraText.replace("await savePhoto(photo)", 'await supabase.storage.from("photos").upload(photo.id, dataUrl)')
    if (uploads === cameraText) { console.log("自己診断: 注入先（savePhoto）が無い"); process.exit(1) }
    if (!check(uploads).some((p) => p.includes("Supabase に触っている"))) { console.log("自己診断: Storage に上げても落ちない"); process.exit(1) }
    console.log("  陰性対照: 一言あり・読む口は撮影欄だけ・Supabase に触らない")
    console.log("  陽性対照①: 一言を消す → 検出")
    console.log("  陽性対照②: 別のファイルが写真を読む → 検出")
    console.log("  陽性対照③: 撮影欄が Storage に上げる → 検出")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = check(cameraText)
console.log("写真の一言を検査")
if (problems.length) { for (const p of problems) console.log(`  NG  ${p}`); console.log(`\n${problems.length} 件`); process.exit(1) }
console.log("PHOTO_NOTICE_OK")
