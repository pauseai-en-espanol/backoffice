import * as styles from './styles';

/**
 * A form's or a button's refusal, announced as it appears (role="alert"; fields name it in aria-describedby), in words
 * with its mark. Rendered empty until there is one, so the live region exists before its message does.
 */
export const FormError = ({ id, message }: { id?: string; message: string | undefined }) => (
  <div id={id} role="alert">
    {message ? (
      <p className={styles.alert}>
        <span aria-hidden="true">⚠ </span>
        {message}
      </p>
    ) : null}
  </div>
);
