// 銘板の読み取り（src/lib/nameplate-reading.ts）と、その評価の計算（scripts/nameplate-eval/lib.mts）を自己診断する。
//
// ■ なぜ要るか（2026-10-23）
//   評価の数字（正答率・「読めないのに値を作った」件数）で、どのモデルを本番に使うかを決める。
//   ★正誤の決め方や集計が間違っていると、危ないモデルを「合格」と読んでしまう。
//   ★返す形（JSON の型）が Claude の制限を外れると、本番で毎回 400 になる。
//   ★API も写真も使わない（費用はかからない）。3 社の呼び方は、偽の返事（fetch の差し替え）で確かめる。
//   ★2026-10-30: Google（Gemini）・OpenAI（GPT）の呼び方・形の確かめ・段階方式の集計を足した。
//
// 使い方: node --experimental-strip-types scripts/check-nameplate-eval.mjs
import path from "path"
import { pathToFileURL } from "url"

const ROOT = process.cwd()
const R = await import(pathToFileURL(path.join(ROOT, "src", "lib", "nameplate-reading.ts")).href)
const L = await import(pathToFileURL(path.join(ROOT, "scripts", "nameplate-eval", "lib.mts")).href)
const P = await import(pathToFileURL(path.join(ROOT, "scripts", "nameplate-eval", "providers.mts")).href)

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

// ---- 7. 形の確かめ（checkNameplateReading）-------------------------------------
const NOW = new Date("2026-10-30T00:00:00+09:00")
const rd = (kind, vals, extra = {}) => {
    const r = reading(kind, vals)
    for (const [k, v] of Object.entries(extra)) Object.assign(r.fields[k], v)
    return r
}
const problemsOf = (r, opts = {}) => R.checkNameplateReading(r, { now: NOW, ...opts })
check(problemsOf(rd("消火器", { maker: "ヤマトプロテック", approval_number: "消第18～12号", manufactured: "2018年" })).length === 0, "形の正しい消火器の答えを引っかけている")
check(problemsOf(rd("受信機", { approval_number: "受第2〜1号", manufactured: "H27" })).length === 0, "和暦の製造年・受第…号を引っかけている")
check(problemsOf(rd("ポンプ", { approval_number: "PF-123", manufactured: "2015.4" })).length === 0, "「第」の無い型式番号（認定の番号など）を引っかけている")
for (const [kind, vals, want, why] of [
    ["消火器", { manufactured: "2027年" }, "ありえない年", "未来の製造年"],
    ["消火器", { manufactured: "1949" }, "ありえない年", "1950 年より前の製造年"],
    ["消火器", { manufactured: "15" }, "年の形が無い", "年の形が無い製造年"],
    ["測定機器", { calibrated_at: "1999.4.1" }, "ありえない年", "2000 年より前の校正年月日"],
    ["消火器", { approval_number: "受第2〜1号" }, "頭の字", "消火器なのに受第"],
    ["中継器", { approval_number: "受第2〜1号" }, "頭の字", "中継器なのに受第"],
    ["受信機", { approval_number: "受第2〜1" }, "形でない", "号が無い型式番号"],
]) {
    const got = problemsOf(rd(kind, vals))
    check(got.some((p) => p.includes(want)), `形の確かめ: ${why}を拾えない（${JSON.stringify(got)}）`)
}
check(problemsOf(rd("受信機", { maker: "ホーチキ" }, { maker: { legibility: "unreadable" } })).some((p) => p.includes("読めない")), "値があるのに「読めない」と答えたのを拾えない")
check(problemsOf(rd("受信機", {}, { model: { legibility: "clear" } })).some((p) => p.includes("値が無い")), "「読めた」のに値が無いのを拾えない")
check(problemsOf(rd("受信機", { maker: "ホーチキ" }), { makers: ["ホーチキ株式会社"] }).length === 0, "一覧の製造者名を（会社の種類の書き方の違いで）引っかけている")
check(problemsOf(rd("受信機", { maker: "ホーチ" }), { makers: ["ホーチキ株式会社"] }).some((p) => p.includes("一覧に無い")), "一覧に無い製造者名を拾えない")
check(problemsOf(rd("受信機", { maker: "ホーチ" })).length === 0, "一覧を渡さないのに製造者名を引っかけている")
for (const [v, want] of [["2015", 2015], ["201504", 2015], ["20150412", 2015], ["H27.4", 2015], ["平成27年", 2015], ["令和元年", 2019], ["S50", 1975], ["2015041", null], ["15", null]]) {
    check(R.nameplateYear(v) === want, `年の読み取り: ${v} → ${R.nameplateYear(v)}（期待 ${want}）`)
}

