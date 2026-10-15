'use client';

import Link from 'next/link';
import { type ChangeEvent, Fragment, useEffect, useRef, useState } from 'react';

import { fill } from '@/fill';
import { Counts } from '@/onboarding/imports/Counts';
import { useAnnounce } from '@/ui/announce';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { messageFor } from '@/write';

import { importCampaign } from './actions';
import {
  IMPORT_FILE_KINDS,
  type ImportFileKind,
  importFiles,
  MAX_IMPORT_BYTES,
  recogniseFile,
} from './format';
import * as styles from './styles';
import { type ImportProblem, type ImportResult, parseImportResult } from './types';

export interface ImportText {
  files: string;
  filesHint: string;
  kinds: Readonly<Record<ImportFileKind, string>>;
  chosen: string;
  /** "No se reconoce «{name}»…" */
  ignored: string;
  /** "Faltan: {files}." */
  missing: string;
  tooBig: string;
  /** "No se ha podido leer «{name}»." */
  unreadable: string;
  check: string;
  startAgain: string;
  dryRun: string;
  imported: string;
  importedTitle: string;
  counts: Readonly<Record<string, string>>;
  problems: string;
  problemsIntro: string;
  warnings: string;
  warningsIntro: string;
  /** "{file}, línea {line}" */
  line: string;
  noProblems: string;
  confirm: string;
  toCampaigns: string;
  errors: Readonly<Record<string, string>>;
}

interface Chosen {
  name: string;
  size: number;
  text: string;
}

/** Problems or warnings as the API gave them, each with its file and line: their messages come in Spanish. */
const Listed = ({ items, line }: { items: readonly ImportProblem[]; line: string }) => (
  <ul className={styles.bullets}>
    {items.map((item, index) => (
      // The API's list, in its order, with no ids of its own.
      // oxlint-disable-next-line react/no-array-index-key
      <li key={index}>
        {item.file ? (
          <strong>
            {item.line === null
              ? item.file
              : fill(line, { file: item.file, line: String(item.line) })}
            :{' '}
          </strong>
        ) : null}
        {item.message}
      </li>
    ))}
  </ul>
);

/**
 * Importing a campaign from the outreach repo (outreach spec §4), for admins: its files chosen here, in as many goes
 * as it takes (they live in different folders), each recognised by its name and read as text; then a dry run that
 * writes nothing and shows what would be made, the problems that stop it and the warnings that don't; and only then
 * the import. With problems, the API writes nothing (422) and says them again.
 */
