#!/usr/bin/env node
/**
 * build.js
 * Default mode: split cacheable asset build for FORMA.
 * Baseline mode: legacy inline single-file bundle.
 *
 * Usage:
 *   node scripts/build.js
 *   node scripts/build.js --mode=split
 *   node scripts/build.js --mode=inline
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("node:child_process");
const { transform } = require("sucrase");
const { minify } = require("terser");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "trainer-dashboard.jsx");
const DIST = path.join(ROOT, "dist");
const ASSETS_DIR = path.join(DIST, "assets");
const OUT = path.join(DIST, "index.html");
const BUILD_META_OUT = path.join(DIST, "build-meta.json");
const SW_TEMPLATE = path.join(ROOT, "service-worker.js");

const REACT = fs.readFileSync(path.join(__dirname, "react.min.js"), "utf8");
const REACT_DOM = fs.readFileSync(path.join(__dirname, "react-dom.min.js"), "utf8");
const SUPABASE_UMD = fs.readFileSync(
  path.join(ROOT, "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js"),
  "utf8"
);

const resolveEnvCandidate = (...names) => {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (!value) continue;
    return {
      value,
      source: name,
    };
  }
  return {
    value: "",
    source: "",
  };
};

const CLIENT_SUPABASE_URL_CONFIG = resolveEnvCandidate("VITE_SUPABASE_URL", "SUPABASE_URL");
const CLIENT_SUPABASE_ANON_KEY_CONFIG = resolveEnvCandidate("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
const SUPABASE_URL = CLIENT_SUPABASE_URL_CONFIG.value;
const SUPABASE_ANON_KEY = CLIENT_SUPABASE_ANON_KEY_CONFIG.value;
const SUPABASE_URL_HOST = (() => {
  try {
    return SUPABASE_URL ? new URL(SUPABASE_URL).host : "";
  } catch {
    return "";
  }
})();

const LOCAL_IMPORT_FROM_RE = /(?:import|export)\s+[\s\S]*?\s+from\s+['"](.+?)['"];?/gm;
const LOCAL_IMPORT_SIDE_EFFECT_RE = /import\s+['"](.+?)['"];?/gm;
const STATIC_COPY_ENTRIES = [
  "manifest.json",
  "fonts",
  "icons",
  "splash",
];
const LAZY_CHUNK_SPECS = [
  {
    name: "secondary.tabs",
    baseName: "secondary.tabs",
    entryFile: path.join(ROOT, "src", "domains", "secondary-tabs", "lazy-secondary-tabs-entry.js"),
  },
];
const BUILD_MODES = Object.freeze({
  split: "split",
  inline: "inline",
});

const rawModeArg = process.argv.slice(2).find((arg) => arg.startsWith("--mode="));
const requestedMode = String(
  rawModeArg ? rawModeArg.split("=")[1] : process.env.FORMA_BUILD_MODE || BUILD_MODES.split
).trim().toLowerCase();
const BUILD_MODE = Object.values(BUILD_MODES).includes(requestedMode) ? requestedMode : BUILD_MODES.split;

const formatKb = (value) => `${(value / 1024).toFixed(1)} KB`;
const hashContent = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
const escapeScriptTag = (value) => String(value || "").replace(/<\/script>/gi, "<\\/script>");
const toModuleId = (filePath) => path.relative(ROOT, filePath).replace(/\\/g, "/");

const minifyScript = async (source = "") => {
  const result = await minify(source, {
    compress: {
      passes: 2,
      ecma: 2020,
    },
    mangle: {
      toplevel: true,
    },
    format: {
      comments: false,
    },
    ecma: 2020,
    toplevel: true,
  });
  if (!result?.code) {
    throw new Error("Terser did not return minified output.");
  }
  return result.code;
};

const ensureCleanDist = () => {
  fs.rmSync(DIST, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 150,
  });
  fs.mkdirSync(DIST, { recursive: true });
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
};

const copyRecursive = (fromPath, toPath) => {
  const stats = fs.statSync(fromPath);
  if (stats.isDirectory()) {
    fs.mkdirSync(toPath, { recursive: true });
    for (const entry of fs.readdirSync(fromPath)) {
      copyRecursive(path.join(fromPath, entry), path.join(toPath, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.copyFileSync(fromPath, toPath);
};

const resolveLocalModule = (fromFile, request) => {
  const candidate = path.resolve(path.dirname(fromFile), request);
  const attempts = [candidate, `${candidate}.js`, `${candidate}.jsx`];
  for (const fullPath of attempts) {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) return fullPath;
  }
  throw new Error(`Unable to resolve local module '${request}' from ${path.relative(ROOT, fromFile)}`);
};

const getLocalImportRequests = (source = "") => (
  [
    ...Array.from(source.matchAll(LOCAL_IMPORT_FROM_RE)),
    ...Array.from(source.matchAll(LOCAL_IMPORT_SIDE_EFFECT_RE)),
  ]
    .map((match) => match[1])
    .filter((request) => request && request.startsWith("."))
);

const collectModuleGraph = (entryFile) => {
  const ordered = [];
  const seen = new Set();

  const visit = (filePath) => {
    const normalized = path.resolve(filePath);
    if (seen.has(normalized)) return;
    seen.add(normalized);

    const source = fs.readFileSync(normalized, "utf8");
    const localRequests = getLocalImportRequests(source);
    for (const request of localRequests) {
      visit(resolveLocalModule(normalized, request));
    }

    ordered.push(normalized);
  };

  visit(entryFile);
  return ordered;
};

const buildModuleEntries = (entryFile) => {
  const moduleFiles = collectModuleGraph(entryFile);
  return moduleFiles.map((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    const { code } = transform(source, {
      transforms: ["jsx", "imports"],
      jsxRuntime: "classic",
      production: true,
    });
    return {
      id: toModuleId(filePath),
      code,
    };
  });
};

const buildAppRuntime = ({ moduleEntries, entryId, buildMode, lazyChunkManifest = {} }) => {
  const bundleModules = moduleEntries.map(({ id, code }) => (
    `  ${JSON.stringify(id)}: function(require, module, exports) {\n${code}\n  }`
  )).join(",\n");

  return [
    "(function () {",
    "  window.__FORMA_BOOT_METRICS__ = window.__FORMA_BOOT_METRICS__ || {};",
    `  window.__FORMA_BOOT_METRICS__.buildMode = ${JSON.stringify(buildMode)};`,
    "  window.__FORMA_BOOT_METRICS__.bundleEvaluatedAt = Math.round(performance.now());",
    "  window.__FORMA_CLIENT_CONFIG__ = window.__FORMA_CLIENT_CONFIG__ || {};",
    `  window.__FORMA_CLIENT_CONFIG__.supabaseUrlConfigured = ${JSON.stringify(Boolean(SUPABASE_URL))};`,
    `  window.__FORMA_CLIENT_CONFIG__.supabaseAnonKeyConfigured = ${JSON.stringify(Boolean(SUPABASE_ANON_KEY))};`,
    `  window.__FORMA_CLIENT_CONFIG__.supabaseUrlSource = ${JSON.stringify(CLIENT_SUPABASE_URL_CONFIG.source || "")};`,
    `  window.__FORMA_CLIENT_CONFIG__.supabaseAnonKeySource = ${JSON.stringify(CLIENT_SUPABASE_ANON_KEY_CONFIG.source || "")};`,
    `  window.__FORMA_CLIENT_CONFIG__.supabaseUrlHost = ${JSON.stringify(SUPABASE_URL_HOST)};`,
    `  window.__SUPABASE_URL = window.__SUPABASE_URL || ${JSON.stringify(SUPABASE_URL)};`,
    `  window.__SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY || ${JSON.stringify(SUPABASE_ANON_KEY)};`,
    "",
    "  const __externals = {",
    "    react: React,",
    '    "react-dom": ReactDOM,',
    "  };",
    "",
    "  const __eagerModules = {",
    bundleModules,
    "  };",
    "",
    `  const __lazyChunkManifest = Object.assign(window.__FORMA_LAZY_CHUNK_MANIFEST__ || {}, ${JSON.stringify(lazyChunkManifest)});`,
    "  window.__FORMA_LAZY_CHUNK_MANIFEST__ = __lazyChunkManifest;",
    "  const __modules = window.__FORMA_MODULES__ = window.__FORMA_MODULES__ || {};",
    "  Object.keys(__eagerModules).forEach(function (id) {",
    "    __modules[id] = __eagerModules[id];",
    "  });",
    "  const __cache = window.__FORMA_MODULE_CACHE__ = window.__FORMA_MODULE_CACHE__ || {};",
    "  const __loadedChunks = window.__FORMA_LOADED_CHUNKS__ = window.__FORMA_LOADED_CHUNKS__ || {};",
    "  const __pendingChunks = window.__FORMA_PENDING_CHUNKS__ = window.__FORMA_PENDING_CHUNKS__ || {};",
    "",
    "  const __resolveModuleId = (fromId, request) => {",
    "    if (__externals[request]) return request;",
    "    if (!request.startsWith('.')) return request;",
    "    const parts = fromId.split('/');",
    "    parts.pop();",
    "    for (const token of request.split('/')) {",
    "      if (!token || token === '.') continue;",
    "      if (token === '..') parts.pop();",
    "      else parts.push(token);",
    "    }",
    "    return parts.join('/');",
    "  };",
    "",
    "  const __requireModule = (id) => {",
    "    if (__externals[id]) return __externals[id];",
    "    if (__cache[id]) return __cache[id].exports;",
    "    const factory = __modules[id];",
    "    if (!factory) throw new Error('Unknown module: ' + id);",
    "    const module = { exports: {} };",
    "    __cache[id] = module;",
    "    const localRequire = (request) => __requireModule(__resolveModuleId(id, request));",
    "    factory(localRequire, module, module.exports);",
    "    return module.exports;",
    "  };",
    "",
    "  window.__FORMA_REGISTER_CHUNK__ = window.__FORMA_REGISTER_CHUNK__ || function (chunkName, chunkModules) {",
    "    Object.keys(chunkModules || {}).forEach(function (id) {",
    "      if (!__modules[id]) __modules[id] = chunkModules[id];",
    "    });",
    "    __loadedChunks[chunkName] = true;",
    "    if (__pendingChunks[chunkName]) {",
    "      __pendingChunks[chunkName].resolve();",
    "      delete __pendingChunks[chunkName];",
    "    }",
    "  };",
    "",
    "  window.__FORMA_LOAD_CHUNK__ = window.__FORMA_LOAD_CHUNK__ || function (chunkName) {",
    "    if (!chunkName || __loadedChunks[chunkName]) return Promise.resolve();",
    "    if (__pendingChunks[chunkName]) return __pendingChunks[chunkName].promise;",
    "    const publicPath = __lazyChunkManifest[chunkName];",
    "    if (!publicPath) {",
    "      __loadedChunks[chunkName] = true;",
    "      return Promise.resolve();",
    "    }",
    "    let resolvePromise = function () {};",
    "    let rejectPromise = function () {};",
    "    const promise = new Promise(function (resolve, reject) {",
    "      resolvePromise = resolve;",
    "      rejectPromise = reject;",
    "    });",
    "    __pendingChunks[chunkName] = {",
    "      promise: promise,",
    "      resolve: function () { resolvePromise(); },",
    "      reject: function (error) { rejectPromise(error); },",
    "    };",
    "    const script = document.createElement('script');",
    "    script.defer = true;",
    "    script.src = publicPath;",
    "    script.onload = function () {",
    "      setTimeout(function () {",
    "        if (__loadedChunks[chunkName]) return;",
    "        if (__pendingChunks[chunkName]) {",
    "          __pendingChunks[chunkName].reject(new Error('Lazy chunk did not register: ' + chunkName));",
    "          delete __pendingChunks[chunkName];",
    "        }",
    "      }, 0);",
    "    };",
    "    script.onerror = function () {",
    "      if (__pendingChunks[chunkName]) {",
    "        __pendingChunks[chunkName].reject(new Error('Lazy chunk failed to load: ' + chunkName));",
    "        delete __pendingChunks[chunkName];",
    "      }",
    "    };",
    "    document.head.appendChild(script);",
    "    return promise;",
    "  };",
    "",
    "  window.__FORMA_LOAD_MODULE__ = window.__FORMA_LOAD_MODULE__ || function (input) {",
    "    const chunkName = typeof input === 'string' ? '' : input?.chunkName || '';",
    "    const moduleId = typeof input === 'string' ? input : input?.moduleId || '';",
    "    if (!moduleId) return Promise.reject(new Error('Missing module id for lazy load.'));",
    "    const ensureChunk = chunkName ? window.__FORMA_LOAD_CHUNK__(chunkName) : Promise.resolve();",
    "    return ensureChunk.then(function () {",
    "      return __requireModule(moduleId);",
    "    });",
    "  };",
    "",
    "  try {",
    `    const TrainerDashboard = __requireModule(${JSON.stringify(entryId)}).default;`,
    "    const rootNode = document.getElementById('root');",
    "    const root = ReactDOM.createRoot(rootNode);",
    "    root.render(React.createElement(TrainerDashboard, null));",
    "    window.__FORMA_BOOT_METRICS__.rootRenderCalledAt = Math.round(performance.now());",
    "  } catch (e) {",
    "    document.getElementById('root').innerHTML =",
    "      '<div style=\"padding:2rem;font-family:monospace;color:#f87171;font-size:0.7rem;background:#0a0a0f;min-height:100vh\">' +",
    "      '<div style=\"margin-bottom:1rem;color:#e2e8f0\">BUILD ERROR - screenshot and send to Claude:</div>' +",
    "      e.toString() + '<br/><br/>' + (e.stack || '').substring(0, 1200) + '</div>';",
    "  }",
    "}());",
  ].join("\n");
};

const buildChunkRuntime = ({ moduleEntries, chunkName }) => {
  const bundleModules = moduleEntries.map(({ id, code }) => (
    `  ${JSON.stringify(id)}: function(require, module, exports) {\n${code}\n  }`
  )).join(",\n");

  return [
    "(function () {",
    "  if (!window.__FORMA_REGISTER_CHUNK__) {",
    "    throw new Error('FORMA lazy chunk runtime is not ready.');",
    "  }",
    `  window.__FORMA_REGISTER_CHUNK__(${JSON.stringify(chunkName)}, {`,
    bundleModules,
    "  });",
    "}());",
  ].join("\n");
};

const buildShellStyle = () => `
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body { height: 100%; background: #0a0a0f; }
    #root { min-height: 100%; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
`;

const buildBootConfigScript = ({ buildMode, buildVersion }) => `
window.__FORMA_BOOT_METRICS__ = window.__FORMA_BOOT_METRICS__ || {
  htmlParsedAt: Math.round(performance.now()),
  buildMode: ${JSON.stringify(buildMode)},
  buildVersion: ${JSON.stringify(buildVersion)}
};
window.__FORMA_BOOT_METRICS__.htmlParsedAt = Math.round(performance.now());
window.__FORMA_BOOT_METRICS__.buildMode = ${JSON.stringify(buildMode)};
window.__FORMA_BOOT_METRICS__.buildVersion = ${JSON.stringify(buildVersion)};
window.__FORMA_CLIENT_CONFIG__ = window.__FORMA_CLIENT_CONFIG__ || {
  supabaseUrlConfigured: ${JSON.stringify(Boolean(SUPABASE_URL))},
  supabaseAnonKeyConfigured: ${JSON.stringify(Boolean(SUPABASE_ANON_KEY))},
  supabaseUrlSource: ${JSON.stringify(CLIENT_SUPABASE_URL_CONFIG.source || "")},
  supabaseAnonKeySource: ${JSON.stringify(CLIENT_SUPABASE_ANON_KEY_CONFIG.source || "")},
  supabaseUrlHost: ${JSON.stringify(SUPABASE_URL_HOST)}
};
window.__SUPABASE_URL = window.__SUPABASE_URL || ${JSON.stringify(SUPABASE_URL)};
window.__SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY || ${JSON.stringify(SUPABASE_ANON_KEY)};
`;

const buildServiceWorkerRegistrationScript = () => `
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./service-worker.js").catch(function () {});
  });
}
`;

const buildBaseHtml = ({ bodyScripts = "", extraHead = "", buildMode, buildVersion }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FORMA</title>
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="FORMA" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#0a0a0f" />
  <style>${buildShellStyle()}</style>
  <script>${escapeScriptTag(buildBootConfigScript({ buildMode, buildVersion }))}</script>
  ${extraHead}
</head>
<body>
  <div id="root">
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0f;color:#334155;font-family:monospace;font-size:0.7rem;letter-spacing:0.2em">LOADING...</div>
  </div>
  ${bodyScripts}
</body>
</html>`;

const writeStaticAssets = () => {
  for (const entry of STATIC_COPY_ENTRIES) {
    const sourcePath = path.join(ROOT, entry);
    if (!fs.existsSync(sourcePath)) continue;
    copyRecursive(sourcePath, path.join(DIST, entry));
  }
};

const writeGeneratedServiceWorker = ({ buildVersion, precachePaths }) => {
  const template = fs.readFileSync(SW_TEMPLATE, "utf8");
  const output = template
    .replace(/__FORMA_STATIC_CACHE__/g, JSON.stringify(`forma-static-${buildVersion}`))
    .replace(/__FORMA_RUNTIME_CACHE__/g, JSON.stringify(`forma-runtime-${buildVersion}`))
    .replace(/__FORMA_APP_SHELL__/g, JSON.stringify(precachePaths, null, 2))
    .replace(/__FORMA_STATIC_ASSET_PREFIXES__/g, JSON.stringify(["/assets/", "/icons/", "/splash/", "/fonts/"], null, 2));
  fs.writeFileSync(path.join(DIST, "service-worker.js"), output);
};

const getFileBytes = (filePath) => fs.statSync(filePath).size;

const buildInlineOutput = ({ appRuntime, buildVersion, lazyAssets = [] }) => {
  const html = buildBaseHtml({
    buildMode: BUILD_MODES.inline,
    buildVersion,
    bodyScripts: `
  <script>${escapeScriptTag(REACT)}</script>
  <script>${escapeScriptTag(REACT_DOM)}</script>
  <script>${escapeScriptTag(SUPABASE_UMD)}</script>
  <script>${escapeScriptTag(appRuntime)}</script>`,
  });

  fs.writeFileSync(OUT, html);

  const precachePaths = [
    "/",
    "/index.html",
    "/manifest.json",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/splash/apple-splash-1179x2556.png",
    "/splash/apple-splash-1170x2532.png",
  ];
  const lazyPrecachePaths = lazyAssets.map((asset) => asset.rootPublicPath);
  writeGeneratedServiceWorker({ buildVersion, precachePaths: [...precachePaths, ...lazyPrecachePaths] });

  return {
    mode: BUILD_MODES.inline,
    buildVersion,
    htmlBytes: Buffer.byteLength(html),
    appBytes: Buffer.byteLength(appRuntime),
    vendorBytes: Buffer.byteLength(REACT) + Buffer.byteLength(REACT_DOM) + Buffer.byteLength(SUPABASE_UMD),
    assetFiles: lazyAssets,
  };
};

const writeHashedAsset = (baseName, content) => {
  const hash = hashContent(content);
  const fileName = `${baseName}.${hash}.js`;
  const fullPath = path.join(ASSETS_DIR, fileName);
  fs.writeFileSync(fullPath, content);
  return {
    fileName,
    publicPath: `./assets/${fileName}`,
    rootPublicPath: `/assets/${fileName}`,
    bytes: Buffer.byteLength(content),
  };
};

const buildSplitOutput = ({ appRuntime, buildVersion, lazyAssets = [] }) => {
  const reactAsset = writeHashedAsset("react.vendor", REACT);
  const reactDomAsset = writeHashedAsset("react-dom.vendor", REACT_DOM);
  const supabaseAsset = writeHashedAsset("supabase.vendor", SUPABASE_UMD);
  const appAsset = writeHashedAsset("app.bundle", appRuntime);

  const bodyScripts = [
    `<script defer src="${reactAsset.publicPath}"></script>`,
    `<script defer src="${reactDomAsset.publicPath}"></script>`,
    `<script defer src="${supabaseAsset.publicPath}"></script>`,
    `<script defer src="${appAsset.publicPath}"></script>`,
    `<script>${escapeScriptTag(buildServiceWorkerRegistrationScript())}</script>`,
  ].join("\n  ");

  const html = buildBaseHtml({
    buildMode: BUILD_MODES.split,
    buildVersion,
    extraHead: [
      `<link rel="preload" href="${reactAsset.publicPath}" as="script" />`,
      `<link rel="preload" href="${reactDomAsset.publicPath}" as="script" />`,
      `<link rel="preload" href="${supabaseAsset.publicPath}" as="script" />`,
      `<link rel="preload" href="${appAsset.publicPath}" as="script" />`,
    ].join("\n  "),
    bodyScripts,
  });

  fs.writeFileSync(OUT, html);

  const precachePaths = [
    "/",
    "/index.html",
    "/manifest.json",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/splash/apple-splash-1179x2556.png",
    "/splash/apple-splash-1170x2532.png",
    reactAsset.rootPublicPath,
    reactDomAsset.rootPublicPath,
    supabaseAsset.rootPublicPath,
    appAsset.rootPublicPath,
  ];
  const lazyPrecachePaths = lazyAssets.map((asset) => asset.rootPublicPath);
  writeGeneratedServiceWorker({ buildVersion, precachePaths: [...precachePaths, ...lazyPrecachePaths] });

  return {
    mode: BUILD_MODES.split,
    buildVersion,
    htmlBytes: Buffer.byteLength(html),
    appBytes: appAsset.bytes,
    vendorBytes: reactAsset.bytes + reactDomAsset.bytes + supabaseAsset.bytes,
    assetFiles: [reactAsset, reactDomAsset, supabaseAsset, appAsset, ...lazyAssets],
  };
};

const writeBuildMeta = (meta) => {
  fs.writeFileSync(BUILD_META_OUT, JSON.stringify(meta, null, 2));
};

const runBuild = async () => {
  console.log(`Building FORMA (${BUILD_MODE})...`);
  console.log(
    `Client Supabase build config: url=${CLIENT_SUPABASE_URL_CONFIG.source || "missing"} ` +
    `host=${SUPABASE_URL_HOST || "missing"} anon=${CLIENT_SUPABASE_ANON_KEY_CONFIG.source || "missing"}`
  );
  execFileSync(process.execPath, [path.join(__dirname, "check-repo-hygiene.cjs")], { stdio: "inherit" });

  ensureCleanDist();
  writeStaticAssets();

  const lazyChunkAssets = [];
  const lazyChunkManifest = {};
  for (const spec of LAZY_CHUNK_SPECS) {
    if (!fs.existsSync(spec.entryFile)) continue;
    const chunkModuleEntries = buildModuleEntries(spec.entryFile);
    const rawChunkRuntime = buildChunkRuntime({
      moduleEntries: chunkModuleEntries,
      chunkName: spec.name,
    });
    const chunkRuntime = await minifyScript(rawChunkRuntime);
    const asset = writeHashedAsset(spec.baseName, chunkRuntime);
    lazyChunkAssets.push({
      ...asset,
      chunkName: spec.name,
    });
    lazyChunkManifest[spec.name] = asset.publicPath;
  }

  const moduleEntries = buildModuleEntries(SRC);
  const entryId = toModuleId(SRC);
  const sourceFingerprint = hashContent([
    REACT,
    REACT_DOM,
    SUPABASE_UMD,
    ...lazyChunkAssets.map((asset) => `${asset.chunkName}:${asset.fileName}`),
    ...moduleEntries.map((entry) => `${entry.id}:${entry.code}`),
  ].join("\n"));
  const rawAppRuntime = buildAppRuntime({
    moduleEntries,
    entryId,
    buildMode: BUILD_MODE,
    lazyChunkManifest,
  });
  const rawAppBytes = Buffer.byteLength(rawAppRuntime);
  const appRuntime = await minifyScript(rawAppRuntime);

  const summary = BUILD_MODE === BUILD_MODES.inline
    ? buildInlineOutput({ appRuntime, buildVersion: sourceFingerprint, lazyAssets: lazyChunkAssets })
    : buildSplitOutput({ appRuntime, buildVersion: sourceFingerprint, lazyAssets: lazyChunkAssets });

  const buildMeta = {
    mode: summary.mode,
    buildVersion: summary.buildVersion,
    builtAt: new Date().toISOString(),
    entryId,
    rawAppBytes,
    appBytes: summary.appBytes,
    htmlBytes: summary.htmlBytes,
    vendorBytes: summary.vendorBytes,
    minifier: "terser",
    totalDistBytes: getFileBytes(OUT)
      + summary.assetFiles.reduce((sum, asset) => sum + asset.bytes, 0),
    clientSupabaseConfig: {
      urlSource: CLIENT_SUPABASE_URL_CONFIG.source || "",
      anonKeySource: CLIENT_SUPABASE_ANON_KEY_CONFIG.source || "",
      urlConfigured: Boolean(SUPABASE_URL),
      anonKeyConfigured: Boolean(SUPABASE_ANON_KEY),
      urlHost: SUPABASE_URL_HOST,
    },
    assets: summary.assetFiles.map((asset) => ({
      fileName: asset.fileName,
      publicPath: asset.publicPath,
      bytes: asset.bytes,
      chunkName: asset.chunkName || "",
    })),
  };
  writeBuildMeta(buildMeta);

  const shrinkLine = `raw app ${formatKb(rawAppBytes)} -> ${formatKb(summary.appBytes)}`;
  if (summary.mode === BUILD_MODES.inline) {
    console.log(
      `Built legacy inline dist/index.html - ${formatKb(summary.htmlBytes)} ` +
      `(vendor ${formatKb(summary.vendorBytes)}, app ${formatKb(summary.appBytes)}, ${shrinkLine})`
    );
  } else {
    console.log(
      `Built cacheable split dist/index.html - ${formatKb(summary.htmlBytes)} ` +
      `(vendor ${formatKb(summary.vendorBytes)}, app ${formatKb(summary.appBytes)}, ${shrinkLine})`
    );
    for (const asset of summary.assetFiles) {
      console.log(`  asset ${asset.fileName} - ${formatKb(asset.bytes)}`);
    }
  }
};

runBuild().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
