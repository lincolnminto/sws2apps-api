import { existsSync } from 'node:fs';
import dotenv from 'dotenv';

/**
 * Mode-aware .env loader (dotenv-flow convention) using plain dotenv.
 *
 * Precedence (highest wins). dotenv never overrides an already-set variable,
 * so files are loaded highest-precedence first:
 *
 *   1. .env.[mode].local   → only in `mode`, git-ignored (machine secrets)
 *   2. .env.[mode]         → only in `mode`, committed (non-secret config)
 *   3. .env.local          → all modes, git-ignored (machine secrets)
 *   4. .env                → all modes, git-ignored base
 *
 * `mode` comes from NODE_ENV (`development` | `production` | `test`),
 * defaulting to `development`.
 *
 * On Cloud Run / hosted environments no .env file exists — variables are
 * injected by the platform and this loader is a no-op, which is intended.
 */
const mode = process.env.NODE_ENV || 'development';

const files = [`.env.${mode}.local`, `.env.${mode}`, '.env.local', '.env'];

for (const path of files) {
	if (existsSync(path)) {
		dotenv.config({ path });
	}
}
