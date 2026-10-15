import type { Status as Kind } from '@backoffice/ui/brand';

import * as styles from './styles';

/** Each status's mark, so it never depends on colour (BRIEF, accessibility). */
const MARKS: Readonly<Record<Kind, string>> = {
  positive: '✓',
  attention: '!',
  negative: '✕',
  info: 'i',
};

/** A status in words, with its mark and colours: "✓ Activa", "✕ Revocada". */
export const Status = ({ kind, label }: { kind: Kind; label: string }) => (
  <span className={styles.status} data-status={kind}>
    <span aria-hidden="true">{MARKS[kind]}</span>
    {label}
  </span>
);
