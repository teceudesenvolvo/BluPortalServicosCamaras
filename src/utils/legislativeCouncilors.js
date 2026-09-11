const readPath = (source, path = '') => String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);

const normalizeCouncilor = (record, fields = {}) => ({
  id: String(readPath(record, fields.id || 'id') || ''),
  userId: String(readPath(record, fields.userId || 'userId') || ''),
  name: String(readPath(record, fields.name || 'nome') || ''),
  cargo: String(readPath(record, fields.cargo || 'nome_parlamentar') || 'Vereador(a)'),
  partido: String(readPath(record, fields.party || 'partido.sigla') || ''),
  avatarUrl: String(readPath(record, fields.photo || 'foto') || ''),
  email: String(readPath(record, fields.email || 'email') || ''),
  external: true,
});

export const fetchLegislativeCouncilors = async settings => {
  const config = settings?.integrations?.legislativeApi;
  if (!config?.enabled || !config.url) return null;
  const response = await fetch(config.url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`A API legislativa respondeu HTTP ${response.status}.`);
  const payload = await response.json();
  const source = config.responsePath ? readPath(payload, config.responsePath) : payload;
  const records = Array.isArray(source) ? source : Array.isArray(source?.results) ? source.results : [];
  return records.map(record => normalizeCouncilor(record, config.fields)).filter(item => item.name);
};
