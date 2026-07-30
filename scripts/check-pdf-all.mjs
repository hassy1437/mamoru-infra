// 帳票PDFの検査を1つの入口から全部走らせる。`npm run check:pdf`
//
// ══════════════════════════════════════════════════════════════════
// ■ なぜ要るか（2026-07-26 に分かったこと）
//   検出器が「何を見ていないか」は10種類つぶしてきたが、その全部が
//   **検出器が動いている前提**の話だった。実測したところ
//   scripts/check-*.{py,mjs} 12本のうち **12本すべてがどこからも実行されていなかった**。
//   （4本は他ファイルから参照されているように見えたが、いずれもコメント内の言及だけ）
//   ＝ 緑と言えるのは「その日たまたま人間が全部手で叩いたから」でしかなかった。
//   実害も出ている: check-bekki2-content-overflow.py は素のテンプレートでも
//   OVERFLOW を返す壊れた状態で長期間残っていた。誰も走らせていなかったからである。
//
// ■ 設計の3点
//   1. 単一の入口にまとめる
//      入口が1つなら「網羅」は "入口を通っていないものが0件" という
//      単純な不変条件になる。docs/BACKLOG.md の fetchPdf() 単一入口と同じ解法。
//   2. ★孤立検査の検出をランナー自身に入れる（STAGE 0）
//      scripts/ の検査スクリプトを列挙し、CHECKS に載っていないものがあれば失敗する。
//      これが無いと、次に検査を足した人がまた孤立させて同じ穴が再発する。
//   3. 期待終了コードと成功センチネルを両方見る
//      終了コードだけだと「走ったが黙って失敗していた」を拾えない。
//      センチネルだけだと途中でクラッシュしたのに残骸を拾う。両方要る。
//
// ■ 鮮度ゲート（STAGE 1）
//   生成PDFがソースより古いまま検査すると「古いものを測って緑」になる。
//   実際に一度踏んでいる（生成スクリプトが stderr を隠していて、
//   構文エラーで生成に失敗したのに古いPDFを測り続けた）。
//   ソースの最新更新時刻 > 生成物の最古更新時刻 なら止める。--regen で作り直す。
//
// 使い方:
//   node scripts/check-pdf-all.mjs            # 検査だけ（生成物が古ければ止まる）
//   node scripts/check-pdf-all.mjs --regen    # PDFを作り直してから検査
//   node scripts/check-pdf-all.mjs --list     # 実行内容を出すだけ（走らせない）
import { spawn, spawnSync } from "child_process"
import os from "os"
import { createHash } from "crypto"
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const REGEN = process.argv.includes("--regen")
const LIST_ONLY = process.argv.includes("--list")
/**
 * ★ベースライン照合だけを外す口。CI 用。
 *
 *   ベースライン照合は登録済みPNGとの画素比較で、差分が出たら**人が目で見て承認する**。
 *   CI に載せると「赤いまま放置」か「無条件更新」のどちらかになり、判断が消えて
 *   儀式だけが残る。＝ 載せないのは技術的制約ではなく運用上の判断。
 *   （Linux と Windows で描画は 132ページすべて1ピクセルも違わないことを実測済み。
 *     つまり技術的には載る。載せないのは上の理由による）
 *
 * ★外したことは必ず大きく出す。黙って減らすと「緑＝全部見た」と誤読される。
 *   ローカルでは付けないこと。付けると退行検出が丸ごと消える。
 */
const SKIP_BASELINE = process.argv.includes("--skip-baseline")

const PY = process.platform === "win32" ? "python" : "python3"

/** baseline.py と同じ選定（debug を除く）。検査対象を1か所で決める */
const SET_DIRS = {
    stress: ["tmp/pdf-test-bekki234", "tmp/pdf-test-bekki5678", "tmp/pdf-test-bekki9to12",
             "tmp/pdf-test-bekki13to22", "tmp/pdf-test-extra"],
    realistic: ["tmp/pdf-realistic"],
}

const pdfsOf = (set) =>
    SET_DIRS[set]
        .flatMap((d) => {
            const abs = path.join(ROOT, d)
            if (!fs.existsSync(abs)) return []
            return fs.readdirSync(abs).filter((f) => f.endsWith(".pdf") && !f.includes("debug"))
                .sort().map((f) => path.join(d, f))
        })

