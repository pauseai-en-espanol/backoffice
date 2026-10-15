'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';

import { fill } from '@/fill';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { CensusOption, OptionKind } from './types';

import * as styles from '../styles';
import { addCensusOption, orderCensusOptions, updateCensusOption } from './actions';
import { reorder, sortOptions } from './format';

export interface OptionsEditorText {
  none: string;
  inactive: string;
  add: string;
  newOption: string;
  added: string;
  rename: string;
  /** "Renombrar «{label}»", the button's name for screen readers. */
  renameFor: string;
  /** "Nuevo nombre para «{label}»" */
  renameLabel: string;
  save: string;
  cancel: string;
  renamed: string;
  up: string;
  down: string;
  /** "Subir «{label}»" */
  moveUp: string;
  /** "Bajar «{label}»" */
  moveDown: string;
  moved: string;
  off: string;
  on: string;
  /** "Desactivar «{label}»" */
  deactivate: string;
  /** "Reactivar «{label}»" */
  reactivate: string;
  deactivated: string;
  reactivated: string;
  missing: string;
  errors: Readonly<Record<string, string>>;
}

/** A new name for an option, asked in place; the field takes focus as it opens. */
const RenameForm = ({
  option,
  text,
  pending,
  onSave,
  onCancel,
}: {
  option: CensusOption;
  text: OptionsEditorText;
  pending: boolean;
  onSave: (label: string) => void;
  onCancel: () => void;
}) => {
  const field = useRef<HTMLInputElement>(null);
  const [missing, setMissing] = useState(false);
  const id = `opcion-${option.id}`;

  useEffect(() => {
    field.current?.focus();
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = field.current?.value.trim() ?? '';
    setMissing(label === '');
    if (label !== '') {
      onSave(label);
    }
  };

  return (
    <form className={ui.form} onSubmit={submit}>
      <div className={ui.field}>
        <label className={ui.label} htmlFor={id}>
          {fill(text.renameLabel, { label: option.label })}
        </label>
        <input
          ref={field}
          id={id}
          className={ui.input}
          defaultValue={option.label}
          aria-invalid={missing}
          aria-describedby={missing ? `${id}-error` : undefined}
        />
        <FormError id={`${id}-error`} message={missing ? text.missing : undefined} />
      </div>
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={pending}>
          {text.save}
        </button>
        <button type="button" className={ui.textButton} onClick={onCancel}>
          {text.cancel}
        </button>
      </div>
    </form>
  );
};

/**
 * One of the census's lists (skills, or areas to help in), for admins (census spec): add an option, rename it, move it
 * up or down, deactivate it or bring it back. Nothing is ever deleted: an option someone chose stays theirs, and a
 * deactivated one is no longer offered. Each change is said in the page's live region; focus stays where it was.
 */
export const OptionsEditor = ({
  kind,
  options,
  text,
}: {
  kind: OptionKind;
  options: readonly CensusOption[];
  text: OptionsEditorText;
}) => {
  const write = useWrite(text.errors);
  const list = sortOptions(options);
  const [renaming, setRenaming] = useState<string>();
  const [back, setBack] = useState<string>();
  const [label, setLabel] = useState('');
  const [missing, setMissing] = useState(false);
  const add = `nueva-${kind}`;

  useEffect(() => {
    if (back !== undefined && renaming === undefined) {
      document.getElementById(`renombrar-${back}`)?.focus();
    }
  }, [back, renaming]);

  const close = (id: string) => {
    setBack(id);
    setRenaming(undefined);
  };

  const rename = async (option: CensusOption, value: string) => {
    if (value === option.label) {
      close(option.id);
      return;
    }
    const answer = await write.run(() => updateCensusOption(option.id, { label: value }), {
      done: text.renamed,
    });
    if (answer?.ok) {
      close(option.id);
    }
  };

  const move = (id: string, direction: 'up' | 'down') => {
    const ids = reorder(list, id, direction);
    if (ids.length === 0 || write.pending) {
      return;
    }
    void write.run(() => orderCensusOptions(kind, ids), { done: text.moved });
  };

  const toggle = (option: CensusOption) =>
    void write.run(() => updateCensusOption(option.id, { active: !option.active }), {
      done: option.active ? text.deactivated : text.reactivated,
    });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = label.trim();
    setMissing(value === '');
    if (value === '') {
      return;
    }
    const answer = await write.run(() => addCensusOption({ kind, label: value }), {
      done: text.added,
    });
    if (answer?.ok) {
      setLabel('');
    }
  };

  return (
    <div className={ui.form}>
      {list.length === 0 ? (
        <p className={ui.hint}>{text.none}</p>
      ) : (
        <ol className={styles.personList}>
          {list.map((option, index) => (
            <li key={option.id} className={styles.personItem}>
              <p>
                {option.label}
                {option.active ? null : <span className={ui.muted}> {text.inactive}</span>}
              </p>
              {renaming === option.id ? (
                <RenameForm
                  option={option}
                  text={text}
                  pending={write.pending}
                  onSave={(value) => void rename(option, value)}
                  onCancel={() => close(option.id)}
                />
              ) : (
                <div className={ui.rowActions}>
                  <button
                    id={`renombrar-${option.id}`}
                    type="button"
                    className={ui.secondaryButton}
                    aria-label={fill(text.renameFor, { label: option.label })}
                    onClick={() => {
                      write.clear();
                      setRenaming(option.id);
                    }}
                  >
                    {text.rename}
                  </button>
                  <button
                    type="button"
                    className={ui.secondaryButton}
                    aria-label={fill(text.moveUp, { label: option.label })}
                    aria-disabled={index === 0 || write.pending}
                    onClick={() => move(option.id, 'up')}
                  >
                    <span aria-hidden="true">↑</span>
                    {text.up}
                  </button>
                  <button
                    type="button"
                    className={ui.secondaryButton}
                    aria-label={fill(text.moveDown, { label: option.label })}
                    aria-disabled={index === list.length - 1 || write.pending}
                    onClick={() => move(option.id, 'down')}
                  >
                    <span aria-hidden="true">↓</span>
                    {text.down}
                  </button>
                  <button
                    type="button"
                    className={ui.secondaryButton}
                    aria-label={fill(option.active ? text.deactivate : text.reactivate, {
                      label: option.label,
                    })}
                    aria-disabled={write.pending}
                    onClick={() => toggle(option)}
                  >
                    {option.active ? text.off : text.on}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <FormError message={write.error} />
      <form className={ui.form} onSubmit={submit}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={add}>
            {text.newOption}
          </label>
          <input
            id={add}
            className={ui.input}
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
            aria-invalid={missing}
            aria-describedby={missing ? `${add}-error` : undefined}
          />
          <FormError id={`${add}-error`} message={missing ? text.missing : undefined} />
        </div>
        <div>
          <button type="submit" className={ui.button} aria-disabled={write.pending}>
            {text.add}
          </button>
        </div>
      </form>
    </div>
  );
};
