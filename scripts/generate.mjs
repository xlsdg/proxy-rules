import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

const RULE_SOURCES = [
  {
    tag: 'tgcidr',
    url: 'https://raw.githubusercontent.com/Loyalsoldier/surge-rules/release/telegramcidr.txt',
  },
  {
    tag: 'cncidr',
    url: 'https://raw.githubusercontent.com/Loyalsoldier/surge-rules/release/cncidr.txt',
  },
];

const NO_RESOLVE_RULE_TYPES = new Set(['IP-CIDR', 'IP-CIDR6', 'IP-ASN', 'GEOIP']);

function isIpv4Cidr(value) {
  const match = value.match(/^((?:\d{1,3}\.){3}\d{1,3})\/(\d{1,2})$/);
  const ip = match?.[1];
  const prefixLengthText = match?.[2];
  if (!ip || !prefixLengthText) return false;

  const prefixLength = Number(prefixLengthText);
  if (prefixLength > 32) return false;

  return ip.split('.').every((segment) => {
    const octet = Number(segment);
    return Number.isInteger(octet) && octet >= 0 && octet <= 255;
  });
}

function isIpv6Cidr(value) {
  const match = value.match(/^[0-9a-fA-F:]+\/(\d{1,3})$/);
  if (!match?.[1]) return false;
  return Number(match[1]) <= 128;
}

function appendNoResolve(ruleLine) {
  const line = ruleLine.trim();
  if (!line || line.startsWith('#') || line.startsWith('//') || /\bno-resolve\b/i.test(line)) {
    return line;
  }

  const segments = line.split(',');
  if (segments.length >= 2) {
    const ruleType = segments[0]?.trim().toUpperCase();
    return ruleType && NO_RESOLVE_RULE_TYPES.has(ruleType) ? `${line},no-resolve` : line;
  }

  if (isIpv4Cidr(line)) return `IP-CIDR,${line},no-resolve`;
  if (isIpv6Cidr(line)) return `IP-CIDR6,${line},no-resolve`;

  return line;
}

await mkdir(DIST_DIR, { recursive: true });

await Promise.all(
  RULE_SOURCES.map(async ({ tag, url }) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);

    const text = await response.text();
    const lines = text.split(/\r?\n/).map(appendNoResolve);
    const content = lines.join('\n').trimEnd() + '\n';

    const outputPath = path.join(DIST_DIR, `${tag}.txt`);
    await writeFile(outputPath, content, 'utf8');
    console.log(`Generated: ${outputPath}`);
  }),
);