/** 長文セットを作り直すスクリプト。全部そろって25様式になる */
const GENERATORS = [
    "scripts/generate-bekki234-route-tests.mjs",
    "scripts/generate-bekki5678-route-tests.mjs",
    "scripts/generate-bekki9to12-route-tests.mjs",
    "scripts/generate-bekki13to22-route-tests.mjs",
    "scripts/generate-extra-route-tests.mjs",
    "scripts/generate-realistic-route-tests.mjs",
]

/** 生成物より新しければ作り直しが要るソース */
const SOURCE_GLOBS = [
    ["src/app/api", (p) => p.endsWith("route.ts")],
    ["src/lib", (p) => /pdf-.*\.ts$/.test(p)],
    ["public/PDF", (p) => p.endsWith(".pdf")],
    ["scripts", (p) => /^(generate-.*-route-tests\.mjs|run-route-pdf\.mjs)$/.test(path.basename(p))],
    ["scripts/fixtures", () => true],
]

/**
 * 検査の登録簿。★ここに載っていない scripts/check-* があると STAGE 0 で失敗する。
 *   file     … scripts/ 配下のファイル名。孤立検出の突き合わせキー
 *   runs     … 実際の実行単位（同じスクリプトを長文/現実値で2回走らせる等）
 *   sentinel … 標準出力にこれが出ていなければ失敗（終了コード0でも）
 */
