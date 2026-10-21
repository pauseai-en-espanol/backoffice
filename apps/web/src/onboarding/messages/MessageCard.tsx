'use client';

import type { MessagePurpose } from '@backoffice/domain/message-templates';

import { fill } from '@/fill';
import { PrivateMark } from '@/outreach/PrivateMark';
import { useDisclosure } from '@/outreach/useDisclosure';
import { ConfirmAction } from '@/ui/ConfirmAction';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { MessageTemplate } from '../types';
import type { MessagesPageText } from './text';

import { changeMessageTemplate } from './actions';
import { MessageEditor } from './MessageEditor';
import * as styles from './styles';

/**
 * A message in Mensajes (PLAN M5): its title, whether it's the reader's own (PLAN R71), its version (worded by the
 * page), what it says and, when it names someone, what someone without a name gets. Rewritten in place; retired after
 * a question (it stops being offered, and the history still names it), or put back in use, by whoever may write it:
 * its own person, or an admin for the team's. To anyone else, the team's says who changes it.
 */
export const MessageCard = ({
  template,
  version,
  editable,
  me,
  text,
}: {
  template: MessageTemplate;
  /** "Versión 2, del 16 de octubre de 2026, de Ana", worded by the page. */
  version: string;
  /** Whether the reader may change it: their own, or the team's for an admin. */
  editable: boolean;
  me: string;
  text: MessagesPageText;
}) => {
  const { open, heading, opener, show, hide } = useDisclosure();
  const write = useWrite(text.errors);
  const name = { title: template.title };

  return (
    <article className={ui.card} aria-labelledby={`mensaje-${template.id}-titulo`}>
      <h3 id={`mensaje-${template.id}-titulo`} className={ui.h3}>
        {template.title}
      </h3>
      {template.mine ? <PrivateMark label={text.ownMark} /> : null}
      <p className={ui.hint}>{version}</p>
      <div className={styles.message}>{template.body}</div>
      {template.bodyNameless === null ? null : (
        <div>
          <p className={ui.label}>{text.bodyNameless}</p>
          <div className={styles.message}>{template.bodyNameless}</div>
        </div>
      )}
      {!editable ? (
        <p className={ui.hint}>{text.teamReadOnly}</p>
      ) : open ? (
        <MessageEditor
          purpose={template.purpose}
          template={template}
          chooseWhose={false}
          me={me}
          heading={heading}
          title={fill(text.editFor, name)}
          text={text}
          onDone={hide}
        />
      ) : (
        <div className={ui.rowActions}>
          <button
            ref={opener}
            type="button"
            className={ui.secondaryButton}
            aria-label={fill(text.editFor, name)}
            onClick={show}
          >
            {text.edit}
          </button>
          {template.active ? (
            <ConfirmAction
              label={fill(text.retireFor, name)}
              text={{
                question: fill(text.retireQuestion, name),
                confirm: text.retire,
                cancel: text.cancel,
                done: text.retired,
                errors: text.errors,
              }}
              run={() => changeMessageTemplate(template.id, { active: false })}
            />
          ) : (
            <button
              type="button"
              className={ui.secondaryButton}
              aria-disabled={write.pending}
              aria-label={fill(text.restoreFor, name)}
              onClick={() =>
                void write.run(() => changeMessageTemplate(template.id, { active: true }), {
                  done: text.restored,
                })
              }
            >
              {text.restore}
            </button>
          )}
        </div>
      )}
      <FormError message={write.error} />
    </article>
  );
};

/** A new message for a purpose, written in place behind its button: one's own, or for an admin the team's too. */
export const NewMessage = ({
  purpose,
  chooseWhose,
  me,
  text,
}: {
  purpose: MessagePurpose;
  /** Whether the writer picks the team's or their own (an admin); else it's their own. */
  chooseWhose: boolean;
  me: string;
  text: MessagesPageText;
}) => {
  const { open, heading, opener, show, hide } = useDisclosure();
  const label = fill(text.addFor, { purpose: text.purposes[purpose] });
  return open ? (
    <MessageEditor
      purpose={purpose}
      template={null}
      chooseWhose={chooseWhose}
      me={me}
      heading={heading}
      title={label}
      text={text}
      onDone={hide}
    />
  ) : (
    <div>
      <button ref={opener} type="button" className={ui.button} aria-label={label} onClick={show}>
        {text.add}
      </button>
    </div>
  );
};
