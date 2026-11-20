#!/usr/bin/env node
// branch.js · Shipping Dock: branch naming policy + protected-branch guard (zero deps)
// ─────────────────────────────────────────────────────────────
// Reference implementation of the indie-keeper branch governance.
// Small teams rarely write their branch rules down, so every repo ends up
// with main/master coexisting and mystery branches. One policy in
// keeper-profile.json; one command to check it, one to create compliant
// branches.
//
// Usage:
//   node branch.js check            current branch vs policy (exit 1 with --strict on violations)
//   node branch.js new <type> <words…>   create type/slug branch (e.g. new feature login ui)
//   node branch.js policy           print the active policy
//
// Policy lives in keeper-profile.json → branch: { protected: [...], types: [...] }
// Defaults: protected = ["main"] · types = feature/fix/hotfix/chore/docs/refactor/experiment
// All commands accept --root=<project root>, --lang=<en|zh>
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { detectLang, makeT } = require('../lang');

// ── argv parsing: both --name=value and --name value are accepted ──
const VALUE_FLAGS = new Set(['root', 'lang']);
function parseArgv(raw) {
  const flags = {}; const bools = new Set(); const pos = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else {
        const name = a.slice(2);
        if (VALUE_FLAGS.has(name) && i + 1 < raw.length && !raw[i + 1].startsWith('--')) flags[name] = raw[++i];
        else bools.add(name);
      }
    } else pos.push(a);
  }
  return { flags, bools, pos };
}
const A = parseArgv(process.argv.slice(2));
function flag(name, dflt) { return name in A.flags ? A.flags[name] : dflt; }

const lang = detectLang();
const ROOT = path.resolve(flag('root', process.cwd()));

const MSG = {
  notGit: { en: '✗ not a git repository (or git unavailable)', zh: '✗ 不是 git 仓库（或 git 不可用）' },
  checkHead: { en: '\n  branch check · current: {0}\n', zh: '\n  分支体检 · 当前：{0}\n' },
  onProtected: {
    en: '  ⚠ you are on protected branch "{0}" — do day-to-day work on a named branch (keeper branch new <type> <words…>), keep this one for reviewed merges/releases',
    zh: '  ⚠ 你在保护分支 "{0}" 上——日常开发请开命名分支（keeper branch new <类型> <描述…>），这条留给审过的合并/发布',
  },
  nameOk: { en: '  ✓ branch name follows policy ({0}/<slug>)', zh: '  ✓ 分支名符合规范（{0}/<slug>）' },
  nameBad: {
    en: '  ✗ branch name "{0}" is off-policy — expected <type>/<slug> with type ∈ {1} and slug in kebab-case',
    zh: '  ✗ 分支名 "{0}" 不符合规范——应为 <类型>/<slug>，类型 ∈ {1}，slug 用 kebab-case',
  },
  strictFail: { en: '\n  --strict: policy violations found, exiting 1', zh: '\n  --strict：有违规项，退出码 1' },
  newUsage: { en: 'Usage: branch.js new <type> <words…>  (e.g. new feature login ui → feature/login-ui)', zh: '用法：branch.js new <类型> <描述…>（如 new feature login ui → feature/login-ui）' },
  badType: { en: '✗ type "{0}" is not in policy — allowed: {1}', zh: '✗ 类型 "{0}" 不在规范里——允许：{1}' },
  emptySlug: { en: '✗ nothing usable for a slug in "{0}"', zh: '✗ "{0}" 里提炼不出可用的 slug' },
  created: { en: '✓ created and switched to {0}', zh: '✓ 已创建并切到 {0}' },
  createFailed: { en: '✗ git checkout -b failed: {0}', zh: '✗ git checkout -b 失败：{0}' },
  policyHead: { en: '\n  branch policy (keeper-profile.json → branch)\n', zh: '\n  分支规范（keeper-profile.json → branch）\n' },
  policyProtected: { en: '  protected branches: {0} — no direct day-to-day commits; merges/releases only', zh: '  保护分支：{0}——不做日常直改，只接合并/发布' },
  policyTypes: { en: '  branch types: {0} — branches are named <type>/<kebab-slug>', zh: '  分支类型：{0}——分支名为 <类型>/<kebab-slug>' },
  policyPr: {
    en: '  merge etiquette: solo → merge/rebase locally after self-review; 2+ people or risky change → open a PR so someone else reads the diff',
    zh: '  合并礼仪：单人 → 自查后本地 merge/rebase；两人以上或高危改动 → 开 PR 让第二双眼睛看 diff',
  },
  policySrc: { en: '  (source: {0})', zh: '  （来源：{0}）' },
  policyDefault: { en: 'built-in defaults — add a "branch" section to keeper-profile.json to customize', zh: '内置默认——在 keeper-profile.json 加 "branch" 段可自定义' },
  unknownCmd: { en: 'Unknown command "{0}", see branch.js help', zh: '不认识命令"{0}"，看 branch.js help' },
  help: {
    en: `branch.js · branch naming policy + protected-branch guard

  branch.js check [--strict]     current branch vs policy (--strict exits 1 on violations)
  branch.js new <type> <words…>  create <type>/<kebab-slug> and switch to it
  branch.js policy               print the active policy

  Policy: keeper-profile.json → branch: { "protected": ["main"], "types": [...] }
  Defaults: protected = main · types = feature/fix/hotfix/chore/docs/refactor/experiment
`,
    zh: `branch.js · 分支命名规范 + 保护分支守卫

  branch.js check [--strict]     当前分支对照规范体检（--strict 违规退出码 1）
  branch.js new <类型> <描述…>   创建 <类型>/<kebab-slug> 并切过去
  branch.js policy               打印当前生效的规范

  规范：keeper-profile.json → branch: { "protected": ["main"], "types": [...] }
  默认：protected = main · 类型 = feature/fix/hotfix/chore/docs/refactor/experiment
`,
  },
};
const t = makeT(MSG, lang);

