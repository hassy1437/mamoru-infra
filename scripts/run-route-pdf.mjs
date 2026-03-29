import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import ts from "typescript";

const NEXT_SERVER_IMPORT_RE = /import\s+\{\s*NextRequest\s*,\s*NextResponse\s*\}\s+from\s+"next\/server"\s*;?/;
const SRC_ALIAS_IMPORT_RE = /from\s+"@\/([^"]+)"/g;

const NEXT_STUB = `
class NextResponse extends Response {
  static json(data, init = {}) {
    const headers = new Headers(init.headers || {});
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify(data), { ...init, headers });
  }
}
`;

export async function runRouteOutput({ routePath, payload, outPath }) {
  const resolvedOutPath = outPath;
  if (!resolvedOutPath) {
    throw new Error(`outPath is required for ${routePath}`);
  }

  const absRoutePath = path.resolve(routePath);
  const baseTmp = path.join(process.cwd(), "tmp", "route-pdf-mods");
  fs.mkdirSync(baseTmp, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(baseTmp, "route-pdf-"));

  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    skipLibCheck: true,
  };

  const transpiledModules = new Map();

  const transpileLocalModule = (absInputPath, injectNextStub = false) => {
    const normalizedInputPath = path.resolve(absInputPath);
    if (transpiledModules.has(normalizedInputPath)) {
      return transpiledModules.get(normalizedInputPath);
    }

    const relativeToSrc = path.relative(path.join(process.cwd(), "src"), normalizedInputPath);
    const relativeOutPath = relativeToSrc.startsWith("..")
      ? path.basename(normalizedInputPath)
      : relativeToSrc;
    const tmpModulePath = path
      .join(tmpDir, relativeOutPath)
      .replace(/\\/g, "/")
      .replace(/\.ts$/, ".mjs");

    fs.mkdirSync(path.dirname(tmpModulePath), { recursive: true });

    const rawSource = fs.readFileSync(normalizedInputPath, "utf8");
    const sourceWithResolvedAliases = rawSource.replace(SRC_ALIAS_IMPORT_RE, (_, specifier) => {
      const resolvedPath = path.join(
        process.cwd(),
        "src",
        specifier.endsWith(".ts") ? specifier : `${specifier}.ts`,
      );
      const tmpDependencyPath = transpileLocalModule(resolvedPath, false);
      return `from "${pathToFileURL(tmpDependencyPath).href}"`;
    });

    let patched = sourceWithResolvedAliases;
    if (injectNextStub) {
      patched = sourceWithResolvedAliases.replace(NEXT_SERVER_IMPORT_RE, NEXT_STUB);
      if (patched === sourceWithResolvedAliases) {
        patched = `${NEXT_STUB}\n${sourceWithResolvedAliases}`;
      }
    }

    const transpiled = ts.transpileModule(patched, {
      compilerOptions,
      fileName: normalizedInputPath,
    });

    fs.writeFileSync(tmpModulePath, transpiled.outputText, "utf8");
    transpiledModules.set(normalizedInputPath, tmpModulePath);
    return tmpModulePath;
  };

  const tmpModulePath = transpileLocalModule(absRoutePath, true);

  try {
    const mod = await import(pathToFileURL(tmpModulePath).href);
    if (typeof mod.POST !== "function") {
      throw new Error(`POST export not found in ${routePath}`);
    }

    const req = { json: async () => payload };
    const res = await mod.POST(req);
    if (!(res instanceof Response)) {
      throw new Error(`POST did not return a Response for ${routePath}`);
    }

    if (!res.ok) {
      const text = await res.text();
      const error = new Error(`Route failed ${res.status}: ${text}`);
      error.status = res.status;
      error.responseBody = text;
      error.headers = Object.fromEntries(res.headers.entries());
      throw error;
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(resolvedOutPath), { recursive: true });
    fs.writeFileSync(resolvedOutPath, bytes);
    return {
      outPath: resolvedOutPath,
      bytes: bytes.length,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // no-op
    }
  }
}

export async function runRoutePdf({ routePath, payload, outPdfPath }) {
  const result = await runRouteOutput({ routePath, payload, outPath: outPdfPath });
  return { ...result, outPdfPath: result.outPath };
}

export default runRoutePdf;