const CHECKS = [
    // ── 静的検査（PDFを作らなくても走る。速いので先に落とす）
    {
        file: "check-field-labels.py", stage: "静的",
        why: "⑧のエラーに出す項目ラベルが入力画面の表記とズレていないか",
        runs: [{ cmd: [PY, "scripts/check-field-labels.py"], sentinel: "FIELD_LABELS_OK" }],
    },
    {
        file: "check-pdf-error-handling.py", stage: "静的",
        why: "PDF取得の失敗が共有ヘルパーを通って分岐しているか（生fetchの取りこぼし）",
        runs: [{ cmd: [PY, "scripts/check-pdf-error-handling.py"], sentinel: "PDF_ERROR_HANDLING_OK" }],
    },
    {
        file: "check-latin-font-coverage.py", stage: "静的",
        why: "英数字がラン分割を経ずに描かれている経路が無いか（字化けの上流）",
        runs: [{ cmd: [PY, "scripts/check-latin-font-coverage.py"], sentinel: "LATIN_FONT_COVERAGE_OK" }],
    },

    // ── インク層（グリフ実体の欠落。ToUnicode と /W だけ見ていると通り抜ける）
    {
        file: "check-ink-coverage.py", stage: "インク層",
        why: "文字が実際に描かれているか。subset:true でグリフが消えた事故の再発防止",
        needs: ["tmp/digit-regression.pdf", "tmp/digit-regression.json"],
        runs: [{ cmd: [PY, "scripts/check-ink-coverage.py"], sentinel: "INK_COVERAGE_PASSED" }],
    },

    // ── 生成PDFの実測
    {
        file: "check-overflow.py", stage: "生成PDF", needsPdfs: true,
        why: "罫線をまたぐ文字（はみ出し）",
        runs: ["stress", "realistic"].map((s) => ({
            label: s, cmd: [PY, "scripts/check-overflow.py", ...pdfsOf(s)], sentinel: "OVERFLOW_NONE",
        })),
    },
    {
        file: "check-truncation.py", stage: "生成PDF", needsPdfs: true,
        why: "「収まって見えるが情報が欠落」した切り詰め",
        runs: ["stress", "realistic"].map((s) => ({
            label: s, cmd: [PY, "scripts/check-truncation.py", "--summary", ...pdfsOf(s)], sentinel: "NO_TRUNCATION",
        })),
    },
    {
        file: "check-mangled-glyphs.py", stage: "生成PDF", needsPdfs: true,
        why: "英数字が日本語フォント側に流れて別字形になる化け",
        runs: ["stress", "realistic"].map((s) => ({
            label: s, cmd: [PY, "scripts/check-mangled-glyphs.py", ...pdfsOf(s)], sentinel: "NO_MANGLED_GLYPHS",
        })),
    },
    {
        file: "check-bekki2-content-overflow.py", stage: "生成PDF", needsPdfs: true,
        why: "bekki2 容量等セルが判定セルへはみ出していないか（素テンプレート対照）",
        runs: [
            { label: "自己診断", cmd: [PY, "scripts/check-bekki2-content-overflow.py", "--self-test"], sentinel: "SELF_TEST_OK" },
            { label: "stress", cmd: [PY, "scripts/check-bekki2-content-overflow.py", "tmp/pdf-test-bekki234/bekki2_test.pdf"], sentinel: "BEKKI2_CONTENT_OVERFLOW_OK" },
            { label: "realistic", cmd: [PY, "scripts/check-bekki2-content-overflow.py", "tmp/pdf-realistic/bekki2_test.pdf"], sentinel: "BEKKI2_CONTENT_OVERFLOW_OK" },
        ],
    },
    {
        file: "check-cell-definition-audit.py", stage: "静的",
        why: "セル定義そのものが刷り込みに掛かっていないか。値に依存しないので、短い値でたまたま当たっていない潜在箇所も出る",
        runs: [
            { label: "自己診断", cmd: [PY, "scripts/check-cell-definition-audit.py", "--self-test"], sentinel: "SELF_TEST_OK" },
            { cmd: [PY, "scripts/check-cell-definition-audit.py"], sentinel: "CELL_DEFINITION_AUDIT_OK" },
        ],
    },
    {
        file: "check-numeric-rows-declaration.py",
        // ★排他。自己診断がソース（ルート/生成物）を一時的に書き換えるので、
        //   他の検査と同時に走らせると壊れた途中状態を読ませてしまう（並列化で実際に踏んだ）。
        exclusive: true, stage: "静的",
        why: "テストデータのどのセルに数値を入れるかの宣言が、実装・テンプレートと合っているか。"
            + "ここが嘘だと現実値セット（＝合否の基準）が偽の値で埋まり、その範囲の検査が空振りしたまま緑になる",
        runs: [
            { label: "自己診断", cmd: [PY, "scripts/check-numeric-rows-declaration.py", "--self-test"], sentinel: "SELF_TEST_OK" },
            { cmd: [PY, "scripts/check-numeric-rows-declaration.py"], sentinel: "NUMERIC_ROWS_DECLARATION_OK" },
        ],
    },
    {
        file: "check-row-cells.py",
        // ★排他。自己診断がソース（ルート/生成物）を一時的に書き換えるので、
        //   他の検査と同時に走らせると壊れた途中状態を読ませてしまう（並列化で実際に踏んだ）。
        exclusive: true, stage: "静的",
        why: "行ループ（drawResultRows）が描くセルの定義が刷り込みに掛かっていないか。"
            + "check-cell-definition-audit はリテラル座標の drawInCell しか見ず、この領域では一度も鳴っていなかった",
        runs: [
            { label: "自己診断", cmd: [PY, "scripts/check-row-cells.py", "--self-test"], sentinel: "SELF_TEST_OK" },
            { cmd: [PY, "scripts/check-row-cells.py"], sentinel: "ROW_CELLS_OK" },
        ],
    },
    {
        file: "check-generation-health.py", stage: "生成PDF", needsPdfs: true,
        why: "生成が成功し、ページ数がテンプレートと一致し、全ルートがテストセットに入っているか。"
            + "★画素比較ではないので人の承認が要らず、CI に載せられる（ベースライン照合との違い）",
        runs: [{ cmd: [PY, "scripts/check-generation-health.py"], sentinel: "GENERATION_HEALTH_OK" }],
    },
    {
        file: "check-printed-overlap.py", stage: "生成PDF", needsPdfs: true,
        why: "アプリの文字が刷り込み（選択肢欄・単位・ラベル）に重なっていないか。罫線基準の検査では出ない次元",
        runs: [
            { label: "自己診断", cmd: [PY, "scripts/check-printed-overlap.py", "--self-test"], sentinel: "SELF_TEST_OK" },
            ...["stress", "realistic"].map((s) => ({
                label: s, cmd: [PY, "scripts/check-printed-overlap.py", ...pdfsOf(s)], sentinel: "NO_PRINTED_OVERLAP",
            })),
        ],
    },
    {
        file: "check-choice-clearance.py",
        // ★排他。自己診断がソース（ルート/生成物）を一時的に書き換えるので、
        //   他の検査と同時に走らせると壊れた途中状態を読ませてしまう（並列化で実際に踏んだ）。
        exclusive: true, stage: "静的",
        why: "○が隣の刷り込み語に触れていないか（全様式・定数すべて）。1つのセルに丸は1つしか付かないので"
            + "生成PDFでは選択肢の一部しか踏めない。使われていない定数こそ黙って壊れる",
        runs: [
            { label: "自己診断", cmd: [PY, "scripts/check-choice-clearance.py", "--self-test"], sentinel: "SELF_TEST_OK" },
            { cmd: [PY, "scripts/check-choice-clearance.py"], sentinel: "CHOICE_CLEARANCE_OK" },
        ],
    },
    {
        file: "check-bekki14-choice-clearance.py", stage: "生成PDF", needsPdfs: true,
        why: "選択肢を囲む○が隣の刷り込み語に触れていないか。触れると「一斉と区分の両方が選ばれている」ように見え、"
            + "法定書類として意味が壊れる。罫線越えでも刷り込みへの重なりでも出ない次元",
        runs: [
            { label: "自己診断", cmd: [PY, "scripts/check-bekki14-choice-clearance.py", "--self-test"], sentinel: "SELF_TEST_OK" },
            { cmd: [PY, "scripts/check-bekki14-choice-clearance.py"], sentinel: "CHOICE_CLEARANCE_OK" },
        ],
    },
    {
        file: "check-model-cell-overflow.py", stage: "生成PDF", needsPdfs: true,
        why: "型式セルのはみ出し",
        // ★既定値は tmp/pdf-test-fixed/bekki1_debug_test.pdf（保守されていない残骸）なので
        //   ランナーからは必ず維持対象のPDFを明示して渡す
        runs: [
            { label: "stress", cmd: [PY, "scripts/check-model-cell-overflow.py", "tmp/pdf-test-extra/bekki1_test.pdf"], sentinel: "MODEL_CELL_OVERFLOW_OK" },
            { label: "realistic", cmd: [PY, "scripts/check-model-cell-overflow.py", "tmp/pdf-realistic/bekki1_test.pdf"], sentinel: "MODEL_CELL_OVERFLOW_OK" },
        ],
    },

    // ── 挙動（ルートを実際に叩く。遅いので最後）
    {
        file: "check-fit-error.mjs", stage: "挙動",
        why: "収まらない値を黙って切り詰めず422で返すか（正常200／超過422の両方向）",
        runs: [{ cmd: ["node", "scripts/check-fit-error.mjs"], sentinel: "FIT_ERROR_CHECK_OK" }],
    },
    {
        file: "check-shrink-warning.mjs", stage: "挙動",
        why: "設計値から大きく縮小したとき警告を返すか（PDFは返す）",
        runs: [{ cmd: ["node", "scripts/check-shrink-warning.mjs"], sentinel: "SHRINK_WARNING_CHECK_OK" }],
    },
    {
        file: "check-choice-mismatch-warning.mjs", stage: "挙動", needsPdfs: true,
        why: "選択肢欄の値がどれとも一致せず○が1つも描かれないとき、業者に警告が届くか。"
            + "PDFは正常に出て罫線越えも重なりもベースライン差分も出ない＝全検査が緑のまま情報だけ落ちる唯一の経路",
        runs: [{ cmd: ["node", "scripts/check-choice-mismatch-warning.mjs"], sentinel: "CHOICE_MISMATCH_WARNING_CHECK_OK" }],
    },
    {
        file: "check-merge-order.mjs", stage: "静的",
        why: "結合PDFの綴じ順が様式番号順か。★指標には出ない種類（罫線も越えず切り詰めも無いので"
            + "全検査が緑のまま「綴じたときに目的の様式を探せない」だけが残る）",
        runs: [
            { label: "自己診断", cmd: ["node", "scripts/check-merge-order.mjs", "--self-test"], sentinel: "SELF_TEST_OK" },
            { cmd: ["node", "scripts/check-merge-order.mjs"], sentinel: "MERGE_ORDER_OK" },
        ],
    },
    {
        file: "check-row-labels.mjs",
        // ★排他。自己診断がソース（ルート/生成物）を一時的に書き換えるので、
        //   他の検査と同時に走らせると壊れた途中状態を読ませてしまう（並列化で実際に踏んだ）。
        exclusive: true, stage: "静的",
        why: "⑧のエラー・警告に出す行ラベルが入力画面と一致しているか。"
            + "フォームの行を1つ増やすと以降が全部1つずれ、業者が**間違った行**を開く（何も出ないより悪い）",
        runs: [
            { label: "自己診断", cmd: ["node", "scripts/check-row-labels.mjs", "--self-test"], sentinel: "SELF_TEST_OK" },
            { cmd: ["node", "scripts/check-row-labels.mjs"], sentinel: "ROW_LABELS_OK" },
        ],
    },
    {
        file: "check-warning-consumers.mjs", stage: "静的",
        why: "サーバが返した警告・エラーを UI が取りこぼしていないか。"
            + "★同じ事故が3回起きている（マージ側の422／個別フォーム14件／納品ボタン）。"
            + "型定義から読むので、BuildResult にフィールドを足せば自動で対象になる",
        runs: [
            { label: "自己診断", cmd: ["node", "scripts/check-warning-consumers.mjs", "--self-test"], sentinel: "SELF_TEST_OK" },
            { cmd: ["node", "scripts/check-warning-consumers.mjs"], sentinel: "WARNING_CONSUMERS_OK" },
        ],
    },
    {
        file: "check-pdf-failure-ux.mjs", stage: "挙動",
        why: "422/5xx/壊れた本文/通信断を区別してUIに出すか。納品はfitで止まるか",
        runs: [{ cmd: ["node", "scripts/check-pdf-failure-ux.mjs"], sentinel: "PDF_FAILURE_UX_CHECK_OK" }],
    },
]

