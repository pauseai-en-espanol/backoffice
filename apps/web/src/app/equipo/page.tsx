import type { Metadata } from 'next';

import { getFormatter, getTranslator } from '@backoffice/i18n/messages';

import type { Invitation, InvitationState, TeamMember } from '@/team/data';
import type { ConfirmText } from '@/ui/ConfirmAction';

import { isUnavailable } from '@/data';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getInvitations, getTeam } from '@/team/data';
import { InvitationActions } from '@/team/InvitationActions';
import { InviteForm } from '@/team/InviteForm';
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
  const [team, invitations] = await Promise.all([
    getTeam(),
    admin ? getInvitations() : Promise.resolve(undefined),
  ]);
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
