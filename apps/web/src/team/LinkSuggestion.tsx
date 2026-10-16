'use client';

import { ConfirmAction, type ConfirmText } from '@/ui/ConfirmAction';

import { linkPerson } from './actions';

/**
 * An admin links an account to the person who shares its email (PLAN M5, step 5), asked about in place first. The
 * API and the database decide again; the link grants nothing.
 */
export const LinkSuggestion = ({
  userId,
  personId,
  label,
  text,
}: {
  userId: string;
  personId: string;
  label: string;
  text: ConfirmText;
}) => <ConfirmAction label={label} text={text} run={() => linkPerson(userId, personId)} />;
