'use client';

import { normalizeDiscord, normalizeEmail, normalizePhone } from '@backoffice/domain/identities';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { fill } from '@/fill';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { messageFor } from '@/write';

import type { PlaceText } from './place/text';

import { candidates as findCandidates, quickAdd, type QuickAdd } from './actions';
import { QUICK_ADD_STAGES, type QuickAddProblem, quickAddProblems } from './forms';
import { personName } from './names';
import { PlaceFields } from './place/PlaceFields';
import * as place from './place/styles';
import * as styles from './styles';
import { type ArrivalChannel, type Candidate, parseCandidates } from './types';

export interface QuickAddText {
  name: string;
  /** "Opcional: …" */
  nameHint: string;
  /** "Sin nombre", for a candidate without one. */
  noName: string;
  phone: string;
  phoneHint: string;
  email: string;
  discord: string;
  discordHint: string;
  discordInvalid: string;
  contactHint: string;
  arrival: string;
  arrivalHint: string;
  arrivalNone: string;
  arrivedOn: string;
  arrivedOnHint: string;
  /** The place pickers' words (PLAN R74), and their groups' (R75). */
  place: PlaceText;
  livesIn: string;
  from: string;
  addFrom: string;
  chat: string;
  chatHint: string;
  stage: string;
  stageHint: string;
  note: string;
  noteWarning: string;
  submit: string;
  checking: string;
  candidatesTitle: string;
  candidatesIntro: string;
  candidateExact: string;
  candidateSimilar: string;
  /** "Es {name}" */
  isThisPerson: string;
  isNew: string;
  chooseFirst: string;
  contactMissing: string;
  phoneInvalid: string;
  emailInvalid: string;
  /** "Se guardará como {value}" */
  willBe: string;
  review: string;
  conflict: string;
  toPerson: string;
  toBandeja: string;
  stages: Readonly<Record<string, string>>;
  errors: Readonly<Record<string, string>>;
}

const DEBOUNCE_MS = 400;

/**
 * Añadir rápido (onboarding spec, views): a phone, an email or a Discord username, the name if known (PLAN R37), and
 * whatever else is known: where they came from, from the list in Ajustes, and the day they arrived, today unless
 * changed, and emptied when nobody knows (PLAN M5). As the person types, the API is asked for records like it
 * (debounced), and when there are any, the person must say whether it is one of them or someone new before saving, so
 * the database isn't left to guess. Saving leads to the person's page, or says the record went to the Bandeja.
 */
