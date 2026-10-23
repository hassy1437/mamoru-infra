// 銘板の読み取り（src/lib/nameplate-reading.ts）と、その評価の計算（scripts/nameplate-eval/lib.mts）を自己診断する。
//
// ■ なぜ要るか（2026-10-23）
//   評価の数字（正答率・「読めないのに値を作った」件数）で、どのモデルを本番に使うかを決める。
//   ★正誤の決め方や集計が間違っていると、危ないモデルを「合格」と読んでしまう。
//   ★返す形（JSON の型）が Claude の制限を外れると、本番で毎回 400 になる。
//   ★API も写真も使わない（費用はかからない）。
//
// 使い方: node --experimental-strip-types scripts/check-nameplate-eval.mjs
import path from "path"
import { pathToFileURL } from "url"

const ROOT = process.cwd()
const R = await import(pathToFileURL(path.join(ROOT, "src", "lib", "nameplate-reading.ts")).href)
const L = await import(pathToFileURL(path.join(ROOT, "scripts", "nameplate-eval", "lib.mts")).href)

const problems = []
const check = (ok, message) => {
    if (!ok) problems.push(message)
}

// ---- 1. 正誤の決め方 ---------------------------------------------------
for (const [expected, got, want, why] of [
    ["P-1A", "Ｐ－１Ａ", "correct", "全角と半角の違いは一致"],
    ["受第2〜1号", "受第２～１号", "correct", "波ダッシュの仲間・全角数字は一致"],
    ["ATU 30", "ATU30", "correct", "空白の有無は一致"],
    ["p-1a", "P-1A", "correct", "大文字小文字は一致"],
    ["ホーチキ株式会社", "ホーチキ", "variant", "会社の種類の書き方だけの違いは表記ゆれ"],
    ["㈱ホーチキ", "ホーチキ株式会社", "variant", "㈱ と 株式会社 は表記ゆれ"],
    ["ホーチキ", "ホ-チキ", "wrong", "★長音「ー」をハイフンと同じにしない"],
    ["P-1A", "P-1B", "wrong", "違う値は誤り"],
    [null, "P-1A", "fabricated", "正解が空なのに値 = 作った"],
    ["", "P-1A", "fabricated", "空文字も空として扱う"],
    ["P-1A", null, "missed", "正解があるのに空 = 空で返した"],
    [null, null, "both_empty", "どちらも空"],
]) {
    const v = R.judgeNameplateField(expected, got)
    check(v === want, `正誤: ${why}（${expected} / ${got} → ${v}、期待 ${want}）`)
}

// ---- 2. 返す形（JSON の型）が Claude の制限の中にある -----------------------
/** 制限を外れている所を返す（自分でも試す: 下の負の対照） */
function schemaProblems(schema) {
    const out = []
    let unions = 0
    const walk = (node, where) => {
        if (!node || typeof node !== "object") return
        for (const k of ["minLength", "maxLength", "minimum", "maximum", "multipleOf", "maxItems"]) {
            if (k in node) out.push(`${where}: 使えない制約 ${k}`)
        }
        if (Array.isArray(node.type) || node.anyOf) unions++
        if (node.type === "object") {
            if (node.additionalProperties !== false) out.push(`${where}: additionalProperties が false でない`)
            const props = Object.keys(node.properties ?? {})
            const req = node.required ?? []
            for (const p of props) if (!req.includes(p)) out.push(`${where}.${p}: required に入っていない（省略できる欄にしない）`)
            for (const [p, child] of Object.entries(node.properties ?? {})) walk(child, `${where}.${p}`)
        }
        if (node.enum && node.enum.length === 0) out.push(`${where}: enum が空`)
    }
    walk(schema, "$")
    if (unions > 16) out.push(`null を許す欄（型の組み合わせ）が ${unions} 個（上限 16）`)
    return out
}
check(schemaProblems(R.NAMEPLATE_SCHEMA).length === 0, `返す形が制限を外れている: ${schemaProblems(R.NAMEPLATE_SCHEMA).join(" / ")}`)
// 負の対照: 検査そのものが外れを拾えること
check(schemaProblems({ type: "object", properties: { a: { type: "string" } }, required: [] }).length === 2,
    "自己診断: additionalProperties・required の抜けを拾えない")
