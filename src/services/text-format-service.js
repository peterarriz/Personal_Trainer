const MOJIBAKE_PATTERN = /(?:Ã.|Â|â€|â€™|â€œ|â€¢|â€“|â€”|â€¦|�)/;
const COMMON_MOJIBAKE_REPLACEMENTS = [
  ["Ã‚Â·", "·"],
  ["Ã¢â‚¬Â¢", "•"],
  ["Ã¢â‚¬â€", "—"],
  ["Ã¢â‚¬â€œ", "–"],
  ["Ã¢â‚¬Â¦", "…"],
  ["Ã¢â‚¬â„¢", "’"],
  ["Ã¢â‚¬Å“", "“"],
  ["Ã¢â‚¬Â", "”"],
  ["Ã¢â€ â€™", "→"],
  ["Ã¢â€ â€˜", "↑"],
  ["Ã¢â€ â€œ", "↓"],
  ["Ãƒâ€”", "×"],
  ["Ã‚Â°", "°"],
  ["Â·", "·"],
  ["Â", ""],
];

const suspiciousScore = (value = "") => {
  const matches = String(value || "").match(/(?:Ã.|Â|â.|�)/g);
  return matches ? matches.length : 0;
};

const decodeLatin1AsUtf8 = (value = "") => {
  const input = String(value || "");
  const bytes = Uint8Array.from(Array.from(input).map((char) => char.charCodeAt(0) & 0xff));
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  const percentEncoded = Array.from(bytes).map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join("");
  try {
    return decodeURIComponent(percentEncoded);
  } catch {
    return input;
  }
};

export const repairMojibakeText = (value = "") => {
  let current = String(value || "");
  if (!current || !MOJIBAKE_PATTERN.test(current)) return current;

  for (const [broken, fixed] of COMMON_MOJIBAKE_REPLACEMENTS) {
    current = current.replaceAll(broken, fixed);
  }

  if (!MOJIBAKE_PATTERN.test(current)) return current;

  for (let i = 0; i < 2; i += 1) {
    const decoded = decodeLatin1AsUtf8(current);
    if (!decoded || decoded === current) break;
    if (suspiciousScore(decoded) > suspiciousScore(current)) break;
    current = decoded;
    if (!MOJIBAKE_PATTERN.test(current)) break;
  }

  for (const [broken, fixed] of COMMON_MOJIBAKE_REPLACEMENTS) {
    current = current.replaceAll(broken, fixed);
  }

  return current;
};

export const DISPLAY_SEPARATORS = {
  middot: " · ",
  bullet: " • ",
  emDash: " — ",
};

export const joinDisplayParts = (parts = [], separator = DISPLAY_SEPARATORS.middot) => (
  repairMojibakeText((parts || []).filter(Boolean).join(separator))
);

export const sanitizeDisplayCopy = (value = "") => repairMojibakeText(String(value || ""));
