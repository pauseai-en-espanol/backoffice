import * as styles from '@/ui/styles';

/**
 * "Solo tú lo ves" on a note or an organisation that is the reader's alone (PLAN M5, step 6): in words, with a lock
 * that is only decoration, never by colour alone.
 */
export const PrivateMark = ({ label }: { label: string }) => (
  <span className={`${styles.block} ${styles.hint}`}>
    <span aria-hidden="true">🔒 </span>
    {label}
  </span>
);
