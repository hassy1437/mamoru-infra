// 回帰テスト: 英数字が化けずに描かれ、計測幅と実描画幅が一致すること。
//
// 守りたい性質（2つ。どちらも「元に戻すと静かに再発する」）:
//   ① 単一フォント選択（pickFont）— NotoSansJP で "PMP-9000-EX" を描くと数字が
//      CJK拡張Aのグリフに化け、widthOfTextAtSize は比例幅を返すのに実描画は全角幅になる（最大+41.6%）。
//   ② ラン分割（splitFontRuns）— ①だけでは「日本語と英数字が混じった1文字列」を救えない。
//      文字列単位でフォントを選ぶ限り、混在文字列は必ず jp 側に落ち、その中の英数字が化ける。
//      例: "27-P2 点検項目" / "型式 PMP-9000-EX"。
//
// ★検査対象は本番実体（src/lib/pdf-form-helpers.ts）を直接読み込む。
//   ロジックを写して検査すると、本番だけ差し戻されたときに通り続けてしまう。
//
// 判定は2段（閾値だけに頼らない）:
//   (1) 抽出テキスト一致 … PDFから読み出した文字列が入力と同一か（化けの直接検出）
//   (2) 幅の乖離 … |実描画幅 - 計測幅| / 計測幅 が閾値未満か（収まり判定が信用できるか）
//
// 使い方: node scripts/digit-mangling-regression.mjs
//   → tmp/digit-regression.pdf と判定用メタ tmp/digit-regression.json を作る。
//     続けて python scripts/digit-mangling-regression.py で合否を出す。
//     インク層は python scripts/check-ink-coverage.py（グリフ実体の欠落を見る別層）。
import { PDFDocument, StandardFonts } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { loadPdfFormHelpers } from "./load-pdf-helpers.mjs"

// 実データに出る形。化ける条件＝英字/数字が NotoSansJP 側に流れること。
const SAMPLES = [
    // A. ASCII単独の型番（①が守る範囲）
    "PMP-9000-EX",
    "MTR-2026-L",
    "PG-9000-LONG",
    "CYL-1000",
    "SMK-2000",
    "TT-42-EXT",
    "RCV-11",
    "ENG-5000",
    // B. 日本語＋英数字の混在（★①では救えない。①bのラン分割が守る範囲）
    "27-P2 点検項目",
    "PG-9000-LONG（予備）",
    "型式 PMP-9000-EX",
    "消火器 10本 設置",
    "第1-2号 ポンプ室",
    "2026年7月24日 実施",
    "ABC-123 及び DEF-456",
    // C. 対照（元々化けない・崩れていないことの確認用）
    "03-1234-5678",
    "0123456789",
    "ＡＢＣ１２３",
    "自動火災報知設備",
    "○",
    "－",
]

const SIZE = 12
const X = 40
const jpPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

const { measureRuns, drawTextRuns, splitFontRuns } = await loadPdfFormHelpers()

const pdfDoc = await PDFDocument.create()
pdfDoc.registerFontkit(fontkit)
const jp = await pdfDoc.embedFont(fs.readFileSync(jpPath))
const latin = await pdfDoc.embedFont(StandardFonts.Helvetica)
const fonts = { jp, latin }

const page = pdfDoc.addPage([560, 40 + SAMPLES.length * 30])
const rows = []
let y = page.getSize().height - 30
for (const text of SAMPLES) {
    // 本番と同じ計測・描画経路を通す（ここを写しにすると退行を検出できない）
    const apiWidth = measureRuns(fonts, text, SIZE)
    drawTextRuns(page, fonts, text, X, y, SIZE)
    const runs = splitFontRuns(fonts, text).map((r) => (r.font === latin ? "latin" : "jp"))
    rows.push({ text, y, apiWidth, font: runs.join("+") || "-", runCount: runs.length })
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
