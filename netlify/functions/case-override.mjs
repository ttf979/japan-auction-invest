import { stores, validCaseId, readJson, writeJson, json } from '../lib/store.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = await req.json().catch(() => null);
  if (!body || !validCaseId(body.caseId) || typeof body.field !== 'string' || body.field.length > 120) {
    return json({ error: 'invalid_payload' }, 400);
  }
  const store = stores.manual();
  const key = `cases/${body.caseId}`;
  const previous = await readJson(store, key) || { fields: {} };
  const fields = { ...(previous.fields || {}) };
  if (body.value === null || body.value === '') delete fields[body.field];
  else fields[body.field] = { value: body.value, confirmedAt: new Date().toISOString() };
  const next = { ...previous, fields, updatedAt: new Date().toISOString() };
  await writeJson(store, key, next, { caseId: body.caseId, kind: 'manual-override' });
  return json(next);
};