// ---- 8. 段階方式（安いモデル → 引っかかった写真だけ強いモデル）---------------------------
const cAnswers = L.loadAnswers([header, "a.jpg,受信機,ホーチキ,P-1A,,,,", "b.jpg,消火器,ヤマト,,消第18~12号,2018,,", "c.jpg,ポンプ,荏原,,,,,"].join("\n")).answers
const cResults = [
    call("a.jpg", "haiku", reading("受信機", { maker: "ホーチキ", model: "P-1A" })),
    call("b.jpg", "haiku", reading("消火器", { maker: "ヤマト", approval_number: "消第18~12号", manufactured: "2081" })), // ★誤り＋ありえない年 → 読み直す
    call("c.jpg", "haiku", rd("ポンプ", { maker: "荏原" }, { maker: { certainty: "low" } })),                              // 正しいが自信が低い
    call("a.jpg", "sonnet", reading("受信機", { maker: "ホーチキ", model: "P-1A" })),
    call("b.jpg", "sonnet", reading("消火器", { maker: "ヤマト", approval_number: "消第18~12号", manufactured: "2018" })),
    call("c.jpg", "sonnet", reading("ポンプ", { maker: "荏原" })),
]
const opts = { now: NOW }
const cc = L.summarizeCascade(cResults, cAnswers, "haiku", "sonnet", "check", 150, opts)
const yh = L.costYen("haiku", 4000, 1000, 150)
const ys = L.costYen("sonnet", 4000, 1000, 150)
check(cc.escalated === 1 && cc.calls === 3, `段階方式: 読み直した写真の数が違う（${cc.escalated}/${cc.calls}）`)
check(cc.accuracy === 1 && cc.wrong === 0 && cc.passes, `段階方式: 読み直した答えに替わっていない（正答率 ${cc.accuracy}）`)
check(Math.abs(cc.yenTotal - (3 * yh + ys)) < 1e-9, `段階方式: 費用が「安い 3 回＋強い 1 回」でない（${cc.yenTotal}）`)
check(Math.abs(cc.avgSeconds - (2 * 3 + 2) / 3) < 1e-9, `段階方式: 読み直した写真の時間を 2 回分にしていない（${cc.avgSeconds}）`)
const cl = L.summarizeCascade(cResults, cAnswers, "haiku", "sonnet", "check_or_low", 150, opts)
check(cl.escalated === 2, `段階方式: 自信が低い欄のある写真も読み直す条件で数が違う（${cl.escalated}）`)
const haikuOnly = L.summarize(cResults, cAnswers, 150).find((s) => s.model === "haiku")
check(haikuOnly.wrong === 1 && haikuOnly.accuracy < 1 && haikuOnly.accuracy < cc.accuracy, "段階方式の比べ: 安いモデルだけの誤りが数えられていない")
check(L.needsSecondLook({ ...cResults[0], reading: null, error: "500" }, "check", opts), "失敗した答えを読み直しに回していない")
check(!L.needsSecondLook(cResults[0], "check_or_low", opts), "形も自信も問題ない答えを読み直しに回している")
check(JSON.stringify(L.defaultCascadePairs(L.summarize(cResults, cAnswers, 150))) === JSON.stringify([["haiku", "sonnet"]]),
    `既定の組が「安いモデル → 高くて正答率の高いモデル」でない: ${JSON.stringify(L.defaultCascadePairs(L.summarize(cResults, cAnswers, 150)))}`)
