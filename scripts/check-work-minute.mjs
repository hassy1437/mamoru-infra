// 作業中の 1 分ごとの印（src/lib/work-minute.ts・src/components/work-minute-marker.tsx）を検査する。
//
// ■ なぜ要るか（2026-09-27）
//   先行利用の 5 班で報告書の作成時間を実測するための部品。★最優先は「入力を絶対に止めない」こと。
//   印の口（DB）が落ちても・遅くても・無くても、点検の画面は普段どおり動かなければならない。
//
// ■ 検査すること
//   A. 決まり（src/lib/work-minute.ts を Node でそのまま動かす）
//      1. 直近 60 秒に操作があったときだけ送る／画面が裏・オフラインでは送らない／貯めて後で送らない
//      2. ★送信は待たない（tick は同期で戻る）。送信が例外・失敗・返らないでも tick は例外を出さない
//      3. 送るのは { propertyId, soukatsuId } だけ
//   B. 形（部品のソースを読む）
//      4. rpc の引数は p_property_id / p_soukatsu_id だけ・await していない・成否を then の両方で捨てる
//      5. 部品は Quiet（受け止め役）で包まれている
//      6. ★保存・確定・PDF の部品は、この印を読み込んでいない（保存の道筋に入らない）
//
// 使い方: node --experimental-strip-types scripts/check-work-minute.mjs
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"

const ROOT = process.cwd()
const LIB = path.join(ROOT, "src", "lib", "work-minute.ts")
const COMP = path.join(ROOT, "src", "components", "work-minute-marker.tsx")

const problems = []
const check = (ok, message) => {
    if (!ok) problems.push(message)
}

// ---- A. 決まり ----
const unhandled = []
process.on("unhandledRejection", (e) => unhandled.push(String(e)))

const { createWorkMinuteMarker, ACTIVE_WINDOW_MS } = await import(pathToFileURL(LIB).href)

function rig({ send, visible = true, online = true } = {}) {
    const st = { t: 1_000_000, visible, online, sent: [] }
    const m = createWorkMinuteMarker(
        { propertyId: "p-1", soukatsuId: "s-1" },
        {
            send: send ?? ((x) => { st.sent.push(x) }),
            now: () => st.t,
            isVisible: () => st.visible,
            isOnline: () => st.online,
        },
    )
    return { st, m }
}

