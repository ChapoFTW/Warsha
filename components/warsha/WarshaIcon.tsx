import { Circle, Ellipse, Path, Rect, Svg } from 'react-native-svg';

import { useThemeColors } from '@/src/appearance/appearance-context';
import {
  WARSHA_ICON_STROKE_WIDTH,
  WARSHA_ICON_VIEWBOX,
  warshaIconElements,
  type WarshaIconElement,
} from '@/src/brand/warsha-icon-geometry';
import {
  WARSHA_FALLBACK_ICON,
  warshaIconSize,
  type WarshaIconSize,
} from '@/src/brand/warsha-icons';

/**
 * An approved Warsha mark, on Android and iOS.
 *
 * ## Why this exists rather than another MaterialIcons call
 *
 * `<MaterialIcons name={category.icon} />` took a string nothing validated —
 * `service_categories.icon_name` held loose names like `window` and `garden` —
 * and a name Material did not recognise rendered an empty box silently. Warsha
 * now has drawn marks of its own for every category and trade, and this is the
 * only thing that draws them.
 *
 * ## Colour
 *
 * The assets are `currentColor` throughout. React Native SVG does not inherit
 * `color` the way a browser does, so the resolved token is passed down
 * explicitly — `textPrimary` by default, which is what a category card and the
 * trade picker both want. A caller wanting a quieter mark passes
 * `colors.textSecondary`; nothing hard-codes a hex, so light, dark and system
 * all work from the one asset.
 *
 * ## Accessibility
 *
 * Decorative by default. Every place this is used already renders the localized
 * category or trade name beside it, and announcing it twice is worse than not
 * announcing it. A caller that genuinely uses the mark as a control with no
 * visible text passes `label`, which turns it into an announced image.
 */
export function WarshaIcon({
  name,
  size = 'lg',
  color,
  label,
}: {
  /** A key from the shared authority — `categoryIconName` / `professionIconName`. */
  name: string;
  size?: WarshaIconSize | number;
  color?: string;
  /** Only when there is no visible text. Localized by the caller. */
  label?: string;
}) {
  const colors = useThemeColors();
  const pixels = typeof size === 'number' ? size : warshaIconSize[size];
  // An unknown key draws the legacy mark rather than nothing. A missing icon
  // must never be a blank space or a raw key in front of a customer.
  const elements = warshaIconElements(name) ?? warshaIconElements(WARSHA_FALLBACK_ICON) ?? [];
  const ink = color ?? colors.textPrimary;

  return (
    <Svg
      width={pixels}
      height={pixels}
      viewBox={WARSHA_ICON_VIEWBOX}
      fill="none"
      stroke={ink}
      strokeWidth={WARSHA_ICON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}>
      {elements.map((element, index) => renderElement(element, index, ink))}
    </Svg>
  );
}

/**
 * One drawn element.
 *
 * `fill: currentColor` marks the family's single solid accent, and it also has
 * to carry `stroke="none"` — a filled shape that keeps the root's stroke reads
 * as a heavier blob at 16px, which is the size the family is meant to survive.
 */
function renderElement(element: WarshaIconElement, index: number, ink: string) {
  const fill = element.fill === 'currentColor' ? ink : 'none';
  const stroke = element.stroke === 'none' ? 'none' : ink;
  const shared = { key: index, fill, stroke, transform: element.transform };

  switch (element.tag) {
    case 'rect':
      return (
        <Rect
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
      return <Circle {...shared} cx={element.cx} cy={element.cy} r={element.r} />;
    case 'ellipse':
      return <Ellipse {...shared} cx={element.cx} cy={element.cy} rx={element.rx} ry={element.ry} />;
    default:
      return <Path {...shared} d={element.d} />;
  }
}