const pp = L.parseCascadePairs("haiku>sonnet, gpt-nano>gpt-mini")
check(pp.problems.length === 0 && pp.pairs.length === 2 && pp.pairs[1][0] === "gpt-nano", `--cascade を読めない: ${JSON.stringify(pp)}`)
for (const bad of ["haiku>haiku", "foo>sonnet", "haiku", "haiku>sonnet>opus"]) {
    check(L.parseCascadePairs(bad).problems.length === 1, `--cascade の書き間違い（${bad}）を拾えない`)
}
const cs = L.checkStats(cResults, cAnswers, opts).find((s) => s.model === "haiku")
check(cs.flagged === 1 && cs.mistakeImages === 1 && cs.mistakeImagesFlagged === 1 && cs.lowCertainty === 1, `形の確かめの集計が違う: ${JSON.stringify(cs)}`)

// ---- 9. 3 社の表と単価 ---------------------------------------------------------
check(L.DEFAULT_MODELS.every((m) => L.isModelAlias(m)), "既定のモデルに知らない名前がある")
for (const p of ["anthropic", "openai", "google"]) {
    check(L.DEFAULT_MODELS.some((m) => L.MODELS[m].provider === p), `既定のモデルに ${p} が無い（3 社を比べる）`)
}
for (const m of L.MODEL_ALIASES) {
    const info = L.MODELS[m]
    check(info.usdIn > 0 && info.usdOut >= info.usdIn, `${m} の単価がおかしい（${info.usdIn}/${info.usdOut}）`)
    check(info.provider === "anthropic" ? info.priceChecked : !info.priceChecked, `${m}: 公式で確かめていない単価に「確かめた」と付けている（または逆）`)
}
for (const p of ["openai", "google"]) check(L.PROVIDERS[p].priceSource.includes("未確認"), `${p} の単価の出どころに「未確認」が無い`)
const gEst = L.estimateTokens("google", 1568, 1176)
const oEst = L.estimateTokens("openai", 1568, 1176)
check(L.estimateTokens("anthropic", 1568, 1176).input === Math.round(1568 * 1176 / 750) + 1500, "Claude の見込みが設計書の式でない")
check(gEst.input >= 1120 + 1500 && oEst.input >= 1500 && gEst.output >= 1000 && oEst.output >= 1000, "Gemini・GPT の見込みが少なすぎる")

