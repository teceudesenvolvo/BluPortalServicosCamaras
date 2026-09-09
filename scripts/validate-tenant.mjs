import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const configPath = resolve(import.meta.dirname, '../public/tenant.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const errors = [];
if (config.schemaVersion !== 1) errors.push('schemaVersion deve ser 1');
for (const field of ['name','slug','city','state']) if (!config.tenant?.[field]) errors.push(`tenant.${field} é obrigatório`);
for (const field of ['primaryColor','secondaryColor','accentColor']) if (!/^#[0-9a-f]{6}$/i.test(config.design?.[field] || '')) errors.push(`design.${field} deve ser uma cor hexadecimal`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Tenant ${config.tenant.slug} válido.`);
