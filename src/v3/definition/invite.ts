import { AppRoleType } from './app.js';

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface InviteType {
  id: string;
  email: string;
  congregation_id: string;
  role: AppRoleType[];
  token_hash: string;
  status: 'pending'|'accepted'|'expired'|'revoked';
  expires_at: string; // ISO-8601 string
  created_at: string; // ISO-8601 string
  created_by: string; // admin uid
  accepted_at?: string | null;
  accepted_by?: string | null;
  revoked_at?: string | null;
}

export class InviteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteUnavailableError';
  }
}
