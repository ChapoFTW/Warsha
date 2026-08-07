/**
 * WPS-024 document hashing.
 *
 * A versioned agreement is only worth anything if "the version you accepted"
 * names an exact text. That needs a hash, and the hash has to be computable in
 * three places that share no runtime: the app (to say what it rendered), Node
 * (to check the shipped corpus against the register), and Postgres (to verify
 * the acceptance and to bind it to the account).
 *
 * So SHA-256 is implemented here in plain TypeScript rather than pulled from a
 * platform API. `expo-crypto` is not installed and adding a native module for
 * this would mean a new dev-client build; `crypto.subtle` is async and absent
 * on some React Native runtimes; `node:crypto` does not exist in the app. A
 * hundred lines of arithmetic that behave identically everywhere is the
 * cheaper answer, and the pgTAP suite asserts the output matches
 * `pg_catalog.sha256(pg_catalog.convert_to(..., 'UTF8'))` on a known string,
 * so the three implementations are pinned to each other by a test rather than
 * by hope.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** UTF-8 bytes, written out rather than taken from `TextEncoder`, which is
 * absent on some React Native runtimes and would make this platform-dependent
 * for the sake of four branches. Lone surrogates are encoded as U+FFFD, the
 * same substitution `convert_to(..., 'UTF8')` effectively lands on, so a
 * malformed string cannot hash differently on two platforms. */
export function utf8Bytes(input: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd;
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

export function sha256Hex(input: string): string {
  const bytes = utf8Bytes(input);
  const bitLength = bytes.length * 8;
  // Padded length is ceil((len + 9) / 64) * 64: the message, one 0x80 byte, and
  // eight length bytes, rounded up to a whole block.
  //
  // `((len + 9) >> 6) + 1` looks like that and is not. It computes
  // floor((len + 9) / 64) + 1, which equals the ceiling EXCEPT when len + 9 is
  // an exact multiple of 64 — where it adds a whole extra block of zeros and
  // changes the digest. That is len ≡ 55 (mod 64): one input length in
  // sixty-four, and every other test passed. The boundary cases in the
  // regression suite exist because of this.
  const paddedLength = ((((bytes.length + 8) >> 6) + 1) << 6);
  const block = new Uint8Array(paddedLength);
  block.set(bytes);
  block[bytes.length] = 0x80;
  // The length field is 64 bits. Only the low 32 are written: a legal document
  // long enough to overflow them would be 512 megabytes.
  const view = new DataView(block.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  let hex = '';
  for (let i = 0; i < 8; i += 1) hex += h[i].toString(16).padStart(8, '0');
  return hex;
}

/**
 * The exact bytes a hash is taken over.
 *
 * Canonicalised before hashing so that a trailing space or a reflowed
 * paragraph does not silently invalidate every acceptance ever recorded
 * against a document whose meaning did not change. What survives
 * canonicalisation is the words and their order — which is what a reader
 * agreed to. What does not survive is whitespace, which is not.
 *
 * This is deliberately NOT a normaliser for the words themselves: no case
 * folding, no punctuation stripping, no Unicode normalisation. Changing a word
 * must change the hash, because changing a word changes the agreement.
 */
export function canonicalText(parts: readonly string[]): string {
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
    .join('\n');
}
