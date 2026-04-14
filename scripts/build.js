#!/usr/bin/env node
/**
 * build.js - bundles src/trainer-dashboard.jsx into index.html
 * Run: node scripts/build.js
 * Requires: npm install sucrase
 */

const fs = require("fs");
const path = require("path");
const { transform } = require("sucrase");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "trainer-dashboard.jsx");
const OUT = path.join(ROOT, "index.html");
const REACT = fs.readFileSync(path.join(__dirname, "react.min.js"), "utf8");
const REACT_DOM = fs.readFileSync(path.join(__dirname, "react-dom.min.js"), "utf8");
const SUPABASE_UMD = fs.readFileSync(
  path.join(ROOT, "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js"),
  "utf8"
);
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";
// Support both single-line and multiline ES import declarations when walking local deps.
const LOCAL_IMPORT_RE = /import\s+[\s\S]*?\s+from\s+['"](.+?)['"];?/gm;

console.log("Building...");

const toModuleId = (filePath) => path.relative(ROOT, filePath).replace(/\\/g, "/");

const resolveLocalModule = (fromFile, request) => {
  const candidate = path.resolve(path.dirname(fromFile), request);
  const attempts = [candidate, `${candidate}.js`, `${candidate}.jsx`];
  for (const fullPath of attempts) {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) return fullPath;
  }
  throw new Error(`Unable to resolve local module '${request}' from ${path.relative(ROOT, fromFile)}`);
};

const getLocalImportRequests = (source = "") => (
  Array.from(source.matchAll(LOCAL_IMPORT_RE))
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

const moduleFiles = collectModuleGraph(SRC);
const moduleEntries = moduleFiles.map((filePath) => {
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

const bundleModules = moduleEntries.map(({ id, code }) => (
  `  ${JSON.stringify(id)}: function(require, module, exports) {\n${code}\n  }`
)).join(",\n");

const entryId = toModuleId(SRC);

const html = `<!DOCTYPE html>
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
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body { height: 100%; background: #0a0a0f; }
    #root { min-height: 100%; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
  </style>
  <script>${REACT}</script>
  <script>${REACT_DOM}</script>
  <script>${SUPABASE_UMD}</script>
</head>
<body>
  <div id="root">
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0f;color:#334155;font-family:monospace;font-size:0.7rem;letter-spacing:0.2em">LOADING...</div>
  </div>
  <script>
window.__SUPABASE_URL = window.__SUPABASE_URL || ${JSON.stringify(SUPABASE_URL)};
window.__SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY || ${JSON.stringify(SUPABASE_ANON_KEY)};

const __externals = {
  react: React,
  "react-dom": ReactDOM,
};

const __modules = {
${bundleModules}
};

const __cache = {};

const __resolveModuleId = (fromId, request) => {
  if (__externals[request]) return request;
  if (!request.startsWith(".")) return request;
  const parts = fromId.split("/");
  parts.pop();
  for (const token of request.split("/")) {
    if (!token || token === ".") continue;
    if (token === "..") parts.pop();
    else parts.push(token);
  }
  return parts.join("/");
};

const __requireModule = (id) => {
  if (__externals[id]) return __externals[id];
  if (__cache[id]) return __cache[id].exports;
  const factory = __modules[id];
  if (!factory) throw new Error("Unknown module: " + id);
  const module = { exports: {} };
  __cache[id] = module;
  const localRequire = (request) => __requireModule(__resolveModuleId(id, request));
  factory(localRequire, module, module.exports);
  return module.exports;
};

try {
  const TrainerDashboard = __requireModule(${JSON.stringify(entryId)}).default;
  const rootNode = document.getElementById("root");
  const root = ReactDOM.createRoot(rootNode);
  root.render(React.createElement(TrainerDashboard, null));
} catch (e) {
  document.getElementById("root").innerHTML =
    '<div style="padding:2rem;font-family:monospace;color:#f87171;font-size:0.7rem;background:#0a0a0f;min-height:100vh">' +
    '<div style="margin-bottom:1rem;color:#e2e8f0">BUILD ERROR - screenshot and send to Claude:</div>' +
    e.toString() + '<br/><br/>' + (e.stack || '').substring(0, 1200) + '</div>';
}
  </script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log(`Built index.html - ${(html.length / 1024).toFixed(1)} KB`);