// ---- 10. 3 社の呼び方（偽の返事）---------------------------------------------------
const img = { base64: "QUJD", mediaType: "image/jpeg" }
const KEY = "sk-test-not-a-real-key"
const fakeFetch = (respond) => {
    const seen = []
    const f = async (url, init = {}) => {
        seen.push({ url: String(url), init })
        return respond(String(url), init)
    }
    return { f, seen }
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const goodText = JSON.stringify(good)

// 同じ指示・同じ形・写真が先
const aReq = R.buildNameplateRequest({ model: "m", imageBase64: img.base64, mediaType: "image/jpeg" })
const oReq = P.buildOpenAIRequest("gpt-x", img, "low")
const gReq = P.buildGeminiRequest(img, "low")
check(oReq.instructions === aReq.system && gReq.systemInstruction.parts[0].text === aReq.system, "★3 社で指示が同じでない")
check(oReq.input[0].content[0].type === "input_image" && oReq.input[0].content[1].text === R.NAMEPLATE_USER_TEXT, "GPT: 写真を先・頼む文を後に置いていない")
check(oReq.input[0].content[0].image_url === "data:image/jpeg;base64,QUJD" && oReq.input[0].content[0].detail === "high", "GPT: 写真の渡し方が違う")
check(oReq.text.format.type === "json_schema" && oReq.text.format.strict === true && oReq.text.format.schema === R.NAMEPLATE_SCHEMA, "GPT: 決まった形（strict）で返させていない")
check(oReq.reasoning.effort === "low" && oReq.max_output_tokens === 4000 && oReq.store === false, "GPT: 考える量・出力の上限・残さない設定が違う")
check("inlineData" in gReq.contents[0].parts[0] && gReq.contents[0].parts[1].text === R.NAMEPLATE_USER_TEXT, "Gemini: 写真を先・頼む文を後に置いていない")
check(gReq.generationConfig.responseMimeType === "application/json" && gReq.generationConfig.maxOutputTokens === 4000, "Gemini: JSON で返させていない・出力の上限が違う")
check(gReq.generationConfig.thinkingConfig.thinkingLevel === "low", "Gemini: 考える量を渡していない")

// Gemini の形
const gs = P.toGeminiSchema(R.NAMEPLATE_SCHEMA)
const gsText = JSON.stringify(gs)
check(!gsText.includes("additionalProperties") && !gsText.includes('"null"'), "Gemini の形に additionalProperties・null の型が残っている")
check(gs.type === "OBJECT" && gs.properties.device_kind.format === "enum" && gs.properties.device_kind.enum.length === R.NAMEPLATE_DEVICE_KINDS.length, "Gemini の形: 機器の種類の選択肢が違う")
const gField = gs.properties.fields.properties.maker
check(gField.properties.value.type === "STRING" && gField.properties.value.nullable === true, "Gemini の形: null を許す欄が nullable になっていない")
check(JSON.stringify(gField.required) === JSON.stringify(["value", "legibility", "certainty"]) && JSON.stringify(gs.propertyOrdering) === JSON.stringify(["device_kind", "fields"]), "Gemini の形: 必須・並びが抜けた")
let threw = 0
for (const bad of [{ type: "string", maxLength: 3 }, { type: "array", items: { type: "string" } }, { type: ["string", "number"] }]) {
    try { P.toGeminiSchema(bad) } catch { threw++ }
}
check(threw === 3, "Gemini の形に直せない書き方を黙って落としている")

// OpenAI の返事
const oDone = { status: "completed", output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: goodText }] }], usage: { input_tokens: 3000, output_tokens: 700 } }
const o1 = fakeFetch(() => json(oDone))
const or1 = await P.callOpenAI(KEY, "gpt-x", img, "low", o1.f)
check(or1.finished && or1.text === goodText && or1.inputTokens === 3000 && or1.outputTokens === 700 && or1.error === null, `GPT: 正しい返事を読めない: ${JSON.stringify(or1)}`)
check(o1.seen[0].url === P.OPENAI_RESPONSES_URL && o1.seen[0].init.headers.Authorization === `Bearer ${KEY}` && JSON.parse(o1.seen[0].init.body).model === "gpt-x", "GPT: 送り先・キー・モデル名の渡し方が違う")
// ★文と断りが両方あっても、断りがあれば読まない
const oRef = P.readOpenAIResponse({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: goodText }, { type: "refusal", refusal: "no" }] }], usage: {} })
check(!oRef.finished && oRef.stopReason === "refusal", "GPT: 断られた答えを読んでしまう")
const oInc = P.readOpenAIResponse({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [{ type: "message", content: [{ type: "output_text", text: "{" }] }], usage: { input_tokens: 1, output_tokens: 4000 } })
check(!oInc.finished && oInc.stopReason === "incomplete: max_output_tokens" && oInc.outputTokens === 4000, "GPT: 途中で切れた答えを読んでしまう（または費用を数えない）")
const oErr = await P.callOpenAI(KEY, "gpt-x", img, "low", fakeFetch(() => json({ error: { message: "model not found" } }, 404)).f)
check(!oErr.finished && oErr.error === "404 model not found", `GPT: エラーの文が違う: ${oErr.error}`)
const oNet = await P.callOpenAI(KEY, "gpt-x", img, "low", async () => { throw new TypeError("network down") })
check(oNet.error?.includes("network down") && !oNet.error.includes(KEY), "GPT: 通信の失敗で投げる・キーを出す")

