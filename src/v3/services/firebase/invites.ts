import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { InviteType, InviteStatus, InviteUnavailableError } from '../../definition/invite.js';
import { AppRoleType } from '../../definition/app.js';

const db = getFirestore();
const INVITES_COLLECTION = 'invites';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function getExpiryTimestamp(): number {
  return Date.now() + 24 * 60 * 60 * 1000; // 24 hours
}

function toISOString(ts: number): string {
  return new Date(ts).toISOString();
}

export async function createInvite(input: {
  email: string;
  congregation_id: string;
  role: AppRoleType[];
  created_by: string;
}): Promise<{ invite: InviteType; token: string }> {
  const token = generateToken();
  const token_hash = hashToken(token);
  const now = Date.now();
  const expires_at = getExpiryTimestamp();

  const inviteData: Omit<InviteType, 'id'> = {
    email: input.email.toLowerCase(),
    congregation_id: input.congregation_id,
    role: input.role,
    token_hash,
    status: 'pending',
    expires_at: toISOString(expires_at),
    created_at: toISOString(now),
    created_by: input.created_by,
    accepted_at: null,
    accepted_by: null,
    revoked_at: null,
  };

  const docRef = await db.collection(INVITES_COLLECTION).add(inviteData);
  const invite: InviteType = { id: docRef.id, ...inviteData };
  return { invite, token };
}

export async function findInviteByToken(token: string): Promise<InviteType | null> {
  const token_hash = hashToken(token);
  const snapshot = await db
    .collection(INVITES_COLLECTION)
    .where('token_hash', '==', token_hash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as InviteType;
}

export async function findInviteById(id: string): Promise<InviteType | null> {
  const doc = await db.collection(INVITES_COLLECTION).doc(id).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...doc.data() } as InviteType;
}

export async function acceptInviteTransactional(id: string, auth_uid: string): Promise<InviteType> {
	return completeInviteProvisioning(id, auth_uid);
}

export async function beginInviteProvisioning(id: string, auth_uid: string): Promise<InviteType> {
	const inviteRef = db.collection(INVITES_COLLECTION).doc(id);
	const provisioning_user_id = crypto.randomUUID().toUpperCase();

  const result = await db.runTransaction(async (transaction) => {
    const inviteDoc = await transaction.get(inviteRef);

    if (!inviteDoc.exists) {
      throw new InviteUnavailableError('Invite not found');
    }

    const invite = inviteDoc.data() as InviteType;

		if (invite.status === 'accepted') {
			if (invite.accepted_by !== auth_uid) {
				throw new InviteUnavailableError(`Invite is ${invite.status}`);
			}

			return invite;
		}

		if (invite.status === 'provisioning') {
			if (invite.accepted_by !== auth_uid) {
				throw new InviteUnavailableError(`Invite is ${invite.status}`);
			}

			return invite;
		}

		if (invite.status !== 'pending') {
			throw new InviteUnavailableError(`Invite is ${invite.status}`);
    }

    const now = Date.now();
    if (new Date(invite.expires_at).getTime() <= now) {
      throw new InviteUnavailableError('Invite has expired');
    }

		transaction.update(inviteRef, {
			status: 'provisioning',
			accepted_by: auth_uid,
			provisioning_user_id,
		});

		return {
			...invite,
			status: 'provisioning' as InviteStatus,
			accepted_by: auth_uid,
			provisioning_user_id,
		};
	});

  return result;
}

export async function completeInviteProvisioning(id: string, auth_uid: string): Promise<InviteType> {
	const inviteRef = db.collection(INVITES_COLLECTION).doc(id);

	return db.runTransaction(async (transaction) => {
		const inviteDoc = await transaction.get(inviteRef);

		if (!inviteDoc.exists) {
			throw new InviteUnavailableError('Invite not found');
		}

		const invite = inviteDoc.data() as InviteType;
		if (invite.accepted_by !== auth_uid) {
			throw new InviteUnavailableError(`Invite is ${invite.status}`);
		}

		if (invite.status === 'accepted') {
			return invite;
		}

		if (invite.status !== 'provisioning') {
			throw new InviteUnavailableError(`Invite is ${invite.status}`);
		}

		const accepted_at = toISOString(Date.now());
		transaction.update(inviteRef, { status: 'accepted', accepted_at });

		return { ...invite, status: 'accepted' as InviteStatus, accepted_at };
	});
}

export async function revokeInvite(id: string, admin_uid: string): Promise<void> {
  const inviteRef = db.collection(INVITES_COLLECTION).doc(id);

  await db.runTransaction(async (transaction) => {
    const inviteDoc = await transaction.get(inviteRef);

    if (!inviteDoc.exists || inviteDoc.data()?.status !== 'pending') {
      throw new InviteUnavailableError('Invite is no longer pending');
    }

    transaction.update(inviteRef, {
      status: 'revoked',
      revoked_at: toISOString(Date.now()),
      revoked_by: admin_uid,
    });
  });
}

export async function listInvites(): Promise<InviteType[]> {
  const snapshot = await db
    .collection(INVITES_COLLECTION)
    .orderBy('created_at', 'desc')
    .get();

  const now = Date.now();
  return snapshot.docs.map((doc) => {
    const invite = { id: doc.id, ...doc.data() } as InviteType;
    return invite.status === 'pending' && new Date(invite.expires_at).getTime() <= now
      ? { ...invite, status: 'expired' as InviteStatus }
      : invite;
  });
}
