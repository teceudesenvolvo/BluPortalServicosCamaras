const readPath = (source, path = '') => String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);

const castValue = (value, type) => {
    if (type === 'number') return value === '' || value == null ? null : Number(value);
    if (type === 'boolean') return value === true || value === 'true' || value === 1 || value === '1';
    if (type === 'date') return value ? new Date(value).toISOString() : null;
    if (type === 'array') return Array.isArray(value) ? value : value == null ? [] : [value];
    return value == null ? '' : String(value);
};

export const mapExternalRecord = (record, mappings = []) => Object.fromEntries(
    mappings.filter(item => item.targetField && item.sourceField).map(item => [
        item.targetField.trim(),
        castValue(readPath(record, item.sourceField.trim()), item.type || 'string'),
    ]),
);

export const fetchExternalIntegration = async integration => {
    const response = await fetch(integration.url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`A API respondeu HTTP ${response.status}.`);
    const payload = await response.json();
    const source = integration.responsePath ? readPath(payload, integration.responsePath) : payload;
    const records = Array.isArray(source) ? source : source ? [source] : [];
    return records.slice(0, 5).map(record => mapExternalRecord(record, integration.mappings));
};
