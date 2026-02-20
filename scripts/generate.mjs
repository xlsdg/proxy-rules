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

const IP_BASED_RULE_TYPES = new Set([
  "IP-CIDR",
  "IP-CIDR6",
  "IP-ASN",
  "GEOIP",
]);

function isIpv4Cidr(value) {
  const match = value.match(/^((?:\d{1,3}\.){3}\d{1,3})\/(\d{1,2})$/);
  if (!match) return false;

  const [, ip, prefixLen] = match;
  if (Number(prefixLen) > 32) return false;

  return ip.split(".").every((octet) => {
    const n = Number(octet);
    return n >= 0 && n <= 255;
  });
}

function isIpv6Cidr(value) {
  const match = value.match(/^[0-9a-fA-F:]+\/(\d{1,3})$/);
  if (!match) return false;
  return Number(match[1]) <= 128;
}

function parseLine(rawLine) {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return { kind: "skip", line: trimmed };
  }

  const segments = trimmed.split(",");
  if (segments.length >= 2) {
    const ruleType = segments[0].trim().toUpperCase();
    const cidr = segments[1].trim();
    if (IP_BASED_RULE_TYPES.has(ruleType)) {
      return { kind: "rule", line: trimmed, ruleType, cidr };
    }
    return { kind: "other", line: trimmed };
  }

  if (isIpv4Cidr(trimmed))
    return { kind: "rule", line: trimmed, ruleType: "IP-CIDR", cidr: trimmed };
  if (isIpv6Cidr(trimmed))
    return { kind: "rule", line: trimmed, ruleType: "IP-CIDR6", cidr: trimmed };

  return { kind: "other", line: trimmed };
}

function buildLoonList(rawLines) {
  const lines = [];
  for (const rawLine of rawLines) {
    const parsed = parseLine(rawLine);
    if (parsed.kind !== "rule") {
      lines.push(parsed.line);
      continue;
    }
    if (/\bno-resolve\b/i.test(parsed.line)) {
      lines.push(parsed.line);
      continue;
    }

    if (parsed.line.includes(",")) lines.push(`${parsed.line},no-resolve`);
    else lines.push(`${parsed.ruleType},${parsed.cidr},no-resolve`);
  }
  return lines.join("\n").trimEnd() + "\n";
}

function buildEgernYaml(rawLines) {
  const ipv4Cidrs = [];
  const ipv6Cidrs = [];
  for (const rawLine of rawLines) {
    const parsed = parseLine(rawLine);
    if (parsed.kind !== "rule") continue;
    if (parsed.ruleType === "IP-CIDR" && isIpv4Cidr(parsed.cidr))
      ipv4Cidrs.push(parsed.cidr);
    else if (parsed.ruleType === "IP-CIDR6" && isIpv6Cidr(parsed.cidr))
      ipv6Cidrs.push(parsed.cidr);
  }

  const yamlParts = ["no_resolve: true"];
  if (ipv4Cidrs.length) {
    yamlParts.push("ip_cidr_set:", ...ipv4Cidrs.map((cidr) => `  - ${cidr}`));
  }
  if (ipv6Cidrs.length) {
    yamlParts.push("ip_cidr6_set:", ...ipv6Cidrs.map((cidr) => `  - ${cidr}`));
  }
  return yamlParts.join("\n") + "\n";
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

    const rawText = await response.text();
    const rawLines = rawText.split(/\r?\n/);
    const loonContent = buildLoonList(rawLines);
    const egernContent = buildEgernYaml(rawLines);

    await Promise.all([
      writeFile(path.join(LOON_DIR, `${name}.list`), loonContent, "utf8"),
      writeFile(path.join(EGERN_DIR, `${name}.yaml`), egernContent, "utf8"),
    ]);
  }),
);
