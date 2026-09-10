/**
 * Put the device somewhere, so a location-dependent journey can be driven.
 *
 * This was written off once as a boundary — "the emulator console refuses
 * `geo fix`" — and it is not one. It is a tooling problem with a documented
 * fix, and the difference matters: a harness that cannot place a device cannot
 * exercise the map picker, the service area, or anything live arrival tracking
 * will need.
 *
 * ## Two separate faults, found in order
 *
 * **The token.** The emulator console requires a token, read at STARTUP from
 * `~/.emulator_console_auth_token`. On this machine that file held sixteen NUL
 * bytes — not a token and not empty — so every command came back `KO: missing
 * authentication token` and no token a client could send would ever match. An
 * EMPTY file disables console authentication, which is the documented behaviour
 * and the right answer for an emulator that only ever talks to this machine.
 * Truncating it is not enough on its own: the file is read once, at startup, so
 * the emulator has to be restarted afterwards.
 *
 * **`adb emu`.** With the token fixed, `adb emu geo fix` returned exit 0 and an
 * empty string, for every command including `avd name` — silence that reads
 * exactly like success. The console itself was fine the whole time: connecting
 * to port 5554 directly gives the banner, `OK`, and the AVD's name. So this
 * speaks the console protocol over a socket rather than through `adb emu`,
 * which is the documented interface and the one that demonstrably answers.
 *
 * That is also why every command here READS THE REPLY. A transport that fails
 * by saying nothing is the worst kind, and the first version of this module
 * checked for the string `KO` in an empty response and reported success four
 * times while the device sat in Mountain View.
 *
 * ## What this deliberately does NOT do
 *
 * It does not register a mock location provider or add any test path to the
 * product. The emulator's own GPS is moved and Warsha is told nothing — it asks
 * the platform the same way it does on a real phone, and the permission prompt
 * it shows is the real one. A harness that had to change the product in order
 * to observe the product would be observing a different product.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ADB = process.env.WARSHA_ADB
  ?? (existsSync('D:\\Dev\\Android\\Sdk\\platform-tools\\adb.exe')
    ? 'D:\\Dev\\Android\\Sdk\\platform-tools\\adb.exe'
    : 'adb');

const TOKEN_FILE = join(homedir(), '.emulator_console_auth_token');

/** Coordinates a journey can be driven to, none of them anyone's home. */
export const PLACES = {
  /**
   * Abdin Square, central Cairo — a public square in the district the QA
   * professional's service area names. A place rather than a person, and
   * stable enough to assert against.
   */
  abdinSquare: { latitude: 30.0444, longitude: 31.2483 },
  /** Tahrir Square: ~1.2km away, so "did it move" has an unambiguous answer. */
  tahrirSquare: { latitude: 30.0444, longitude: 31.2357 },
};

/** Why the console cannot be reached, or null when it can. */
export function consoleObstacle() {
  if (!existsSync(TOKEN_FILE)) return null; // absent behaves as disabled
  const size = statSync(TOKEN_FILE).size;
  if (size === 0) return null;
  if (readFileSync(TOKEN_FILE).every((byte) => byte === 0)) {
    return `${TOKEN_FILE} holds ${size} NUL bytes — neither a token nor empty, so console `
      + 'authentication can never succeed. Truncate it to zero bytes and RESTART the emulator; '
      + 'the file is read once, at startup.';
  }
  return null;
}

/**
 * One console command, and its reply.
 *
 * The reply is the whole point. `adb emu` returns exit 0 and an empty string
 * when it fails, which is indistinguishable from success, so this waits for the
 * console's own `OK` or `KO` and treats anything else as a failure.
 */
