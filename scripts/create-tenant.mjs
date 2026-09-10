import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const required = ['slug', 'name', 'city', 'state', 'rootEmail'];
const missing = required.filter(key => !args[key]);
if (missing.length) {
  console.error(`Uso: npm run tenant:create -- --slug=municipio --name="Câmara Municipal de Município" --city=Município --state=CE --rootEmail=admin@camara.gov.br`);
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(args.slug)) {
  console.error('O slug aceita apenas letras minúsculas, números e hífens.');
  process.exit(1);
}

const projectRoot = resolve(import.meta.dirname, '..');
const tenantDir = resolve(projectRoot, 'tenants', args.slug);
if (existsSync(tenantDir)) {
  console.error(`O tenant ${args.slug} já existe.`);
  process.exit(1);
}
const template = JSON.parse(readFileSync(resolve(projectRoot, 'tenants/example/tenant.config.json'), 'utf8'));
template.tenant = { ...template.tenant, name: args.name, shortName: args.shortName || args.name, slug: args.slug, city: args.city, state: args.state.toUpperCase(), portalTitle: args.portalTitle || 'Portal de Serviços' };
template.security = { rootEmails: args.rootEmail.split(',').map(email => email.trim().toLowerCase()).filter(Boolean) };
mkdirSync(tenantDir, { recursive: true });
writeFileSync(resolve(tenantDir, 'tenant.config.json'), `${JSON.stringify(template, null, 2)}\n`);
writeFileSync(resolve(projectRoot, 'public/tenant.config.json'), `${JSON.stringify(template, null, 2)}\n`);
console.log(`Tenant ${args.slug} criado e ativado em public/tenant.config.json.`);
