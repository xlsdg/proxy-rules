import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");

const RULE_SOURCES = [
  {
    name: "tgcidr",
    url: "https://raw.githubusercontent.com/Loyalsoldier/surge-rules/release/telegramcidr.txt",
  },
  {
    name: "cncidr",
    url: "https://raw.githubusercontent.com/Loyalsoldier/surge-rules/release/cncidr.txt",
  },
];

const NO_RESOLVE_RULE_TYPES = new Set([
  "IP-CIDR",
  "IP-CIDR6",
  "IP-ASN",
  "GEOIP",
]);

function isIpv4Cidr(input) {
  const match = input.match(/^((?:\d{1,3}\.){3}\d{1,3})\/(\d{1,2})$/);
  if (!match) return false;

  const [, ip, prefix] = match;
  if (Number(prefix) > 32) return false;

  return ip.split(".").every((s) => {
    const n = Number(s);
    return n >= 0 && n <= 255;
  });
}

function isIpv6Cidr(input) {
  const match = input.match(/^[0-9a-fA-F:]+\/(\d{1,3})$/);
  if (!match) return false;
  return Number(match[1]) <= 128;
}

function ensureNoResolve(rawLine) {
  const line = rawLine.trim();
  if (
    !line ||
    line.startsWith("#") ||
    line.startsWith("//") ||
    /\bno-resolve\b/i.test(line)
  ) {
    return line;
  }

  const parts = line.split(",");
  if (parts.length >= 2) {
    const ruleType = parts[0].trim().toUpperCase();
    if (NO_RESOLVE_RULE_TYPES.has(ruleType)) return `${line},no-resolve`;
    return line;
  }

  if (isIpv4Cidr(line)) return `IP-CIDR,${line},no-resolve`;
  if (isIpv6Cidr(line)) return `IP-CIDR6,${line},no-resolve`;

  return line;
}

await mkdir(DIST_DIR, { recursive: true });

await Promise.all(
  RULE_SOURCES.map(async ({ name, url }) => {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to fetch ${url}: ${response.status}`);

    const text = await response.text();
    const lines = text.split(/\r?\n/).map(ensureNoResolve);
    const content = lines.join("\n").trimEnd() + "\n";

    const outputPath = path.join(DIST_DIR, `${name}.txt`);
    await writeFile(outputPath, content, "utf8");
  }),
);