export const ImportCampaign = ({ text }: { text: ImportText }) => {
  const announce = useAnnounce();
  const [files, setFiles] = useState<Partial<Record<ImportFileKind, Chosen>>>({});
  const [ignored, setIgnored] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult>();
  const [done, setDone] = useState<ImportResult>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (result || done) {
      heading.current?.focus();
    }
  }, [result, done]);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const picked = [...(input.files ?? [])];
    setError(undefined);
    setResult(undefined);
    setDone(undefined);
    const next = { ...files };
    const skipped: string[] = [];
    for (const file of picked) {
      const kind = recogniseFile(file.name);
      if (kind === undefined) {
        skipped.push(file.name);
        continue;
      }
      try {
        next[kind] = { name: file.name, size: file.size, text: await file.text() };
      } catch {
        setError(fill(text.unreadable, { name: file.name }));
      }
    }
    setFiles(next);
    setIgnored(skipped);
    // The same file may be chosen again after it changed on disk.
    input.value = '';
  };

  const texts: Partial<Record<ImportFileKind, string>> = {};
  for (const kind of IMPORT_FILE_KINDS) {
    const file = files[kind];
    if (file !== undefined) {
      texts[kind] = file.text;
    }
  }
  const request = importFiles(texts);
  const size = Object.values(files).reduce((sum, file) => sum + file.size, 0);
  const tooBig = size > MAX_IMPORT_BYTES;

  const send = async (dryRun: boolean) => {
    if (pending || !('files' in request) || tooBig) {
      return;
    }
    setPending(true);
    setError(undefined);
    const answer = await importCampaign({ dryRun, files: request.files });
    setPending(false);
    const parsed = answer.ok || answer.status === 422 ? parseImportResult(answer.body) : undefined;
    if (!parsed) {
      setError(messageFor(answer.ok ? { status: 500 } : answer, text.errors));
      return;
    }
    if (!dryRun && answer.ok) {
      setResult(undefined);
      setDone(parsed);
      announce(text.imported);
      return;
    }
    setResult(parsed);
  };

  if (done) {
    return (
      <div className={ui.form}>
        <h2 ref={heading} tabIndex={-1} className={ui.h3}>
          {text.importedTitle}
        </h2>
        <Counts counts={done.counts} labels={text.counts} />
        {done.warnings.length > 0 ? (
          <>
            <p className={ui.label}>{text.warnings}</p>
            <Listed items={done.warnings} line={text.line} />
          </>
        ) : null}
        <p>
          <Link className={ui.button} href="/campanas">
            {text.toCampaigns}
          </Link>
        </p>
      </div>
    );
  }

  const chosen = IMPORT_FILE_KINDS.filter((kind) => files[kind] !== undefined);
  return (
    <div className={ui.form}>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="importar-ficheros">
          {text.files}
        </label>
        <span id="importar-ficheros-pista" className={ui.hint}>
          {text.filesHint}
        </span>
        <input
          id="importar-ficheros"
          className={ui.input}
          type="file"
          multiple
          accept=".yaml,.yml,.md,.csv,text/yaml,text/markdown,text/csv"
          onChange={(event) => void choose(event)}
          aria-describedby="importar-ficheros-pista importar-error"
        />
      </div>
      {chosen.length > 0 ? (
        <div>
          <p className={ui.label}>{text.chosen}</p>
          <dl className={ui.facts}>
            {chosen.map((kind) => (
              <Fragment key={kind}>
                <dt>{text.kinds[kind]}</dt>
                <dd className={ui.breakAnywhere}>{files[kind]?.name}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ) : null}
      {ignored.length > 0 ? (
        <ul className={styles.marked}>
          {ignored.map((name) => (
            <li key={name}>
              <span aria-hidden="true">!</span>
              {fill(text.ignored, { name })}
            </li>
          ))}
        </ul>
      ) : null}
      {'missing' in request && chosen.length > 0 ? (
        <p className={ui.notice}>
          {fill(text.missing, {
            files: request.missing.map((kind) => text.kinds[kind]).join(', '),
          })}
        </p>
      ) : null}
      {tooBig ? <p className={ui.alert}>{text.tooBig}</p> : null}
      {chosen.length > 0 ? (
        <div className={ui.rowActions}>
          {'files' in request && !tooBig ? (
            <button
              type="button"
              className={ui.button}
              aria-disabled={pending}
              onClick={() => void send(true)}
            >
              {text.check}
            </button>
          ) : null}
          <button
            type="button"
            className={ui.textButton}
            onClick={() => {
              setFiles({});
              setIgnored([]);
              setResult(undefined);
              setError(undefined);
            }}
          >
            {text.startAgain}
          </button>
        </div>
      ) : null}
      {result ? (
        <>
          <h2 ref={heading} tabIndex={-1} className={ui.h3}>
            {text.dryRun}
          </h2>
          <Counts counts={result.counts} labels={text.counts} />
          {result.problems.length > 0 ? (
            <div className={ui.alert}>
              <p className={ui.label}>
                <span aria-hidden="true">⚠ </span>
                {text.problems}
              </p>
              <p>{text.problemsIntro}</p>
              <Listed items={result.problems} line={text.line} />
            </div>
          ) : (
            <p className={ui.done}>{text.noProblems}</p>
          )}
          {result.warnings.length > 0 ? (
            <div className={ui.notice}>
              <p className={ui.label}>{text.warnings}</p>
              <p className={ui.hint}>{text.warningsIntro}</p>
              <Listed items={result.warnings} line={text.line} />
            </div>
          ) : null}
          {result.problems.length === 0 && result.dryRun ? (
            <div>
              <button
                type="button"
                className={ui.button}
                aria-disabled={pending}
                onClick={() => void send(false)}
              >
                {text.confirm}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      <FormError id="importar-error" message={error} />
    </div>
  );
};
