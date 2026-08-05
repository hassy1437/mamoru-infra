"use client"

import { useState } from "react"

/**
 * ※印の条件文。長いものは畳んで出す。
 *
 * ■ なぜ畳むか（2026-08-05・chromium で 360px 端末を実測）
 *   全39件のうち2件が **7行** になる（消防法施行規則の条文をそのまま引いているもの）。
 *   行ラベルより注記のほうが長くなり、入力欄が画面の下に押し出されていた。
 *
 * ■ ★閾値 60文字（実測の分布の谷から決めた。推測ではない）
 *   ※込みの文字数を並べると 37 / 54 / 73 / 137 に固まり、間に谷がある。
 *     2行 33件 … 32〜37文字
 *     3行  3件 … 54文字
 *     4行  1件 … 73文字   ← ここから畳む
 *     7行  2件 … 137文字
 *   隣との差は 37→54 が 17、54→73 が 19、73→137 が 64。
 *   ★54（3行）と73（4行）の間の谷の中央付近＝60 を採る。
 *   ＝ 3行までは畳まず、4行以上になるものだけ畳む。対象は 3件。
 *   ★注記を足したら分布が変わる。閾値はこの分布の谷に依存しているので、
 *     足したときは測り直すこと（.tmp/wrap2.mjs のハーネス）。
 */
export const NOTE_COLLAPSE_THRESHOLD = 60;

/** 畳んだときに見せる文字数。★「何の条件か」が分かる程度は必ず見せる。 */
const PREVIEW_CHARS = 28;

export function RowNote({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const full = `※ ${text}`;

  // 短いものはそのまま出す（畳むボタンが増えるだけで読みにくくなる）。
  if (full.length <= NOTE_COLLAPSE_THRESHOLD) {
    return <div className={`text-xs text-amber-700 leading-snug ${className}`}>{full}</div>;
  }

  return (
    <div className={`text-xs text-amber-700 leading-snug ${className}`}>
      {/*
        ★畳んでいるときも冒頭は見せる。全部隠すと「なぜこの欄が特別なのか」が
          分からなくなり、注記を足した意味が消える。
      */}
      {open ? full : `${full.slice(0, PREVIEW_CHARS)}…`}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ml-1 underline underline-offset-2 hover:no-underline"
        aria-expanded={open}
      >
        {open ? "閉じる" : "全文"}
      </button>
    </div>
  );
}