check(schemaProblems({ type: "object", properties: { a: { type: "string", maxLength: 3 } }, required: ["a"], additionalProperties: false }).length === 1,
    "自己診断: 使えない制約を拾えない")

// ★判定・点検者を読ませない（設計書 1.「読まないもの」）
const keys = JSON.stringify(R.NAMEPLATE_SCHEMA)
for (const bad of ["judg", "result", "inspector", "defect", "良", "不良", "点検者"]) {
    check(!keys.includes(bad), `返す形に読ませない欄（${bad}）がある`)
}
check(R.NAMEPLATE_SYSTEM_PROMPT.includes("null") && R.NAMEPLATE_SYSTEM_PROMPT.includes("補ったり"),
    "指示に「読めない字は補わず null」が無い")

// ---- 3. 依頼の中身 -------------------------------------------------------
const req = R.buildNameplateRequest({ model: "claude-opus-5-5", imageBase64: "AAAA", mediaType: "image/jpeg" })
check(!("thinking" in req), "★thinking を送っている（Opus 5.5 は切れない。量は effort で決める）")
check(req.output_config.effort === "low", "考える量の既定が low でない")
check(req.output_config.format.type === "json_schema" && req.output_config.format.schema === R.NAMEPLATE_SCHEMA, "決まった形で返させていない")
check(req.messages[0].content[0].type === "image" && req.messages[0].content[1].type === "text", "画像を先・指示を後に置いていない")

// ---- 4. 答えの読み取り -----------------------------------------------------
const good = {
    device_kind: "受信機",
    fields: Object.fromEntries(R.NAMEPLATE_FIELDS.map((f) => [f.key, { value: null, legibility: "absent", certainty: "high" }])),
}
check(R.parseNameplateReading(JSON.stringify(good)) !== null, "正しい形の答えを読めない")
check(R.parseNameplateReading("{") === null, "壊れた JSON を読んでしまう")
const missing = structuredClone(good)
delete missing.fields.maker
check(R.parseNameplateReading(JSON.stringify(missing)) === null, "欄が欠けた答えを読んでしまう")
const badLeg = structuredClone(good)
badLeg.fields.maker.legibility = "maybe"
check(R.parseNameplateReading(JSON.stringify(badLeg)) === null, "知らない legibility を読んでしまう")

// ---- 5. 正解の表（CSV） ------------------------------------------------------
const rows = L.parseCsv('a,"b,c","d""e"\r\n"改\n行",x,\r\n')
check(JSON.stringify(rows) === JSON.stringify([["a", "b,c", 'd"e'], ["改\n行", "x", ""]]), `CSV の読み取りが違う: ${JSON.stringify(rows)}`)
check(JSON.stringify(L.parseCsv(L.decodeCsvBytes(new TextEncoder().encode(L.toCsv(rows))))) === JSON.stringify(rows), "CSV を書いて読み直すと変わる")
// ★Excel の「CSV (コンマ区切り)」は Shift_JIS。「受信機,ホーチキ」の Shift_JIS のバイト列
const sjis = Uint8Array.from(Buffer.from("8ef3904d8b402c837a815b8360834c", "hex"))
check(L.decodeCsvBytes(sjis) === "受信機,ホーチキ", `Shift_JIS の CSV を読めない: ${L.decodeCsvBytes(sjis)}`)

