/**
 * Capability identifiers, made readable.
 *
 * `manage_kill_switches` is a database key. It is precise, it is what every
 * grant and every refusal is written against, and it is not something an
 * operator should have to decode. The identifier stays the authority; this is
 * only how it is spoken.
 *
 * The explanation is not invented here either. Admin help articles already
 * declare which capabilities they cover, so the manual that documents a power
 * is the same text offered next to it. The articles are passed in rather than
 * imported so this module stays free of bundler path aliases and can be tested
 * directly.
 */

/** `manage_kill_switches` → `Manage kill switches`. */
export function capabilityLabel(capability: string): string {
  const words = capability.replace(/_/g, ' ').trim();
  if (!words) return capability;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type HelpArticle = { id: string; title: string; capabilities?: string[] };
export type CapabilityHelp = { id: string; title: string };

/**
 * Builds the capability → manual-section lookup once.
 *
 * The first article that claims a capability wins, which keeps the mapping
 * stable as more articles are written against the same power.
 */
export function buildCapabilityHelp(
  articles: HelpArticle[],
): (capability: string) => CapabilityHelp | null {
  const byCapability = new Map<string, CapabilityHelp>();
  for (const article of articles) {
    for (const capability of article.capabilities ?? []) {
      if (!byCapability.has(capability)) {
        byCapability.set(capability, { id: article.id, title: article.title });
      }
    }
  }
  return (capability) => byCapability.get(capability) ?? null;
}