export const QuickAddForm = ({
  chats,
  channels,
  today,
  text,
}: {
  chats: readonly string[];
  /** "Llegó por"'s active entries. */
  channels: readonly ArrivalChannel[];
  /** Today in Madrid: "Llegó el"'s first value, and its latest. */
  today: string;
  text: QuickAddText;
}) => {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [discord, setDiscord] = useState('');
  const [province, setProvince] = useState('');
  // "De dónde es" is folded until asked for (PLAN R75); opening it takes focus there.
  const [fromOpen, setFromOpen] = useState(false);
  useEffect(() => {
    if (fromOpen) {
      document.getElementById('alta-origen-pais')?.focus();
    }
  }, [fromOpen]);
  const [found, setFound] = useState<Candidate[]>([]);
  const [checking, setChecking] = useState(false);
  const [choice, setChoice] = useState('');
  const [problems, setProblems] = useState<QuickAddProblem[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<{ status: string; personId: string | null }>();
  const result = useRef<HTMLDivElement>(null);
  const asked = useRef(0);

  const phoneValue = normalizePhone(phone);
  const emailValue = normalizeEmail(email);
  const discordValue = normalizeDiscord(discord);

  // Asked only once there's enough to go on: three letters of a name, or a valid phone or email.
  const enough = name.trim().length >= 3 || phoneValue !== undefined || emailValue !== undefined;
  const shown = enough ? found : [];

  // Candidates for what is typed, once typing pauses; only the latest answer counts.
  useEffect(() => {
    if (!enough) {
      return undefined;
    }
    const query = {
      name: name.trim(),
      ...(phoneValue ? { phone: phoneValue } : {}),
      ...(emailValue ? { email: emailValue } : {}),
      ...(province.trim() ? { province: province.trim() } : {}),
    };
    const ask = ++asked.current;
    const timer = setTimeout(async () => {
      setChecking(true);
      const answer = await findCandidates(query);
      if (ask !== asked.current) {
        return;
      }
      setChecking(false);
      const list = answer.ok ? (parseCandidates(answer.body) ?? []) : [];
      setFound(list);
      setChoice((current) =>
        current === 'new' || list.some((candidate) => candidate.personId === current)
          ? current
          : '',
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enough, name, phoneValue, emailValue, province]);

  useEffect(() => {
    if (outcome) {
      result.current?.focus();
    }
  }, [outcome]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const field = (key: string) => {
      const value = form.get(key);
      return typeof value === 'string' ? value.trim() : '';
    };
    const issues = quickAddProblems({
      name,
      phone,
      email,
      discord,
      candidates: shown.length,
      choice,
    });
    setProblems(issues);
    if (issues.length > 0) {
      return;
    }
    const intake: QuickAdd = {
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(phoneValue ? { phone: phoneValue } : {}),
      ...(emailValue ? { email: emailValue } : {}),
      ...(discordValue ? { discord: discordValue } : {}),
      ...(field('arrival') ? { arrival: field('arrival') } : {}),
      // Emptied: nobody knows when they arrived (PLAN M5).
      arrivedOn: field('arrivedOn') || null,
      ...(province.trim() ? { province: province.trim() } : {}),
      ...(field('town') ? { town: field('town') } : {}),
      ...(field('country') ? { country: field('country') } : {}),
      ...(field('originCountry') ? { originCountry: field('originCountry') } : {}),
      ...(field('originProvince') ? { originProvince: field('originProvince') } : {}),
      ...(field('chat') ? { chat: field('chat') } : {}),
      ...(field('note') ? { note: field('note') } : {}),
      stage: field('stage') || 'new',
      ...(shown.length > 0
        ? choice === 'new'
          ? { decision: 'new' as const }
          : { decision: 'attach' as const, target: choice }
        : {}),
    };
    setPending(true);
    setError(undefined);
    const answer = await quickAdd(intake);
    setPending(false);
    if (!answer.ok) {
      setError(messageFor(answer, text.errors));
      return;
    }
    const status = typeof answer.body.status === 'string' ? answer.body.status : '';
    const personId = typeof answer.body.personId === 'string' ? answer.body.personId : null;
    if ((status === 'created' || status === 'attached') && personId !== null) {
      router.push(`/personas/${encodeURIComponent(personId)}`);
      return;
    }
    setOutcome({ status, personId });
  };

  if (outcome) {
    return (
      <div ref={result} tabIndex={-1} className={ui.notice} role="status">
        <p>{outcome.status === 'conflict' ? text.conflict : text.review}</p>
        <ul className={ui.linkList}>
          {outcome.personId === null ? null : (
            <li>
              <Link className={ui.link} href={`/personas/${encodeURIComponent(outcome.personId)}`}>
                {text.toPerson}
              </Link>
            </li>
          )}
          <li>
            <Link className={ui.link} href="/bandeja">
              {text.toBandeja}
            </Link>
          </li>
        </ul>
      </div>
    );
  }

  const has = (problem: QuickAddProblem) => problems.includes(problem);
  const message: Record<QuickAddProblem, string> = {
    contact: text.contactMissing,
    phone: text.phoneInvalid,
    email: text.emailInvalid,
    discord: text.discordInvalid,
    choice: text.chooseFirst,
  };

  return (
    <form className={ui.form} onSubmit={submit} noValidate>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="alta-nombre">
          {text.name}
        </label>
        <input
          id="alta-nombre"
          className={ui.input}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={200}
          autoComplete="off"
          aria-describedby="alta-nombre-hint"
        />
        <span id="alta-nombre-hint" className={ui.hint}>
          {text.nameHint}
        </span>
      </div>
      <fieldset className={ui.fieldset} aria-describedby="alta-contacto">
        <legend>
          {text.phone} / {text.email} / {text.discord}
        </legend>
        <span id="alta-contacto" className={ui.hint}>
          {text.contactHint}
        </span>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="alta-telefono">
            {text.phone}
          </label>
          <input
            id="alta-telefono"
            className={ui.input}
            type="tel"
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="off"
            maxLength={40}
            aria-invalid={has('phone') || has('contact')}
            aria-describedby="alta-telefono-hint alta-problemas"
          />
          <span id="alta-telefono-hint" className={ui.hint}>
            {phone.trim() === ''
              ? text.phoneHint
              : phoneValue
                ? fill(text.willBe, { value: phoneValue })
                : text.phoneInvalid}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="alta-correo">
            {text.email}
          </label>
          <input
            id="alta-correo"
            className={ui.input}
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
            maxLength={254}
            aria-invalid={has('email') || has('contact')}
            aria-describedby="alta-correo-hint alta-problemas"
          />
          <span id="alta-correo-hint" className={ui.hint}>
            {email.trim() !== '' && !emailValue ? text.emailInvalid : ''}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="alta-discord">
            {text.discord}
          </label>
          <input
            id="alta-discord"
            className={ui.input}
            name="discord"
            value={discord}
            onChange={(event) => setDiscord(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            maxLength={40}
            aria-invalid={has('discord') || has('contact')}
            aria-describedby="alta-discord-hint alta-problemas"
          />
          <span id="alta-discord-hint" className={ui.hint}>
            {discord.trim() === ''
              ? text.discordHint
              : discordValue
                ? fill(text.willBe, { value: discordValue })
                : text.discordInvalid}
          </span>
        </div>
      </fieldset>
      <div className={ui.fieldRow} data-columns="wide-narrow">
        <div className={ui.field}>
          <label className={ui.label} htmlFor="alta-llegada">
            {text.arrival}
          </label>
          <select
            id="alta-llegada"
            name="arrival"
            className={styles.select}
            defaultValue=""
            aria-describedby="alta-llegada-hint"
          >
            <option value="">{text.arrivalNone}</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.label}
              </option>
            ))}
          </select>
          <span id="alta-llegada-hint" className={ui.hint}>
            {text.arrivalHint}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="alta-llego-el">
            {text.arrivedOn}
          </label>
          <input
            id="alta-llego-el"
            className={ui.input}
            type="date"
            name="arrivedOn"
            defaultValue={today}
            max={today}
            aria-describedby="alta-llego-el-hint"
          />
          <span id="alta-llego-el-hint" className={ui.hint}>
            {text.arrivedOnHint}
          </span>
        </div>
      </div>
      <fieldset className={ui.fieldset}>
        <legend>{text.livesIn}</legend>
        <div className={place.row}>
          <PlaceFields
            prefix="alta"
            names={{ country: 'country', province: 'province', town: 'town' }}
            initial={{ country: null, province: null, town: null }}
            onProvinceChange={setProvince}
            text={text.place}
          />
        </div>
      </fieldset>
      {fromOpen ? (
        <fieldset className={ui.fieldset}>
          <legend>{text.from}</legend>
          <div className={place.row}>
            <PlaceFields
              prefix="alta-origen"
              names={{ country: 'originCountry', province: 'originProvince' }}
              initial={{ country: null, province: null }}
              text={text.place}
            />
          </div>
        </fieldset>
      ) : (
        <div>
          <button type="button" className={ui.textButton} onClick={() => setFromOpen(true)}>
            {text.addFrom}
          </button>
        </div>
      )}

      <div role="status" aria-live="polite" className={ui.hint}>
        {checking ? text.checking : ''}
      </div>
      {shown.length > 0 ? (
        <fieldset className={styles.choices} aria-describedby="alta-candidatos-intro">
          <legend>{text.candidatesTitle}</legend>
          <span id="alta-candidatos-intro" className={ui.hint}>
            {text.candidatesIntro}
          </span>
          {shown.map((candidate) => (
            <label key={candidate.personId}>
              <input
                type="radio"
                name="choice"
                value={candidate.personId}
                checked={choice === candidate.personId}
                onChange={() => setChoice(candidate.personId)}
              />
              <span>
                {fill(text.isThisPerson, { name: personName(candidate.name, text.noName) })}
                <span className={`${ui.block} ${ui.hint}`}>
                  {[
                    candidate.stage ? text.stages[candidate.stage] : undefined,
                    candidate.owner ?? undefined,
                    candidate.exact ? text.candidateExact : text.candidateSimilar,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </label>
          ))}
          <label>
            <input
              type="radio"
              name="choice"
              value="new"
              checked={choice === 'new'}
              onChange={() => setChoice('new')}
            />
            <span>{text.isNew}</span>
          </label>
        </fieldset>
      ) : null}

      <div className={ui.field}>
        <label className={ui.label} htmlFor="alta-chat">
          {text.chat}
        </label>
        <input
          id="alta-chat"
          className={ui.input}
          name="chat"
          list="alta-chats"
          maxLength={100}
          autoComplete="off"
          aria-describedby="alta-chat-hint"
        />
        <datalist id="alta-chats">
          {chats.map((chat) => (
            <option key={chat} value={chat}>
              {chat}
            </option>
          ))}
        </datalist>
        <span id="alta-chat-hint" className={ui.hint}>
          {text.chatHint}
        </span>
      </div>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="alta-etapa">
          {text.stage}
        </label>
        <select
          id="alta-etapa"
          name="stage"
          className={styles.select}
          defaultValue="new"
          aria-describedby="alta-etapa-hint"
        >
          {QUICK_ADD_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {text.stages[stage]}
            </option>
          ))}
        </select>
        <span id="alta-etapa-hint" className={ui.hint}>
          {text.stageHint}
        </span>
      </div>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="alta-nota">
          {text.note}
        </label>
        <textarea
          id="alta-nota"
          name="note"
          className={styles.textarea}
          maxLength={4000}
          aria-describedby="alta-nota-aviso"
        />
        <span id="alta-nota-aviso" className={ui.hint}>
          {text.noteWarning}
        </span>
      </div>
      <div id="alta-problemas" role="alert">
        {problems.length > 0 ? (
          <ul className={ui.alert}>
            {problems.map((problem) => (
              <li key={problem}>
                <span aria-hidden="true">⚠ </span>
                {message[problem]}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <FormError message={error} />
      <div>
        <button type="submit" className={ui.button} aria-disabled={pending}>
          {text.submit}
        </button>
      </div>
    </form>
  );
};
