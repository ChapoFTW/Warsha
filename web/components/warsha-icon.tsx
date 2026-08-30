import {
  WARSHA_ICON_STROKE_WIDTH,
  WARSHA_ICON_VIEWBOX,
  warshaIconElements,
  type WarshaIconElement,
} from '@/src/brand/warsha-icon-geometry.ts';
import {
  WARSHA_FALLBACK_ICON,
  warshaIconSize,
  type WarshaIconSize,
} from '@/src/brand/warsha-icons.ts';

/**
 * An approved Warsha mark, in the browser.
 *
 * The web counterpart of the native `WarshaIcon`. Same geometry module, same
 * keys, same fallback — only the rendering primitive differs, which is the
 * whole point of compiling the assets to data: the two surfaces cannot drift
 * into drawing different marks for the same category.
 *
 * Colour is left to `currentColor`, which is what a browser is good at: the
 * mark takes the ink of whatever it sits in, so light, dark and system come
 * from the page's own tokens with no prop to pass and nothing to keep in sync.
 *
 * Decorative by default — every use renders the localized name beside it, and
 * a second announcement of the same word helps nobody. `label` promotes it to
 * an announced image for the rare case where the mark stands alone.
 */
export function WarshaIcon({
  name,
  size = 'lg',
  label,
  className,
}: {
  name: string;
  size?: WarshaIconSize | number;
  label?: string;
  className?: string;
}) {
  const pixels = typeof size === 'number' ? size : warshaIconSize[size];
  const elements = warshaIconElements(name) ?? warshaIconElements(WARSHA_FALLBACK_ICON) ?? [];

  return (
    <svg
      className={className}
      width={pixels}
      height={pixels}
      viewBox={WARSHA_ICON_VIEWBOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={WARSHA_ICON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {elements.map(renderElement)}
    </svg>
  );
}

function renderElement(element: WarshaIconElement, index: number) {
  // `key` is deliberately NOT part of `shared`. React does not read a key out
  // of a spread object -- it warns and falls back to no key at all, so a list
  // of icon elements reconciles by position instead of identity. It is passed
  // directly on each element below.
  const shared = {
    
    fill: element.fill === 'currentColor' ? 'currentColor' : 'none',
    stroke: element.stroke === 'none' ? 'none' : undefined,
    transform: element.transform,
  };
  switch (element.tag) {
    case 'rect':
      return (
        <rect
          key={index}
          {...shared}
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          rx={element.rx}
          ry={element.ry}
        />
      );
    case 'circle':
      return <circle key={index} {...shared} cx={element.cx} cy={element.cy} r={element.r} />;
    case 'ellipse':
      return <ellipse key={index} {...shared} cx={element.cx} cy={element.cy} rx={element.rx} ry={element.ry} />;
    default:
      return <path key={index} {...shared} d={element.d} />;
  }
}
