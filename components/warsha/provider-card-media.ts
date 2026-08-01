export const PROVIDER_CARD_MIN_WIDTH = 238;
export const PROVIDER_CARD_MAX_WIDTH = 278;
export const PROVIDER_MEDIA_HEIGHT = 128;

export type ProviderMediaState = 'missing' | 'loading' | 'loaded' | 'failed';
export type ProviderMediaEvent = 'load-start' | 'loaded' | 'failed';

export function isValidProviderImageUri(uri: string | null | undefined) {
  return /^(?:https?:\/\/|file:\/\/|content:\/\/|data:image\/)/i.test(uri?.trim() ?? '');
}

export function initialProviderMediaState(uri: string | null | undefined): ProviderMediaState {
  return isValidProviderImageUri(uri) ? 'loading' : 'missing';
}

export function reduceProviderMediaState(state: ProviderMediaState, event: ProviderMediaEvent): ProviderMediaState {
  if (state === 'missing') return 'missing';
  if (event === 'failed') return 'failed';
  if (event === 'loaded') return 'loaded';
  return 'loading';
}

export function shouldRenderProviderMedia(state: ProviderMediaState) {
  return state === 'loading' || state === 'loaded';
}

export function providerCardWidth(viewportWidth: number) {
  const pageWidth = Math.min(Math.max(viewportWidth, 0), 720);
  return Math.min(PROVIDER_CARD_MAX_WIDTH, Math.max(PROVIDER_CARD_MIN_WIDTH, pageWidth * 0.7));
}