const DEFAULT_POLICY = {
  protected: ['main'],
  types: ['feature', 'fix', 'hotfix', 'chore', 'docs', 'refactor', 'experiment'],
};

function loadPolicy(root) {
  try {
    const prof = JSON.parse(fs.readFileSync(path.join(root, 'keeper-profile.json'), 'utf8'));
    const b = prof.branch || {};
    return {
      protected: Array.isArray(b.protected) && b.protected.length ? b.protected : DEFAULT_POLICY.protected,
      types: Array.isArray(b.types) && b.types.length ? b.types : DEFAULT_POLICY.types,
      custom: !!prof.branch,
    };
  } catch { return { ...DEFAULT_POLICY, custom: false }; }
}

// Pure: words → kebab-case slug (ascii-safe, git-ref-safe)
function slugify(words) {
  return words.join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-') // keep CJK so zh descriptions survive
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

// Pure: is this branch name policy-compliant? Protected names pass by definition
// (they are governed by the protected rule, not the naming rule).
function validateBranchName(name, policy) {
  if (policy.protected.includes(name)) return { ok: true, protected: true };
  const m = /^([^/]+)\/(.+)$/.exec(name);
  if (!m) return { ok: false, reason: 'no-slash' };
  if (!policy.types.includes(m[1])) return { ok: false, reason: 'bad-type' };
  if (!/^[a-z0-9\u4e00-\u9fff]+(-[a-z0-9\u4e00-\u9fff]+)*$/.test(m[2])) return { ok: false, reason: 'bad-slug' };
  return { ok: true, protected: false };
}

function git(args) {
  try {
    const r = spawnSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } catch { return { ok: false, out: '', err: '' }; }
}

function currentBranch() {
  const r = git(['branch', '--show-current']);
  return r.ok ? r.out : null;
}

// ── commands ──

function cmdCheck() {
  const policy = loadPolicy(ROOT);
  const cur = currentBranch();
  if (!cur) { console.error(t('notGit')); process.exit(1); }
  console.log(t('checkHead', cur));
  let violations = 0;
  if (policy.protected.includes(cur)) {
    console.log(t('onProtected', cur));
    violations++;
  } else {
    const v = validateBranchName(cur, policy);
    if (v.ok) console.log(t('nameOk', policy.types.join('|')));
    else { console.log(t('nameBad', cur, policy.types.join('/'))); violations++; }
  }
  if (violations && A.bools.has('strict')) { console.log(t('strictFail')); process.exit(1); }
}

function cmdNew(rest) {
  const policy = loadPolicy(ROOT);
  const type = rest[0];
  const words = rest.slice(1);
  if (!type || !words.length) { console.error(t('newUsage')); process.exit(1); }
  if (!policy.types.includes(type)) { console.error(t('badType', type, policy.types.join('/'))); process.exit(1); }
  const slug = slugify(words);
  if (!slug) { console.error(t('emptySlug', words.join(' '))); process.exit(1); }
  const name = `${type}/${slug}`;
  const r = git(['checkout', '-b', name]);
  if (!r.ok) { console.error(t('createFailed', r.err.split('\n')[0] || '?')); process.exit(1); }
  console.log(t('created', name));
}

function cmdPolicy() {
  const policy = loadPolicy(ROOT);
  console.log(t('policyHead'));
  console.log(t('policyProtected', policy.protected.join(', ')));
  console.log(t('policyTypes', policy.types.join(' / ')));
  console.log(t('policyPr'));
  console.log(t('policySrc', policy.custom ? 'keeper-profile.json' : t('policyDefault')));
}

// ── main ──

function main() {
  const cmd = A.pos[0];
  const rest = A.pos.slice(1);
  if (!cmd || cmd === 'help') { console.log(t('help')); return; }
  const table = { check: cmdCheck, new: cmdNew, policy: cmdPolicy };
  if (!table[cmd]) { console.error(t('unknownCmd', cmd)); process.exit(1); }
  table[cmd](rest);
}

// Run only when invoked directly; export pure helpers for unit tests
// (scripts/tests/unit.js) — same pattern as schedule.js.
if (require.main === module) main();
module.exports = { slugify, validateBranchName, loadPolicy, DEFAULT_POLICY };
