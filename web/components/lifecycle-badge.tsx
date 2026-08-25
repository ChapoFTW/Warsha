import type { LifecycleSemantic } from '@/src/lifecycle/lifecycle-presentation';

import styles from './product-surface.module.css';

const semanticClass: Record<LifecycleSemantic, string> = {
  neutral: styles.statusNeutral,
  active: styles.statusActive,
  attention: styles.statusAttention,
  confirmed: styles.statusConfirmed,
  complete: styles.statusComplete,
  destructive: styles.statusDestructive,
  expired: styles.statusExpired,
};

/** A status badge. Category and service metadata must keep using `.workLabel`. */
export function LifecycleBadge({ label, semantic }: { label: string; semantic: LifecycleSemantic }) {
  return <span className={`${styles.badge} ${styles.lifecycleBadge} ${semanticClass[semantic]}`}>{label}</span>;
}
