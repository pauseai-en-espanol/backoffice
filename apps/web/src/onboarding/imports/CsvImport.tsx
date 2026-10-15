'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';

import { fill } from '@/fill';
import { useAnnounce } from '@/ui/announce';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { messageFor } from '@/write';

import { importCsv } from '../actions';
import { isMappingField, MAPPING_FIELDS, type MappingField, usedMapping } from '../csv-mapping';
import { type CsvAnalysis, MAX_CSV_BYTES, parseAnalysis } from '../forms';
import * as styles from '../styles';
import { countsOf } from '../types';
import { Counts } from './Counts';

export interface CsvImportText {
  file: string;
  fileTooBig: string;
  fileUnreadable: string;
  mapping: string;
  mappingIntro: string;
  /** "Columna «{column}»" */
  column: string;
  fields: Readonly<Record<MappingField | 'ignore', string>>;
  recalculate: string;
  previewTitle: string;
  invalidTitle: string;
  /** "Fila {row}: {field}" */
  invalidRow: string;
  dryRun: string;
  apply: string;
  applied: string;
  noName: string;
  counts: Readonly<Record<string, string>>;
  errors: Readonly<Record<string, string>>;
}

const cell = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

/**
 * Importing a CSV (onboarding spec, web and CSV): the file read here (1 MB at most), then a dry run that shows which
 * column holds what (guessed from the headers, then checked), the first rows as they would be stored, the rows with
 * values that don't do, and what applying would do. Nothing is stored until "Aplicar la importación"; importing the
 * same rows again changes nothing.
 */
export const CsvImport = ({ text }: { text: CsvImportText }) => {
  const router = useRouter();
  const announce = useAnnounce();
  const [csv, setCsv] = useState<string>();
  const [analysis, setAnalysis] = useState<CsvAnalysis>();
  const [mapping, setMapping] = useState<Record<string, MappingField | 'ignore'>>({});
  const [applied, setApplied] = useState<Record<string, number>>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (analysis) {
      heading.current?.focus();
    }
  }, [analysis]);

  const analyse = async (
    content: string,
    withMapping?: Record<string, MappingField | 'ignore'>,
  ) => {
    setPending(true);
    setError(undefined);
    setApplied(undefined);
    const answer = await importCsv({
      csv: content,
      ...(withMapping ? { mapping: usedMapping(withMapping) } : {}),
    });
    setPending(false);
    const parsed = answer.ok ? parseAnalysis(answer.body) : undefined;
    if (!parsed) {
      setError(messageFor(answer.ok ? { status: 500 } : answer, text.errors));
      return;
    }
    setAnalysis(parsed);
    setMapping(withMapping ?? parsed.mapping);
  };

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setAnalysis(undefined);
    setCsv(undefined);
    if (!file) {
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setError(text.fileTooBig);
      return;
    }
    let content: string;
    try {
      content = await file.text();
    } catch {
      setError(text.fileUnreadable);
      return;
    }
    setCsv(content);
    await analyse(content);
  };

  const apply = async () => {
    if (!csv || pending) {
      return;
    }
    if (!Object.values(mapping).includes('name')) {
      setError(text.noName);
      return;
    }
    setPending(true);
    setError(undefined);
    const answer = await importCsv({ csv, mapping: usedMapping(mapping), apply: true });
    setPending(false);
    if (!answer.ok) {
      setError(messageFor(answer, text.errors));
      return;
    }
    setApplied(countsOf(answer.body.counts));
    setAnalysis(undefined);
    announce(text.applied);
    router.refresh();
  };

  const used = MAPPING_FIELDS.filter((field) => Object.values(mapping).includes(field));

  return (
    <div className={ui.form}>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="csv-archivo">
          {text.file}
        </label>
        <input
          id="csv-archivo"
          className={ui.input}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void choose(event)}
          aria-describedby="csv-error"
        />
      </div>
      {applied ? <Counts counts={applied} labels={text.counts} /> : null}
      {analysis ? (
        <>
          <h3 ref={heading} tabIndex={-1} className={ui.h3}>
            {text.mapping}
          </h3>
          <p className={ui.hint}>{text.mappingIntro}</p>
          <div className={styles.filters}>
            {analysis.columns.map((column, index) => (
              <div key={column} className={ui.field}>
                <label className={ui.label} htmlFor={`csv-columna-${index}`}>
                  {fill(text.column, { column })}
                </label>
                <select
                  id={`csv-columna-${index}`}
                  className={styles.select}
                  value={mapping[column] ?? 'ignore'}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMapping((current) => ({
                      ...current,
                      [column]: isMappingField(value) ? value : 'ignore',
                    }));
                  }}
                >
                  <option value="ignore">{text.fields.ignore}</option>
                  {MAPPING_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {text.fields[field]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div>
            <button
              type="button"
              className={ui.secondaryButton}
              aria-disabled={pending}
              onClick={() => csv && void analyse(csv, mapping)}
            >
              {text.recalculate}
            </button>
          </div>
          {analysis.preview.length > 0 && used.length > 0 ? (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <caption>{text.previewTitle}</caption>
                <thead>
                  <tr>
                    {used.map((field) => (
                      <th key={field} scope="col">
                        {text.fields[field]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.preview.map((row, index) => (
                    // Rows have no id of their own: their place in the file is theirs.
                    // oxlint-disable-next-line react/no-array-index-key
                    <tr key={index}>
                      {used.map((field) => (
                        <td key={field} className={ui.breakAnywhere}>
                          {cell(row[field])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {analysis.invalid.length > 0 ? (
            <>
              <h3 className={ui.h3}>{text.invalidTitle}</h3>
              <ul className={styles.meta}>
                {analysis.invalid.map((entry) => (
                  <li key={`${entry.row}-${entry.field}`}>
                    {fill(text.invalidRow, {
                      row: entry.row,
                      field: isMappingField(entry.field) ? text.fields[entry.field] : entry.field,
                    })}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className={ui.label}>{text.dryRun}</p>
          <Counts counts={analysis.counts} labels={text.counts} />
          <div>
            <button
              type="button"
              className={ui.button}
              aria-disabled={pending}
              onClick={() => void apply()}
            >
              {text.apply}
            </button>
          </div>
        </>
      ) : null}
      <FormError id="csv-error" message={error} />
    </div>
  );
};
