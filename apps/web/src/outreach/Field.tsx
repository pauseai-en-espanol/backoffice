import { describedBy } from '@/auth/client';
import * as onboarding from '@/onboarding/styles';
import * as ui from '@/ui/styles';

import * as styles from './styles';

/**
 * A labelled text field as the outreach forms use it: its hint under the label's field, described by the hint and, once
 * there is one, the form's error (`errorId`); `invalid` when the API or the page refused it by name.
 */
export const Field = ({
  id,
  name,
  label,
  hint,
  defaultValue,
  required = false,
  maxLength,
  type = 'text',
  multiline = false,
  large = false,
  invalid = false,
  errorId,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  maxLength?: number;
  type?: 'text' | 'email' | 'url' | 'tel' | 'date' | 'number';
  multiline?: boolean;
  /** A letter's body: a tall box. */
  large?: boolean;
  invalid?: boolean;
  errorId?: string;
}) => {
  const hintId = hint ? `${id}-pista` : undefined;
  const common = {
    id,
    name,
    defaultValue: defaultValue ?? '',
    required,
    maxLength,
    'aria-invalid': invalid,
    'aria-describedby': describedBy(hintId, errorId),
  };
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea
          className={large ? `${onboarding.textarea} ${styles.bodyArea}` : onboarding.textarea}
          {...common}
        />
      ) : (
        <input
          className={ui.input}
          type={type}
          {...(type === 'number' ? { min: 1, step: 1, inputMode: 'numeric' as const } : {})}
          {...common}
        />
      )}
      {hint ? (
        <span id={hintId} className={ui.hint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
};

/** A labelled select of known values, each in words. */
export const Select = <V extends string>({
  id,
  name,
  label,
  hint,
  values,
  names,
  defaultValue,
  empty,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  values: readonly V[];
  names: Readonly<Record<V, string>>;
  defaultValue?: string;
  /** The words for choosing none, when none may be chosen. */
  empty?: string;
}) => {
  const hintId = hint ? `${id}-pista` : undefined;
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        className={onboarding.select}
        defaultValue={defaultValue ?? ''}
        aria-describedby={hintId}
      >
        {empty === undefined ? null : <option value="">{empty}</option>}
        {values.map((value) => (
          <option key={value} value={value}>
            {names[value]}
          </option>
        ))}
      </select>
      {hint ? (
        <span id={hintId} className={ui.hint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
};

/** A staff member to own something, or nobody; the current owner stays choosable even if they left the team since. */
export const OwnerSelect = ({
  id,
  label,
  owners,
  current,
  none,
}: {
  id: string;
  label: string;
  owners: readonly { userId: string; displayName: string }[];
  current: { userId: string; displayName: string } | null;
  none: string;
}) => {
  const all =
    current && !owners.some((owner) => owner.userId === current.userId)
      ? [...owners, current]
      : owners;
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        name="ownerId"
        className={onboarding.select}
        defaultValue={current?.userId ?? ''}
      >
        <option value="">{none}</option>
        {all.map((owner) => (
          <option key={owner.userId} value={owner.userId}>
            {owner.displayName || owner.userId}
          </option>
        ))}
      </select>
    </div>
  );
};
