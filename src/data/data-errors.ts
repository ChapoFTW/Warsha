import { isRequestTimeout } from '@/src/data/request-policy';
import type { TranslationKey } from '@/src/i18n/translations';
type ErrorLike={message?:string;code?:string;status?:number};
/**
 * A bounded request that ran out of time is the same thing, to the person
 * holding the phone, as being offline: the connection did not deliver an
 * answer, and trying again is the sensible next move. It is checked first
 * because its message does not contain the words the text match looks for.
 */
export function dataErrorKey(reason:unknown):TranslationKey{if(isRequestTimeout(reason))return 'authNetworkError';const error=reason as ErrorLike;const text=(error?.message??'').toLowerCase();if(text.includes('fetch')||text.includes('network')||text.includes('offline'))return 'authNetworkError';if(error?.status===401||error?.status===403||text.includes('jwt'))return 'authRequired';if(error?.status===409||error?.code==='23505'||text.includes('duplicate'))return 'genericTryAgain';if(error?.status&&error.status>=500)return 'authServerError';return 'genericTryAgain'}
export function logDataError(scope:string,reason:unknown){if(__DEV__){const error=reason as ErrorLike;console.warn(`[Warsha ${scope}]`,{code:error?.code,status:error?.status,message:error?.message})}}
