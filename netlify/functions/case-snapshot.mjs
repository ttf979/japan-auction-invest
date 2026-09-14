import { stores, validCaseId, writeJson, json } from '../lib/store.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = await req.json().catch(() => null);
  if (!body || !validCaseId(body.caseId) || !body.payload || typeof body.payload !== 'object') {
    return json({ error: 'invalid_payload' }, 400);
  }

  const now = new Date().toISOString();
  const snapshotKey = `cases/${body.caseId}/${now}`;
  const snapshots = stores.snapshots();
  await writeJson(snapshots, snapshotKey, {
    caseId: body.caseId,
    source: body.source || 'unknown',
    result: body.result || 'success',
    payload: body.payload,
    capturedAt: now,
  }, { caseId: body.caseId, kind: 'snapshot' });

  // Only a successful update may replace the current case record.
  if ((body.result || 'success') === 'success') {
    await writeJson(stores.cases(), `cases/${body.caseId}/current`, body.payload, {
      caseId: body.caseId,
      kind: 'current-case',
      source: body.source || 'unknown',
    });
  }

  return json({ ok: true, snapshotKey, currentUpdated: (body.result || 'success') === 'success' });
};
