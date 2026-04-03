#!/usr/bin/env node
/**
 * build.js — compiles src/trainer-dashboard.jsx → index.html
 * Run: node scripts/build.js
 * Requires: npm install sucrase (one-time)
 */

const fs = require("fs");
const path = require("path");
const { transform } = require("sucrase");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "trainer-dashboard.jsx");
const OUT = path.join(ROOT, "index.html");
const REACT = fs.readFileSync(path.join(__dirname, "react.min.js"), "utf8");
const REACT_DOM = fs.readFileSync(path.join(__dirname, "react-dom.min.js"), "utf8");
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

console.log("Building...");

const inlineLocalImports = (sourceCode, sourceFile) => {
  let code = sourceCode;
  const dir = path.dirname(sourceFile);
  let inlined = "";
  const importRe = /^import\s+\{[^}]+\}\s+from\s+['"](.+?)['"];?\n/gm;
  let match;
  while ((match = importRe.exec(sourceCode)) !== null) {
    const importPath = match[1];
    if (!importPath.startsWith(".")) continue;
    const full = path.resolve(dir, importPath);
    const raw = fs.readFileSync(full, "utf8");
    const nested = inlineLocalImports(raw, full);
    const normalized = nested
      .replace(/^export\s+const\s+/gm, "const ")
      .replace(/^export\s+function\s+/gm, "function ")
      .replace(/^export\s+\{[^}]+\};?\n/gm, "");
    inlined += `\n// inlined: ${path.relative(ROOT, full)}\n${normalized}\n`;
  }
  code = code.replace(importRe, (line, p1) => (p1.startsWith(".") ? "" : line));
  return inlined + code;
};

let jsx = inlineLocalImports(fs.readFileSync(SRC, "utf8"), SRC);

// Remove React import — we use the inlined global
jsx = jsx.replace(/^import \{[^}]+\} from ['"]react['"];?\n/m, "");

const { code } = transform(jsx, {
  transforms: ["jsx"],
  jsxRuntime: "classic",
  production: true,
});

const js = code.replace(
  "export default function TrainerDashboard",
  "function TrainerDashboard"
);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Personal Trainer</title>
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Trainer" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#0a0a0f" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body { height: 100%; background: #0a0a0f; }
    #root { min-height: 100%; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
  </style>
  <script>${REACT}</script>
  <script>${REACT_DOM}</script>
</head>
<body>
  <div id="root">
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0f;color:#334155;font-family:monospace;font-size:0.7rem;letter-spacing:0.2em">LOADING...</div>
  </div>
  <script>
window.__SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
window.__SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};
const { useState, useEffect, useRef, useMemo } = React;

${js}

    try {
      const _c = document.getElementById('root');
      const _r = ReactDOM.createRoot(_c);
      _r.render(React.createElement(TrainerDashboard, null));
    } catch(e) {
      document.getElementById('root').innerHTML =
        '<div style="padding:2rem;font-family:monospace;color:#f87171;font-size:0.7rem;background:#0a0a0f;min-height:100vh">' +
        '<div style="margin-bottom:1rem;color:#e2e8f0">BUILD ERROR — screenshot and send to Claude:</div>' +
        e.toString() + '<br/><br/>' + (e.stack||'').substring(0,500) + '</div>';
    }
  </script>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log(`✓ Built index.html — ${(html.length / 1024).toFixed(1)} KB`);
