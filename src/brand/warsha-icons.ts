import {
  professions,
  withdrawnProfessions,
} from '../providers/profession-taxonomy.ts';
import {
  LEGACY_CATEGORY_IDS,
  SERVICE_DEMAND_ORDER,
} from '../services/service-catalogue.ts';
import { warshaIconElements, type WarshaIconName } from './warsha-icon-geometry.ts';

/**
 * Which approved mark stands for a category or a trade.
 *
 * ## Identity, not filenames and not glyph names
 *
 * Warsha used `@expo/vector-icons` Material glyph names, carried in
 * `service_categories.icon_name` and rendered as `<MaterialIcons name={...}>`.
 * Three things were wrong with that as an authority. The column held loose
 * names (`window`, `garden`, `lock`) that nothing validated, so a typo or a
 * renamed glyph rendered an empty box with no error. Every surface reached for
 * its own name — `category.icon`, `category.iconName`, `item.icon as never` —
 * so the same category could be drawn differently on two screens. And a
 * profession had no icon at all: the trade picker was a list of checkboxes.
 *
 * The identity here is a stable icon key, `service-<categoryId>` or
 * `profession-<kebab-key>`, which is also the asset's filename stem, so the
 * mapping is derivable from the row rather than maintained beside it.
 *
 * ## Inheritance is the rule, not a fallback
 *
 * The design package draws sixteen trades that are visibly their own thing and
 * says the rest are the practitioner form of exactly one category — a second
 * drawing of the same object would only add noise to the picker. So:
 *
 *     professionIcon(key) = override[key] ?? categoryIcon(categoryOf(key))
 *
 * That is the approved resolution rule, applied here once. It is not a
 * fallback: eighteen trades resolve through it deliberately, and
 * `warsha-icons.test.mts` asserts every selectable trade resolves one way or
 * the other, so a trade added later cannot quietly land on the unknown mark.
 *
 * ## RTL
 *
 * Nothing in this family mirrors. The package reviewed the directional-looking
 * marks — satellite dish, saw, hand plane, key, shears, trowels, camera lens —
 * and concluded the direction belongs to the object, not to reading order. So
 * the flag is global and false rather than per icon, and no renderer applies a
 * transform in Arabic.
 */

/** The one mark a caller may fall back to, and the only one for history. */
export const WARSHA_FALLBACK_ICON = 'legacy-general-maintenance' satisfies WarshaIconName;

/** No icon in the family mirrors. Global, per the approved RTL guidance. */
export const WARSHA_ICONS_MIRROR_IN_RTL = false;

/**
 * Trades that are visibly their own thing.
 *
 * Kept as an explicit list rather than derived from which files exist, so
 * adding an asset cannot silently change what a trade resolves to — the
 * decision is recorded here and the test checks the file backs it up.
 */
const PROFESSION_ICON_OVERRIDES: Record<string, WarshaIconName> = {
  constructionWorker: 'profession-construction-worker',
  flooringSpecialist: 'profession-flooring-specialist',
  furnitureMaker: 'profession-furniture-maker',
  furnitureRepairer: 'profession-furniture-repairer',
  glassWorker: 'profession-glass-worker',
  gypsumWorker: 'profession-gypsum-worker',
  homeElectronicsTechnician: 'profession-home-electronics',
  interiorDecorator: 'profession-interior-decorator',
  landscaper: 'profession-landscaper',
  mason: 'profession-mason',
  poolTechnician: 'profession-pool-technician',
  securitySystemTechnician: 'profession-security-system',
  smartHomeTechnician: 'profession-smart-home',
  tiler: 'profession-tiler',
  upholsterer: 'profession-upholsterer',
  welder: 'profession-welder',
};

const categoryOfProfession = new Map<string, string>(
  professions.map((profession) => [profession.key, profession.categoryId]),
);
const withdrawnProfessionKeys = new Set<string>(
  withdrawnProfessions.map((profession) => profession.key),
);
const legacyCategories = new Set<string>(LEGACY_CATEGORY_IDS);

/** Whether the family actually ships this mark. */
export function isWarshaIcon(name: string): name is WarshaIconName {
  return warshaIconElements(name) !== null;
}

/**
 * The mark for a service category.
 *
 * A withdrawn category resolves to the legacy mark rather than to nothing: an
 * old request still has to render. A category this build has never heard of —
 * one seeded after it shipped — resolves there too, which is the one case the
 * fallback exists for.
 */
export function categoryIconName(categoryId: string): WarshaIconName {
  if (legacyCategories.has(categoryId)) return WARSHA_FALLBACK_ICON;
  const candidate = `service-${categoryId}`;
  return isWarshaIcon(candidate) ? candidate : WARSHA_FALLBACK_ICON;
}

/**
 * The mark for a trade: its own, or its category's.
 *
 * A withdrawn trade — `handyman`, `generalMaintenance` — resolves to the legacy
 * mark, so a worker who still holds one reads as something rather than as a
 * blank, without that mark ever being offered for new work.
 */
export function professionIconName(professionKey: string): WarshaIconName {
  const override = PROFESSION_ICON_OVERRIDES[professionKey];
  if (override) return override;
  if (withdrawnProfessionKeys.has(professionKey)) return WARSHA_FALLBACK_ICON;
  const categoryId = categoryOfProfession.get(professionKey);
  return categoryId ? categoryIconName(categoryId) : WARSHA_FALLBACK_ICON;
}

/** Whether this trade draws its own mark rather than inheriting one. */
export function professionHasOwnIcon(professionKey: string): boolean {
  return professionKey in PROFESSION_ICON_OVERRIDES;
}

/**
 * Every mark the product can currently reach, for the contact sheet and tests.
 *
 * Built from the catalogue rather than from the asset directory, so an asset
 * nothing maps to shows up as unused and a catalogue entry with no asset shows
 * up as missing — the two failures a mapping is supposed to make visible.
 */
export function warshaIconCoverage() {
  return {
    categories: SERVICE_DEMAND_ORDER.map((id) => ({ id, icon: categoryIconName(id) })),
    professions: professions.map((profession) => ({
      key: profession.key,
      icon: professionIconName(profession.key),
      own: professionHasOwnIcon(profession.key),
      inheritedFrom: professionHasOwnIcon(profession.key) ? null : profession.categoryId,
    })),
    withdrawnProfessions: withdrawnProfessions.map((profession) => ({
      key: profession.key,
      icon: professionIconName(profession.key),
    })),
  };
}

/**
 * The size steps a Warsha surface may draw an icon at.
 *
 * Named rather than numeric at the call site so the containers stay consistent:
 * the package specifies a 48px category card holding a 24px icon, bare 20px in
 * list rows and result cards, and 24px in the trade picker aligned to the
 * label's cap height. `sm` exists for the 14px inline chip that search already
 * draws. Nothing outside this set is a size the design covers.
 */
export const warshaIconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export type WarshaIconSize = keyof typeof warshaIconSize;
