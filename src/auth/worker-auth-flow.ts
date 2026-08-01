import type { TranslationKey } from '@/src/i18n/translations';

export type WorkerAuthStage = 'PHONE_ENTRY' | 'CODE_SENT' | 'OTP_ENTRY' | 'VERIFYING' | 'VERIFIED';
type WorkerAuthErrorScope = 'phone' | 'otp';

export type WorkerAuthFlowState = {
  stage: WorkerAuthStage;
  errorKey: TranslationKey | null;
  errorScope: WorkerAuthErrorScope | null;
};

export type WorkerAuthFlowEvent =
  | { type: 'RESET' | 'PHONE_CHANGED' | 'PATH_SWITCHED' | 'REMOUNTED' }
  | { type: 'SEND_STARTED' | 'SEND_SUCCEEDED' | 'OTP_PRESENTED' }
  | { type: 'SEND_FAILED'; errorKey: TranslationKey }
  | { type: 'OTP_CHANGED' | 'VERIFY_STARTED' }
  | { type: 'VERIFY_FAILED'; errorKey: TranslationKey }
  | { type: 'RESEND_STARTED' | 'RESEND_SUCCEEDED' }
  | { type: 'RESEND_FAILED'; errorKey: TranslationKey }
  | { type: 'VERIFIED' };

const OTP_ONLY_ERRORS = new Set<TranslationKey>(['authInvalidOtp', 'authOtpExpired']);

export function createWorkerAuthFlow(): WorkerAuthFlowState {
  return { stage: 'PHONE_ENTRY', errorKey: null, errorScope: null };
}

function phoneStageError(errorKey: TranslationKey): TranslationKey {
  return OTP_ONLY_ERRORS.has(errorKey) ? 'authServerError' : errorKey;
}

export function transitionWorkerAuthFlow(state: WorkerAuthFlowState, event: WorkerAuthFlowEvent): WorkerAuthFlowState {
  switch (event.type) {
    case 'RESET':
    case 'PHONE_CHANGED':
    case 'PATH_SWITCHED':
    case 'REMOUNTED':
      return createWorkerAuthFlow();
    case 'SEND_STARTED':
      return { stage: 'PHONE_ENTRY', errorKey: null, errorScope: null };
    case 'SEND_SUCCEEDED':
    case 'RESEND_SUCCEEDED':
      return { stage: 'CODE_SENT', errorKey: null, errorScope: null };
    case 'OTP_PRESENTED':
      return state.stage === 'CODE_SENT' ? { stage: 'OTP_ENTRY', errorKey: null, errorScope: null } : state;
    case 'SEND_FAILED':
    case 'RESEND_FAILED':
      return { stage: 'PHONE_ENTRY', errorKey: phoneStageError(event.errorKey), errorScope: 'phone' };
    case 'OTP_CHANGED':
      return state.errorScope === 'otp' ? { ...state, errorKey: null, errorScope: null } : state;
    case 'VERIFY_STARTED':
      return state.stage === 'OTP_ENTRY' ? { stage: 'VERIFYING', errorKey: null, errorScope: null } : state;
    case 'VERIFY_FAILED':
      return { stage: 'OTP_ENTRY', errorKey: event.errorKey, errorScope: 'otp' };
    case 'RESEND_STARTED':
      return { stage: 'OTP_ENTRY', errorKey: null, errorScope: null };
    case 'VERIFIED':
      return { stage: 'VERIFIED', errorKey: null, errorScope: null };
  }
}

export function workerOtpVisible(state: WorkerAuthFlowState) {
  return state.stage === 'OTP_ENTRY' || state.stage === 'VERIFYING';
}

export function workerAuthVisibleErrorKey(state: WorkerAuthFlowState): TranslationKey | null {
  if (state.stage === 'PHONE_ENTRY') return state.errorScope === 'phone' ? state.errorKey : null;
  if (state.stage === 'OTP_ENTRY' || state.stage === 'VERIFYING') return state.errorScope === 'otp' ? state.errorKey : null;
  return null;
}
