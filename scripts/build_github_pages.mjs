import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const normalizeBase = (value) => {
  if (!value || value === '.') return '/';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
};

const explicitBase = valueAfter('--base') || process.env.BASE_PATH;
const repository = valueAfter('--repo') || process.env.GITHUB_REPOSITORY;
const explicitSite = valueAfter('--site') || process.env.SITE_URL;

let base = explicitBase;
let site = explicitSite;

if (!base && repository) {
  const [owner, repo] = repository.includes('/') ? repository.split('/') : ['', repository];
  const userSite = repo.toLowerCase().endsWith('.github.io');
  base = userSite ? '/' : `/${repo}/`;
  if (!site && owner) site = userSite ? `https://${repo}` : `https://${owner}.github.io/${repo}`;
}

if (!base) {
  console.error('Missing GitHub Pages base path. Use one of:');
  console.error('  npm run build:github-pages -- --repo OWNER/REPOSITORY');
  console.error('  npm run build:github-pages -- --base /REPOSITORY/ --site https://OWNER.github.io/REPOSITORY');
  process.exit(1);
}

process.env.BASE_PATH = normalizeBase(base);
if (site) process.env.SITE_URL = site.replace(/\/$/, '');

console.log(`Building GitHub Pages dist with BASE_PATH=${process.env.BASE_PATH}`);
if (process.env.SITE_URL) console.log(`Using SITE_URL=${process.env.SITE_URL}`);

const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const commandArgs = npmExecPath ? [npmExecPath, 'run', 'build'] : ['run', 'build'];
const result = spawnSync(command, commandArgs, {
  stdio: 'inherit',
  env: process.env,
  shell: !npmExecPath && process.platform === 'win32'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);