import type { Status as Kind } from '@backoffice/ui/brand';
import type { LucideIcon } from 'lucide-react';

import { Check, Info, TriangleAlert, X } from 'lucide-react';

import { Icon } from './Icon';
import * as styles from './styles';

/** Each status's icon, so it never depends on colour (BRIEF, accessibility; PLAN R61). */
const ICONS: Readonly<Record<Kind, LucideIcon>> = {
  positive: Check,
  attention: TriangleAlert,
  negative: X,
  info: Info,
};

/** A status in words, with its icon and colours: "✓ Activa", "✕ Revocada". */
export const Status = ({ kind, label }: { kind: Kind; label: string }) => (
  <span className={styles.status} data-status={kind}>
    <Icon icon={ICONS[kind]} size={14} />
    {label}
  </span>
);
