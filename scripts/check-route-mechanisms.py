# 各PDFルートが持つべき「構造」の欠けを検出する。
#
# ■ なぜ要るか（2026-07-31 に踏んだ）
#   報告書ルート（generate-pdf）だけが fit コレクタを持っておらず、
#   26本中1本の欠けに誰も気づけなかった。`fonts.fit?` は optional chaining なので
#   コレクタが無くても静かに no-op になり、型検査も実行時エラーも出ない。
#   結果、その様式では **「警告0件」が「測っていない」の意味**だったのに、
#   全検査が緑を出していた。実測すると 4.19pt の描画と 21文字の切り詰めが
#   黙って出ていた。
#   ＝ 欠けているものは、検出器が「無い」と言わない限り見えない。
#
# ■ 何を「持つべき」とするか（★人が列挙しない）
#   共有ライブラリ（pdf-fit-report / pdf-form-helpers）の識別子について、
#   26本のうち何本が使っているかを数え、**多数派を正とみなす**。
#   多数派を正とする根拠: これらは様式ごとの機能差ではなく、
#   「入力由来かを判定する」「警告を返す」といった**どの様式にも要る配管**である。
#   様式固有の機能（drawChoiceCircle=選択肢のある様式だけ 等）は保有率が下がるので
#   自然に閾値の下に落ちる。
#
# ■ 閾値 STRUCTURAL_MIN の決め方
#   実測の保有数の分布には 25 と 23 の間に段差がある（26×10 / 25×1 / 23以下）。
#   24 に置くとその段差の中に切り位置が来る。★分布は毎回印字するので、
#   将来ズレたら目で確認できる（閾値を勘で固定したまま気づけない形にしない）。
#
# 使い方: python scripts/check-route-mechanisms.py [--self-test]
import collections
import glob
import io
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STRUCTURAL_MIN = 24

# 識別子として現れない「使っているか」の目印（ローカル定義やメンバ参照）
MEMBER_MARKERS = ("fonts.fit", "resolve(body)")

# ★構造を持たないことが判明している箇所。kind と理由を必ず書く。
#   "意図"   … 様式の性質上そもそも要らない（設計判断が済んでいる）
#   "欠落"   … 直すべきだと判定済みで未対処（債務）
#   "未判定" … ★測っていないので欠落か意図かを決められない。判断の保留を明示するための区分。
#             「欠落」に入れると直す前提の債務に見え、「意図」に入れると設計判断が
#             済んだように見える。どちらも嘘になるので3つ目が要る。
KINDS = ("意図", "欠落", "未判定")

# ★2026-08-01: ("drawWrappedTextInCell", "soukatu") の「未判定」を解消して削除した。
#   保留の理由は「セルが2行入るかを罫線で測っていない」だった。実測した結果:
#   総括表の値セットは全8欄とも**内部の横罫線が0本**で、高さ 41.8〜78.3pt（設計サイズで4〜7行）。
#   1行しか入らないという可能性は消えたので、規定の第一手どおり折り返しを入れた（所在地から）。
#   実測: 折り返し後は 16/17/32/49/80字 すべて設計値 9.5pt のまま（縮小も切り詰めも無し）。
EXCEPTIONS = {
    ("CellRef", "pdf"): (
        "意図",
        "報告書（第1号様式）は行ループ（drawResultRows）を持たない。CellRef は"
        "「どの欄の何行目のどの列か」を fit 報告に渡すための型で、行ループのある22様式が使う。"
        "この様式は欄が固定でラベルが一意に決まるため、位置による帰属が要らない。"),
}


def routes():
    out = {}
    for r in sorted(glob.glob(os.path.join(ROOT, "src/app/api/*/route.ts"))):
        dn = os.path.basename(os.path.dirname(r))
        if not re.fullmatch(r"generate-[A-Za-z0-9_-]*pdf", dn):
            continue
        out[dn.replace("generate-", "").replace("-pdf", "")] = io.open(r, encoding="utf-8").read()
    return out


def usage(rs):
    use = collections.defaultdict(set)
    for name, s in rs.items():
        for m in re.finditer(r'import\s*\{([^}]*)\}\s*from\s*"@/lib/(pdf-fit-report|pdf-form-helpers)"', s):
            for ident in re.findall(r"\b([A-Za-z_]\w*)\b", m.group(1)):
                if ident == "type":
                    continue
                use[ident].add(name)
        for marker in MEMBER_MARKERS:
            if marker in s:
                use[marker].add(name)
    return use


