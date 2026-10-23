import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

/**
 * 単体テスト（2026-10-23 に入れた）。
 *
 * ■ なぜ要るか（docs/BACKLOG.md「点検アプリ側にテストが1件も無い」）
 *   PDF は npm run check:pdf（約 90 本の検査スクリプト）が守っているが、
 *   入力画面の状態の扱いや PDF を取りに行く口（pdf-client.ts）は型検査以外に守るものが無かった。
 *   ★検査スクリプトは「PDF の出来上がり」を見るもの。ここは「関数が入力に対して何を返すか」を見る。
 *
 * ■ 置き場所: 対象の隣に *.test.ts（src/lib/foo.ts → src/lib/foo.test.ts）
 */
export default defineConfig({
    resolve: {
        alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
        // ★別セッションの作業コピー（.claude/worktrees）と生成物を拾わない（マッチングサイトで二重に走った）
        exclude: ["**/node_modules/**", "**/.claude/**", "**/.next/**", "tmp/**"],
        // 日付は日本時間で扱う決まり（date-utils）。開発機が JST だと timeZone の付け忘れが素通りするので UTC で回す
        env: { TZ: "UTC" },
    },
})