// Gemini の返事
const gDone = {
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: "考えた中身", thought: true }, { text: goodText }] } }],
    usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 300, thoughtsTokenCount: 500 },
}
const g1 = fakeFetch(() => json(gDone))
const gr1 = await P.callGemini(KEY, "gemini-x", img, "low", g1.f)
check(gr1.finished && gr1.text === goodText && gr1.inputTokens === 1800 && gr1.outputTokens === 800, `Gemini: 正しい返事を読めない（考えた分を出力に足す・考えた中身を混ぜない）: ${JSON.stringify(gr1)}`)
check(g1.seen[0].url === P.geminiUrl("gemini-x") && g1.seen[0].url.endsWith("/models/gemini-x:generateContent") && g1.seen[0].init.headers["x-goog-api-key"] === KEY && !g1.seen[0].url.includes(KEY),
    "Gemini: 送り先・キーの渡し方が違う（★キーを URL に入れない）")
const gBlk = P.readGeminiResponse({ promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: 10 } })
check(!gBlk.finished && gBlk.stopReason === "blocked: SAFETY", "Gemini: 止められた答えを読んでしまう")
const gMax = P.readGeminiResponse({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] })
check(!gMax.finished && gMax.stopReason === "MAX_TOKENS", "Gemini: 途中で切れた答えを読んでしまう")
const gErr = await P.callGemini(KEY, "gemini-x", img, "low", fakeFetch(() => new Response("bad gateway", { status: 502 })).f)
check(gErr.error === "502 bad gateway", `Gemini: JSON でないエラーの文が違う: ${gErr.error}`)

// モデルの一覧（2 ページ）
const pages = fakeFetch((url) => json(url.includes("pageToken=") ? { models: [{ name: "models/gemini-b" }] } : { models: [{ name: "models/gemini-a" }], nextPageToken: "t 2" }))
const gl = await P.listGeminiModels(KEY, pages.f)
check(JSON.stringify(gl.ids) === JSON.stringify(["gemini-a", "gemini-b"]) && pages.seen[1].url.includes("pageToken=t%202"), `Gemini: モデルの一覧を全部読めない: ${JSON.stringify(gl)}`)
const ol = await P.listOpenAIModels(KEY, fakeFetch(() => json({ data: [{ id: "gpt-a" }] })).f)
check(JSON.stringify(ol.ids) === JSON.stringify(["gpt-a"]), "GPT: モデルの一覧を読めない")

// Anthropic（SDK の代わりに偽物）
const fakeClient = (reply) => ({ messages: { create: async (req) => { fakeClient.last = req; if (reply instanceof Error) throw reply; return reply } } })
const ar1 = await P.callAnthropic(fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: goodText }], usage: { input_tokens: 4000, output_tokens: 900 } }), "claude-x", img, "low")
check(ar1.finished && ar1.text === goodText && ar1.outputTokens === 900 && fakeClient.last.model === "claude-x" && fakeClient.last.system === R.NAMEPLATE_SYSTEM_PROMPT, "Claude: 正しい返事を読めない・指示が違う")
const ar2 = await P.callAnthropic(fakeClient({ stop_reason: "refusal", content: [], usage: { input_tokens: 10, output_tokens: 0 } }), "claude-x", img, "low")
check(!ar2.finished && ar2.stopReason === "refusal", "Claude: 断られた答えを読んでしまう")
const ar3 = await P.callAnthropic(fakeClient(Object.assign(new Error("overloaded"), { status: 529 })), "claude-x", img, "low")
check(ar3.error?.startsWith("529") && ar3.error.includes("overloaded"), `Claude: エラーの文が違う: ${ar3.error}`)

