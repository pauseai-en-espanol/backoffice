import type { Metadata } from 'next';

import { getFormatter, getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import type { Invitation, InvitationState, TeamMember } from '@/team/data';
import type { ConfirmText } from '@/ui/ConfirmAction';

import { isUnavailable } from '@/data';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getInvitations, getPersonSuggestions, getPrivateRecords, getTeam } from '@/team/data';
import { HandOver } from '@/team/HandOver';
import { InvitationActions } from '@/team/InvitationActions';
import { InviteForm } from '@/team/InviteForm';
import { LinkSuggestion } from '@/team/LinkSuggestion';
import { MemberActions } from '@/team/MemberActions';
import { roleHelp, roleNames, teamErrors } from '@/team/text';
import { Announcer } from '@/ui/Announcer';
import { Status } from '@/ui/Status';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('team.title') };

const STATE_KIND = {
  pending: 'info',
  accepted: 'positive',
  revoked: 'negative',
  expired: 'attention',
} as const satisfies Record<InvitationState, string>;

/**
 * The team (ADR-0002, staff): everyone sees who is in it and with which roles, to know whom to hand people to. Admins
 * also invite, change roles and names, deactivate and reactivate, send password links, and manage invitations. Every
 * change is the API's and the database's to allow: an admin's buttons are only shown, never trusted.
 */
