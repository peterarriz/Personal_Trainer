#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const args = process.argv.slice(2);
const configFlagIndex = args.findIndex((arg) => arg === "--config");
const configPath = configFlagIndex >= 0 ? args[configFlagIndex + 1] : "bundlesize.config.js";
const resolvedConfigPath = path.resolve(process.cwd(), configPath || "bundlesize.config.js");

if (!fs.existsSync(resolvedConfigPath)) {
  console.error(`bundlesize: config not found at ${resolvedConfigPath}`);
  process.exit(1);
}

const config = require(resolvedConfigPath);
const files = Array.isArray(config?.files) ? config.files : [];

const parseSize = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  const match = raw.match(/^([\d.]+)\s*(b|kb|mb)$/);
  if (!match) throw new Error(`Unsupported size format: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "mb") return Math.round(amount * 1024 * 1024);
  if (unit === "kb") return Math.round(amount * 1024);
  return Math.round(amount);
};

let hasFailure = false;
for (const item of files) {
  const filePath = path.resolve(process.cwd(), item.path);
  if (!fs.existsSync(filePath)) {
    console.error(`bundlesize: missing file ${item.path}`);
    hasFailure = true;
    continue;
  }
  const maxSize = parseSize(item.maxSize || "0b");
  const gzipSize = zlib.gzipSync(fs.readFileSync(filePath)).length;
  const status = gzipSize <= maxSize ? "PASS" : "FAIL";
  console.log(`bundlesize ${status}: ${item.path} gzip ${(gzipSize / 1024).toFixed(1)} KB / ${(maxSize / 1024).toFixed(1)} KB`);
  if (gzipSize > maxSize) hasFailure = true;
}

if (hasFailure) process.exit(1);