// ---- 11. まとめの表（3 社・★未確認の単価・段階方式）------------------------------------
const mixed = [
    ...cResults,
    call("a.jpg", "gemini-flash-lite", reading("受信機", { maker: "ホーチキ", model: "P-1A" })),
    call("b.jpg", "gemini-flash-lite", reading("消火器", { maker: "ヤマト", approval_number: "消第18~12号", manufactured: "2018" })),
    call("c.jpg", "gemini-flash-lite", reading("ポンプ", { maker: "荏原" })),
]
const ms = L.summarize(mixed, cAnswers, 150)
const md3 = L.renderSummaryMarkdown(ms, { when: "t", images: 3, effort: "low", maxSide: 1568, yenPerUsd: 150 },
    [L.summarizeCascade(mixed, cAnswers, "haiku", "sonnet", "check", 150, opts)], L.checkStats(mixed, cAnswers, opts))
check(md3.includes("| Gemini Flash-Lite | Google | gemini-3.1-flash-lite |") && md3.includes("★"), "まとめの表に会社・モデル名・未確認の印が出ていない")
check(md3.includes("段階方式") && md3.includes("Haiku 5.5 → Sonnet 5.5") && md3.includes("形の確かめで、誤りのある写真"), "まとめの表に段階方式・形の確かめが出ていない")
check(md3.includes("Google の単価") && md3.includes("Anthropic の単価"), "まとめに会社ごとの単価の出どころが出ていない")
check(L.diffRows(mixed, cAnswers, opts).some((r) => r[1] === "形の確かめ" && r.some((v) => v.includes("ありえない年"))), "写真ごとの表に形の確かめが出ていない")

// ---- 12. モデル名・単価の差し替え（★最後に。表を書き換えるので元に戻す）----------------------
const saved = structuredClone(L.MODELS)
check(L.applyModelOverrides(["gemini-flash=gemini-3.8-flash"], []).length === 0 && L.MODELS["gemini-flash"].id === "gemini-3.8-flash" && !L.MODELS["gemini-flash"].priceChecked,
    "--id でモデル名を替えられない（または単価を「確かめた」のままにしている）")
check(L.applyModelOverrides(["haiku=claude-haiku-9"], []).length === 0 && !L.MODELS.haiku.priceChecked, "★モデル名だけ替えたのに単価を「確かめた」のままにしている")
check(L.applyModelOverrides([], ["gpt-nano=0.05/0.4"]).length === 0 && L.MODELS["gpt-nano"].usdIn === 0.05 && L.MODELS["gpt-nano"].usdOut === 0.4 && L.MODELS["gpt-nano"].priceChecked,
    "--price で単価を替えられない")
check(L.applyModelOverrides(["gpt-mini=gpt-9-mini"], ["gpt-mini=1/5"]).length === 0 && L.MODELS["gpt-mini"].priceChecked, "モデル名と単価を一緒に替えたのに「未確認」にしている")
check(L.applyModelOverrides(["nope=x", "haiku=a b"], ["haiku=1", "x=1/2"]).length === 4, "--id・--price の書き間違いを拾えない")
for (const k of Object.keys(saved)) Object.assign(L.MODELS[k], saved[k])
check(L.MODELS["gemini-flash"].id === "gemini-3.6-flash", "差し替えのあと元に戻らない（自己診断の不具合）")

if (problems.length) {
    console.log(`銘板の読み取りの自己診断: ${problems.length} 件の問題`)
    for (const p of problems) console.log(`  ★${p}`)
    process.exit(1)
}
console.log("銘板の読み取りの自己診断: 正誤・返す形・依頼・読み取り・正解の表・集計・形の確かめ・段階方式・3 社の呼び方 すべて OK")
console.log("NAMEPLATE_EVAL_OK")