export function consoleCommand(command, { port = 5554, timeout = 6000 } = {}) {
  const obstacle = consoleObstacle();
  if (obstacle) throw new Error(obstacle);

  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let transcript = '';
    let sent = false;

    const finish = (error, value) => {
      socket.destroy();
      if (error) reject(error); else resolve(value);
    };

    const timer = setTimeout(
      () => finish(new Error(`the emulator console did not answer "${command}" within ${timeout}ms`)),
      timeout,
    );

    socket.setEncoding('utf8');
    socket.on('error', (error) => { clearTimeout(timer); finish(error); });
    socket.on('data', (chunk) => {
      transcript += chunk;
      // The banner ends with its own OK; the command goes after that.
      if (!sent && /Android Console/.test(transcript) && /OK/.test(transcript)) {
        sent = true;
        transcript = '';
        socket.write(`${command}\n`);
        return;
      }
      if (!sent) return;
      if (/^KO/m.test(transcript)) {
        clearTimeout(timer);
        finish(new Error(`the emulator console refused "${command}": ${transcript.trim()}`));
      } else if (/^OK/m.test(transcript)) {
        clearTimeout(timer);
        finish(null, transcript.trim());
      }
    });
  });
}

/**
 * Move the emulator's GPS.
 *
 * ## What this proves, and what it does not
 *
 * The console's `OK` proves the fix was accepted. It does NOT prove the device
 * has adopted it, and `dumpsys location` is not the way to find out: the "last
 * location" it prints is a cached last-known value that the GPS provider only
 * refreshes while something is actively listening for updates. With no client
 * requesting a position, an emulator sits on its boot default — Mountain View —
 * however many fixes it has been sent.
 *
 * The first version of this treated that as a failure and refused a fix it had
 * successfully delivered. Which was the better failure of the two: the version
 * before it looked for the string `KO` in `adb emu`'s empty output and reported
 * success four times while the device never moved.
 *
 * So `verify` is opt-in and honest about its precondition. Pass it only when
 * something on the device is listening — Warsha's own map picker, with the
 * permission granted, is exactly that — and the assertion then means something.
 * Left off, this returns the coordinate it SENT, and the caller is expected to
 * confirm through the product rather than through this module.
 *
 * @param {{latitude: number, longitude: number}} place
 * @param {{verify?: boolean}} options  read it back; needs an active listener
 */
export async function setDeviceLocation(place, { verify = false } = {}) {
  // Longitude first. The console takes them in that order, and getting it wrong
  // puts the device in the Indian Ocean without complaining.
  await consoleCommand(`geo fix ${place.longitude} ${place.latitude}`);
  if (!verify) return place;

  const reported = deviceLocation();
  if (!reported) {
    throw new Error('the console accepted the fix but the device reports no GPS location at all');
  }
  const off = Math.hypot(reported.latitude - place.latitude, reported.longitude - place.longitude);
  if (off > 0.01) {
    throw new Error('the console accepted the fix and the device still reports '
      + `${reported.latitude},${reported.longitude}. If nothing on the device is listening for `
      + 'location updates, this is expected and `verify` should not have been passed.');
  }
  return reported;
}

/** Where the device says it is, read out of the platform's own location service. */
export function deviceLocation() {
  const dump = execFileSync(ADB, ['shell', 'dumpsys', 'location'], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  const match = dump.match(/last location=Location\[gps (-?[\d.]+),(-?[\d.]+)/);
  return match ? { latitude: Number(match[1]), longitude: Number(match[2]) } : null;
}

/**
 * Grant Warsha the location permission the way a person granting it would.
 *
 * `pm grant` is the platform's own mechanism and changes nothing about how the
 * app asks or what it does with the answer. It exists so a scripted walk does
 * not stall on a system dialog with no label worth matching.
 */
export function grantLocationPermission(packageName = 'com.warsha.app') {
  for (const permission of ['android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION']) {
    execFileSync(ADB, ['shell', 'pm', 'grant', packageName, permission], { encoding: 'utf8' });
  }
}

// Runnable, to place the device or to explain why it cannot be placed.
if (process.argv[1] && process.argv[1].endsWith('location.mjs')) {
  const named = process.argv[2] ?? 'abdinSquare';
  const place = PLACES[named];
  if (!place) {
    console.error(`unknown place "${named}". Known: ${Object.keys(PLACES).join(', ')}`);
    process.exit(1);
  }
  try {
    const reported = await setDeviceLocation(place);
    console.log(`device placed at ${named}: ${reported.latitude}, ${reported.longitude}`);
  } catch (error) {
    console.error(`REFUSING: ${error.message}`);
    process.exit(2);
  }
}
