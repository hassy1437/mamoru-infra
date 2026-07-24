// 回帰テスト: 「英字+ハイフン+数字」の型番が化けずに描かれ、計測幅と実描画幅が一致すること。
//
// 守りたい性質:
//   NotoSansJP で "PMP-9000-EX" を描くと数字が CJK拡張A のグリフ(9→U+40FA)に化け、
//   font.widthOfTextAtSize() は比例幅を返すのに実描画は全角幅になる（最大+41.6%）。
//   収まり判定はこのAPIに依存しているため「収まる」と誤答し、罫線を越える。
//   ＝ 誰かが pickFont を外して customFont 直描画に戻すと、静かに再発する。
//
// 判定は2段（閾値だけに頼らない）:
//   (1) 抽出テキスト一致 … PDFから読み出した文字列が入力と同一か（化けの直接検出）
//   (2) 幅の乖離 … |実描画幅 - 計測幅| / 計測幅 が閾値未満か（収まり判定が信用できるか）
//
// 使い方: node scripts/digit-mangling-regression.mjs
//   → PDF を tmp/digit-regression.pdf に生成し、判定用メタを tmp/digit-regression.json に書く。
//     続けて python scripts/digit-mangling-regression.py で合否を出す。
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"

// 実データに出る型番の形（消防設備の型式・製造番号）。化ける条件＝英字+ハイフン+数字。
const SAMPLES = [
    "PMP-9000-EX",
    "MTR-2026-L",
    "PG-9000-LONG",
    "CYL-1000",
    "SMK-2000",
    "TT-42-EXT",
    "RCV-11",
    "ENG-5000",
    // 対照（元々化けない）: 崩れていないことの確認用
    "03-1234-5678",
    "0123456789",
]

const SIZE = 12
const X = 40
const jpPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

const pdfDoc = await PDFDocument.create()
pdfDoc.registerFontkit(fontkit)
const jp = await pdfDoc.embedFont(fs.readFileSync(jpPath))
const latin = await pdfDoc.embedFont(StandardFonts.Helvetica)

// 本番と同じ選択規則（pdf-form-helpers.pickFont と同義）を、依存無しで再現する。
const ASCII_ONLY = /^[\x20-\x7E]+$/
const pick = (t) => (ASCII_ONLY.test(t) ? latin : jp)

const page = pdfDoc.addPage([520, 40 + SAMPLES.length * 30])
const rows = []
let y = page.getSize().height - 30
for (const text of SAMPLES) {
    const font = pick(text)
    const apiWidth = font.widthOfTextAtSize(text, SIZE)
    page.drawText(text, { x: X, y, size: SIZE, font, color: rgb(0, 0, 0) })
    rows.push({ text, y, apiWidth, font: font === latin ? "latin" : "jp" })
    y -= 30
}

fs.mkdirSync(path.join(process.cwd(), "tmp"), { recursive: true })
const pdfOut = path.join(process.cwd(), "tmp", "digit-regression.pdf")
fs.writeFileSync(pdfOut, await pdfDoc.save())
fs.writeFileSync(
    path.join(process.cwd(), "tmp", "digit-regression.json"),
    JSON.stringify({ size: SIZE, x: X, pageHeight: page.getSize().height, rows }, null, 2),
)
console.log(pdfOut)
