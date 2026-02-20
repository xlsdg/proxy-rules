import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");
const LOON_DIR = path.join(DIST_DIR, "loon");
const EGERN_DIR = path.join(DIST_DIR, "egern");

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

function extractCidr(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return null;

  const parts = trimmed.split(",");
  if (parts.length >= 2) {
    const ruleType = parts[0].trim().toUpperCase();
    const value = parts[1].trim();
    if (ruleType === "IP-CIDR" && isIpv4Cidr(value)) return { cidr: value, version: 4 };
    if (ruleType === "IP-CIDR6" && isIpv6Cidr(value)) return { cidr: value, version: 6 };
    return null;
  }

  if (isIpv4Cidr(trimmed)) return { cidr: trimmed, version: 4 };
  if (isIpv6Cidr(trimmed)) return { cidr: trimmed, version: 6 };
  return null;
}

function formatEgernYaml(surgeLines) {
  const ipv4 = [];
  const ipv6 = [];
  for (const line of surgeLines) {
    const result = extractCidr(line);
    if (!result) continue;
    if (result.version === 4) ipv4.push(result.cidr);
    else ipv6.push(result.cidr);
  }

  let yaml = "no_resolve: true\n";
  if (ipv4.length) {
    yaml += "ip_cidr_set:\n";
    for (const cidr of ipv4) yaml += `  - ${cidr}\n`;
  }
  if (ipv6.length) {
    yaml += "ip_cidr6_set:\n";
    for (const cidr of ipv6) yaml += `  - ${cidr}\n`;
  }
  return yaml;
}

await Promise.all([
  mkdir(LOON_DIR, { recursive: true }),
  mkdir(EGERN_DIR, { recursive: true }),
]);

await Promise.all(
  RULE_SOURCES.map(async ({ name, url }) => {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to fetch ${url}: ${response.status}`);

    const text = await response.text();
    const lines = text.split(/\r?\n/).map(ensureNoResolve);
    const loonContent = lines.join("\n").trimEnd() + "\n";
    const egernContent = formatEgernYaml(lines);

    await Promise.all([
      writeFile(path.join(LOON_DIR, `${name}.txt`), loonContent, "utf8"),
      writeFile(path.join(EGERN_DIR, `${name}.yaml`), egernContent, "utf8"),
    ]);
  }),
);
