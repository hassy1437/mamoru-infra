/**
 * 型式・容器番号・交付番号など英数字の欄に付ける（2026-10-20・iPhone の入力しやすさ）。
 * iPhone は文字の欄で、英字の先頭を自動で大文字にし（pg-100 → Pg-100）、英単語の綴りを自動で直す。
 * 型式や番号はそのまま入ってほしいので、どちらも切る。日本語の変換には関係しない。
 */
export const CODE_INPUT_PROPS = { autoCapitalize: "off", autoCorrect: "off", spellCheck: false } as const
