'use client';

import type { Stage } from '@backoffice/domain/stages';

import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { foldName } from '@backoffice/domain/identities';
import { placeLine } from '@backoffice/domain/places';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

import { fill } from '@/fill';
import { read } from '@/onboarding/actions';
import { personName } from '@/onboarding/names';
import { parseSummary, type PersonSummary } from '@/onboarding/types';
import { Icon } from '@/ui/Icon';
import { icons } from '@/ui/icons';
import { srOnly } from '@/ui/styles';

import * as styles from './search-styles';
import { isSearchShortcut, searchShortcutAria, useApple } from './shortcut';

type Group = 'recent' | 'people' | 'contacts' | 'organisations' | 'actions' | 'pages';

/** The order groups are listed in: what was found, then what can be done, then where to go. */
const GROUPS: readonly Group[] = [
  'recent',
  'people',
  'contacts',
  'organisations',
  'actions',
  'pages',
];

interface Option {
  key: string;
  group: Group;
  label: string;
  detail?: string | undefined;
  href: string;
}

interface Found {
  people: PersonSummary[];
  contacts: { id: string; name: string; organisation: string | null }[];
  organisations: { id: string; name: string }[];
}

const NOTHING: Found = { people: [], contacts: [], organisations: [] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseFound = (body: Record<string, unknown>): Found => ({
  people: Array.isArray(body.people)
    ? body.people.flatMap((value) => parseSummary(value) ?? [])
    : [],
  contacts: Array.isArray(body.contacts)
    ? body.contacts.flatMap((value) =>
        isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
          ? [
              {
                id: value.id,
                name: value.name,
                organisation: typeof value.organisation === 'string' ? value.organisation : null,
              },
            ]
          : [],
      )
    : [],
  organisations: Array.isArray(body.organisations)
    ? body.organisations.flatMap((value) =>
        isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
          ? [{ id: value.id, name: value.name }]
          : [],
      )
    : [],
});

export interface SearchText {
  open: string;
  /** The shortcut as each system writes it: "⌘K" on Apple's, "Ctrl K" on the rest. */
  keys: { apple: string; other: string };
  title: string;
  placeholder: string;
  groups: Record<Group, string>;
  /** "Nada coincide con «{q}»." */
  none: string;
  /** "{count} resultados" */
  count: string;
  searching: string;
  /** "… Ábrelo desde cualquier página con {keys}." */
  help: string;
  noName: string;
  stages: Record<Stage, string>;
}

/**
 * The search from anywhere (PLAN R80): Ctrl K, ⌘K on a Mac (R85), or its button in the header, opens a dialog that
 * finds as it's typed: people by name, phone, email or Discord, best first (onboarding staff), contacts and
 * organisations (outreach staff), the sections and what can be done. Nothing typed, the people one last worked with.
 * The arrows move, Enter opens, Escape closes and puts focus back.
 */
export const Search = ({
  pages,
  actions,
  text,
}: {
  pages: readonly { label: string; href: string }[];
  actions: readonly { label: string; href: string }[];
  text: SearchText;
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found>(NOTHING);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const apple = useApple();
  const keys = apple ? text.keys.apple : text.keys.other;

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (isSearchShortcut(event, apple)) {
        event.preventDefault();
        setOpen(true);
        setSearching(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apple]);

  // As it's typed, a moment after the last key.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    let live = true;
    const timer = setTimeout(
      () => {
        void read(`/api/search?${new URLSearchParams({ q: query.trim() }).toString()}`).then(
          (answer) => {
            if (live) {
              setSearching(false);
              setFound(answer.ok ? parseFound(answer.body) : NOTHING);
              setActive(0);
            }
          },
        );
      },
      query.trim() === '' ? 0 : 150,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  const options = useMemo((): Option[] => {
    const typed = foldName(query);
    const matches = (label: string) => typed === '' || foldName(label).includes(typed);
    return [
      ...found.people.map((person) => ({
        key: `persona-${person.id}`,
        group: typed === '' ? ('recent' as const) : ('people' as const),
        label: personName(person.name, text.noName),
        detail: [
          text.stages[person.stage],
          placeLine({ province: person.province, country: person.country }),
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/personas/${encodeURIComponent(person.id)}`,
      })),
      ...found.contacts.map((contact) => ({
        key: `contacto-${contact.id}`,
        group: 'contacts' as const,
        label: contact.name,
        detail: contact.organisation ?? undefined,
        href: `/contactos/${encodeURIComponent(contact.id)}`,
      })),
      ...found.organisations.map((organisation) => ({
        key: `organizacion-${organisation.id}`,
        group: 'organisations' as const,
        label: organisation.name,
        href: `/organizaciones/${encodeURIComponent(organisation.id)}`,
      })),
      ...actions
        .filter((action) => matches(action.label))
        .map((action) => ({ key: `accion-${action.href}`, group: 'actions' as const, ...action })),
      ...pages
        .filter((page) => matches(page.label))
        .map((page) => ({ key: `seccion-${page.href}`, group: 'pages' as const, ...page })),
    ];
  }, [found, query, actions, pages, text]);

  const current = options[active];
  useEffect(() => {
    if (current) {
      document.getElementById(`buscar-${current.key}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [current]);

  const go = (option: Option) => {
    setOpen(false);
    setQuery('');
    router.push(option.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && current) {
      event.preventDefault();
      go(current);
    }
  };

  const grouped = GROUPS.map((group) => ({
    group,
    items: options.flatMap((option, index) => (option.group === group ? [{ option, index }] : [])),
  })).filter(({ items }) => items.length > 0);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        setSearching(details.open);
      }}
      initialFocusEl={() => input.current}
      lazyMount
      unmountOnExit
    >
      <Dialog.Trigger className={styles.button} aria-keyshortcuts={searchShortcutAria(apple)}>
        <Icon icon={icons.search} size={18} />
        {text.open}
        <span className={styles.keys} aria-hidden="true">
          {keys}
        </span>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Positioner className={styles.positioner}>
          <Dialog.Content className={styles.content}>
            <Dialog.Title className={srOnly}>{text.title}</Dialog.Title>
            <input
              ref={input}
              className={styles.input}
              type="search"
              role="combobox"
              aria-expanded="true"
              aria-controls="buscar-lista"
              aria-activedescendant={current ? `buscar-${current.key}` : undefined}
              aria-autocomplete="list"
              aria-label={text.title}
              aria-describedby="buscar-ayuda"
              placeholder={text.placeholder}
              value={query}
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setSearching(true);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
            <p role="status" className={srOnly}>
              {searching ? text.searching : fill(text.count, { count: String(options.length) })}
            </p>
            {options.length === 0 && !searching ? (
              <p className={styles.empty}>{fill(text.none, { q: query.trim() })}</p>
            ) : null}
            <div id="buscar-lista" role="listbox" aria-label={text.title} className={styles.list}>
              {grouped.map(({ group, items }) => (
                <div key={group} role="presentation">
                  <div
                    id={`buscar-grupo-${group}`}
                    className={styles.groupLabel}
                    role="presentation"
                  >
                    {text.groups[group]}
                  </div>
                  <div role="group" aria-labelledby={`buscar-grupo-${group}`}>
                    {items.map(({ option, index }) => (
                      // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the input's arrows and Enter drive it
                      <div
                        key={option.key}
                        id={`buscar-${option.key}`}
                        role="option"
                        tabIndex={-1}
                        aria-selected={index === active}
                        className={styles.option}
                        onMouseMove={() => setActive(index)}
                        onClick={() => go(option)}
                      >
                        <span>{option.label}</span>
                        {option.detail ? (
                          <span className={styles.detail}>{option.detail}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p id="buscar-ayuda" className={styles.footer}>
              {fill(text.help, { keys })}
            </p>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};
