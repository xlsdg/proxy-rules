# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

proxy-rules generates proxy rule files from upstream IP CIDR sources. It fetches Telegram and China CIDR ranges from [Loyalsoldier/surge-rules](https://github.com/Loyalsoldier/surge-rules), ensures each rule has the `no-resolve` flag, and writes output to `dist/loon/` (Loon `.list` format) and `dist/egern/` (Egern YAML rule sets).

## Commands

- **Generate rules**: `node scripts/generate.mjs`

No package.json or external dependencies. Requires Node.js 18+ (uses native `fetch`).

## Architecture

Single-script project: `scripts/generate.mjs` does everything.

1. Rule sources are defined as `{name, url}` objects at the top of the file
2. Each source is fetched in parallel, raw lines are split and passed to two symmetric builder functions
3. `parseLine()` parses Surge-format lines into structured objects with rule type and CIDR info
4. Validation uses `isIpv4Cidr()` and `isIpv6Cidr()` with strict format checking (octet ranges, prefix lengths)
5. `buildLoonList(rawLines)` parses each line, appends `no-resolve` to rule lines, and joins them into Loon `.list` format
6. `buildEgernYaml(rawLines)` categorizes CIDRs into `ip_cidr_set` / `ip_cidr6_set` arrays and outputs YAML with `no_resolve: true`
7. Output goes to `dist/loon/{name}.list` and `dist/egern/{name}.yaml`

## CI/CD

GitHub Actions workflow (`.github/workflows/generate.yml`) runs daily at midnight UTC and on manual trigger. It generates rules, diffs against the `release` branch, and pushes changes with a timestamped GitHub release.
