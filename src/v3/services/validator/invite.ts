import { findInviteByToken } from '../firebase/invites.js';
import { InviteType, InviteUnavailableError } from '../../definition/invite.js';

export async function validateInviteToken(token: string, authUid?: string): Promise<InviteType> {
  if (!token) {
    throw new InviteUnavailableError('Invite token is required');
  }

  const invite = await findInviteByToken(token);

  if (!invite) {
    throw new InviteUnavailableError('Invalid invite token');
  }

	if (invite.status === 'provisioning' || invite.status === 'accepted') {
		if (authUid && invite.accepted_by === authUid) {
			return invite;
		}

		throw new InviteUnavailableError(`Invite is ${invite.status}`);
	}

	if (invite.status !== 'pending') {
    throw new InviteUnavailableError(`Invite is ${invite.status}`);
  }

  const now = Date.now();
  if (new Date(invite.expires_at).getTime() <= now) {
    throw new InviteUnavailableError('Invite has expired');
  }

  return invite;
}
