const { spawnSync } = require('node:child_process');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const firebaseBin = path.join(rootDir, 'node_modules', '.bin', isWindows ? 'firebase.cmd' : 'firebase');
const vitestBin = path.join(rootDir, 'node_modules', '.bin', isWindows ? 'vitest.cmd' : 'vitest');
const projectId = process.env.FIREBASE_EMULATOR_PROJECT || 'demo-onemeal';
const emulatorCommand = `"${vitestBin}" run --config vitest.emulator.config.ts`;
const javaHome = process.env.ONEMEAL_JAVA_HOME || process.env.JAVA_HOME;
const env = {
  ...process.env,
  GCLOUD_PROJECT: projectId,
};

if (javaHome) {
  env.JAVA_HOME = javaHome;
  env.PATH = `${path.join(javaHome, 'bin')}${path.delimiter}${env.PATH || ''}`;
}

const command = `"${firebaseBin}" emulators:exec --project ${projectId} --only auth,firestore,functions ${emulatorCommand}`;
const shellBin = isWindows ? 'powershell.exe' : process.env.SHELL || '/bin/sh';
const shellArgs = isWindows
  ? [
      '-NoProfile',
      '-Command',
      `& '${firebaseBin}' emulators:exec --project ${projectId} --only auth,firestore,functions '${emulatorCommand}'`,
    ]
  : ['-lc', command];

const result = spawnSync(shellBin, shellArgs, {
  cwd: rootDir,
  stdio: 'inherit',
  env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
