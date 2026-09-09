/**
 * The synthetic photograph, checked without an emulator.
 *
 * The professional onboarding walk stopped at "Add your photo — Required" and
 * that was recorded as something the harness could not supply. It was recorded
 * wrongly: a picker needs a file in the gallery, and a file is not a human
 * boundary. `scripts/android-e2e/photo-fixture.mjs` draws one.
 *
 * What is asserted here is everything that can be known off-device, because a
 * fixture that turns out to be a corrupt PNG at step 2 of 7 wastes an entire
 * emulator run to tell you so.
 *
 * What is NOT asserted, stated plainly rather than left as a gap: that the
 * bytes are identical across Node versions. `zlib` may legitimately change its
 * output between releases, so pinning a hash here would fail on a Node upgrade
 * for a reason that has nothing to do with Warsha. Determinism is asserted
 * within a run, which is the property the harness actually depends on — the
 * same image every time it uploads one.
 */
import assert from 'node:assert/strict';

import { buildSyntheticPortrait, fixtureFingerprint } from './android-e2e/photo-fixture.mjs';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

const image = buildSyntheticPortrait();

// --- It is a PNG -----------------------------------------------------------
equal([...image.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'the fixture carries the PNG signature');
ok(image.includes(Buffer.from('IHDR', 'ascii')), 'it has a header chunk');
ok(image.includes(Buffer.from('IDAT', 'ascii')), 'it has pixel data');
ok(image.includes(Buffer.from('IEND', 'ascii')), 'and it is terminated');

// --- Every chunk's CRC is correct ------------------------------------------
// A truncated or mis-encoded chunk still contains the letters "IDAT". Walking
// the chunk list is what proves the file would actually decode.
const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
const crc32 = (buffer: Buffer) => {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = crcTable[(c ^ buffer[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const seen: string[] = [];
let offset = 8;
while (offset < image.length) {
  const length = image.readUInt32BE(offset);
  const type = image.subarray(offset + 4, offset + 8).toString('ascii');
  const body = image.subarray(offset + 4, offset + 8 + length);
  const declared = image.readUInt32BE(offset + 8 + length);
  checks += 1;
  assert.equal(crc32(body), declared, `the ${type} chunk's CRC is correct`);
  seen.push(type);
  offset += 12 + length;
}
equal(offset, image.length, 'the chunks account for the whole file, with nothing trailing');
equal(seen, ['IHDR', 'IDAT', 'IEND'], 'and they are exactly the three a decoder needs');

// --- The header says what the picker will act on ---------------------------
const width = image.readUInt32BE(16);
const height = image.readUInt32BE(20);
equal(width, 900, 'the fixture is 900 wide');
equal(height, 1200, 'and 1200 tall');
ok(width !== height,
  'IT IS NOT SQUARE — a square fixture would leave WorkerPhotoPicker’s centre-crop untested');
ok(Math.min(width, height) <= 1400,
  'and the short side is under the resize threshold, so the crop runs unmasked by a resize');
equal(image[24], 8, 'eight bits per channel');
equal(image[25], 2, 'truecolour, which every Android decoder handles');

// --- Determinism -----------------------------------------------------------
const again = buildSyntheticPortrait();
equal(Buffer.compare(image, again), 0, 'BUILDING IT TWICE PRODUCES IDENTICAL BYTES');
equal(fixtureFingerprint(image), fixtureFingerprint(again), 'so the fingerprint is stable');
equal(fixtureFingerprint(image).length, 12, 'and short enough to read in a log line');

// --- It is a plausible photograph, not a blank rectangle -------------------
// If the drawing ever degenerates to one flat colour the journey would still
// "pass" while proving nothing about cropping or upload.
ok(image.length > 2000, 'the encoded image is substantial enough to be a real photo');
ok(image.length < 400_000, 'and small enough to push to a device quickly');

console.log(`Photo fixture: ${checks} checks passed.`);
