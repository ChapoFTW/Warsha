/**
 * A photograph the harness can supply.
 *
 * The professional onboarding walk stopped at step 2 of 7 — "Add your photo —
 * Required" — and that was logged as a boundary the harness could not cross.
 * It is not one. A photo picker needs a file in the gallery; nothing about that
 * requires a human, only an image that exists.
 *
 * What this deliberately does NOT do is bypass the product. It does not stub
 * `ImagePicker`, does not write `avatarPath` straight into the draft, and does
 * not call `replaceAvatar` behind the screen's back. It puts a real decodable
 * image into the emulator's gallery and lets the real picker, the real
 * permission prompt, the real crop and the real upload run. A pass therefore
 * means the product works, which is the only kind of pass worth recording.
 *
 * ## Why it is drawn rather than checked in
 *
 * A binary fixture in Git is a file nobody can review in a diff. This is
 * generated from code: every byte is a consequence of the lines below, the
 * bytes are identical on every machine and every run, and a reviewer can see
 * what the image contains by reading it.
 *
 * ## Why 900x1200
 *
 * Portrait, and deliberately NOT square. `WorkerPhotoPicker` centre-crops to
 * the shorter side before uploading, so a square fixture would leave that crop
 * untested and a wrong crop would still pass. 900 is under the 1400 resize
 * threshold, so the crop path runs without the resize path masking it.
 */
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { adb, shell, sleep } from './driver.mjs';

const WIDTH = 900;
const HEIGHT = 1200;

/** PNG wants big-endian lengths and CRCs on every chunk. */
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/**
 * A recognisable portrait, so that a screenshot of this journey shows something
 * a person can identify at a glance rather than a coloured rectangle they have
 * to take on trust. Flat shapes only: a background, a shoulder arc, a head.
 */
const drawPortrait = () => {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  const headCx = WIDTH / 2;
  const headCy = HEIGHT * 0.38;
  const headR = WIDTH * 0.22;
  const shoulderCx = WIDTH / 2;
  const shoulderCy = HEIGHT * 1.05;
  const shoulderR = WIDTH * 0.52;

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const i = (y * WIDTH + x) * 3;
      // Vertical wash, so the crop is visible against a gradient rather than
      // against a flat colour that would hide a wrong offset.
      let r = 226 - Math.round((y / HEIGHT) * 40);
      let g = 232 - Math.round((y / HEIGHT) * 34);
      let b = 240 - Math.round((y / HEIGHT) * 26);

      const dS = Math.hypot(x - shoulderCx, y - shoulderCy);
      if (dS < shoulderR) { r = 38; g = 78; b = 120; }

      const dH = Math.hypot(x - headCx, y - headCy);
      if (dH < headR) { r = 214; g = 170; b = 132; }

      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
    }
  }
  return pixels;
};

/** Encodes RGB pixels as a PNG with filter type 0 on every scanline. */
export const buildSyntheticPortrait = () => {
  const pixels = drawPortrait();
  const stride = WIDTH * 3;
  const raw = Buffer.alloc((stride + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    // level 9 so the bytes are stable across Node versions that change the default
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

export const fixtureFingerprint = (buffer) =>
  createHash('sha256').update(buffer).digest('hex').slice(0, 12);

const REMOTE_DIR = '/sdcard/Pictures/WarshaQA';
const REMOTE_PATH = `${REMOTE_DIR}/warsha-qa-portrait.png`;

/**
 * Puts the image where the system picker will find it.
 *
 * The media scan is the part that is easy to get wrong: a pushed file is not in
 * the gallery until MediaStore has indexed it, and a picker opened too early
 * shows an empty grid that looks exactly like a broken picker.
 */
export async function installPhotoFixture(packageName) {
  const image = buildSyntheticPortrait();
  const local = join(tmpdir(), 'warsha-qa-portrait.png');
  mkdirSync(tmpdir(), { recursive: true });
  writeFileSync(local, image);

  shell(`mkdir -p ${REMOTE_DIR}`);
  adb(['push', local, REMOTE_PATH]);

  // Ask MediaStore to index it, then wait until it actually has.
  shell(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${REMOTE_PATH}`);

  let indexed = false;
  for (let attempt = 0; attempt < 15 && !indexed; attempt += 1) {
    const rows = shell(
      `content query --uri content://media/external/images/media` +
      ` --projection _display_name --where "_display_name='warsha-qa-portrait.png'"`);
    indexed = /warsha-qa-portrait\.png/.test(rows || '');
    if (!indexed) await sleep(1000);
  }

  // Granted here rather than tapped through: the permission dialog is Android's,
  // not Warsha's, and driving it proves nothing about this product. The picker
  // itself, the crop and the upload are all still exercised for real.
  if (packageName) {
    for (const permission of [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_EXTERNAL_STORAGE',
    ]) {
      try { shell(`pm grant ${packageName} ${permission}`); } catch { /* not on every API level */ }
    }
  }

  return {
    remotePath: REMOTE_PATH,
    width: WIDTH,
    height: HEIGHT,
    bytes: image.length,
    fingerprint: fixtureFingerprint(image),
    indexed,
  };
}
