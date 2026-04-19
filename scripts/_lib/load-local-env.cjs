const fs = require("fs");
const path = require("path");

function parseEnvFile(content = "") {
  return String(content || "")
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.startsWith("#")) return acc;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) return acc;
      const [, key, rawValue] = match;
      let value = rawValue || "";
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      value = value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r");
      acc[key] = value;
      return acc;
    }, {});
}

function loadLocalEnv({
  cwd = process.cwd(),
  filenames = [".env.local", ".env"],
} = {}) {
  const loaded = [];
  for (const filename of filenames) {
    const filePath = path.resolve(cwd, filename);
    if (!fs.existsSync(filePath)) continue;
    const parsed = parseEnvFile(fs.readFileSync(filePath, "utf8"));
    Object.entries(parsed).forEach(([key, value]) => {
      if (process.env[key] === undefined || String(process.env[key]).trim() === "") {
        process.env[key] = value;
      }
    });
    loaded.push(filePath);
  }
  return loaded;
}

module.exports = {
  loadLocalEnv,
  parseEnvFile,
};
