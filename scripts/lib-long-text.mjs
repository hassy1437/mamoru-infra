// 長文セットの「長さの基準」を1か所で決める。
//
// ■ なぜ要るか（2026-07-31 に踏んだ）
//   長文セットの作り方が2系統に分かれていた:
//     22ルート … 生成スクリプトのコード内に長い値を直書き
//      4ルート … scripts/fixtures/extra/*.payload.json を素通し（★長文化の処理が無い）
//   後者（bekki1 / 報告書 / 点検者一覧 / 総括表）は「長文セット」という名前なのに
//   現実値と同じ長さで、その4様式については stress を一度もやっていなかった。
//   ＝ 系統が2つあると、片方に処理を足し忘れても名前だけは揃っているので気づけない。
//
// ■ 基準の置き方（★他ルートの実測長に合わせない）
//   以前の見積もりは「bekki* の実測長に揃える」だったが、それだと
//   fixture が既にその長さの報告書は永遠に stress にならない。
//   そこで**フィールド種別ごとに「現実にありうる最大」**を置く。
//   ★根拠を必ず書く。数値だけ置くと、次にそれを動かしてよいか誰も判断できない。
//
// ■ 使い方
//   applyLongText(payload) を、全ての生成スクリプトが applyNumericRows の前に呼ぶ。
//   ★4本だけに別の仕組みを足さない。系統を増やすのが今回の穴の原因だった。

/**
 * 種別ごとの長文。value は実際に payload へ入る文字列。
 *
 * ★length ではなく文字列そのものを持つ理由: 「70字」という数字だけだと
 *   何を想定したのかが残らない。実物を書いておけば、次に見た人が
 *   「この住所は現実にあるか」を判断できる。
 */
// ★どの種別を長文セットに適用するか（実測に基づく）
//   全種別を同時に当てると 26本中 22本が 422（切り詰め）になり **PDFが出ない**。
//   PDFが出ないと下流の検査（下限割れ・はみ出し・ベースライン）が丸ごとその様式を失う。
//   ＝ 長文セットは「収まらないことを表明する」ためではなく「長い入力での版面を測る」ためにあるので、
//     測れる側に留める必要がある。1種別ずつ切り分けた実測:
//
//     種別               422  縮小  下限割れ   備考
//     住所(65字)           0    44    49     折り返しのあるセルなので縮小で吸収される
//     備考(150字)          0    31    31     同上
//     電話(30字)           4    34    40     bekki3/4/7/8
//     会社名(35字)        17    17    13     30字までは出る（実測）
//     不良内容(43字)      17    18    12
//     氏名(24字)          19    14    11
//     建物名(35字)        22    11     6     ★測定機器表の「機器名」セルが原因
//     型式・製造者(36字)   22     9     3     ★同上。15字までしか出ない（実測）
//
//   ★422 になる6種別は「その長さの実データが印字できない」という**本番の所見**であって、
//     テストの都合ではない。長文セットからは外すが、消さずにここに残す（applyToStress:false）。
export const LONG_TEXT_STANDARD = [
    {
        kind: "住所",
        applyToStress: true,
        match: /(^|_)(address|所在地)$/i,
        // 都道府県5 + 市区町村8 + 町名丁目番地16 + 建物名16 + 棟・階・部屋12 + 方書8 ≒ 65字
        // 実測: 報告書の届出者住所は 80字で切り詰め（21字欠落）が発生する。
        //       65字はその手前で、かつ「建物名と部屋番号まで書いた住所」として現実にありうる。
        value: "東京都千代田区丸の内一丁目一番一号 丸の内ビルディング東棟10階1001号室 サンプル管理組合気付",
        // ★長文セットで実際に使う値は 45字に切る。
        //   旧コメントは「総括表は61字で切り詰め」だったが、これは**測れていなかった**。
        //   総括表の drawInCell は切り詰めても fonts.fit?.report を一度も呼ばない実装で、
        //   欠落が報告されないまま 200 が返っていたためである（2026-08-01 に共有版へ統合して判明）。
        //   統合後の実測: 総括表の所在地は **45字** で切り詰まる（49字を入れると4字欠落）。
        //   45字を超えると総括表が長文セットから 422 で落ち、その様式の版面を一切測れなくなる。
        //   ★「実務でありうる49〜65字の住所が総括表に入らない」ことは本番の所見として残す
        //     （折り返しを持たない1行欄なので、422で止めるか略称にするかの二択になる）。
        stressLimit: 45,
        why: "住所は建物名・棟・階・部屋番号・方書まで書くと60字を超える。実測で80字は切り詰めが起きるので、その手前の現実的な最大に置く",
    },
    {
        kind: "会社名",
        applyToStress: false,
        match: /(^|_)(company)$/i,
        // 法人格の正式名称は長い。「特定非営利活動法人」9字 + 名称 + 「連合会」等
        value: "特定非営利活動法人サンプル防火対象物管理組合連合会 東京支店 設備保守部",
        why: "法人格の正式名称（特定非営利活動法人・一般社団法人等）に支店・部署が付くと35字を超える",
    },
    {
        kind: "氏名",
        applyToStress: false,
        match: /(^|_)(inspector_name|fire_manager|witness|inspector_responsible)$/i,
        value: "統括防火管理者 サンプル太郎（防災管理点検資格者）",
        // 氏名欄には資格・役職を併記する運用がある（実際の点検票で確認できる書き方）
        why: "氏名欄に役職と資格を併記する運用があり、氏名だけの4字では stress にならない",
    },
    {
        kind: "建物名",
        applyToStress: false,
        match: /(^|_)(form_name|building_name|name)$/i,
        value: "サンプルシティタワー・レジデンス アネックス棟（旧サンプルビルディング）",
        why: "再開発物件は「○○タワー・レジデンス △△棟（旧□□）」のように併記され30字を超える",
    },
    {
        kind: "電話",
        applyToStress: false,
        match: /(^|_)(tel|phone)$/i,
        value: "03-1234-5678（内線1234・夜間 090-1234-5678）",
        why: "内線と夜間連絡先を併記する運用がある",
    },
    {
        kind: "型式・製造者",
        applyToStress: false,
        match: /(^|_)(maker|model)$/i,
        value: "サンプル計測器製作所 ABC-1234-XYZ-2026年式（旧型番 DEF-567）",
        why: "型番は世代表記・旧型番の併記で30字を超える",
    },
    {
        kind: "備考",
        applyToStress: true,
        match: /(^|_)(notes|shoubou_notes)$/i,
        value: "備考欄の長文テストです。日本語文章がスペースなしでもはみ出さないこと、狭いセルで縮小や"
            + "切り詰めが効くことを確認します。不良箇所が複数ある場合は各設備の状況と措置予定を"
            + "並べて記載するため、実務でもこの程度の長さになります。必要に応じて省略記号で表示します。",
        // ★長文セットで実際に使う値は 80字に切る。
        //   実測: 点検者一覧の備考欄は 80字しか入らず（422 が fits:80 / over:47 と明示）、
        //   150字を入れると 422 になって **PDF が出ない**＝その様式の版面を測れなくなる。
        //   ここで切るのは測定のためであって、150字が非現実的だからではない。
        //   ★「実務でありうる150字が印字できない」ことは本番の所見として残す（相棒への確認事項）。
        stressLimit: 80,
        why: "備考は不良内容と措置予定を設備ごとに並べる欄で、実務でも150字を超える",
    },
    {
        kind: "不良内容・措置内容",
        applyToStress: false,
        match: /(^|_)(bad_content|action_content|bad_detail|action)$/i,
        value: "接続部の緩みおよび外形の変形を確認。部品交換のうえ再試験を実施予定（長文フィット確認用）",
        why: "不良内容と措置内容は文章で書く欄。現行の長文セットは30字前後で、行の折り返しを試せていない",
    },
]

