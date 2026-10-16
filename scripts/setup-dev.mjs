import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('Existing .env preserved.');
} else {
  writeFileSync(
    '.env',
    `HOST=127.0.0.1\nPORT=18080\nAPP_ORIGIN=http://127.0.0.1:15173\nSESSION_SECRET=${randomBytes(48).toString('base64url')}\n`,
  );
  console.log('Created ignored local configuration.');
}
