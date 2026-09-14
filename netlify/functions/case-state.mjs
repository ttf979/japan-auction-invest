import { stores, validCaseId, readJson, writeJson, json } from '../lib/store.mjs';

const allowed = new Set(['收藏','待研究','已分析','準備投標','已投標','放棄','排除']);

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = await req.json().catch(() => null);
  if (!body || !validCaseId(body.caseId) || !allowed.has(body.status)) {
    return json({ error: 'invalid_payload' }, 400);
  }
  const store = stores.userState();
  const key = `cases/${body.caseId}`;
  const previous = await readJson(store, key) || {};
  const next = { ...previous, status: body.status, updatedAt: new Date().toISOString() };
  await writeJson(store, key, next, { caseId: body.caseId, kind: 'user-state' });
  return json(next);
};