{ // 1. 操作が無ければ送らない・直近 60 秒なら送る・61 秒前なら送らない
    const { st, m } = rig()
    check(m.tick() === false && st.sent.length === 0, "操作が無いのに送った")
    m.noteActivity(); st.t += 30_000
    check(m.tick() === true && st.sent.length === 1, "30 秒前に操作があったのに送らなかった")
    st.t += ACTIVE_WINDOW_MS - 30_000 + 1_000
    check(m.tick() === false && st.sent.length === 1, "61 秒前の操作で送った")
}
{ // 1. 裏では送らない・オフラインでは送らない・★戻っても貯めた分を送らない
    const { st, m } = rig({ visible: false })
    m.noteActivity(); st.t += 10_000
    check(m.tick() === false && st.sent.length === 0, "画面が裏なのに送った")
    st.visible = true; st.online = false; m.noteActivity(); st.t += 10_000
    check(m.tick() === false && st.sent.length === 0, "オフラインなのに送った")
    st.online = true; st.t += 120_000
    check(m.tick() === false && st.sent.length === 0, "オフラインの間の分を、あとで送った（貯めて送らない約束）")
}
{ // 2. 送信が同期で例外 → tick は false で戻り、例外を出さない
    const { st, m } = rig({ send: () => { throw new Error("口が壊れている") } })
    m.noteActivity(); st.t += 1_000
    let threw = false
    try { m.tick() } catch { threw = true }
    check(!threw, "送信の例外が tick の外に出た")
}
{ // 2. 送信が失敗（Promise が reject）→ 未処理の reject を残さない
    const { st, m } = rig({ send: () => Promise.reject(new Error("500")) })
    m.noteActivity(); st.t += 1_000
    check(m.tick() === true, "失敗する口のとき tick が true を返さない（送ったこと自体は数える）")
}
{ // 2. 送信が返らない（Promise が永遠に解決しない）→ tick は同期で戻る（待たない）
    const { st, m } = rig({ send: () => new Promise(() => {}) })
    m.noteActivity(); st.t += 1_000
    const r = m.tick()
    check(typeof r === "boolean", "tick が boolean 以外（Promise など）を返した＝待っている")
}
{ // 2. 時計が壊れていても noteActivity は例外を出さない
    const m = createWorkMinuteMarker({ propertyId: "p", soukatsuId: null }, {
        send: () => {}, now: () => { throw new Error("時計") }, isVisible: () => true, isOnline: () => true,
    })
    let threw = false
    try { m.noteActivity(); m.tick() } catch { threw = true }
    check(!threw, "時計の例外が外に出た")
}
{ // 3. 送るのは propertyId / soukatsuId だけ。どちらも無ければ送らない
    const { st, m } = rig()
    m.noteActivity(); st.t += 1_000; m.tick()
    check(JSON.stringify(Object.keys(st.sent[0] ?? {}).sort()) === JSON.stringify(["propertyId", "soukatsuId"]),
        `送る中身が propertyId / soukatsuId だけでない: ${JSON.stringify(st.sent[0])}`)
    const sent = []
    const empty = createWorkMinuteMarker({ propertyId: null, soukatsuId: null }, {
        send: (x) => { sent.push(x) }, now: () => 0, isVisible: () => true, isOnline: () => true,
    })
    empty.noteActivity()
    check(empty.tick() === false && sent.length === 0, "物件も総括表も無いのに送った")
}

// ---- B. 形 ----
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const comp = strip(fs.readFileSync(COMP, "utf8"))
const rpc = comp.match(/\.rpc\(\s*"([a-z_]+)"\s*,\s*\{([^}]*)\}\s*\)/)
check(rpc && rpc[1] === "mark_work_minute", "部品が mark_work_minute を呼んでいない")
if (rpc) {
    const keys = [...rpc[2].matchAll(/([a-z_]+)\s*:/g)].map((m) => m[1]).sort()
    check(JSON.stringify(keys) === JSON.stringify(["p_property_id", "p_soukatsu_id"]), `rpc の引数が物件・総括表だけでない: ${keys.join(", ")}`)
}
check(!/await\s+supabase\s*\.\s*rpc|await\s+[a-z]+\.rpc\(\s*"mark_work_minute"/.test(comp), "印の rpc を await している（待たない約束）")
check(/\.then\(\s*\(\)\s*=>\s*undefined\s*,\s*\(\)\s*=>\s*undefined\s*\)/.test(comp), "印の rpc の成否を then の両方で捨てていない")
check(/<Quiet>\s*<Marker/.test(comp) && /getDerivedStateFromError/.test(comp), "部品が受け止め役（Quiet）で包まれていない")
check(!/value|innerText|textContent|FormData/.test(comp), "部品が入力の値・画面の中身を読んでいる")

// 6. 保存・確定・PDF の部品は、この印を読み込んでいない
const compDir = path.join(ROOT, "src", "components")
const importers = []
for (const f of fs.readdirSync(compDir)) {
    if (!/\.(tsx|ts)$/.test(f) || f === "work-minute-marker.tsx") continue
    const s = fs.readFileSync(path.join(compDir, f), "utf8")
    if (/work-minute/.test(s)) importers.push(f)
}
check(importers.length === 0, `保存・確定・PDF の部品が印を読み込んでいる（保存の道筋に入る）: ${importers.join(", ")}`)

await new Promise((r) => setTimeout(r, 50))
check(unhandled.length === 0, `未処理の reject が残った: ${unhandled.join(" / ")}`)

console.log("作業中の 1 分ごとの印を検査: 決まり 8 項目・形 6 項目")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("WORK_MINUTE_OK")
