/**
 * Registering twice with the same credentials must not look like registering.
 *
 * QA on the website: create an account, sign out, start registration again with
 * the same credentials — and the flow ran to the end as though a new account
 * had been made.
 *
 * Nothing was duplicated server-side. Supabase does not create a second account
 * and does not return an error either, because an error there would turn any
 * signup form into an account-enumeration oracle. It returns a DECOY instead: a
 * user object with a fresh-looking id, no session, and an empty `identities`
 * array. A genuine new signup has exactly one identity.
 *
 * Warsha read only `error` and `session`. The decoy was indistinguishable from
 * a new account awaiting confirmation, so the person was told to check their
 * email and left waiting for a message nobody had sent.
 *
 * This tests the rule against the shapes the provider actually returns, which
 * is where the defect was — not against a live account, because creating one
 * requires a deliverable mailbox this environment does not have.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { signUpWasMasked } from '../src/auth/auth-errors.ts';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };

/*
 * A user object as the provider sends it, of which `signUpWasMasked` reads one
 * field.
 *
 * The `id` matters to what these fixtures are SAYING — the decoy's whole
 * disguise is that it carries a fresh-looking id — but it is not part of the
 * narrow shape the function accepts, and TypeScript checks an object literal
 * for excess properties at the call site. A real caller passes a whole `User`
 * from the client, which is a variable rather than a literal and is therefore
 * never checked that way, so widening the function to silence this would widen
 * it for nobody.
 */
const asUser = (fields: Record<string, unknown>) => fields as { identities?: unknown };

// --- The shapes the provider returns ----------------------------------------
{
  // An address that already belongs to a confirmed account.
  ok(signUpWasMasked(asUser({ id: 'decoy', identities: [] })),
    'an empty identities array is the provider saying "this address is taken", '
    + 'and must never be read as a new account');

  // A genuine new signup.
  ok(!signUpWasMasked(asUser({ id: 'real', identities: [{ id: 'i1', provider: 'email' }] })),
    'one identity is a real new account');

  ok(!signUpWasMasked(asUser({ id: 'several', identities: [{ id: 'i1' }, { id: 'i2' }] })),
    'and so is more than one — a linked identity is not a duplicate');

  /*
   * Absent rather than empty is treated as real, deliberately. Older providers
   * and mocked clients omit the field, and refusing those would break signup
   * for everybody in order to catch a duplicate.
   */
  ok(!signUpWasMasked(asUser({ id: 'no-field' })),
    'a missing identities field is not evidence of anything, so signup proceeds');
  ok(!signUpWasMasked(asUser({ id: 'null-field', identities: null })),
    'nor is a null one');
  ok(!signUpWasMasked(null), 'and no user at all is not a masked signup');
  ok(!signUpWasMasked(undefined), 'nor is undefined');
}

// --- Both surfaces ask the question ------------------------------------------
/*
 * Read off the source because the failure being guarded against is one of the
 * two call sites forgetting. There are exactly two, and they were both wrong.
 */
{
  const web = readFileSync('web/lib/auth-actions.ts', 'utf8');
  ok(/signUpWasMasked\(data\.user\)/.test(web),
    'the website checks for the decoy before believing a signup succeeded');
  ok(/already_registered_or_refused/.test(web),
    'and maps it to the same ambiguous refusal an outright rejection produces');

  const native = readFileSync('src/auth/auth-context.tsx', 'utf8');
  ok(/signUpWasMasked\(data\.user\)/.test(native),
    'the app checks for it too — one rule, both surfaces');
}

// --- And it does not become an enumeration oracle ------------------------------
/*
 * The whole reason the provider masks this is to stop a signup form answering
 * "does this address have an account?" for a stranger. Warsha must not undo
 * that by adding an endpoint of its own, or by telling the person which of the
 * two fields collided.
 */
{
  for (const path of ['web/lib/auth-actions.ts', 'src/auth/auth-context.tsx']) {
    const source = readFileSync(path, 'utf8');
    ok(!/checkEmailExists|checkPhoneExists|emailTaken|phoneTaken/i.test(source),
      `${path}: no endpoint that answers whether an identity exists`);
  }

  const copy = readFileSync('web/lib/app-copy.ts', 'utf8');
  const message = /signUpTrySigningIn: '([^']*)'/.exec(copy)?.[1] ?? '';
  ok(message.length > 0, 'the refusal has a message');
  ok(!/\bemail\b.*\bexists\b|\bphone\b.*\bexists\b|already registered/i.test(message),
    `the message does not confirm an account exists — it said ${JSON.stringify(message)}`);
  ok(/sign in/i.test(message),
    'and it offers the way forward, which is to sign in');
}

console.log(`Signup duplicate account: ${checks} checks passed.`);