/** 検査ではないが、この入口から必ず通す工程 */
const EXTRA_STAGES = [
    {
        name: "字形化け回帰", stage: "インク層",
        why: "型番の字形化けと幅乖離。check-ink-coverage.py が読むPDFもここで作る",
        runs: [
            { label: "生成", cmd: ["node", "scripts/digit-mangling-regression.mjs"], sentinel: null },
            { label: "判定", cmd: [PY, "scripts/digit-mangling-regression.py"], sentinel: "DIGIT_MANGLING_REGRESSION_PASSED" },
        ],
    },
    {
        name: "ベースライン照合", stage: "退行", needsPdfs: true,
        why: "長文25様式・現実値25様式のPNG差分（★この端末限定）",
        optional: ".tmp/baseline",
        runs: [{ cmd: [PY, "scripts/baseline.py", "check", "all"], sentinel: "BASELINE_MATCH" }],
    },
]

// ══════════════════════════════════════════════════════════════════
const line = (c = "─") => c.repeat(72)
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`

const run = (cmd) => {
    const t0 = Date.now()
    const r = spawnSync(cmd[0], cmd.slice(1), {
        cwd: ROOT, encoding: "utf8", shell: false,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    })
    // ★stderr を捨てない。生成が失敗したのに気づかず古い成果物を測る事故を踏んでいる
    return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, ms: Date.now() - t0 }
}

/**
 * 非同期版。★並列実行のためだけに足したもので、**実行するコマンドは同一**。
 * 速くする改修は「測るものを減らして速くなる」に転びやすいので、
 * 引数も判定（終了コード＋センチネル）も一切変えていない。
 */
const runAsync = (cmd) => new Promise((resolve) => {
    const t0 = Date.now()
    const p = spawn(cmd[0], cmd.slice(1), {
        cwd: ROOT, shell: false,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    })
    let out = ""
    p.stdout.on("data", (d) => { out += d.toString("utf8") })
    p.stderr.on("data", (d) => { out += d.toString("utf8") })
    p.on("close", (code) => resolve({ code, out, ms: Date.now() - t0 }))
    p.on("error", (e) => resolve({ code: 1, out: String(e), ms: Date.now() - t0 }))
})

/** 同時実行数。CPU数-1（最低2）。★増やしすぎると各検査が遅くなり合計が伸びる */
const CONCURRENCY = Math.max(2, (os.cpus()?.length ?? 4) - 1)

/** thunk を上限つきで並行実行する（結果の順序は入力順を保つ） */
const parallelMap = async (items, fn, limit) => {
    const out = new Array(items.length)
    let next = 0
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (;;) {
            const i = next++
            if (i >= items.length) return
            out[i] = await fn(items[i], i)
        }
    })
    await Promise.all(workers)
    return out
}

/**
 * 生成物の由来を表す指紋。★mtime ではなく内容ハッシュで見る。
 *   mtime だと、フォーマッタや git checkout がファイルに触っただけで
 *   中身が同じでも「古い」と判定され、毎回52秒の再生成を強いられる。
 *   ＝ 守られなくなる検査になる。実際この方式で最初に誤検知した。
 */
const MANIFEST = path.join(ROOT, "tmp", ".pdf-check-sources.json")

const sourceHashes = () => {
    const out = {}
    for (const [dir, match] of SOURCE_GLOBS) {
        const abs = path.join(ROOT, dir)
        if (!fs.existsSync(abs)) continue
        const walk = (d) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
                const p = path.join(d, e.name)
                if (e.isDirectory()) { walk(p); continue }
                if (!match(p)) continue
                out[path.relative(ROOT, p).replace(/\\/g, "/")] =
                    createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16)
            }
        }
        walk(abs)
    }
    return out
}

const diffHashes = (was, now) => {
    const keys = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort()
    return keys.filter((k) => was[k] !== now[k])
}

// ── STAGE 0: 孤立検査の検出 ──────────────────────────────────────
const SELF = path.basename(new URL(import.meta.url).pathname)
const onDisk = fs.readdirSync(path.join(ROOT, "scripts"))
    .filter((f) => /^check-.*\.(py|mjs)$/.test(f) && f !== SELF).sort()
const registered = new Set(CHECKS.map((c) => c.file))
const orphans = onDisk.filter((f) => !registered.has(f))
const missing = [...registered].filter((f) => !onDisk.includes(f))

console.log(line("═"))
console.log("STAGE 0  孤立検査の検出")
console.log(`  scripts/ の検査 ${onDisk.length} 本 / 登録簿 ${registered.size} 本`)
if (orphans.length || missing.length) {
    for (const f of orphans) console.log(`  ★孤立: ${f} … CHECKS に登録されておらず、この入口から走らない`)
    for (const f of missing) console.log(`  ★欠落: ${f} … CHECKS にあるが scripts/ に無い`)
    console.log("\n  検査を足したら CHECKS にも登録すること。登録しないと誰も走らせない。")
    process.exit(1)
}
console.log("  孤立0 / 欠落0")

const ALL = [...CHECKS, ...EXTRA_STAGES]
if (LIST_ONLY) {
    console.log(line())
    for (const c of ALL) {
        console.log(`  [${c.stage}] ${c.file ?? c.name} — ${c.why}`)
        for (const r of c.runs) console.log(`      ${r.label ? r.label + ": " : ""}${r.cmd.join(" ")}`)
    }
    process.exit(0)
}

// ── STAGE 1: 生成と鮮度 ─────────────────────────────────────────
console.log(line("═"))
console.log("STAGE 1  生成物の鮮度")
const t0All = Date.now()
if (REGEN) {
    for (const g of GENERATORS) {
        const r = run(["node", g])
        console.log(`  ${r.code === 0 ? "OK  " : "★NG "} ${g} (${secs(r.ms)})`)
        if (r.code !== 0) { console.log(r.out.split("\n").slice(-15).join("\n")); process.exit(1) }
    }
    // ★どのソースから作った生成物かを残す。次回以降はこれと突き合わせて鮮度を見る
    fs.writeFileSync(MANIFEST, JSON.stringify({ hashes: sourceHashes() }, null, 2), "utf8")
    console.log(`  由来を記録: ${path.relative(ROOT, MANIFEST)}`)
} else {
    const pdfs = [...pdfsOf("stress"), ...pdfsOf("realistic")]
    if (pdfs.length === 0) {
        console.log("  ★生成PDFが1つも無い。--regen を付けて実行すること")
        process.exit(1)
    }
    if (!fs.existsSync(MANIFEST)) {
        console.log("  ★生成物の由来が記録されていない（tmp/.pdf-check-sources.json が無い）")
        console.log("    どのソースから作られたPDFか分からないまま測ることになる。--regen を付けて実行すること")
        process.exit(1)
    }
    const was = JSON.parse(fs.readFileSync(MANIFEST, "utf8")).hashes
    const changed = diffHashes(was, sourceHashes())
    if (changed.length > 0) {
        console.log(`  ★生成後にソースが ${changed.length} 件変わっている:`)
        for (const f of changed.slice(0, 10)) console.log(`      ${f}`)
        if (changed.length > 10) console.log(`      … 他 ${changed.length - 10} 件`)
        console.log("    古いPDFを測ると『古いものを測って緑』になる。--regen を付けて実行すること")
        process.exit(1)
    }
    console.log(`  OK   長文 ${pdfsOf("stress").length} 件 / 現実値 ${pdfsOf("realistic").length} 件、生成時のソースと一致`)
}

// ── STAGE 2: 検査 ───────────────────────────────────────────────
console.log(line("═"))
console.log("STAGE 2  検査")
const results = []
let failed = 0

/**
 * ★実行単位を平らに並べて並行実行する。
 *
 *   同じスクリプトの「自己診断」と本番、長文セットと現実値セットは互いに独立で、
 *   順番に走らせる理由が無かった（実測 245秒のうち最長の1件は31秒）。
 *   ＝ 逐次であること自体が所要時間の主因。
 *
 * ★変えていないもの: 実行するコマンド・引数・判定（終了コード＋センチネル）・
 *   出力の順序（結果は入力順に並べ直してから出す）。
 *   速くする改修は「測るものを減らして速くなる」に転びやすい。圧縮の前後で
 *   全件の結果が一致することを必ず確かめること。
 *
 * ★書き込みの競合が無いこと: 各検査は生成済みPDFを**読む**だけ。
 *   一時PDFを書くもの（check-fit-error / check-shrink-warning /
 *   check-choice-mismatch-warning / digit-mangling-regression）は
 *   出力先が互いに違う。
 */
const units = []
const exclusiveUnits = []
for (const c of ALL) {
    const name = c.file ?? c.name
    if (c.optional && !fs.existsSync(path.join(ROOT, c.optional))) {
        console.log(`  SKIP [${c.stage}] ${name} … ${c.optional} が無い（この端末では未登録）`)
        results.push({ name, ms: 0, state: "SKIP" })
        continue
    }
    if (SKIP_BASELINE && name === "ベースライン照合") {
        console.log(`  ★除外 [${c.stage}] ${name} … --skip-baseline が指定されています`)
        console.log("       画素比較は人が差分を見て承認する検査なので CI では走らせません。")
        console.log("       ★ローカルで npm run check:pdf を通すこと。pre-push フックが鮮度を見張っています。")
        results.push({ name, ms: 0, state: "SKIP" })
        continue
    }
    for (const r of c.runs) {
        const u = { stage: c.stage, label: r.label ? `${name} (${r.label})` : name, r }
        ;(c.exclusive ? exclusiveUnits : units).push(u)
    }
}
console.log(`  同時実行 ${CONCURRENCY} 並列 / 並行 ${units.length} 件 + 排他 ${exclusiveUnits.length} 件`)
// ★排他の相を先に直列で回す。ソースを書き換える自己診断が他の検査と重なると、
//   書き換わった途中状態を読ませてしまう（並列化した直後に check-row-labels が
//   「生成物が一致しない」で落ちて発覚した）。
const doneEx = []
for (const u of exclusiveUnits) doneEx.push({ u, res: await runAsync(u.r.cmd) })
const done = [...doneEx, ...await parallelMap(units, async (u) => ({ u, res: await runAsync(u.r.cmd) }), CONCURRENCY)]
for (const { u, res } of done) {
    const codeOk = res.code === 0
    const sentOk = u.r.sentinel === null || res.out.includes(u.r.sentinel)
    const ok = codeOk && sentOk
    if (!ok) failed += 1
    const why = !codeOk ? `exit=${res.code}` : !sentOk ? `センチネル ${u.r.sentinel} が出力に無い` : ""
    console.log(`  ${ok ? "OK  " : "★NG "} [${u.stage}] ${u.label} (${secs(res.ms)}) ${why}`)
    if (!ok) {
        for (const l of res.out.split(/\r?\n/).filter(Boolean).slice(-20)) console.log(`        ${l}`)
    }
    results.push({ name: u.label, ms: res.ms, state: ok ? "OK" : "NG" })
}

// ── まとめ ──────────────────────────────────────────────────────
console.log(line("═"))
const total = Date.now() - t0All
const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5)
console.log(`所要 ${secs(total)} / 実行 ${results.length} 件 / 失敗 ${failed} 件`)
console.log("  遅い順: " + slow.map((r) => `${r.name} ${secs(r.ms)}`).join(" / "))
if (failed > 0) {
    console.log("\nCHECK_PDF_FAILED")
    process.exit(1)
}
console.log("\nCHECK_PDF_ALL_OK")
