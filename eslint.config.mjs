import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ★検査が書き出す作業用フォルダ（生成物・自己診断の写し）。ここまで見ると警告が 400 件を超え、
    //   本物の指摘が埋もれていた（2026-10-22）。
    "tmp/**",
  ]),
]);

export default eslintConfig;
