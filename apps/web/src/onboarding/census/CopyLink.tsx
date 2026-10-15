'use client';

import { useState } from 'react';

import { useAnnounce } from '@/ui/announce';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';

export interface CopyLinkText {
  label: string;
  hint?: string;
  copy: string;
  copied: string;
  copyFailed: string;
}

/**
 * A link to hand on: shown whole in a read-only field (select it and copy by hand if need be) with a button that
 * copies it and says so in the page's live region, or says here that it couldn't.
 */
export const CopyLink = ({ id, url, text }: { id: string; url: string; text: CopyLinkText }) => {
  const announce = useAnnounce();
  const [failed, setFailed] = useState(false);
  const hint = text.hint ? `${id}-pista` : undefined;
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id}>
        {text.label}
      </label>
      {text.hint ? (
        <p id={hint} className={ui.hint}>
          {text.hint}
        </p>
      ) : null}
      <input
        id={id}
        className={`${ui.input} ${ui.breakAnywhere}`}
        type="url"
        readOnly
        value={url}
        aria-describedby={hint}
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className={ui.rowActions}>
        <button
          type="button"
          className={ui.secondaryButton}
          onClick={() => {
            setFailed(false);
            navigator.clipboard.writeText(url).then(
              () => announce(text.copied),
              () => setFailed(true),
            );
          }}
        >
          {text.copy}
        </button>
      </div>
      <FormError message={failed ? text.copyFailed : undefined} />
    </div>
  );
};
