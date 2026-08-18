import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { getAuth } from 'firebase-admin/auth';
import { MailClient } from '../config/mail_config.js';
import { InvitesList } from '../classes/Invites.js';
import { UsersList } from '../classes/Users.js';
import {
  acceptInviteTransactional,
  createInvite as createFirestoreInvite,
  listInvites as listFirestoreInvites,
  revokeInvite as revokeFirestoreInvite,
} from '../services/firebase/invites.js';
import { decodeUserIdToken } from '../services/firebase/users.js';
import { InviteUnavailableError } from '../definition/invite.js';
import { AppRoleType } from '../definition/app.js';
import { validateInviteToken } from '../services/validator/invite.js';

const invalidToken = { message: 'error_auth_invalid-token' };

const hasValidationErrors = (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;

  res.status(400).json({ message: 'error_api_bad-request' });
  return true;
};

export const createInvite = async (req: Request, res: Response) => {
  if (hasValidationErrors(req, res)) return;

  const { email, congregation_id, role } = req.body as {
    email: string;
    congregation_id: string;
    role: AppRoleType[];
  };
  const created_by = res.locals.inviteAdminUid as string;
  const { token } = await createFirestoreInvite({ email, congregation_id, role, created_by });
  await InvitesList.load();

  const appHost = process.env.ORGANIZED_APP_HOST || process.env.APP_HOST || 'http://localhost:5173';
  const language = (req.headers.applanguage as string) || 'eng';
  req.i18n?.changeLanguage(language);
  const translate = (key: string, fallback: string) => req.t?.(key) || fallback;

  const options = {
    to: email,
    subject: translate('tr_inviteTitle', "You're invited to join Organized"),
    template: 'invite',
    context: {
      inviteTitle: translate('tr_inviteTitle', "You're invited to join Organized"),
      inviteDesc: translate('tr_inviteDesc', 'An administrator has invited you to join their congregation on Organized.'),
      inviteButton: translate('tr_inviteButton', 'Accept invitation'),
      inviteExpiry: translate('tr_inviteExpiry', 'This invitation expires in 24 hours.'),
      link: `${appHost}/?invite=${token}`,
      copyright: new Date().getFullYear(),
    },
  };

  await MailClient.sendEmail(options, 'Invite email sent to user');

  res.status(200).json({ message: 'INVITE_SENT' });
};

export const listInvites = async (_req: Request, res: Response) => {
  const invites = await listFirestoreInvites();
  res.status(200).json(
    invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      congregation_id: invite.congregation_id,
      role: invite.role,
      status: invite.status,
      expires_at: invite.expires_at,
      created_at: invite.created_at,
      created_by: invite.created_by,
      accepted_at: invite.accepted_at,
      accepted_by: invite.accepted_by,
      revoked_at: invite.revoked_at,
    })),
  );
};

export const revokeInvite = async (req: Request, res: Response) => {
  try {
    await revokeFirestoreInvite(req.params.id, res.locals.inviteAdminUid as string);
    await InvitesList.load();
    res.status(200).json({ message: 'INVITE_REVOKED' });
  } catch (error) {
    if (error instanceof InviteUnavailableError) {
      res.status(410).json(invalidToken);
      return;
    }
    throw error;
  }
};

export const getInviteInfo = async (req: Request, res: Response) => {
  try {
    const invite = await validateInviteToken(String(req.query.token || ''));
    res.status(200).json({
      email: invite.email,
      congregation_id: invite.congregation_id,
      role: invite.role,
      expires_at: invite.expires_at,
    });
  } catch (error) {
    if (error instanceof InviteUnavailableError) {
      res.status(410).json(invalidToken);
      return;
    }
    throw error;
  }
};

export const acceptInvite = async (req: Request, res: Response) => {
  if (hasValidationErrors(req, res)) return;

  try {
    const { token, firstname, lastname } = req.body as {
      token: string;
      firstname: string;
      lastname: string;
    };
    const invite = await validateInviteToken(token);
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    const uid = idToken ? await decodeUserIdToken(idToken) : undefined;

    if (!uid) {
      res.status(401).json(invalidToken);
      return;
    }

    const authUser = await getAuth().getUser(uid);
    if (authUser.email?.toLowerCase() !== invite.email.toLowerCase()) {
      res.status(403).json({ message: 'UNAUTHORIZED_ACCESS' });
      return;
    }

    await acceptInviteTransactional(invite.id, uid);
    const user = await UsersList.create({ auth_uid: uid, firstname, lastname, email: invite.email });

    await user.assignCongregation({
      congId: invite.congregation_id,
      role: invite.role,
      firstname,
      lastname,
    });
    await InvitesList.load();
    res.status(200).json({ user_id: user.id, congregation_id: invite.congregation_id });
  } catch (error) {
    if (error instanceof InviteUnavailableError) {
      res.status(410).json(invalidToken);
      return;
    }
    throw error;
  }
};
