import { InviteType } from '../definition/invite.js';
import { createInvite, findInviteByToken, listInvites, revokeInvite, acceptInviteTransactional } from '../services/firebase/invites.js';

class Invites {
  list: InviteType[];

  constructor() {
    this.list = [];
  }

  #sort() {
    this.list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async #add(invite: InviteType) {
    this.list.push(invite);
    this.#sort();
    return this.list.find((record) => record.id === invite.id)!;
  }

  async load() {
    this.list = await listInvites();
    this.#sort();
  }

  findById(id: string) {
    return this.list.find((invite) => invite.id === id);
  }

  findByEmail(email: string) {
    return this.list.find((invite) => invite.email === email.toLowerCase());
  }

  async findByToken(token: string) {
    return findInviteByToken(token);
  }

  async create(input: { email: string; congregation_id: string; role: string[]; created_by: string }) {
    const { invite } = await createInvite(input);
    return this.#add(invite);
  }

  async revoke(id: string, admin_uid: string) {
    await revokeInvite(id, admin_uid);
    const invite = this.findById(id);
    if (invite) {
      invite.status = 'revoked';
      invite.revoked_at = new Date().toISOString();
    }
  }

  async accept(id: string, auth_uid: string) {
    const updatedInvite = await acceptInviteTransactional(id, auth_uid);
    const index = this.list.findIndex((invite) => invite.id === id);
    if (index !== -1) {
      this.list[index] = updatedInvite;
    }
    return updatedInvite;
  }

  getPending() {
    return this.list.filter((invite) => invite.status === 'pending');
  }

  getAccepted() {
    return this.list.filter((invite) => invite.status === 'accepted');
  }

  getExpired() {
    return this.list.filter((invite) => invite.status === 'expired');
  }

  getRevoked() {
    return this.list.filter((invite) => invite.status === 'revoked');
  }
}

export const InvitesList = new Invites();
