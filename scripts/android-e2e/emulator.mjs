/**
 * Start an emulator that is actually usable, and prove it before returning.
 *
 * Four separate times this session an emulator reported itself ready and was
 * not, and each cost a restart plus whatever run was in flight. The causes were
 * all different and all silent:
 *
 *   1. `sys.boot_completed` was `1` while `window` and `package` did not exist.
 *      The property means the boot animation finished, not that the system
 *      services a UI harness needs are up.
 *   2. A snapshot saved while the system was already broken restored the same
 *      broken system on the next boot, so a normal restart could not fix it.
 *   3. `Stop-Process -Name qemu-system-x86_64-headless` missed the process,
 *      which on this machine is named `qemu-system-x86_64`. The old emulator
 *      survived, and the new one refused with "Running multiple emulators with
 *      the same AVD".
 *   4. Driving the device during a gradle build killed the window service
 *      outright.
 *
 * So readiness here is a QUESTION ASKED OF THE SERVICES, not a property read.
 * If `pm` and `wm` answer, the device can be driven; if they do not, nothing
 * else about it matters.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const SDK = process.env.ANDROID_SDK_ROOT ?? 'D:\\Dev\\Android\\Sdk';
const ADB = process.env.WARSHA_ADB
  ?? (existsSync(`${SDK}\\platform-tools\\adb.exe`) ? `${SDK}\\platform-tools\\adb.exe` : 'adb');
const EMULATOR = process.env.WARSHA_EMULATOR
  ?? (existsSync(`${SDK}\\emulator\\emulator.exe`) ? `${SDK}\\emulator\\emulator.exe` : 'emulator');

const quiet = (args) => {
  try {
    return execFileSync(ADB, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return ''; }
};

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Whether the services a UI harness needs are answering.
 *
 * `pm` and `wm` specifically: those are what install, `wm size` and
 * `uiautomator` depend on, and they are exactly the two that have gone missing.
 */
export function servicesReady() {
  return /package:android\b/.test(quiet(['shell', 'pm', 'list', 'packages', 'android']))
    && /size/i.test(quiet(['shell', 'wm', 'size']));
}

/** Every emulator process, whatever this platform decided to call it. */
export function runningEmulators() {
  if (process.platform !== 'win32') return [];
  try {
    const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' });
    return out.split(/\r?\n/)
      .filter((line) => /^"(qemu-system[^"]*|emulator)\.exe"/i.test(line))
      .map((line) => ({ name: line.split('","')[0].replace(/^"/, ''), pid: Number(line.split('","')[1]) }));
  } catch { return []; }
}

/**
 * Stop every emulator, by pattern rather than by exact name.
 *
 * The exact-name version of this is what let a `qemu-system-x86_64` outlive a
 * kill aimed at `qemu-system-x86_64-headless`, and the symptom was the NEXT
 * emulator refusing to start rather than anything about the old one.
 */
export function stopEmulators() {
  const running = runningEmulators();
  for (const { pid } of running) {
    try { execFileSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore' }); } catch { /* gone */ }
  }
  return running.length;
}

/**
 * Boot an emulator and wait until it can be driven.
 *
 * `-no-snapshot-load` because a snapshot of a broken system boots a broken
 * system, and `-no-snapshot-save` so a session that goes wrong cannot leave one
 * behind for the next.
 */
export async function bootEmulator({ avd = 'warsha_pixel', timeout = 300_000 } = {}) {
  stopEmulators();
  await sleep(4000);

  const child = spawn(EMULATOR, [
    '-avd', avd,
    '-no-snapshot-load',
    '-no-snapshot-save',
    '-no-boot-anim',
    '-gpu', 'swiftshader_indirect',
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (servicesReady()) return true;
    await sleep(6000);
  }
  throw new Error(`${avd} booted but pm/wm never answered within ${timeout}ms`);
}

/**
 * Refuse to drive a device that is not ready, saying which part is missing.
 *
 * Called at the top of a flow, this turns "the sweep produced four screenshots
 * of a loading screen" into a refusal with a reason.
 */
export function requireReadyDevice() {
  if (servicesReady()) return;
  const booted = /^1/.test(quiet(['shell', 'getprop', 'sys.boot_completed']).trim());
  throw new Error(booted
    ? 'the device reports boot_completed but pm/wm are not answering. A snapshot of a '
      + 'broken system boots a broken system: cold boot with -no-snapshot-load.'
    : 'no usable device. Boot one with bootEmulator() before driving a flow.');
}

if (process.argv[1] && process.argv[1].endsWith('emulator.mjs')) {
  const command = process.argv[2] ?? 'status';
  if (command === 'boot') {
    await bootEmulator({ avd: process.argv[3] ?? 'warsha_pixel' });
    console.log('emulator ready: pm and wm are answering');
  } else if (command === 'stop') {
    console.log(`stopped ${stopEmulators()} emulator process(es)`);
  } else {
    const running = runningEmulators();
    console.log(`processes: ${running.map((p) => `${p.name}:${p.pid}`).join(', ') || 'none'}`);
    console.log(`services:  ${servicesReady() ? 'pm and wm answering' : 'NOT READY'}`);
  }
}
