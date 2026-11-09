// 銘板の読み取り: 本物のキーで写真を読ませて、アプリと同じ道すじ（同時に呼ぶ → 形の確かめ → 多数決）を確かめる（2026-11-09）。
//
// 使い方: node --experimental-strip-types scripts/nameplate-live-check.mts <写真.jpg> [写真2.jpg ...]
//   ・キーは環境変数（ANTHROPIC_API_KEY・GEMINI_API_KEY・OPENAI_API_KEY）。★無い会社は飛ばす（アプリと同じ）
//   ・モデルはアプリと同じ（src/lib/nameplate-ai-config.ts・NAMEPLATE_MODEL_* で替えられる）
//   ・★費用がかかる（1 枚・1 社あたり 1 円前後）。DB・写真の置き場には何も書かない
//   ・★写真はアプリならブラウザで長い辺 1568px の JPEG に縮めてから送る。ここでは渡した写真をそのまま送る
//   ・★ANTHROPIC_BASE_URL が入っていると Anthropic の SDK はそちらへ送る。ここでは消してから呼ぶ
//
// 出すもの: 会社ごとの成否・時間・トークン数・費用・欄ごとの値と、多数決の結果（そろった／割れた／空）
import { readFileSync } from "node:fs"
import { basename } from "node:path"

import { nameplateLiveModels } from "../src/lib/nameplate-ai-config.ts"
import { NAMEPLATE_PROVIDER_LABEL, buildNameplateConsensus } from "../src/lib/nameplate-consensus.ts"
import { NAMEPLATE_FIELDS } from "../src/lib/nameplate-reading.ts"
import { readNameplateWithAll } from "../src/lib/nameplate-server.ts"

delete process.env.ANTHROPIC_BASE_URL

const files = process.argv.slice(2)
if (files.length === 0) {
    console.error("使い方: node --experimental-strip-types scripts/nameplate-live-check.mts <写真.jpg> [写真2.jpg ...]")
    process.exit(2)
}
const models = nameplateLiveModels(process.env)
if (models.length === 0) {
    console.error("★キーが 1 つもありません（ANTHROPIC_API_KEY・GEMINI_API_KEY・OPENAI_API_KEY）")
    process.exit(2)
}
console.log(`使う AI: ${models.map((m) => `${NAMEPLATE_PROVIDER_LABEL[m.provider]}（${m.id}）`).join("・")}`)

let failures = 0
let totalUsd = 0
for (const file of files) {
    const img = { base64: readFileSync(file).toString("base64"), mediaType: "image/jpeg" as const }
    const results = await readNameplateWithAll(models, img)
    const consensus = buildNameplateConsensus(results)
    console.log(`\n=== ${basename(file)}`)
    for (const r of results) {
        const label = NAMEPLATE_PROVIDER_LABEL[r.provider]
        totalUsd += r.costUsd ?? 0
        if (!r.ok) failures++
        console.log(
            `--- ${label}（${r.model}）: ${r.ok ? "読めた" : `失敗: ${r.error}`}・${r.ms}ms・入力 ${r.inputTokens}・出力 ${r.outputTokens}・` +
                `${r.costUsd === null ? "費用 —" : `約 ${(r.costUsd * 150).toFixed(2)} 円`}`,
        )
        if (r.reading) {
            console.log(`    機器: ${r.reading.device_kind}`)
            for (const f of NAMEPLATE_FIELDS) {
                const fr = r.reading.fields[f.key]
                console.log(`    ${f.label}: ${fr?.value ?? "（なし）"}［${fr?.legibility ?? "-"}・${fr?.certainty ?? "-"}］`)
            }
        }
    }
    console.log(`--- 多数決（答えた会社 ${consensus.voters}）: 機器 ${consensus.device_kind}`)
    for (const f of NAMEPLATE_FIELDS) {
        const c = consensus.fields[f.key]
        const mark = c.status === "agreed" ? "そろった" : c.status === "split" ? "割れた" : "空"
        const cands = c.candidates.map((x) => `${x.value}（${x.providers.map((p) => NAMEPLATE_PROVIDER_LABEL[p]).join("・")}）`).join(" / ")
        console.log(`    ${f.label}: ${mark}${c.value ? `「${c.value}」` : ""}${c.warning ? "・黄色" : ""}${cands ? `  候補: ${cands}` : ""}`)
    }
    if (consensus.warnings.length > 0) console.log(`    形の確かめ: ${consensus.warnings.join(" / ")}`)
}
console.log(`\n費用の合計: 約 ${(totalUsd * 150).toFixed(2)} 円（1 ドル 150 円で換算）・失敗 ${failures} 件`)
process.exit(failures > 0 ? 1 : 0)