const TeamPage = async () => {
  const me = await requireStaff();
  const admin = me.staff.roles.includes('admin');
  // Who may open a person's page (onboarding staff and admins), and so follow "Ver su ficha".
  const opensPeople = admin || me.staff.roles.includes('onboarding');
  const [team, invitations, suggestions, privateRecords] = await Promise.all([
    getTeam(),
    admin ? getInvitations() : Promise.resolve(undefined),
    admin ? getPersonSuggestions() : Promise.resolve([]),
    admin ? getPrivateRecords() : Promise.resolve([]),
  ]);
  // Who may inherit a departed member's private outreach records (PLAN M5, step 6): active, in outreach or admin.
  const heirs = isUnavailable(team)
    ? []
    : team.staff
        .filter(
          (member) =>
            member.active && (member.roles.includes('outreach') || member.roles.includes('admin')),
        )
        .map(({ userId, displayName }) => ({ userId, displayName }));
  const recordsOf = (userId: string) =>
    isUnavailable(privateRecords)
      ? undefined
      : privateRecords.find((records) => records.userId === userId);
  const format = getFormatter();
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'long' });
  const names = roleNames(t);
  const help = roleHelp(t);
  const errors = teamErrors(t);
  const confirm = (question: string, done: string): ConfirmText => ({
    question,
    done,
    confirm: t('team.confirm'),
    cancel: t('team.cancel'),
    errors,
  });

  /**
   * A member's own person record (PLAN M5, step 5): a link to it for whoever can open it; else, for an admin, the
   * person who shares the account's email, to link here, or where linking is done.
   */
  const personOf = (member: TeamMember) => {
    if (member.personId !== null) {
      return opensPeople ? (
        <Link className={styles.link} href={`/personas/${encodeURIComponent(member.personId)}`}>
          {t('team.personOpen')}
        </Link>
      ) : (
        t('team.personOpen')
      );
    }
    const suggestion = isUnavailable(suggestions)
      ? undefined
      : suggestions.find((entry) => entry.userId === member.userId);
    if (!admin || !suggestion) {
      return admin ? t('team.personNoneHint') : t('team.personNone');
    }
    const name = suggestion.person.name ?? t('people.noName');
    return (
      <>
        <Link
          className={styles.link}
          href={`/personas/${encodeURIComponent(suggestion.person.id)}`}
        >
          {t('team.personSuggested', { name })}
        </Link>{' '}
        <LinkSuggestion
          userId={member.userId}
          personId={suggestion.person.id}
          label={t('team.personLink')}
          text={confirm(
            t('team.confirmPersonLink', { account: member.displayName, name }),
            t('team.personLinked'),
          )}
        />
      </>
    );
  };

  const memberCard = (member: TeamMember) => {
    const self = member.userId === (isUnavailable(team) ? '' : team.me);
    const name = member.displayName;
    return (
      <li key={member.userId} className={styles.card}>
        <h3 className={styles.h3}>
          {name} {self ? <span className={styles.muted}>{t('team.you')}</span> : null}
        </h3>
        <dl className={styles.facts}>
          <dt>{t('team.permissions')}</dt>
          <dd>
            {member.roles.length === 0 ? (
              t('team.noRoles')
            ) : (
              <ul className={styles.tags}>
                {member.roles.map((role) => (
                  <li key={role} className={styles.tag}>
                    {names[role]}
                  </li>
                ))}
              </ul>
            )}
          </dd>
          <dt>{t('team.status')}</dt>
          <dd>
            {member.active ? (
              <Status kind="positive" label={t('team.active')} />
            ) : (
              <Status kind="negative" label={t('team.inactive')} />
            )}
          </dd>
          <dt>{t('team.person')}</dt>
          <dd>{personOf(member)}</dd>
          {member.active || member.deactivatedAt === null ? (
            <>
              <dt>{t('team.since')}</dt>
              <dd>{day(member.createdAt)}</dd>
            </>
          ) : (
            <>
              <dt>{t('team.deactivatedOn')}</dt>
              <dd>{day(member.deactivatedAt)}</dd>
            </>
          )}
        </dl>
        {admin && !member.active && recordsOf(member.userId) ? (
          <section aria-label={t('team.privateRecords')}>
            <h4 className={styles.label}>{t('team.privateRecords')}</h4>
            <p className={styles.text}>
              {t('team.privateCounts', {
                contacts: recordsOf(member.userId)?.contacts ?? 0,
                organisations: recordsOf(member.userId)?.organisations ?? 0,
                notes: recordsOf(member.userId)?.notes ?? 0,
              })}
            </p>
            <HandOver
              userId={member.userId}
              heirs={heirs}
              text={{
                heir: t('team.heir'),
                heirHint: t('team.heirHint'),
                heirNone: t('team.heirNone'),
                handOver: t('team.handOver'),
                handedOver: t('team.handedOver'),
                errors: {
                  ...errors,
                  heir: t('team.handOverErrors.heir'),
                  stillActive: t('team.handOverErrors.stillActive'),
                },
              }}
            />
          </section>
        ) : null}
        {admin ? (
          <MemberActions
            member={member}
            text={{
              editor: {
                edit: t('team.edit'),
                title: t('team.editTitle', { name }),
                rename: t('team.rename'),
                roles: t('team.permissions'),
                save: t('team.save'),
                cancel: t('team.cancel'),
                saved: t('team.saved'),
                roleNames: names,
                roleHelp: help,
                errors,
              },
              activation: member.active
                ? {
                    label: t('team.deactivate'),
                    ...confirm(
                      t('team.confirmDeactivate', { name }),
                      t('team.deactivated', { name }),
                    ),
                  }
                : {
                    label: t('team.reactivate'),
                    ...confirm(
                      t('team.confirmReactivate', { name }),
                      t('team.reactivated', { name }),
                    ),
                  },
              passwordLink: {
                label: t('team.passwordLink'),
                ...confirm(
                  t('team.confirmPasswordLink', { name }),
                  t('team.passwordLinkSent', { name }),
                ),
              },
            }}
          />
        ) : null}
      </li>
    );
  };

  const invitationCard = (invitation: Invitation) => {
    const pending = invitation.state === 'pending';
    return (
      <li key={invitation.id} className={styles.card}>
        <h3 className={`${styles.h3} ${styles.breakAnywhere}`}>{invitation.email}</h3>
        <dl className={styles.facts}>
          <dt>{t('team.invitations.state')}</dt>
          <dd>
            <Status
              kind={STATE_KIND[invitation.state]}
              label={t(`team.invitations.${invitation.state}`)}
            />
          </dd>
          <dt>{t('team.permissions')}</dt>
          <dd>{invitation.roles.map((role) => names[role]).join(', ')}</dd>
          <dt>{t('team.invitations.by')}</dt>
          <dd>{invitation.createdBy.displayName}</dd>
          {pending ? (
            <>
              <dt>{t('team.invitations.expires')}</dt>
              <dd>{day(invitation.expiresAt)}</dd>
            </>
          ) : null}
        </dl>
        <InvitationActions
          id={invitation.id}
          pending={pending}
          text={
            pending
              ? {
                  label: t('team.invitations.revoke'),
                  ...confirm(
                    t('team.invitations.confirmRevoke', { email: invitation.email }),
                    t('team.invitations.revokedDone'),
                  ),
                }
              : {
                  label: t('team.invitations.delete'),
                  ...confirm(
                    t('team.invitations.confirmDelete', { email: invitation.email }),
                    t('team.invitations.deleted'),
                  ),
                }
          }
        />
      </li>
    );
  };

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('team.title')}</h1>
      <p className={styles.text}>{t('team.intro')}</p>
      <Announcer>
        <section aria-labelledby="members">
          <h2 id="members" className={styles.h2}>
            {t('team.members')}
          </h2>
          {isUnavailable(team) ? (
            <p className={styles.notice}>{t('web.unavailable.body')}</p>
          ) : (
            <ul className={styles.cardList}>{team.staff.map(memberCard)}</ul>
          )}
        </section>
        {admin ? (
          <>
            <section aria-labelledby="invite">
              <h2 id="invite" className={styles.h2}>
                {t('team.invite.title')}
              </h2>
              <p className={styles.text}>{t('team.invite.intro')}</p>
              <InviteForm
                text={{
                  email: t('team.invite.email'),
                  roles: t('team.invite.roles'),
                  rolesHint: t('team.invite.rolesHint'),
                  submit: t('team.invite.submit'),
                  sent: String(t.raw('team.invite.sent')),
                  roleNames: names,
                  roleHelp: help,
                  errors,
                }}
              />
            </section>
            <section aria-labelledby="invitations">
              <h2 id="invitations" className={styles.h2}>
                {t('team.invitations.title')}
              </h2>
              {invitations === undefined || isUnavailable(invitations) ? (
                <p className={styles.notice}>{t('web.unavailable.body')}</p>
              ) : invitations.length === 0 ? (
                <p className={styles.text}>{t('team.invitations.none')}</p>
              ) : (
                <ul className={styles.cardList}>{invitations.map(invitationCard)}</ul>
              )}
            </section>
          </>
        ) : null}
      </Announcer>
    </AppShell>
  );
};

export default TeamPage;
