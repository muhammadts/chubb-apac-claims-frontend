const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, reset } = require('./server');

const server = app.listen(0, '127.0.0.1');
const base = new Promise((resolve) => server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`)));
after(() => server.close());
const headers = (role = 'Claimant') => ({ 'x-mock-role': role, 'x-mock-sub': 'claimant', 'x-mock-market': 'MOCK', 'x-mock-team': 'MOCK-TEAM' });

test('claimant detail is private and returns a quoted ETag', async () => {
  reset(); const response = await fetch(`${await base}/api/v1/claims/11111111-1111-4111-8111-111111111111`, { headers: headers() });
  const json = await response.json(); assert.equal(response.status, 200); assert.equal(response.headers.get('etag'), '"1"'); assert.equal('internalNotes' in json, false); assert.equal('decisionRationale' in json, false);
  const masked = await fetch(`${await base}/api/v1/claims/11111111-1111-4111-8111-111111111111`, { headers: { ...headers(), 'x-mock-sub': 'another-claimant' } });
  assert.equal(masked.status, 404);
});

test('mock identity is role checked and staff detail requires scope', async () => {
  reset(); const url = `${await base}/api/v1/staff/claims/11111111-1111-4111-8111-111111111111`;
  assert.equal((await fetch(url, { headers: headers() })).status, 403);
  const denied = await fetch(url, { headers: { ...headers('ClaimsOfficer'), 'x-mock-team': 'OTHER' } }); assert.equal(denied.status, 403);
  assert.equal((await fetch(url, { headers: headers('ClaimsOfficer') })).status, 200);
});

test('mutations require current If-Match and reject stale versions', async () => {
  reset(); const url = `${await base}/api/v1/staff/claims/11111111-1111-4111-8111-111111111111/review`;
  assert.equal((await fetch(url, { method: 'POST', headers: headers('ClaimsOfficer') })).status, 428);
  const stale = await fetch(url, { method: 'POST', headers: { ...headers('ClaimsOfficer'), 'if-match': '"0"' } }); assert.equal(stale.status, 409);
  const success = await fetch(url, { method: 'POST', headers: { ...headers('ClaimsOfficer'), 'if-match': '"1"' } }); assert.equal(success.status, 200); assert.equal(success.headers.get('etag'), '"2"');
});

test('cursor pagination is opaque, deterministic, and validates malformed cursors', async () => {
  reset(); const url = `${await base}/api/v1/claims?pageSize=1`;
  const first = await (await fetch(url, { headers: headers() })).json(); assert.equal(first.items.length, 1); assert.ok(first.nextCursor);
  const second = await (await fetch(`${url}&cursor=${encodeURIComponent(first.nextCursor)}`, { headers: headers() })).json(); assert.equal(second.items.length, 1); assert.notEqual(second.items[0].claimId, first.items[0].claimId);
  assert.equal((await fetch(`${url}&cursor=garbage`, { headers: headers() })).status, 400);
  assert.equal((await fetch(`${await base}/api/v1/claims?pageSize=100`, { headers: headers() })).status, 200);
  assert.equal((await fetch(`${await base}/api/v1/claims?pageSize=101`, { headers: headers() })).status, 400);
});

test('information response advances status and preserves the claimant projection', async () => {
  reset(); const url = `${await base}/api/v1/claims/22222222-2222-4222-8222-222222222222/information-requests/33333333-3333-4333-8333-333333333333/responses`;
  const response = await fetch(url, { method: 'POST', headers: { ...headers(), 'content-type': 'application/json', 'if-match': '"2"' }, body: JSON.stringify({ responseText: 'Additional information' }) });
  assert.equal(response.status, 200); assert.equal(response.headers.get('etag'), '"3"'); assert.equal((await response.json()).status, 'InReview');
});

test('mock reset restores the deterministic seed after local changes', async () => {
  reset();
  const submitted = await fetch(`${await base}/api/v1/claims`, {
    method: 'POST',
    headers: { ...headers(), 'content-type': 'application/json' },
    body: JSON.stringify({
      marketCode: 'MOCK',
      lineOfBusiness: 'Motor',
      contact: { name: 'Local test', email: 'test@example.invalid' },
      incident: { occurredAt: '2026-01-15T10:00:00.000Z', description: 'Mock reset test' },
      motor: {},
    }),
  });
  assert.equal(submitted.status, 201);
  assert.equal((await (await fetch(`${await base}/api/v1/claims`, { headers: headers() })).json()).items.length, 3);

  const resetResponse = await fetch(`${await base}/__mock/reset`, { method: 'POST' });
  assert.equal(resetResponse.status, 200);
  assert.deepEqual(await resetResponse.json(), { status: 'reset', mode: 'mock' });
  assert.equal((await (await fetch(`${await base}/api/v1/claims`, { headers: headers() })).json()).items.length, 2);
});
