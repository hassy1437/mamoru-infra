/**
 * 不良内容・措置内容の候補（2026-10-19・打合せ録音 #101 で決定）。
 *
 * ★★ここの言い回しは開発側が作った「たたき台」。吉田さん（点検の実務の専門家）に見てもらうまでは、
 *     正しい言い回しとして頼らないこと（足す・削る・言い換えるのは、吉田さんの確認を経てから）。
 *
 * ■ なぜ要るか
 *   業者は現場でスマホから入れる。不良内容・措置内容は自由入力だけで、毎回同じ言葉を手で打っていた。
 *
 * ■ 決めたこと
 *   ・自由入力は残す。候補は入力欄に <datalist> で添えるだけ（選んでも打ってもよい）
 *   ・値は今までどおりただの文字列（DB も PDF も変えない）
 *   ・候補はこのファイルにだけ書く（別記 23 様式と総括表の「要改善」が同じ一覧を使う）
 *   ・行ラベルの末尾の語（外形・表示・圧力・作動・点灯・設置場所…）で、その行に合う候補を先に出す
 *
 * ■ ★短く書くこと（DEFECT_PHRASE_MAX_CHARS 字まで）
 *   別記の不良内容・措置内容の欄は幅 65〜95pt・文字 5.9〜6.7pt しかない（例: 別記11の1 の route は 6.1pt）。
 *   長いと縮小（⑨の警告）や切り詰め（⑧の 422・PDF が出ない）になる。
 *   scripts/check-defect-phrases.mjs が字数と配線を見張り、全様式の全行に一番長い候補を入れて PDF を作って確かめる。
 */

/** 候補 1 つの字数の上限。★別記で一番狭い欄（別記7 その4 の措置内容 65.34pt・6.4pt）に 1 行で入る目安 */
export const DEFECT_PHRASE_MAX_CHARS = 10

export type DefectPhraseKind = "bad" | "action"

/** どの行にも出す候補 */
export const GENERAL_DEFECT_PHRASES: Readonly<Record<DefectPhraseKind, readonly string[]>> = {
    bad: [
        "変形・損傷あり",
        "腐食あり",
        "亀裂あり",
        "脱落あり",
        "汚損あり",
        "漏れあり",
        "作動不良",
        "機能不良",
        "表示不鮮明",
        "障害物あり",
        "未設置",
        "規定値外",
        "接続不良",
        "不点灯",
        "異音あり",
        "期限超過",
    ],
    action: [
        "交換済",
        "要交換",
        "修理済",
        "要修理",
        "補修済",
        "要補修",
        "調整済",
        "清掃済",
        "増し締め済",
        "障害物を移動済",
        "改修見積提出済",
        "関係者へ報告済",
        "次回交換予定",
        "経過観察",
    ],
}

export type DefectPhraseGroup = {
    /** datalist の id に使う（英小文字） */
    id: string
    /** 行ラベルの末尾の語がこれを含めば、この組の候補を先に出す */
    keywords: readonly string[]
    bad: readonly string[]
    action: readonly string[]
}

/**
 * 行ラベルの末尾の語ごとの候補。★上から順に見て最初に当たった組を使う（「表示灯」を「表示」より先に）。
 */
