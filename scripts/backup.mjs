// Exports the remote D1 database to backups/maxfit-<date>.sql
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('backups', { recursive: true });
const file = `backups/maxfit-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
execSync(`npx wrangler d1 export maxfit-db --remote --output ../../${file}`, { cwd: 'apps/api', stdio: 'inherit' });
console.log('Backup written to', file);