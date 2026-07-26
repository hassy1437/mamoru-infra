This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## 帳票PDFの検査（push 前に通す）

別記様式のPDFに関わる変更をしたら、push 前にこれを通すこと。

```bash
npm run check:pdf            # 検査のみ（約95秒）
node scripts/check-pdf-all.mjs --regen   # PDFを作り直してから検査（約140秒）
node scripts/check-pdf-all.mjs --list    # 何を走らせるか出すだけ
```

12本の検査を単一の入口から走らせる。**入口が1つなので「網羅」は
"入口を通っていないものが0件" という単純な不変条件になる。**

- 検査を新しく足したら `scripts/check-pdf-all.mjs` の `CHECKS` にも登録すること。
  登録しないと STAGE 0（孤立検査の検出）で落ちる。
  ★2026-07-26 時点で検査12本すべてがどこからも実行されておらず、
  そのうち1本は素のテンプレートでも失敗する壊れた状態で長期間残っていた。
- ソースを変えたのにPDFを作り直していないと STAGE 1（鮮度）で落ちる。
  判定は内容ハッシュなので、ファイルに触っただけでは落ちない。
- 各検査は終了コードと成功センチネルの両方を見る（「走ったが黙って失敗」を防ぐ）。
- ベースライン照合は**この端末限定**（`.tmp/baseline` が無ければ理由を出して飛ばす）。

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
