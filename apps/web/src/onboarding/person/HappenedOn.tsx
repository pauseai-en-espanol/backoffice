import * as ui from '@/ui/styles';

import type { PersonPageText } from './text';

/**
 * "Cuándo fue": the day something happened (PLAN M5), for contact attempts, notes and stage changes; today to start
 * with (PLAN R73), changed if it was another day. Never a day to come. The history shows another day, next to when it
 * was written.
 */
export const HappenedOn = ({ id, text }: { id: string; text: PersonPageText }) => (
  <div className={ui.field}>
    <label className={ui.label} htmlFor={id}>
      {text.happened.label}
    </label>
    <input
      id={id}
      className={ui.input}
      type="date"
      name="happenedOn"
      max={text.happened.today}
      defaultValue={text.happened.today}
      aria-describedby={`${id}-hint`}
    />
    <span id={`${id}-hint`} className={ui.hint}>
      {text.happened.hint}
    </span>
  </div>
);
