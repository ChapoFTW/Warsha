import { BrandLockup, BrandMark, BrandWordmark, type BrandVariant } from './BrandMark';

type BrandLogoProps = {
  size?: number;
  variant?: BrandVariant;
  wordmark?: boolean;
  /** Retained for call-site compatibility; the obsolete tagline is intentionally never rendered. */
  tagline?: boolean;
  layout?: 'horizontal' | 'stacked';
};

/** @deprecated Prefer BrandMark, BrandWordmark, or BrandLockup for new code. */
export function BrandIcon({ size = 40, variant = 'light' }: Pick<BrandLogoProps, 'size' | 'variant'>) {
  return <BrandMark size={size} variant={variant} />;
}

export { BrandWordmark };

/** Compatibility wrapper while existing screens migrate to explicit brand primitives. */
export function BrandLogo({
  size = 40,
  variant = 'light',
  wordmark = false,
  layout = 'horizontal',
}: BrandLogoProps) {
  return wordmark
    ? <BrandLockup size={size} variant={variant} layout={layout} />
    : <BrandMark size={size} variant={variant} />;
}

export { BrandLockup, BrandMark };
