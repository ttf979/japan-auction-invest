import { getStore } from '@netlify/blobs';

const strongStore = (name) => getStore(name, { consistency: 'strong' });

export const stores = {
  cases: () => strongStore('auction-cases'),
  snapshots: () => strongStore('auction-snapshots'),
  manual: () => strongStore('auction-manual'),
  userState: () => strongStore('auction-user-state'),
};

export function validCaseId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

export async function readJson(store, key) {
  return await store.get(key, { type: 'json' });
}

export async function writeJson(store, key, value) {
  return await store.setJSON(key, value);
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
