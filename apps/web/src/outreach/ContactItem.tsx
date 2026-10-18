import type { ReactNode } from 'react';

import { Layers } from 'lucide-react';
import Link from 'next/link';

import { fill } from '@/fill';
import { StagePill } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { Icon } from '@/ui/Icon';
import { RELATIONSHIP_ICONS, RELATIONSHIP_TONE } from '@/ui/icons';
import { Status } from '@/ui/Status';

import type { SummaryWords } from './text';
import type { ContactSummary, RelationshipStage } from './types';

import { contactName } from './format';

/**
 * Whether a contact may be written to, in words with its mark: "Por revisar", "En pausa", "Datos borrados". Never by
 * colour alone.
 */
export const ContactFlags = ({
  contact,
  words,
}: {
  contact: Pick<ContactSummary, 'needsReview' | 'hold' | 'anonymised' | 'private'>;
  words: Pick<SummaryWords, 'needsReview' | 'held' | 'anonymised' | 'private'>;
}) =>
  contact.needsReview || contact.hold || contact.anonymised || contact.private ? (
    <ul className={onboarding.reasons}>
      {contact.private ? (
        <li>
          <Status kind="info" label={words.private} />
        </li>
      ) : null}
      {contact.anonymised ? (
        <li>
          <Status kind="info" label={words.anonymised} />
        </li>
      ) : null}
      {contact.needsReview ? (
        <li>
          <Status kind="attention" label={words.needsReview} />
        </li>
      ) : null}
      {contact.hold ? (
        <li>
          <Status kind="attention" label={words.held} />
        </li>
      ) : null}
    </ul>
  ) : null;

/** Where a relationship stands, as a pill in its colour with its icon and word (PLAN R67). */
export const RelationshipTag = ({ stage, label }: { stage: RelationshipStage; label: string }) => (
  <StagePill tone={RELATIONSHIP_TONE[stage]} icon={RELATIONSHIP_ICONS[stage]} label={label} />
);

/** A contact's tier ("Nivel A"), a quiet tag: a fact that asks nothing (PLAN R67). */
export const TierTag = ({ label }: { label: string }) => (
  <span className={onboarding.teamTag}>
    <Icon icon={Layers} size={13} />
    {label}
  </span>
);

/**
 * A contact in a list (Contactos, an organisation's, a campaign's): who, linked to their page, at which organisation,
 * their relationship, tier, territory and owner, and whether they may be written to. Never their email or phone.
 * `children` are the list's own facts and buttons, kept outside the link.
 */
export const ContactItem = ({
  contact,
  words,
  children,
  as: Tag = 'li',
  showOwner = true,
}: {
  contact: ContactSummary;
  words: SummaryWords;
  children?: ReactNode;
  as?: 'li' | 'div';
  /** The contact's own owner; a campaign's board shows the target's instead. */
  showOwner?: boolean;
}) => (
  <Tag className={onboarding.personItem}>
    <div className={onboarding.personHead}>
      <Link className={onboarding.personName} href={`/contactos/${encodeURIComponent(contact.id)}`}>
        {contactName(contact, words)}
      </Link>
      <RelationshipTag stage={contact.stage} label={words.stages[contact.stage]} />
    </div>
    <p>
      {contact.orgDisplay}
      {contact.role ? ` · ${contact.role}` : ''}
    </p>
    <ul className={onboarding.meta}>
      <li>
        <TierTag label={fill(words.tier, { tier: contact.tier })} />
      </li>
      {contact.organisation ? <li>{words.kinds[contact.organisation.kind]}</li> : null}
      {contact.territory ? (
        <li>
          {words.territory}: {contact.territory}
        </li>
      ) : null}
      {showOwner ? (
        <li>
          {words.owner}: {contact.owner?.displayName || words.noOwner}
        </li>
      ) : null}
      {contact.tags.length > 0 ? <li>{contact.tags.join(', ')}</li> : null}
    </ul>
    <ContactFlags contact={contact} words={words} />
    {children}
  </Tag>
);