def audit(rs=None, drop=None):
    rs = rs or routes()
    use = usage(rs)
    if drop:
        sym, route = drop
        use[sym].discard(route)
    n = len(rs)
    structural = {k: v for k, v in use.items() if len(v) >= STRUCTURAL_MIN}
    problems = []
    for sym, owners in sorted(structural.items()):
        for miss in sorted(set(rs) - owners):
            if (sym, miss) in EXCEPTIONS:
                continue
            problems.append(f"{miss}: 構造 {sym} を持たない（{len(owners)}/{n} 本が持つ）")
    for (sym, route), (kind, _reason) in EXCEPTIONS.items():
        if kind not in KINDS:
            problems.append(f"例外宣言 {sym}/{route}: kind {kind!r} が未定義（{'/'.join(KINDS)} のいずれか）")
        if route not in rs:
            problems.append(f"例外宣言 {sym}/{route}: そのルートが存在しない")
        elif sym not in structural:
            problems.append(f"例外宣言 {sym}/{route}: {sym} はもう構造ではない（宣言を消すこと）")
        elif route in use[sym]:
            problems.append(f"例外宣言 {sym}/{route}: もう欠けていない（{kind}を解消したなら宣言を消すこと）")
    return rs, use, structural, problems


if __name__ == "__main__":
    rs, use, structural, problems = audit()
    n = len(rs)

    if "--self-test" in sys.argv:
        if problems:
            print("自己診断: 現状が既にNG（陰性対照が成立しない）")
            for p in problems:
                print("   ", p)
            sys.exit(1)
        # 陽性1: 構造をどれか1本から外すと落ちるか（全ルート × 代表の構造 で確かめる）
        sym = sorted(structural, key=lambda k: (-len(structural[k]), k))[0]
        victim = sorted(structural[sym])[0]
        if not any("構造" in p for p in audit(rs, drop=(sym, victim))[3]):
            print(f"自己診断: {victim} から {sym} を外しても検出できない")
            sys.exit(1)
        # 陽性2: 例外宣言が実態と合わなくなったら落ちるか
        # ★EXCEPTIONS が空になることはある（未判定を解消して消したとき）。
        #   そのときは「宣言を消すと落ちる」方向を試せないので、代わりに
        #   実在する欠けを1件でっち上げて宣言し、それを消して確かめる。
        got2 = True
        if EXCEPTIONS:
            key = next(iter(EXCEPTIONS))
            saved = EXCEPTIONS.pop(key)
            got2 = any("構造" in p and key[1] in p for p in audit(rs)[3])
            EXCEPTIONS[key] = saved
        EXCEPTIONS[("fitWarningHeader", "soukatu")] = ("意図", "陽性対照")
        got3 = any("もう欠けていない" in p for p in audit(rs)[3])
        del EXCEPTIONS[("fitWarningHeader", "soukatu")]
        if not got2:
            print("自己診断: 例外宣言を消しても検出できない")
            sys.exit(1)
        if not got3:
            print("自己診断: 欠けていないものを例外に載せても検出できない")
            sys.exit(1)
        undecided = sum(1 for k, _ in EXCEPTIONS.values() if k == "未判定")
        print(f"  陰性対照: ルート {n} 本 / 構造 {len(structural)} 件 → 欠け 0"
              f"（宣言済み {len(EXCEPTIONS)} 件を除く。うち未判定 {undecided} 件）")
        print(f"  陽性対照: {victim} から {sym} を外す → 検出 / 例外宣言を消す → 検出 / "
              "欠けていないものを例外に載せる → 検出")
        print("SELF_TEST_OK")
        sys.exit(0)

    dist = collections.Counter(len(v) for v in use.values())
    print(f"PDFルート {n} 本 / 共有ライブラリの識別子 {len(use)} 件")
    print(f"  保有数の分布（★閾値 {STRUCTURAL_MIN} 以上を「構造」とする。段差の位置を毎回確認すること）:")
    for k in sorted(dist, reverse=True):
        bar = "構造 |" if k >= STRUCTURAL_MIN else "     |"
        print(f"    {bar} {k:>2} 本が保有 … {dist[k]} 件")
    print(f"\n構造とみなした仕組み {len(structural)} 件:")
    for sym, owners in sorted(structural.items(), key=lambda x: (-len(x[1]), x[0])):
        miss = sorted(set(rs) - owners)
        note = ""
        if miss:
            kinds = [EXCEPTIONS.get((sym, m), ("★未宣言", ""))[0] for m in miss]
            note = f"  欠け: {', '.join(f'{m}({k})' for m, k in zip(miss, kinds))}"
        print(f"  {sym:<26}{len(owners):>3}/{n}{note}")
    if EXCEPTIONS:
        counts = {k: sum(1 for kk, _ in EXCEPTIONS.values() if kk == k) for k in KINDS}
        print(f"\n宣言済みの例外 {len(EXCEPTIONS)} 件"
              f"（意図 {counts['意図']} / 欠落 {counts['欠落']} / ★未判定 {counts['未判定']}）:")
        for (sym, route), (kind, reason) in EXCEPTIONS.items():
            print(f"  [{kind}] {route} に {sym} が無い")
            print(f"        {reason}")
    if problems:
        print("\n★NG:")
        for p in problems:
            print("   ", p)
        sys.exit(1)
    print("\nROUTE_MECHANISMS_OK")
