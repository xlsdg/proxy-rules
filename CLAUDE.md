# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

proxy-rules generates proxy rule files from upstream IP CIDR sources. It fetches Telegram and China CIDR ranges from [Loyalsoldier/surge-rules](https://github.com/Loyalsoldier/surge-rules), ensures each rule has the `no-resolve` flag, and writes output to `dist/loon/` (Surge/Loon `.txt` format) and `dist/egern/` (Egern YAML rule sets).

## Commands

- **Generate rules**: `node scripts/generate.mjs`

No package.json or external dependencies. Requires Node.js 18+ (uses native `fetch`).

## Architecture

Single-script project: `scripts/generate.mjs` does everything.

1. Rule sources are defined as `{name, url}` objects at the top of the file
2. Each source is fetched in parallel, lines are processed through `ensureNoResolve()`
3. `ensureNoResolve()` handles four cases: lines already with no-resolve, lines with known rule types (IP-CIDR, IP-CIDR6, IP-ASN, GEOIP), raw IPv4 CIDRs, and raw IPv6 CIDRs
4. Validation uses `isIpv4Cidr()` and `isIpv6Cidr()` with strict format checking (octet ranges, prefix lengths)
5. `extractCidr()` parses Surge-format lines into raw CIDRs with version info for Egern output
6. `formatEgernYaml()` categorizes CIDRs into `ip_cidr_set` / `ip_cidr6_set` arrays and outputs YAML with `no_resolve: true`
7. Output goes to `dist/loon/{name}.txt` and `dist/egern/{name}.yaml`

## CI/CD

GitHub Actions workflow (`.github/workflows/generate.yml`) runs daily at midnight UTC and on manual trigger. It generates rules, diffs against the `release` branch, and pushes changes with a timestamped GitHub release.
