import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { GROUP_TITLES } from "./review-output-fixtures.mjs";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const toPosixRelative = (basePath, targetPath) => path.relative(basePath, targetPath).replace(/\\/g, "/");

const parseArgs = (argv) => {
  let outDir = "";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out-dir") {
      outDir = path.resolve(argv[index + 1]);
      index += 1;
    }
  }

  if (!outDir) {
    throw new Error("--out-dir is required");
  }

  return { outDir };
};

const countPdfPages = async (pdfPath) => {
  const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
  return pdfDoc.getPageCount();
};

const buildIndexHtml = (manifest) => {
  const groups = ["report", "overview", "bekki"];
  const sections = groups.map((group) => {
    const entries = manifest.filter((entry) => entry.kind === group);
    const cards = entries.map((entry) => {
      const fileLink = entry.outputPath
        ? `<a href="${escapeHtml(entry.outputPath)}">${escapeHtml(path.basename(entry.outputPath))}</a>`
        : "<span>未生成</span>";
      const payloadLink = entry.payloadPath
        ? `<a href="${escapeHtml(entry.payloadPath)}">${escapeHtml(path.basename(entry.payloadPath))}</a>`
        : "<span>なし</span>";
      const errorHtml = entry.errors.length
        ? `<ul class="errors">${entry.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`
        : `<p class="ok">status=${escapeHtml(entry.status)} bytes=${escapeHtml(entry.bytes)}${entry.pages ? ` pages=${escapeHtml(entry.pages)}` : ""}${entry.renderedPngs !== null ? ` png=${escapeHtml(entry.renderedPngs)}` : ""}</p>`;
      const imageHtml = entry.pngPaths.length
        ? `<div class="thumbs">${entry.pngPaths.map((pngPath) => `<a href="${escapeHtml(pngPath)}"><img src="${escapeHtml(pngPath)}" alt="${escapeHtml(entry.key)}" /></a>`).join("")}</div>`
        : `<p class="muted">PNGなし</p>`;

      return `
        <article class="card">
          <h3>${escapeHtml(entry.title)}</h3>
          <p class="meta">key: ${escapeHtml(entry.key)} / format: ${escapeHtml(entry.format)}</p>
          <p class="links">${fileLink} | ${payloadLink}</p>
          ${errorHtml}
          ${imageHtml}
        </article>
      `;
    }).join("");

    return `
      <section>
        <h2>${escapeHtml(GROUP_TITLES[group])}</h2>
        <div class="grid">${cards}</div>
      </section>
    `;
  }).join("");

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>全帳票テスト出力レビュー</title>
  <style>
    body { font-family: "Yu Gothic UI", "Hiragino Sans", sans-serif; margin: 24px; color: #111827; background: #f8fafc; }
    h1, h2, h3 { margin: 0; }
    h1 { margin-bottom: 24px; }
    section { margin-bottom: 32px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px; }
    .card { background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06); }
    .meta, .links, .muted, .ok { margin: 8px 0; font-size: 13px; color: #475569; }
    .thumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .thumbs img { width: 140px; border: 1px solid #cbd5e1; background: white; }
    .errors { margin: 8px 0; color: #b91c1c; padding-left: 18px; }
    a { color: #0f766e; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>全帳票テスト出力レビュー</h1>
  ${sections}
</body>
</html>`;
};

const main = async () => {
  const { outDir } = parseArgs(process.argv.slice(2));
  const manifestPath = path.join(outDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let failureCount = 0;

  for (const entry of manifest) {
    entry.errors = entry.errors.filter((error) => !error.startsWith("PNG rendering failed") && !error.startsWith("PNG count mismatch"));

    if (entry.format !== "pdf") {
      continue;
    }

    const absolutePdfPath = path.join(outDir, entry.outputPath);
    const absolutePngDir = path.join(outDir, "png", entry.kind, entry.key);
    entry.pages = await countPdfPages(absolutePdfPath);

    if (!fs.existsSync(absolutePngDir)) {
      entry.renderedPngs = 0;
      entry.pngPaths = [];
      entry.errors.push("PNG not rendered");
      failureCount += 1;
      continue;
    }

    const pngFiles = fs.readdirSync(absolutePngDir)
      .filter((name) => name.toLowerCase().endsWith(".png"))
      .sort();
    entry.renderedPngs = pngFiles.length;
    entry.pngPaths = pngFiles.map((name) => toPosixRelative(outDir, path.join(absolutePngDir, name)));

    if (entry.renderedPngs !== entry.pages) {
      entry.errors.push(`PNG count mismatch: pages=${entry.pages}, png=${entry.renderedPngs}`);
      failureCount += 1;
    }
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "index.html"), buildIndexHtml(manifest), "utf8");

  if (failureCount > 0) {
    process.exitCode = 1;
  }
};

await main();
