// What Warsha accepts as an email address and as a password.
//
// Both rules are shared authorities, and the value of a shared authority is
// entirely in whether the surfaces actually ask it. So this file has two halves:
// the matrix, which pins the behaviour, and a set of source assertions proving
// every place a password or an address is chosen reaches for the same module
// rather than restating the rule.
//
// The second half is the one that catches the real regression. Before this pass,
// `app/create-account.tsx` gated signup on `password.length < 6` while
// `app/reset-password.tsx` demanded four rules — so the product cheerfully
// accepted a password at signup that the same account could never set again.
// Nothing was broken; the two files simply did not know about each other.
//
// The literals below are test data. None of them is a credential anywhere.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isValidCustomerEmail, normalizeCustomerEmail } from '../src/auth/auth-identifier.ts';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  passwordFailureKey,
  passwordMeetsPolicy,
  passwordRequirements,
} from '../src/auth/password-policy.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

// ---------------------------------------------------------------------------
// Email: what must fail
// ---------------------------------------------------------------------------
// Each of these is a typing mistake somebody actually makes, and each used to
// reach Supabase and come back as a signup failure the customer was shown as
// though something had gone wrong at Warsha's end.

const malformed = [
  ['hello', 'no domain at all'],
  ['hello.com', 'a domain with no local part and no @'],
  ['hello@', 'nothing after the @'],
  ['@gmail.com', 'nothing before the @'],
  ['hello@gmail', 'a domain with no dot'],
  ['hello @gmail.com', 'a space in the middle'],
  ['hello@gmail..com', 'THE DOUBLED DOT — the most common typo of all'],
  ['test', 'a bare word'],
  ['test.com', 'a hostname mistaken for an address'],
  ['test@', 'nothing after the @'],
  ['test@gmail', 'no public suffix'],
  ['test@gmail..com', 'a doubled dot again'],
  ['.leading@example.com', 'a local part starting with a dot'],
  ['trailing.@example.com', 'a local part ending with a dot'],
  ['double..dot@example.com', 'a doubled dot in the local part'],
  ['user@-example.com', 'a domain label starting with a hyphen'],
  ['user@example-.com', 'a domain label ending with a hyphen'],
  ['user@example.c', 'a single-character top-level domain'],
  ['user@example.123', 'a numeric top-level domain'],
  ['two@at@example.com', 'a second @'],
  ['', 'nothing at all'],
  ['   ', 'only whitespace'],
] as const;

for (const [address, why] of malformed) {
  check(!isValidCustomerEmail(address), `REJECTED: ${JSON.stringify(address)} — ${why}`);
  check(normalizeCustomerEmail(address) === null, `and normalising it yields null — ${why}`);
}

// ---------------------------------------------------------------------------
// Email: what must keep working
// ---------------------------------------------------------------------------
// The failure mode of a stricter rule is rejecting somebody's real address.
// These are ordinary addresses that a stricter-looking implementation gets
// wrong: a plus tag, a two-part public suffix, dots in the local part, and the
// punctuation RFC 5322 permits unquoted.

const wellFormed = [
  'hello@gmail.com',
  'name.surname@example.co.uk',
  'user+tag@example.com',
  'test@gmail.com',
  'first.last@example.com',
  'person+tag@example.co.uk',
  'a_b@c-d.io',
  "o'brien@example.com".replace("'", '!'),
  'x!#$%&*+/=?^_`{|}~@example.com',
  'a@b.co',
] as const;

for (const address of wellFormed) {
  check(isValidCustomerEmail(address), `ACCEPTED: ${address}`);
}

// Normalisation is what stops one person owning two accounts.
check(normalizeCustomerEmail('  Hello@Gmail.COM  ') === 'hello@gmail.com',
  'AN ADDRESS IS TRIMMED AND LOWER-CASED IN ONE PLACE, SO CASE CANNOT FORK AN ACCOUNT');

// ---------------------------------------------------------------------------
// Password: what must fail
// ---------------------------------------------------------------------------

const weak = [
  ['password', 'no uppercase, no digit, no symbol'],
  ['Password', 'no digit, no symbol'],
  ['Password1', 'no symbol — the rule added in this pass'],
  ['password1!', 'no uppercase'],
  ['PASSWORD1!', 'no lowercase'],
  ['Pass1!', 'seven characters, one short'],
  ['', 'empty'],
  ['Aa1!Aa1', 'seven characters with every class present'],
] as const;

for (const [candidate, why] of weak) {
  check(!passwordMeetsPolicy(candidate), `REFUSED: ${JSON.stringify(candidate)} — ${why}`);
  check(passwordFailureKey(candidate) !== null, `and names the outstanding rule — ${why}`);
}

const strong = ['Password1!', 'Warsha2026!', 'Aa1!aaaa', 'a passphrase With 1 Space'] as const;
for (const candidate of strong) {
  check(passwordMeetsPolicy(candidate), `ACCEPTED: ${JSON.stringify(candidate)}`);
  check(passwordFailureKey(candidate) === null, 'and reports nothing outstanding');
}

