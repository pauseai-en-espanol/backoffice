import { Fragment } from 'react';

import { fill } from '@/fill';
import * as ui from '@/ui/styles';

import type { LetterText } from './text';
import type { Handover } from './types';

import { CopyButton } from './CopyButton';
import { type Fix, isWebLink, problemText, warningText } from './format';
import * as styles from './styles';

/** Where each fix is made: the contact's page, or a part of the campaign's (its sections' ids). */
const fixHref = (fix: Fix, links: { contact: string | null; campaign: string }): string | null => {
  switch (fix) {
    case 'contact':
      return links.contact;
    case 'campaign':
      return `${links.campaign}#datos`;
    case 'templates':
      return `${links.campaign}#plantillas`;
    default:
      return `${links.campaign}#parrafos`;
  }
};

/**
 * A letter as the API wrote it (outreach spec §3), for a person to read before they send it themselves: the subject
 * and the body with its own line breaks, the sources of every figure it cites (to check before sending), and what to
 * look at, in words. With `sending`, the ways to send it from their own mail or WhatsApp: a `mailto:` link, and copy
 * buttons, since some clients cut long links. Nothing here sends anything.
 *
 * A letter that isn't ok says each reason in words, each with a link to where it is put right.
 */
export const LetterView = ({
  handover,
  text,
  links,
  sending,
}: {
  handover: Handover;
  text: LetterText;
  links: { contact: string | null; campaign: string };
  sending: boolean;
}) => {
  const { letter } = handover;
  if (!letter.ok) {
    return (
      <div className={ui.alert}>
        <p className={ui.label}>
          <span aria-hidden="true">⚠ </span>
          {text.problemsTitle}
        </p>
        <ul className={styles.bullets}>
          {letter.problems.map((problem, index) => {
            const { text: words, fixes } = problemText(problem, text);
            return (
              // Problems have no id of their own, and come in the API's order.
              // oxlint-disable-next-line react/no-array-index-key
              <li key={index}>
                {words}
                {fixes.map((fix) => {
                  const href = fixHref(fix, links);
                  return href === null ? null : (
                    <Fragment key={fix}>
                      {' '}
                      <a className={ui.link} href={href}>
                        {text.fix[fix]}
                      </a>
                    </Fragment>
                  );
                })}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const { to, cc, mailto, whatsapp, templateVersion } = handover;
  const copyWords = { copied: text.copied, copyFailed: text.copyFailed };
  return (
    <div className={ui.form}>
      <dl className={ui.facts}>
        {to.length > 0 ? (
          <>
            <dt>{text.to}</dt>
            <dd>{to.join(', ')}</dd>
          </>
        ) : null}
        {cc.length > 0 ? (
          <>
            <dt>{text.cc}</dt>
            <dd>{cc.join(', ')}</dd>
          </>
        ) : null}
        <dt>{text.subject}</dt>
        <dd>
          <strong>{letter.subject}</strong>
        </dd>
      </dl>
      <div>
        <p className={ui.label}>{text.body}</p>
        <div className={styles.letter}>{letter.body}</div>
        <p className={ui.hint}>
          {fill(text.words, { words: String(letter.words) })}
          {templateVersion === null
            ? ''
            : ` · ${fill(text.templateVersion, { version: String(templateVersion) })}`}
        </p>
      </div>
      <div>
        <p className={ui.label}>{text.sources}</p>
        {letter.sources.length === 0 ? (
          <p className={ui.hint}>{text.noSources}</p>
        ) : (
          <ul className={styles.bullets}>
            {letter.sources.map((source) => (
              <li key={source}>
                {isWebLink(source) ? (
                  <a className={ui.link} href={source} target="_blank" rel="noopener noreferrer">
                    {source}
                  </a>
                ) : (
                  source
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {letter.warnings.length > 0 ? (
        <div className={ui.notice}>
          <p className={ui.label}>{text.warnings}</p>
          <ul className={styles.marked}>
            {letter.warnings.map((warning, index) => (
              // Warnings have no id of their own, and come in the API's order.
              // oxlint-disable-next-line react/no-array-index-key
              <li key={index}>
                <span aria-hidden="true">!</span>
                {warningText(warning, text)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {sending ? (
        <div className={ui.form}>
          <p className={ui.label}>{text.send}</p>
          {mailto === null ? (
            <p className={ui.notice}>{text.noEmail}</p>
          ) : (
            <div>
              <a className={ui.button} href={mailto} aria-describedby="carta-correo-pista">
                {text.openMail}
              </a>
              <p id="carta-correo-pista" className={ui.hint}>
                {text.mailHint}
              </p>
            </div>
          )}
          <div className={ui.rowActions}>
            {to.length > 0 ? (
              <CopyButton label={text.copyTo} value={to.join(', ')} words={copyWords} />
            ) : null}
            {cc.length > 0 ? (
              <CopyButton label={text.copyCc} value={cc.join(', ')} words={copyWords} />
            ) : null}
            <CopyButton label={text.copySubject} value={letter.subject} words={copyWords} />
            <CopyButton label={text.copyBody} value={letter.body} words={copyWords} />
          </div>
          {whatsapp === null ? null : (
            <div>
              <a
                className={ui.secondaryButton}
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                aria-describedby="carta-whatsapp-pista"
              >
                {text.whatsapp}
              </a>
              <p id="carta-whatsapp-pista" className={ui.hint}>
                {text.whatsappHint}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