const header = L.ANSWER_HEADER.join(",")
const blank = R.NAMEPLATE_FIELDS.map(() => "").join(",")
const csv = [
    header,
    `a.jpg,受信機,ホーチキ,P-1A,受第2〜1号,,,`,
    `b.jpg,中継機,,,,,,`,          // ★選べない機器の種類
    `c.jpg,,${blank}`,             // ★書き忘れ
    `a.jpg,受信機,X,,,,,`,         // ★同じ写真が 2 回
].join("\n")
const loaded = L.loadAnswers(csv)
check(loaded.answers.length === 2, `正解の行の数が違う（${loaded.answers.length}）`)
check(loaded.answers[0].fields.serial_number === null && loaded.answers[0].fields.maker === "ホーチキ", "空の欄を null・書いた欄を値として読んでいない")
check(loaded.problems.some((p) => p.includes("中継機")), "選べない機器の種類を拾えない")
check(loaded.problems.some((p) => p.includes("書いてありません")), "書き忘れの行を拾えない")
check(loaded.problems.some((p) => p.includes("2 回")), "同じ写真が 2 回あるのを拾えない")
check(L.loadAnswers("file,device_kind\nx.jpg,受信機").problems.length > 0, "列が足りない表を通してしまう")

// ---- 6. 集計 ---------------------------------------------------------------
const answers = L.loadAnswers([header, "a.jpg,受信機,ホーチキ,P-1A,,,,", "b.jpg,ポンプ,荏原,,,,,"].join("\n")).answers
const reading = (kind, vals, certainty = "high") => ({
    device_kind: kind,
    fields: Object.fromEntries(R.NAMEPLATE_FIELDS.map((f) => [f.key, { value: vals[f.key] ?? null, legibility: vals[f.key] ? "clear" : "absent", certainty }])),
})
const call = (file, model, r) => ({ file, model, reading: r, stopReason: "end_turn", error: null, inputTokens: 4000, outputTokens: 1000, ms: 2000 })
const results = [
    call("a.jpg", "opus", reading("受信機", { maker: "ホーチキ", model: "P-1A" })),
    call("b.jpg", "opus", reading("ポンプ", { maker: "荏原" })),
    call("a.jpg", "haiku", reading("受信機", { maker: "ホーチキ", model: "P-1A", approval_number: "受第9号" })), // ★作った（型式番号）
    call("b.jpg", "haiku", reading("その他", { maker: "荏原製作所" })),                                      // 誤り（自信あり）
]
const [opus, haiku] = L.summarize(results, answers, 150)
check(opus.model === "opus" && opus.accuracy === 1 && opus.fabricated === 0 && opus.passes, `全部正しいモデルが合格にならない: ${JSON.stringify(opus)}`)
check(Math.abs(opus.yenPerImage - L.costYen("opus", 4000, 1000, 150)) < 1e-9 && Math.abs(opus.yenPerImage - 5.4) < 1e-9, `1 枚の費用が違う（${opus.yenPerImage}）`)
check(haiku.fabricated === 1 && haiku.byField.approval_number.fabricated === 1, "作った欄を数えていない")
check(haiku.wrong === 1 && haiku.confidentMistakes === 2, `誤り・自信ありの誤りの数が違う（${haiku.wrong}・${haiku.confidentMistakes}）`)
check(Math.abs(haiku.accuracy - 2 / 3) < 1e-9, `正答率が違う（${haiku.accuracy}）`)
check(!haiku.passes, "★型式番号で作ったモデルを合格にしている")
check(haiku.deviceKindCorrect === 1 && haiku.deviceKindTotal === 2, "機器の種類の正解の数が違う")
const failed = L.summarize([call("a.jpg", "sonnet", null)], answers, 150)[0]
check(failed.failed === 1 && !failed.passes, "失敗した呼び出しを数えていない／合格にしている")
const md = L.renderSummaryMarkdown([opus, haiku], { when: "t", images: 2, effort: "low", maxSide: 1568, yenPerUsd: 150 })
check(md.includes("満たす") && md.includes("★満たさない"), "まとめの表に合格の目安が出ていない")
const diff = L.diffRows(results, answers)
check(diff.some((r) => r.includes("★作った")) && diff.some((r) => r.includes("★誤り")), "写真ごとの表に危ない欄の印が無い")

if (problems.length) {
    console.log(`銘板の読み取りの自己診断: ${problems.length} 件の問題`)
    for (const p of problems) console.log(`  ★${p}`)
    process.exit(1)
}
console.log("銘板の読み取りの自己診断: 正誤・返す形・依頼・読み取り・正解の表・集計 すべて OK")
console.log("NAMEPLATE_EVAL_OK")