// A space is a symbol. A passphrase is a good password and there is no reason to
// refuse one for containing the wrong punctuation, which is why "special" is
// defined as not-alphanumeric rather than as an approved list.
check(passwordMeetsPolicy('Warsha 2026 rocks!'.replace('rocks', 'Rocks')),
  'A PASSPHRASE WITH SPACES IS A VALID PASSWORD');

check(PASSWORD_MIN_LENGTH === 8, 'the minimum length is still eight');
check(passwordRequirements('').length === 5, 'there are five rules, and the checklist shows all five');
check(passwordRequirements('Password1!').every((rule) => rule.met), 'a valid password satisfies every one');

// bcrypt truncates at 72 bytes, so a longer password and its first 72 bytes are
// the same password. Accepting the longer one and silently discarding the rest
// protects somebody by less than they believe.
check(!passwordMeetsPolicy(`Aa1!${'x'.repeat(PASSWORD_MAX_BYTES)}`),
  'A PASSWORD PAST bcrypt’S 72-BYTE TRUNCATION IS REFUSED RATHER THAN QUIETLY CUT');
check(passwordFailureKey(`Aa1!${'x'.repeat(PASSWORD_MAX_BYTES)}`) === 'passwordTooLong',
  'and says so specifically');
// Counted in bytes, not characters: an Arabic password reaches the limit in
// roughly half as many characters.
check(!passwordMeetsPolicy(`Aa1!${'م'.repeat(40)}`),
  'the bound is measured in bytes, which is what bcrypt counts');

// ---------------------------------------------------------------------------
// Every surface asks the authority
// ---------------------------------------------------------------------------
// The matrix above is worthless if a screen decides for itself.

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * The file with its comments removed.
 *
 * The "no length rule of its own" assertion below is a search for CODE, and the
 * first version of it failed against a comment that quoted the very rule it was
 * looking for. A source assertion that cannot tell an instruction from a
 * sentence about an instruction is one nobody can write an explanation near.
 */
const readCode = (path: string) => read(path)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*/g, '$1');

const passwordSurfaces = [
  ['app/create-account.tsx', 'native signup'],
  ['app/reset-password.tsx', 'native password reset'],
  ['web/app/app/create-account/page.tsx', 'web signup'],
  ['web/app/app/reset-password/page.tsx', 'web password reset'],
  ['web/lib/auth-actions.ts', 'the web signup action'],
] as const;

for (const [path, surface] of passwordSurfaces) {
  check(/password-policy/.test(read(path)),
    `${surface} reads the shared password policy`);
  check(!/password\.length\s*[<>]=?\s*\d/.test(readCode(path)),
    `AND ${surface.toUpperCase()} DOES NOT CARRY A LENGTH RULE OF ITS OWN`);
}

const emailSurfaces = [
  ['app/create-account.tsx', 'native signup'],
  ['web/app/app/create-account/page.tsx', 'web signup'],
  ['src/auth/auth-context.tsx', 'the native auth context'],
] as const;

for (const [path, surface] of emailSurfaces) {
  check(/isValidCustomerEmail|normalizeCustomerEmail|classifySignInIdentity/.test(read(path)),
    `${surface} validates addresses through the shared authority`);
}

// The checklist is one component per platform, not one per screen.
check(/PasswordRequirementList/.test(read('app/create-account.tsx'))
  && /PasswordRequirementList/.test(read('app/reset-password.tsx')),
  'BOTH NATIVE PASSWORD SCREENS SHOW THE SAME CHECKLIST COMPONENT');
check(/PasswordRequirements/.test(read('web/app/app/create-account/page.tsx'))
  && /PasswordRequirements/.test(read('web/app/app/reset-password/page.tsx')),
  'and both web password screens show the same one');

// ---------------------------------------------------------------------------
// The rules are stated in every language
// ---------------------------------------------------------------------------
// A checklist that falls back to English for one rule is a checklist an Arabic
// reader cannot use.

const nativeCopy = read('src/i18n/translations.ts');
const webCopy = read('web/lib/app-copy.ts');
const webFrench = read('web/lib/app-copy.fr.ts');

for (const key of [
  'passwordLengthRequirement', 'passwordUppercaseRequirement', 'passwordLowercaseRequirement',
  'passwordNumberRequirement', 'passwordSpecialRequirement', 'passwordTooLong',
  'requirementMet', 'requirementUnmet', 'emailInvalid',
]) {
  // Three occurrences in the native table is one per language; the French web
  // copy lives in its own file.
  check((nativeCopy.match(new RegExp(`\\b${key}\\s*:`, 'g')) ?? []).length >= 3,
    `${key} is translated into all three languages for the app`);
  check((webCopy.match(new RegExp(`\\b${key}\\s*:`, 'g')) ?? []).length >= 2
    && new RegExp(`\\b${key}\\s*:`).test(webFrench),
    `and into all three for the web`);
}

// The accessible state must be words, not only a colour and a shape.
check(/requirementMet|requirementUnmet/.test(read('components/warsha/PasswordRequirementList.tsx')),
  'THE NATIVE CHECKLIST ANNOUNCES MET/UNMET IN WORDS, NOT ONLY IN COLOUR');
check(/requirementMet|requirementUnmet/.test(read('web/components/password-requirements.tsx')),
  'and so does the web one');

console.log(`Auth validation matrix: ${checks} checks passed.`);
