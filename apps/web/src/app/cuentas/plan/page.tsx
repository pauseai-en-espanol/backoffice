import type { Metadata } from 'next';

import { formatIban } from '@backoffice/domain/accounting';
import { getTranslator } from '@backoffice/i18n/messages';

import { BooksOnly, BooksUnavailable } from '@/accounting/BooksOnly';
import {
  AccountActions,
  type ChartText,
  CounterpartyForm,
  NewAccountForm,
  ProjectForm,
} from '@/accounting/ChartForms';
import { getAccounts, getCounterparties, getProjects } from '@/accounting/data';
import * as books from '@/accounting/styles';
import { accountKindNames, canKeepBooks, canReadBooks, chartErrors } from '@/accounting/text';
import { isUnavailable } from '@/data';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { Disclosure } from '@/ui/Disclosure';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('books.chart.title') };

/**
 * Plan de cuentas (accounting spec §1): the chart, a parent before its sub-accounts; then who money came from or went
 * to, and the projects it was given for. Tesorería adds sub-accounts (one per bank account), retires what it no longer
 * uses and deletes only what was never used; admins read.
 */
const ChartPage = async () => {
  const me = await requireStaff();
  if (!canReadBooks(me)) {
    return (
      <AppShell me={me}>
        <BooksOnly />
      </AppShell>
    );
  }
  const [accounts, counterparties, projects] = await Promise.all([
    getAccounts(),
    getCounterparties(),
    getProjects(),
  ]);
  if (isUnavailable(accounts) || isUnavailable(counterparties) || isUnavailable(projects)) {
    return (
      <AppShell me={me}>
        <BooksUnavailable />
      </AppShell>
    );
  }
  const keeper = canKeepBooks(me);
  const kinds = accountKindNames(t);
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  const depthOf = (code: string): number => {
    let depth = 0;
    let current = byCode.get(code);
    while (current?.parentCode && byCode.has(current.parentCode)) {
      depth += 1;
      current = byCode.get(current.parentCode);
    }
    return depth;
  };
  // The bank's accounts: the one thing the books need before the first movement.
  const banks = accounts.filter((account) => account.treasury && !account.group && account.active);
  const text: ChartText = {
    code: t('books.chart.code'),
    name: t('books.chart.name'),
    kind: t('books.chart.kind'),
    kinds,
    parent: t('books.chart.parent'),
    parentHint: t('books.chart.parentHint'),
    noParent: t('books.chart.noParent'),
    treasury: t('books.chart.treasury'),
    treasuryHint: t('books.chart.treasuryHint'),
    iban: t('books.chart.iban'),
    ibanHint: t('books.chart.ibanHint'),
    create: t('books.chart.create'),
    addAccount: t('books.chart.addAccount'),
    rename: t('books.chart.rename'),
    save: t('books.chart.save'),
    retire: t('books.chart.retire'),
    reactivate: t('books.chart.reactivate'),
    delete: t('books.chart.delete'),
    deleteText: {
      question: String(t.raw('books.chart.deleteQuestion')),
      confirm: t('books.chart.deleteConfirm'),
      cancel: t('books.chart.cancel'),
      done: t('books.chart.deleted'),
      errors: chartErrors(t),
    },
    changed: t('books.chart.changed'),
    added: t('books.chart.added'),
    person: t('books.chart.person'),
    organisation: t('books.chart.organisation'),
    counterpartyKind: t('books.chart.counterpartyKind'),
    taxId: t('books.chart.taxId'),
    province: t('books.chart.province'),
    addCounterparty: t('books.chart.addCounterparty'),
    funder: t('books.chart.funder'),
    noFunder: t('books.chart.noFunder'),
    projectDescription: t('books.chart.projectDescription'),
    active: t('books.chart.active'),
    addProject: t('books.chart.addProject'),
    edit: t('books.chart.edit'),
    errors: chartErrors(t),
  };

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('books.chart.title')}</h1>
      <p className={styles.text}>{t('books.chart.intro')}</p>
      {keeper ? null : <p className={styles.hint}>{t('books.chart.readOnly')}</p>}
      <section aria-labelledby="para-empezar" className={styles.card}>
        <h2 id="para-empezar" className={styles.h3}>
          {t('books.chart.startTitle')}
        </h2>
        {banks.length === 0 ? (
          <p className={styles.text}>{t('books.chart.noBankAccount')}</p>
        ) : (
          <ul className={styles.linkList}>
            {banks.map((bank) => (
              <li key={bank.id}>
                {t('books.chart.bankAccount', { account: `${bank.code} · ${bank.name}` })}
                {bank.iban ? <span className={books.code}> · {formatIban(bank.iban)}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Disclosure
        id="plan-completo"
        heading
        label={t('books.chart.showChart', { count: accounts.length })}
        defaultOpen={banks.length === 0}
      >
        {keeper ? (
          <NewAccountForm parents={accounts.filter((account) => !account.used)} text={text} />
        ) : null}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>{t('books.chart.accounts')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('books.chart.name')}</th>
                <th scope="col" className={styles.wideColumn}>
                  {t('books.chart.kind')}
                </th>
                <th scope="col">{t('books.chart.treasury')}</th>
                {keeper ? <th scope="col">{t('books.chart.edit')}</th> : null}
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className={account.group ? books.groupRow : undefined}>
                  <th
                    scope="row"
                    className={books.chartName}
                    data-depth={Math.min(depthOf(account.code), 3)}
                  >
                    <span className={books.code}>{account.code}</span> · {account.name}
                    {account.active ? null : (
                      <span className={styles.block}>{t('books.chart.retired')}</span>
                    )}
                    {account.yearResult ? (
                      <span className={styles.block}>{t('books.chart.yearResult')}</span>
                    ) : null}
                    <span className={styles.narrowOnly}>{kinds[account.kind]}</span>
                  </th>
                  <td className={styles.wideColumn}>{kinds[account.kind]}</td>
                  <td>
                    {account.treasury ? t('books.chart.treasury') : ''}
                    {account.iban ? (
                      <span className={`${styles.block} ${books.code}`}>
                        {formatIban(account.iban)}
                      </span>
                    ) : null}
                  </td>
                  {keeper ? (
                    <td>
                      <AccountActions account={account} text={text} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
      <Disclosure
        id="plan-contrapartes"
        heading
        label={t('books.chart.showCounterparties', { count: counterparties.length })}
      >
        <p className={styles.text}>{t('books.chart.counterpartiesIntro')}</p>
        {keeper ? <CounterpartyForm text={text} /> : null}
        {counterparties.length === 0 ? (
          <p className={styles.text}>{t('books.chart.noCounterparties')}</p>
        ) : (
          <ul className={styles.cardList}>
            {counterparties.map((counterparty) => (
              <li key={counterparty.id} className={styles.card}>
                <p>
                  <strong>{counterparty.name}</strong> · {t(`books.chart.${counterparty.kind}`)}
                </p>
                <dl className={styles.facts}>
                  {counterparty.taxId ? (
                    <>
                      <dt>{t('books.chart.taxId')}</dt>
                      <dd>{counterparty.taxId}</dd>
                    </>
                  ) : null}
                  {counterparty.province ? (
                    <>
                      <dt>{t('books.chart.province')}</dt>
                      <dd>{counterparty.province}</dd>
                    </>
                  ) : null}
                  {counterparty.iban ? (
                    <>
                      <dt>{t('books.chart.iban')}</dt>
                      <dd className={books.code}>{formatIban(counterparty.iban)}</dd>
                    </>
                  ) : null}
                </dl>
                {keeper ? <CounterpartyForm counterparty={counterparty} text={text} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
      <Disclosure
        id="plan-proyectos"
        heading
        label={t('books.chart.showProjects', { count: projects.length })}
      >
        <p className={styles.text}>{t('books.chart.projectsIntro')}</p>
        {keeper ? <ProjectForm funders={counterparties} text={text} /> : null}
        {projects.length === 0 ? (
          <p className={styles.text}>{t('books.chart.noProjects')}</p>
        ) : (
          <ul className={styles.cardList}>
            {projects.map((project) => (
              <li key={project.id} className={styles.card}>
                <p>
                  <strong>{project.name}</strong> ·{' '}
                  {project.active ? t('books.chart.active') : t('books.chart.ended')}
                </p>
                {project.funder ? (
                  <p className={styles.text}>
                    {t('books.reports.funder', { name: project.funder.name })}
                  </p>
                ) : null}
                {project.description ? <p className={styles.text}>{project.description}</p> : null}
                {keeper ? (
                  <ProjectForm project={project} funders={counterparties} text={text} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
    </AppShell>
  );
};

export default ChartPage;
