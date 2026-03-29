import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { PDFDocument } from "pdf-lib";
import { createReviewJobs, GROUP_TITLES } from "./review-output-fixtures.mjs";
import { runRouteOutput } from "./run-route-pdf.mjs";

const DEFAULT_RENDER_SCALE = 2.0;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const toPosixRelative = (basePath, targetPath) => path.relative(basePath, targetPath).replace(/\\/g, "/");

const pad = (value) => String(value).padStart(2, "0");

const createTimestamp = (date = new Date()) => (
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
);

const parseArgs = (argv) => {
  const args = {
    outDir: path.join(process.cwd(), "tmp", "output-review", createTimestamp()),
    renderScale: DEFAULT_RENDER_SCALE,
    skipRender: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out-dir") {
      args.outDir = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--render-scale") {
      args.renderScale = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--skip-render") {
      args.skipRender = true;
    }
  }

  if (!Number.isFinite(args.renderScale) || args.renderScale <= 0) {
    throw new Error(`Invalid --render-scale: ${args.renderScale}`);
  }

  return args;
};

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
};

const countPdfPages = async (pdfPath) => {
  const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
  return pdfDoc.getPageCount();
};

const renderPdfPages = (pdfPath, pngDir, renderScale) => {
  ensureDir(pngDir);
  const result = spawnSync(
    "python",
    ["scripts/render-pdf-pages.py", pdfPath, pngDir, String(renderScale)],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`PNG rendering failed for ${path.basename(pdfPath)}${details ? `\n${details}` : ""}`);
  }

  return fs.readdirSync(pngDir).filter((name) => name.toLowerCase().endsWith(".png")).length;
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
  const options = parseArgs(process.argv.slice(2));
  const outDir = options.outDir;
  const pdfDir = ensureDir(path.join(outDir, "pdf"));
  const docxDir = ensureDir(path.join(outDir, "docx"));
  const payloadDir = ensureDir(path.join(outDir, "payloads"));
  const pngDir = ensureDir(path.join(outDir, "png"));
  const jobs = createReviewJobs();
  const manifest = [];
  let failureCount = 0;

  for (const job of jobs) {
    const payload = job.buildPayload();
    const payloadPath = path.join(payloadDir, job.kind ?? job.group, `${job.key}.json`);
    const outputBaseDir = ensureDir(path.join(job.format === "pdf" ? pdfDir : docxDir, job.group));
    const outputPath = path.join(outputBaseDir, `${job.key}.${job.format}`);
    const entry = {
      key: job.key,
      title: job.title,
      kind: job.group,
      format: job.format,
      routePath: job.routePath,
      outputPath: toPosixRelative(outDir, outputPath),
      payloadPath: toPosixRelative(outDir, payloadPath),
      status: null,
      bytes: 0,
      pages: null,
      renderedPngs: null,
      pngPaths: [],
      errors: [],
    };

    ensureDir(path.dirname(payloadPath));
    fs.writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    const payloadErrors = job.validatePayload(payload);
    if (payloadErrors.length > 0) {
      entry.errors.push(...payloadErrors);
      failureCount += 1;
      manifest.push(entry);
      continue;
    }

    try {
      const result = await runRouteOutput({
        routePath: job.routePath,
        payload,
        outPath: outputPath,
      });

      entry.status = result.status;
      entry.bytes = result.bytes;

      if (job.format === "pdf") {
        entry.pages = await countPdfPages(outputPath);
        if (!options.skipRender) {
          const pagePngDir = path.join(pngDir, job.group, job.key);
          entry.renderedPngs = renderPdfPages(outputPath, pagePngDir, options.renderScale);
          entry.pngPaths = fs
            .readdirSync(pagePngDir)
            .filter((name) => name.toLowerCase().endsWith(".png"))
            .sort()
            .map((name) => toPosixRelative(outDir, path.join(pagePngDir, name)));

          if (entry.renderedPngs !== entry.pages) {
            entry.errors.push(`PNG count mismatch: pages=${entry.pages}, png=${entry.renderedPngs}`);
          }
        }
      }
    } catch (error) {
      entry.status = error.status ?? null;
      entry.errors.push(error.message);
    }

    if (entry.errors.length > 0 || entry.status !== 200 || entry.bytes <= 0) {
      failureCount += 1;
    }

    manifest.push(entry);
  }

  const manifestPath = path.join(outDir, "manifest.json");
  const indexPath = path.join(outDir, "index.html");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(indexPath, buildIndexHtml(manifest), "utf8");

  const pdfCount = manifest.filter((entry) => entry.format === "pdf").length;
  const docxCount = manifest.filter((entry) => entry.format === "docx").length;
  console.log(`Output dir: ${outDir}`);
  console.log(`Generated entries: ${manifest.length} (pdf=${pdfCount}, docx=${docxCount})`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Index: ${indexPath}`);

  if (failureCount > 0) {
    process.exitCode = 1;
  }
};

await main();
