import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  initialProviderMediaState,
  PROVIDER_CARD_MAX_WIDTH,
  PROVIDER_CARD_MIN_WIDTH,
  PROVIDER_MEDIA_HEIGHT,
  providerCardWidth,
  reduceProviderMediaState,
  shouldRenderProviderMedia,
} from '../components/warsha/provider-card-media.ts';

const validImage = 'https://cdn.example.com/provider.jpg';
assert.equal(initialProviderMediaState(validImage), 'loading', 'valid provider image starts in loading state');
assert.equal(shouldRenderProviderMedia(initialProviderMediaState(validImage)), true, 'valid image reserves compact media while loading');
assert.equal(reduceProviderMediaState('loading', 'loaded'), 'loaded', 'valid image transitions to loaded');
assert.equal(initialProviderMediaState(''), 'missing', 'empty image URI is missing');
assert.equal(initialProviderMediaState('not-a-uri'), 'missing', 'invalid image URI is missing');
assert.equal(shouldRenderProviderMedia('missing'), false, 'missing image collapses the media area');
assert.equal(reduceProviderMediaState('loading', 'failed'), 'failed', 'broken image URI records a failure');
assert.equal(shouldRenderProviderMedia('failed'), false, 'broken image collapses the media area');
assert.equal(shouldRenderProviderMedia('loading'), true, 'loading skeleton exists only while a real image loads');
assert.equal(providerCardWidth(320), PROVIDER_CARD_MIN_WIDTH, 'small iPhone width uses compact minimum card width');
assert.equal(providerCardWidth(390), 273, 'normal iPhone width shows a complete compact horizontal card');
assert.equal(providerCardWidth(1024), PROVIDER_CARD_MAX_WIDTH, 'large screens cap horizontal card width');
assert.ok(PROVIDER_MEDIA_HEIGHT <= 128, 'provider media stays compact on a small iPhone viewport');

const source = readFileSync('components/warsha/ProviderCard.tsx', 'utf8');
assert.match(source, /contentFit="cover"/, 'valid images crop consistently');
assert.match(source, /onLoadStart=/, 'image loading state is explicit');
assert.match(source, /onError=/, 'broken images have an explicit fallback transition');
assert.match(source, /mediaState === 'loading'/, 'skeleton is gated by genuine loading state');
assert.match(source, /avatarFallback/, 'missing images use a compact monochrome identity fallback');
assert.doesNotMatch(source, /height:\s*386|StyleSheet\.absoluteFillObject[\s\S]{0,80}imageShade/, 'card no longer reserves a giant full-card media layer');
assert.doesNotMatch(source, /BrandMark|BrandLogo|BrandLockup/, 'Warsha logo is not used as a provider placeholder');

console.log('Provider card media regression tests passed: valid, missing, broken, loading, list sizing, and small viewport.');
