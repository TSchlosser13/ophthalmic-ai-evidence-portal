import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4322);
const basePath = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');
const previewUrl = `http://127.0.0.1:${port}${basePath}`;
const astroCli = path.join(projectRoot, 'node_modules', 'astro', 'bin', 'astro.mjs');
const playwrightCli = path.join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const childEnvironment = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' };
let previewProcess;

const edgeCandidates = process.platform === 'win32'
  ? [
      path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ]
  : [];
const bundledChromiumAvailable = existsSync(chromium.executablePath());
const installedEdgeAvailable = edgeCandidates.some((candidate) => existsSync(candidate));

if (childEnvironment.PLAYWRIGHT_USE_EDGE === undefined && !bundledChromiumAvailable && installedEdgeAvailable) {
  childEnvironment.PLAYWRIGHT_USE_EDGE = '1';
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const previewIsReady = async () => {
  try {
    const response = await fetch(previewUrl, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
};

const stopPreview = async () => {
  if (!previewProcess || previewProcess.exitCode !== null) return;
  previewProcess.kill();
  await Promise.race([once(previewProcess, 'exit'), delay(5_000)]);

  if (previewProcess.exitCode === null && process.platform === 'win32') {
    const taskkill = spawn('taskkill', ['/pid', String(previewProcess.pid), '/T', '/F'], {
      stdio: 'ignore'
    });
    await once(taskkill, 'exit');
  }
};

try {
  console.log(`Using ${childEnvironment.PLAYWRIGHT_USE_EDGE === '1' ? 'installed Microsoft Edge' : 'Playwright Chromium'} for browser tests.`);

  if (!(await previewIsReady())) {
    console.log(`Starting production preview at ${previewUrl}`);
    previewProcess = spawn(process.execPath, [astroCli, 'preview', '--host', '127.0.0.1', '--port', String(port)], {
      cwd: projectRoot,
      env: childEnvironment,
      stdio: 'ignore'
    });

    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (await previewIsReady()) break;
      if (previewProcess.exitCode !== null) {
        throw new Error(`Astro preview exited with code ${previewProcess.exitCode}.`);
      }
      await delay(500);
    }

    if (!(await previewIsReady())) {
      throw new Error(`Astro preview did not become available at ${previewUrl}.`);
    }
  } else {
    console.log(`Reusing production preview at ${previewUrl}`);
  }

  const playwrightProcess = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
    cwd: projectRoot,
    env: { ...childEnvironment, PLAYWRIGHT_SKIP_WEBSERVER: '1' },
    stdio: 'inherit'
  });
  const [exitCode] = await once(playwrightProcess, 'exit');
  process.exitCode = typeof exitCode === 'number' ? exitCode : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopPreview();
}
