import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createWorkerAuthFlow,
  transitionWorkerAuthFlow,
  workerAuthVisibleErrorKey,
  workerOtpVisible,
} from '../src/auth/worker-auth-flow.ts';

const fresh = createWorkerAuthFlow();
assert.equal(fresh.stage, 'PHONE_ENTRY', 'fresh worker sign-in starts at phone entry');
assert.equal(workerAuthVisibleErrorKey(fresh), null, 'fresh worker sign-in has no error');
assert.equal(workerOtpVisible(fresh), false, 'fresh worker sign-in hides the OTP field');
const sending = transitionWorkerAuthFlow(fresh, { type: 'SEND_STARTED' });
const codeSent = transitionWorkerAuthFlow(sending, { type: 'SEND_SUCCEEDED' });
assert.equal(codeSent.stage, 'CODE_SENT', 'successful send records CODE_SENT');
const otpEntry = transitionWorkerAuthFlow(codeSent, { type: 'OTP_PRESENTED' });
assert.equal(otpEntry.stage, 'OTP_ENTRY', 'successful send presents OTP entry');
assert.equal(workerOtpVisible(otpEntry), true, 'OTP field is visible in OTP_ENTRY');
const verifying = transitionWorkerAuthFlow(otpEntry, { type: 'VERIFY_STARTED' });
assert.equal(verifying.stage, 'VERIFYING', 'OTP submission enters VERIFYING');
const invalidCode = transitionWorkerAuthFlow(verifying, { type: 'VERIFY_FAILED', errorKey: 'authInvalidOtp' });
assert.equal(invalidCode.stage, 'OTP_ENTRY', 'invalid code keeps the user in OTP_ENTRY');
assert.equal(workerOtpVisible(invalidCode), true, 'invalid code is shown only with the OTP field visible');
assert.equal(workerAuthVisibleErrorKey(invalidCode), 'authInvalidOtp', 'invalid-code copy is visible at OTP entry');
const editedPhone = transitionWorkerAuthFlow(invalidCode, { type: 'PHONE_CHANGED' });
assert.equal(editedPhone.stage, 'PHONE_ENTRY', 'editing phone returns to phone entry');
assert.equal(workerAuthVisibleErrorKey(editedPhone), null, 'editing phone clears OTP error');
const staleOtpAtPhoneEntry = { ...fresh, errorKey: 'authInvalidOtp' as const, errorScope: 'otp' as const };
assert.equal(workerAuthVisibleErrorKey(staleOtpAtPhoneEntry), null, 'stale invalid OTP cannot render at phone entry');
const sendFailure = transitionWorkerAuthFlow(fresh, { type: 'SEND_FAILED', errorKey: 'authNetworkError' });
assert.equal(sendFailure.stage, 'PHONE_ENTRY', 'failed send remains at phone entry');
assert.equal(workerAuthVisibleErrorKey(sendFailure), 'authNetworkError', 'failed send keeps its specific send-stage error');
const impossibleOtpSendFailure = transitionWorkerAuthFlow(fresh, { type: 'SEND_FAILED', errorKey: 'authInvalidOtp' });
assert.equal(workerAuthVisibleErrorKey(impossibleOtpSendFailure), 'authServerError', 'send endpoint cannot leak invalid-code copy');
const resend = transitionWorkerAuthFlow(invalidCode, { type: 'RESEND_STARTED' });
assert.equal(resend.stage, 'OTP_ENTRY', 'resend keeps OTP entry visible');
assert.equal(workerAuthVisibleErrorKey(resend), null, 'resend clears invalid/expired code error');
const changedOtp = transitionWorkerAuthFlow(invalidCode, { type: 'OTP_CHANGED' });
assert.equal(workerAuthVisibleErrorKey(changedOtp), null, 'editing OTP clears the prior OTP error');
const verified = transitionWorkerAuthFlow(verifying, { type: 'VERIFIED' });
assert.equal(verified.stage, 'VERIFIED', 'successful OTP enters VERIFIED');
assert.equal(workerAuthVisibleErrorKey(verified), null, 'successful OTP clears all errors');
assert.deepEqual(transitionWorkerAuthFlow(invalidCode, { type: 'PATH_SWITCHED' }), fresh, 'switching Customer/Worker clears transient auth state');
assert.deepEqual(transitionWorkerAuthFlow(invalidCode, { type: 'REMOUNTED' }), fresh, 'screen remount does not restore stale error');

const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');
assert.match(profile, /useFocusEffect/, 'route focus resets worker transient state');
assert.match(profile, /onChangeText=\{changeWorkerPhone\}/, 'phone edits use the stage-clearing handler');
assert.match(profile, /workerErrorKey \?/, 'worker UI renders only stage-scoped error state');
assert.match(profile, /workerFlow\.stage === 'VERIFYING' \? <BrandLoadingMark size=\{20\}/, 'button loading mark is restrained and verification-only');
assert.match(profile, /busy \? <AppText style=\{styles\.dark\}>\{at\('sendingCode'\)\}/, 'send-in-progress keeps an action label instead of a giant logo');

console.log('Worker auth stage regression tests passed: phone, send, OTP, resend, verify, switch, and remount states.');
