import { STAFF_ROLES, type StaffRole } from '@/staff-roles';
import * as styles from '@/ui/styles';

/**
 * A role checkbox each, with what the role may do under its name. Native checkboxes in a fieldset, so the group's
 * name and each choice are read out as such; each label is the target with its box. checkedRoles (roles.ts) reads the
 * choice back.
 */
export const RoleCheckboxes = ({
  legend,
  hint,
  names,
  help,
  checked,
  idPrefix,
  invalid,
  describedBy,
}: {
  legend: string;
  hint?: string;
  names: Record<StaffRole, string>;
  help: Record<StaffRole, string>;
  checked: readonly StaffRole[];
  idPrefix: string;
  invalid?: boolean;
  describedBy?: string;
}) => {
  const hintId = `${idPrefix}-roles-hint`;
  const described = [hint ? hintId : undefined, describedBy].filter(Boolean).join(' ') || undefined;
  return (
    <fieldset
      className={styles.fieldset}
      aria-describedby={described}
      aria-invalid={invalid || undefined}
    >
      <legend>{legend}</legend>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {STAFF_ROLES.map((role) => {
        const id = `${idPrefix}-${role}`;
        return (
          <div key={role} className={styles.checkbox}>
            <input
              id={id}
              type="checkbox"
              name="roles"
              value={role}
              defaultChecked={checked.includes(role)}
              aria-describedby={`${id}-help`}
            />
            <label htmlFor={id}>
              <strong>{names[role]}</strong>
            </label>
            <span id={`${id}-help`} className={styles.checkboxHelp}>
              {help[role]}
            </span>
          </div>
        );
      })}
    </fieldset>
  );
};
