// npm run publish — sends the current code to EAS Update on the "main" branch, which Expo Go
// on the iPhone loads without this computer. Every change needs a publish to reach the phone.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

// Expo Go can't load an update that pins a runtimeVersion, and `eas update:configure` likes to
// add one, so strip it before every publish.
const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
let changed = false;
if (appJson.expo.runtimeVersion !== undefined) {
  delete appJson.expo.runtimeVersion;
  changed = true;
}
if (appJson.expo.ios?.runtimeVersion !== undefined) {
  delete appJson.expo.ios.runtimeVersion;
  changed = true;
}
if (changed) {
  writeFileSync('app.json', JSON.stringify(appJson, null, 2) + '\n');
  console.log('Removed runtimeVersion from app.json (it stops Expo Go from loading updates).');
}

// First run on a machine: link the project to your Expo account (asks a couple of questions).
if (!appJson.expo.extra?.eas?.projectId) {
  console.log('\nFirst publish: linking this project to your Expo account…\n');
  run('npx eas-cli@latest init');
}

let message = 'Update';
try {
  message = execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim() || message;
} catch {}
run(`npx eas-cli@latest update --branch main --message ${JSON.stringify(message)} --platform ios`);
