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

function parseLine(rawLine) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#") || line.startsWith("//")) {
    return { kind: "skip", line };
  }

  const parts = line.split(",");
  if (parts.length >= 2) {
    const ruleType = parts[0].trim().toUpperCase();
    const value = parts[1].trim();
    if (NO_RESOLVE_RULE_TYPES.has(ruleType)) {
      return { kind: "rule", line, ruleType, cidr: value };
    }
    return { kind: "other", line };
  }

  if (isIpv4Cidr(line))
    return { kind: "rule", line, ruleType: "IP-CIDR", cidr: line };
  if (isIpv6Cidr(line))
    return { kind: "rule", line, ruleType: "IP-CIDR6", cidr: line };

  return { kind: "other", line };
}

function ensureNoResolve(rawLine) {
  const parsed = parseLine(rawLine);
  if (parsed.kind !== "rule") return parsed.line;
  if (/\bno-resolve\b/i.test(parsed.line)) return parsed.line;

  if (parsed.line.includes(",")) return `${parsed.line},no-resolve`;
  return `${parsed.ruleType},${parsed.cidr},no-resolve`;
}

function formatEgernYaml(surgeLines) {
  const ipv4 = [];
  const ipv6 = [];
  for (const line of surgeLines) {
    const parsed = parseLine(line);
    if (parsed.kind !== "rule") continue;
    if (parsed.ruleType === "IP-CIDR" && isIpv4Cidr(parsed.cidr))
      ipv4.push(parsed.cidr);
    else if (parsed.ruleType === "IP-CIDR6" && isIpv6Cidr(parsed.cidr))
      ipv6.push(parsed.cidr);
  }

  const sections = ["no_resolve: true"];
  if (ipv4.length) {
    sections.push("ip_cidr_set:", ...ipv4.map((cidr) => `  - ${cidr}`));
  }
  if (ipv6.length) {
    sections.push("ip_cidr6_set:", ...ipv6.map((cidr) => `  - ${cidr}`));
  }
  return sections.join("\n") + "\n";
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
      writeFile(path.join(LOON_DIR, `${name}.list`), loonContent, "utf8"),
      writeFile(path.join(EGERN_DIR, `${name}.yaml`), egernContent, "utf8"),
    ]);
  }),
);
