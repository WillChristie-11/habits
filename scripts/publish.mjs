// npm run publish — sends the current code to EAS Update on the "main" branch, which Expo Go
// on the iPhone loads without this computer. Every change needs a publish to reach the phone.
//
// eas-cli rewrites app.json while publishing (it adds a runtimeVersion and plugin permissions).
// This script snapshots app.json first and puts it back exactly afterwards, even if the publish
// fails, so `git status` stays clean. The only thing kept from a run is the project link
// (extra.eas.projectId + updates.url) the very first time the project is linked.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'app.json';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const original = readFileSync(FILE, 'utf8');
const appJson = JSON.parse(original);

// Expo Go can't load an update that pins a runtimeVersion, so never publish with one.
const stripped = structuredClone(appJson);
delete stripped.expo.runtimeVersion;
if (stripped.expo.ios) delete stripped.expo.ios.runtimeVersion;
if (stripped.expo.android) delete stripped.expo.android.runtimeVersion;

let restore = original;
try {
  writeFileSync(FILE, JSON.stringify(stripped, null, 2) + '\n');

  // First run on a machine: link the project to your Expo account (asks a couple of questions).
  if (!appJson.expo.extra?.eas?.projectId) {
    console.log('\nFirst publish: linking this project to your Expo account…\n');
    run('npx eas-cli@latest init');
    // Keep the new link (and only that) when restoring.
    const linked = JSON.parse(readFileSync(FILE, 'utf8'));
    const keep = JSON.parse(original);
    keep.expo.extra = {
      ...keep.expo.extra,
      eas: { ...keep.expo.extra?.eas, projectId: linked.expo.extra?.eas?.projectId },
    };
    if (linked.expo.updates?.url) keep.expo.updates = { ...keep.expo.updates, url: linked.expo.updates.url };
    restore = JSON.stringify(keep, null, 2) + '\n';
  }

  let message = 'Update';
  try {
    message = execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim() || message;
  } catch {}
  run(
    `npx eas-cli@latest update --branch main --environment production --message ${JSON.stringify(message)} --platform ios`,
  );
} finally {
  writeFileSync(FILE, restore);
  if (restore === original) console.log('\napp.json restored (unchanged).');
  else console.log('\napp.json: kept the new project link; commit it once.');
}
