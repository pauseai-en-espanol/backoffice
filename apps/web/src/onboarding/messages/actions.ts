'use client';

import type { MessagePurpose } from '@backoffice/domain/message-templates';

import { send } from '@/write';

/** Mensajes' calls to the API from the browser (docs/spec/staff-api.md, Mensajes), through write.ts. */

/** A new message: one's own ("Solo yo", `private`), or the team's, which only admins write (PLAN R71). */
export const addMessageTemplate = (template: {
  purpose: MessagePurpose;
  title: string;
  body: string;
  bodyNameless: string | null;
  private: boolean;
}) => send('POST', '/api/message-templates', template);

export const changeMessageTemplate = (
  id: string,
  change: { title?: string; body?: string; bodyNameless?: string | null; active?: boolean },
) => send('PATCH', `/api/message-templates/${encodeURIComponent(id)}`, change);