export const DEFECT_PHRASE_GROUPS: readonly DefectPhraseGroup[] = [
    {
        id: "lamp",
        keywords: ["表示灯", "常夜灯", "標識灯", "光源", "点灯"],
        bad: ["不点灯", "球切れ", "点灯不良"],
        action: ["ランプ交換済", "要ランプ交換"],
    },
    {
        id: "outer",
        keywords: ["外形", "外箱", "本体容器"],
        bad: ["変形・損傷あり", "腐食あり", "塗装のはがれ", "亀裂あり"],
        action: ["補修済", "塗装補修済", "要交換"],
    },
    {
        id: "hose",
        keywords: ["ホース", "耐圧"],
        bad: ["亀裂あり", "硬化あり", "接続部の緩み"],
        action: ["ホース交換済", "要ホース交換"],
    },
    {
        id: "pipe",
        keywords: ["配管", "管継手"],
        bad: ["腐食あり", "漏水あり", "損傷あり"],
        action: ["補修済", "要補修"],
    },
    {
        id: "fuse",
        keywords: ["ヒューズ"],
        bad: ["ヒューズ溶断", "容量不適"],
        action: ["ヒューズ交換済"],
    },
    {
        id: "spare",
        keywords: ["予備品"],
        bad: ["予備品不足", "予備品なし"],
        action: ["予備品補充済", "要予備品補充"],
    },
    {
        id: "earth",
        keywords: ["接地"],
        bad: ["接地線外れ", "接地不良"],
        action: ["再接続済"],
    },
    {
        id: "wire",
        keywords: ["結線接続", "接続"],
        bad: ["端子の緩み", "断線", "接続不良"],
        action: ["増し締め済", "再接続済"],
    },
    {
        id: "pressure",
        keywords: ["圧力"],
        bad: ["圧力不足", "指針が範囲外", "圧力計不良"],
        action: ["圧力調整済", "要再充てん", "圧力計交換済"],
    },
    {
        id: "battery",
        keywords: ["蓄電池", "電圧", "充電", "電源", "電解液"],
        bad: ["電圧低下", "充電不良", "液漏れあり", "期限超過"],
        action: ["蓄電池交換済", "要蓄電池交換"],
    },
    {
        id: "label",
        keywords: ["表示", "標識"],
        bad: ["表示不鮮明", "表示の脱落", "表示なし", "標識なし"],
        action: ["表示を貼付済", "要表示貼付", "標識を設置済"],
    },
    {
        id: "place",
        keywords: ["周囲の状況", "設置場所", "設置間隔", "障害", "未警戒"],
        bad: ["障害物あり", "操作障害あり", "未警戒部分あり", "設置位置不適"],
        action: ["障害物を移動済", "移動を依頼済", "要増設"],
    },
    {
        id: "operation",
        keywords: ["作動", "機能", "起動", "運転", "性能"],
        bad: ["作動不良", "作動せず", "誤作動あり", "性能不足"],
        action: ["調整済", "要修理", "部品交換済", "要部品交換"],
    },
    {
        id: "quake",
        keywords: ["耐震", "保持装置"],
        bad: ["固定不良", "転倒防止なし"],
        action: ["固定済", "要固定"],
    },
    {
        id: "water",
        keywords: ["水量", "水状", "貯水槽", "給水装置", "呼水"],
        bad: ["水量不足", "濁りあり", "漏水あり"],
        action: ["補水済", "要清掃"],
    },
    {
        id: "agent",
        keywords: ["薬剤", "消火剤", "性状"],
        bad: ["薬剤量不足", "固化あり", "変色あり"],
        action: ["薬剤詰替済", "要薬剤詰替"],
    },
    {
        id: "pin",
        keywords: ["安全栓", "封"],
        bad: ["安全栓の脱落", "封の損傷"],
        action: ["安全栓取付済", "封を復旧済"],
    },
    {
        id: "valve",
        keywords: ["バルブ", "弁"],
        bad: ["開閉不良", "漏れあり", "固着あり"],
        action: ["調整済", "要交換"],
    },
    {
        id: "sound",
        keywords: ["音圧", "音響", "鳴動"],
        bad: ["音圧不足", "鳴動せず"],
        action: ["調整済", "要交換"],
    },
]

/** 行ラベルの末尾の語（「 / 」「：」・空白で区切った最後。※印は外す） */
export function rowLabelTail(label: string): string {
    const parts = label.replace(/※/g, "").split(/\s*\/\s*|：|\s+/).filter(Boolean)
    return parts[parts.length - 1] ?? ""
}

/** その行の候補の組（当たらなければ null＝どの行にも出す候補だけ） */
export function defectPhraseGroupOf(label: string): DefectPhraseGroup | null {
    const tail = rowLabelTail(label)
    if (!tail) return null
    return DEFECT_PHRASE_GROUPS.find((g) => g.keywords.some((k) => tail.includes(k))) ?? null
}

/** 候補の一覧（その行に合う候補 → どの行にも出す候補。重複は除く） */
export function defectPhrasesOf(kind: DefectPhraseKind, group: DefectPhraseGroup | null): string[] {
    return [...new Set([...(group?.[kind] ?? []), ...GENERAL_DEFECT_PHRASES[kind]])]
}

/** datalist の id の既定の頭（別記の入力画面は 1 画面に 1 様式なので固定でよい） */
export const DEFECT_PHRASE_LIST_PREFIX = "defect-phrases"

/** 組ごとの datalist の id（★描く側 DefectPhraseDatalists と入力欄の list 属性の両方がこれを通す） */
export function defectPhraseGroupListId(
    kind: DefectPhraseKind,
    group: DefectPhraseGroup | null,
    prefix: string = DEFECT_PHRASE_LIST_PREFIX,
): string {
    return `${prefix}-${kind}-${group?.id ?? "general"}`
}

/** 入力欄の list 属性に入れる id（行ラベルから組を決める）。行ラベルの無い欄は label に "" を渡す */
export function defectPhraseListId(kind: DefectPhraseKind, label: string, prefix: string = DEFECT_PHRASE_LIST_PREFIX): string {
    return defectPhraseGroupListId(kind, defectPhraseGroupOf(label), prefix)
}

/** 候補を全部（字数の検査用） */
export function allDefectPhrases(kind: DefectPhraseKind): string[] {
    return [...new Set([...GENERAL_DEFECT_PHRASES[kind], ...DEFECT_PHRASE_GROUPS.flatMap((g) => g[kind])])]
}
