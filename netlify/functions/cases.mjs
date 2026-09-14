import { stores, readJson, json } from '../lib/store.mjs';

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const store = stores.cases();

  if (id) {
    const value = await readJson(store, `cases/${id}/current`);
    return value ? json(value) : json({ error: 'not_found' }, 404);
  }

  const { blobs = [] } = await store.list({ prefix: 'cases/', directories: false });
  const currentKeys = blobs.map(x => x.key).filter(k => k.endsWith('/current'));
  const values = (await Promise.all(currentKeys.map(k => readJson(store, k)))).filter(Boolean);
  return json(values);
};
