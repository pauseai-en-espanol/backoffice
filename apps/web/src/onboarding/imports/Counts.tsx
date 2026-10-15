import { Fragment } from 'react';

import * as styles from '../styles';

/** The order counts are listed in; any other the API adds goes after, by its own name. */
const ORDER = [
  'received',
  'created',
  'attached',
  'review',
  'conflict',
  'updated',
  'unchanged',
  'erased',
  'skipped',
  'discarded',
  'invalid',
];

/** An import's counts, each with its words ("Fichas nuevas: 3"). Usable from server and client components. */
export const Counts = ({
  counts,
  labels,
}: {
  counts: Readonly<Record<string, number>>;
  labels: Readonly<Record<string, string>>;
}) => {
  const keys = Object.keys(counts).sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    return (ia === -1 ? ORDER.length : ia) - (ib === -1 ? ORDER.length : ib);
  });
  return keys.length === 0 ? null : (
    <dl className={styles.counts}>
      {keys.map((key) => (
        <Fragment key={key}>
          <dt>{labels[key] ?? key}</dt>
          <dd>{counts[key]}</dd>
        </Fragment>
      ))}
    </dl>
  );
};
