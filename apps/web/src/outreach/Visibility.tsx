'use client';

import { useRouter } from 'next/navigation';

import { fill } from '@/fill';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { mergeContact, updateContact, updateOrganisation } from './actions';

/**
 * "Solo yo" or "Equipo" (PLAN M5, step 6): who sees a contact, an organisation or a note. Private is for its own
 * person alone, admins included; the team's is everyone in outreach. Only ever from private to the team.
 */
export interface VisibilityText {
  legend: string;
  team: string;
  teamHint: string;
  mine: string;
  mineHint: string;
}

/** "Quién lo ve", when something is made: the team, by default, or only the one making it. */
export const VisibilityChoice = ({ prefix, text }: { prefix: string; text: VisibilityText }) => (
  <fieldset className={ui.fieldset}>
    <legend>{text.legend}</legend>
    <div className={ui.checkbox}>
      <input
        id={`${prefix}-equipo`}
        type="radio"
        name="visibility"
        value="team"
        defaultChecked
        aria-describedby={`${prefix}-equipo-pista`}
      />
      <label htmlFor={`${prefix}-equipo`}>{text.team}</label>
      <span id={`${prefix}-equipo-pista`} className={ui.checkboxHelp}>
        {text.teamHint}
      </span>
    </div>
    <div className={ui.checkbox}>
      <input
        id={`${prefix}-solo-yo`}
        type="radio"
        name="visibility"
        value="private"
        aria-describedby={`${prefix}-solo-yo-pista`}
      />
      <label htmlFor={`${prefix}-solo-yo`}>{text.mine}</label>
      <span id={`${prefix}-solo-yo-pista`} className={ui.checkboxHelp}>
        {text.mineHint}
      </span>
    </div>
  </fieldset>
);

export interface ShareText {
  /** "Solo tú lo ves…" */
  intro: string;
  share: string;
  shared: string;
  /** Team contacts that may be the same person. */
  matchesIntro: string;
  /** "Fusionar con {name}" */
  merge: string;
  merged: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * Sharing one's private contact or organisation with the team (PLAN M5, step 6). A contact that may already be in the
 * team's (an email or the phone in common) is offered to merge into it instead: the team's keeps its details and
 * takes the ones it lacks, and the private notes move over still private. Once shared, it stays the team's.
 */
export const SharePanel = ({
  record,
  matches,
  text,
}: {
  record: { kind: 'contact' | 'organisation'; id: string };
  /** Team contacts that may be this one, by id and how they read. */
  matches: readonly { id: string; name: string }[];
  text: ShareText;
}) => {
  const router = useRouter();
  const write = useWrite(text.errors);

  const share = () =>
    void write.run(
      () =>
        record.kind === 'contact'
          ? updateContact(record.id, { private: false })
          : updateOrganisation(record.id, { private: false }),
      { done: text.shared },
    );

  const merge = async (into: string) => {
    const answer = await write.run(() => mergeContact(record.id, into), {
      done: text.merged,
      refresh: false,
    });
    if (answer?.ok) {
      router.push(`/contactos/${encodeURIComponent(into)}`);
    }
  };

  return (
    <div className={ui.form}>
      <p>{text.intro}</p>
      {matches.length > 0 ? (
        <>
          <p className={ui.hint}>{text.matchesIntro}</p>
          <ul className={ui.rowActions}>
            {matches.map((match) => (
              <li key={match.id}>
                <button
                  type="button"
                  className={ui.secondaryButton}
                  aria-disabled={write.pending}
                  onClick={() => void merge(match.id)}
                >
                  {fill(text.merge, { name: match.name })}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <FormError message={write.error} />
      <div>
        <button type="button" className={ui.button} aria-disabled={write.pending} onClick={share}>
          {text.share}
        </button>
      </div>
    </div>
  );
};