/** 日付・判定・コードなど、長くしてはいけない値 */
const KEEP = /^(\d{4}-\d{2}-\d{2}|良|否|-|—|機器点検|総合点検|[0-9.,/／()（）-]+)$/

/** 長文セットに実際に適用する種別（applyToStress のもの） */
export const STRESS_KINDS = LONG_TEXT_STANDARD.filter((k) => k.applyToStress)

export const kindOf = (key, kinds = STRESS_KINDS) => kinds.find((k) => k.match.test(key)) ?? null

/**
 * ★長文化したキーは必ず現実値セット側にも値が要る。
 *   現実値セットは長文セットの payload を変換して作るので、置換値が定義されていないキーは
 *   **長文のまま現実値セットに混ざる**。CIゲート（現実値で下限割れ0）がその値に乗ってしまう。
 *   実際 REALISTIC のコメントに「ここを漏らすと…実測で発覚」と書かれた前例がある。
 */
export const assertRealisticCoverage = (realisticKeys, seenKeys) => {
    const missing = [...seenKeys].filter((k) => kindOf(k) && !realisticKeys.has(k))
    if (missing.length) {
        throw new Error(
            `長文化したキーに現実値が定義されていない: ${missing.join(", ")}
` +
            "  → scripts/generate-realistic-route-tests.mjs の REALISTIC に足すこと。" +
            "放置すると長文のまま現実値セットに混ざり、CIゲートがその値に乗る。")
    }
}

/**
 * payload の文字列を種別ごとの長文に置き換える。
 * 返り値は { payload, replaced, unmatched } で、★どのキーが種別に当てはまらなかったかを返す。
 * 当てはまらなかったものを黙って捨てると、分類の穴に気づけない。
 */
export const applyLongText = (payload) => {
    const replaced = new Map()
    const unmatched = new Map()
    const walk = (node, key = "") => {
        if (Array.isArray(node)) return node.map((v) => walk(v, key))
        if (node && typeof node === "object") {
            const o = {}
            for (const [k, v] of Object.entries(node)) o[k] = walk(v, k)
            return o
        }
        if (typeof node !== "string" || !node.trim()) return node
        if (KEEP.test(node.trim())) return node
        const kind = kindOf(key, STRESS_KINDS)
        if (!kind) {
            unmatched.set(key, (unmatched.get(key) ?? 0) + 1)
            return node
        }
        replaced.set(key, (replaced.get(key) ?? 0) + 1)
        return kind.stressLimit ? kind.value.slice(0, kind.stressLimit) : kind.value
    }
    return { payload: walk(payload), replaced, unmatched }
}
