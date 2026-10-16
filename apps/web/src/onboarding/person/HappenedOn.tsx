import * as ui from '@/ui/styles';

import type { PersonPageText } from './text';

/**
 * "Cuándo fue (opcional)": the day something happened, if it wasn't today (PLAN M5), for contact attempts, notes and
 * stage changes. Never a day to come; empty is today. The history shows it, next to when it was written.
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
      aria-describedby={`${id}-hint`}
    />
    <span id={`${id}-hint`} className={ui.hint}>
      {text.happened.hint}
    </span>
  </div>
);
