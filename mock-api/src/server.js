const express = require('express');
const { randomUUID } = require('node:crypto');

const app = express();
const port = Number(process.env.MOCK_API_PORT || 4301);
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

const now = '2026-01-15T10:00:00.000Z';
const seed = () => [
  { claimId: '11111111-1111-4111-8111-111111111111', claimNumber: 'MOCK-0001', marketCode: 'MOCK', lineOfBusiness: 'Motor', status: 'Submitted', submittedAt: now, reportedAt: now, contact: { name: 'Mock Claimant', email: 'claimant@example.invalid' }, incident: { occurredAt: now, description: 'Deterministic mock motor scenario' }, motor: { make: 'Mock', model: 'Vehicle' }, property: null, decision: null, informationRequests: [], activities: [{ occurredAt: now, description: 'Claim submitted (mock data)' }], assignment: null, reserve: null, decisionRationale: null, assessments: [], reserveHistory: [], internalNotes: [], assignmentHistory: [], version: 1, owner: 'mock-claimant', marketScope: 'MOCK', teamScope: 'MOCK-TEAM' },
  { claimId: '22222222-2222-4222-8222-222222222222', claimNumber: 'MOCK-0002', marketCode: 'MOCK', lineOfBusiness: 'Property', status: 'AwaitingInformation', submittedAt: now, reportedAt: now, contact: { name: 'Mock Claimant', email: 'claimant@example.invalid' }, incident: { occurredAt: now, description: 'Deterministic mock property scenario' }, motor: null, property: { propertyType: 'Mock property', city: 'Mock City', countryCode: 'ZZ' }, decision: null, informationRequests: [{ requestId: '33333333-3333-4333-8333-333333333333', question: 'Provide additional details (mock request)', status: 'Open', createdAt: now }], assignment: { teamId: 'MOCK-TEAM' }, reserve: null, decisionRationale: null, assessments: [], reserveHistory: [], internalNotes: [], assignmentHistory: [], version: 2, owner: 'mock-claimant', marketScope: 'MOCK', teamScope: 'MOCK-TEAM' },
];
let claims = seed();
const problem = (res, status, title, detail) => res.status(status).type('application/problem+json').json({ type: 'about:blank', title, status, detail });
const card = (c) => ({ claimId: c.claimId, claimNumber: c.claimNumber, marketCode: c.marketCode, lineOfBusiness: c.lineOfBusiness, status: c.status, submittedAt: c.submittedAt, version: c.version });
const claimantDetail = (c) => ({ ...card(c), reportedAt: c.reportedAt, contact: c.contact, incident: c.incident, motor: c.motor, property: c.property, decision: c.decision && { type: c.decision.type, date: c.decision.date, amount: c.decision.amount }, informationRequests: c.informationRequests, activities: c.activities, version: c.version });
const staffDetail = (c) => ({ ...claimantDetail(c), assignment: c.assignment, reserve: c.reserve, decisionRationale: c.decisionRationale, assessments: c.assessments, reserveHistory: c.reserveHistory, internalNotes: c.internalNotes, assignmentHistory: c.assignmentHistory });
const setEtag = (res, c) => res.set('ETag', `"${c.version}"`);
const get = (id) => claims.find((c) => c.claimId === id);
const isGuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const role = (name) => (req, res, next) => req.get('x-mock-role') === name ? next() : problem(res, 403, 'Forbidden', `Mock role ${name} is required.`);
const scoped = (req, claim) => req.get('x-mock-market') === claim.marketScope && (req.get('x-mock-team') || '').split(',').includes(claim.teamScope);
function owned(req, res, next) { const c = get(req.params.claimId); if (!c || !isGuid(req.params.claimId) || c.owner !== (req.get('x-mock-sub') || 'claimant')) return problem(res, 404, 'Not Found', 'Claim was not found.'); req.claim = c; next(); }
function staffClaim(req, res, next) { const c = get(req.params.claimId); if (!c || !isGuid(req.params.claimId)) return problem(res, 404, 'Not Found', 'Claim was not found.'); if (!scoped(req, c)) return problem(res, 403, 'Forbidden', 'Mock market and team scope are required.'); req.claim = c; next(); }
function page(req, items) {
  const size = Number(req.query.pageSize || 20);
  if (!Number.isInteger(size) || size < 1 || size > 100) return { error: 'pageSize must be between 1 and 100.' };
  let offset = 0;
  if (req.query.cursor) { try { const decoded = Buffer.from(req.query.cursor, 'base64url').toString(); if (!/^offset:\d+$/.test(decoded)) throw Error(); offset = Number(decoded.slice(7)); } catch { return { error: 'Cursor is malformed.' }; } }
  const selected = items.slice(offset, offset + size), next = offset + size < items.length ? Buffer.from(`offset:${offset + size}`).toString('base64url') : null;
  return { items: selected, nextCursor: next };
}
function mutate(req, res, transition) {
  const c = req.claim; const match = req.get('if-match');
  if (!match) return problem(res, 428, 'Precondition Required', 'If-Match is required.');
  if (match !== `"${c.version}"`) return problem(res, 409, 'Conflict', 'Claim changed; reload before retrying.');
  const failure = transition(c, req.body || {});
  if (failure) return problem(res, 400, 'Bad Request', failure);
  c.version++;
  if (!Array.isArray(c.activities)) c.activities = [];
  c.activities.push({ occurredAt: new Date().toISOString(), description: 'Mock workflow updated' });
  setEtag(res, c);
  return res.json({ claimId: c.claimId, claimNumber: c.claimNumber, status: c.status, version: c.version });
}

app.get('/health', (_req, res) => res.json({ status: 'Healthy', mode: 'mock' }));
app.post('/__mock/reset', (_req, res) => { claims = seed(); res.json({ status: 'reset', mode: 'mock' }); });
app.post('/api/v1/claims', role('Claimant'), (req, res) => {
  const b = req.body || {};
  if (!b.marketCode || !['Motor', 'Property'].includes(b.lineOfBusiness) || !b.contact?.name || !b.contact?.email || !b.incident?.occurredAt || !b.incident?.description || Boolean(b.motor) === Boolean(b.property) || (b.lineOfBusiness === 'Motor') !== Boolean(b.motor)) return problem(res, 400, 'Validation Failed', 'Submission must match the documented fixed Motor or Property DTO.');
  const c = { claimId: randomUUID(), claimNumber: `MOCK-${String(claims.length + 1).padStart(4, '0')}`, marketCode: b.marketCode, lineOfBusiness: b.lineOfBusiness, status: 'Submitted', submittedAt: new Date().toISOString(), reportedAt: b.reportedAt || null, contact: b.contact, incident: b.incident, motor: b.motor || null, property: b.property || null, decision: null, informationRequests: [], activities: [], assignment: null, reserve: null, decisionRationale: null, assessments: [], reserveHistory: [], internalNotes: [], assignmentHistory: [], version: 1, owner: req.get('x-mock-sub') || 'claimant', marketScope: req.get('x-mock-market') || b.marketCode, teamScope: req.get('x-mock-team') || 'MOCK-TEAM' };
  claims.push(c); setEtag(res, c); return res.status(201).json({ claimId: c.claimId, claimNumber: c.claimNumber, status: c.status, version: c.version });
});
app.get('/api/v1/claims', role('Claimant'), (req, res) => { const result = page(req, claims.filter((c) => c.owner === (req.get('x-mock-sub') || 'claimant')).map(card)); return result.error ? problem(res, 400, 'Bad Request', result.error) : res.json(result); });
app.get('/api/v1/claims/:claimId', role('Claimant'), owned, (req, res) => { setEtag(res, req.claim); res.json(claimantDetail(req.claim)); });
app.get('/api/v1/claims/:claimId/status', role('Claimant'), owned, (req, res) => { const c = req.claim; setEtag(res, c); res.json({ claimId: c.claimId, claimNumber: c.claimNumber, status: c.status, submittedAt: c.submittedAt }); });
app.get('/api/v1/claims/:claimId/timeline', role('Claimant'), owned, (req, res) => { const result = page(req, req.claim.activities); result.error ? problem(res, 400, 'Bad Request', result.error) : res.json(result); });
app.post('/api/v1/claims/:claimId/information-requests/:requestId/responses', role('Claimant'), owned, (req, res) => mutate(req, res, (c, b) => { const r = c.informationRequests.find((item) => item.requestId === req.params.requestId && item.status === 'Open'); if (!r) return 'Open information request was not found.'; if ((b.responseText || '').length > 4000) return 'responseText must not exceed 4000 characters.'; r.status = 'Answered'; c.status = 'InReview'; return null; }));

app.get('/api/v1/staff/claims', role('ClaimsOfficer'), (req, res) => {
  const filters = req.query;
  let items = claims.filter((c) => scoped(req, c));
  for (const key of ['marketCode', 'status', 'claimNumber']) { const qkey = key === 'marketCode' ? 'market' : key; if (filters[qkey]) items = items.filter((c) => String(c[key]).toLowerCase().includes(String(filters[qkey]).toLowerCase())); }
  if (filters.teamId) items = items.filter((c) => c.assignment?.teamId === filters.teamId);
  if (filters.officerId) items = items.filter((c) => c.assignment?.officerSubjectId === filters.officerId);
  for (const [queryName, value] of Object.entries(filters)) {
    if (!['submittedFrom', 'submittedTo', 'incidentFrom', 'incidentTo'].includes(queryName)) continue;
    if (!Number.isFinite(Date.parse(value))) return problem(res, 400, 'Bad Request', `${queryName} must be a valid date.`);
    const field = queryName.startsWith('submitted') ? 'submittedAt' : 'incident.occurredAt';
    const boundary = Date.parse(value);
    items = items.filter((c) => {
      const timestamp = Date.parse(field.includes('.') ? c.incident?.occurredAt : c.submittedAt);
      return queryName.endsWith('From') ? timestamp >= boundary : timestamp <= boundary;
    });
  }
  const result = page(req, items.map(card)); result.error ? problem(res, 400, 'Bad Request', result.error) : res.json(result);
});
app.get('/api/v1/staff/claims/:claimId', role('ClaimsOfficer'), staffClaim, (req, res) => { setEtag(res, req.claim); res.json(staffDetail(req.claim)); });
const staffPost = (suffix, transition) => app.post(`/api/v1/staff/claims/:claimId/${suffix}`, role('ClaimsOfficer'), staffClaim, (req, res) => mutate(req, res, transition));
staffPost('assignment', (c, b) => { if (!b.teamId) return 'teamId is required.'; c.assignment = { teamId: b.teamId, officerSubjectId: b.officerSubjectId || null }; c.assignmentHistory.push(c.assignment); return null; });
staffPost('review', (c) => { if (c.status !== 'Submitted') return 'Review can start only from Submitted.'; c.status = 'InReview'; return null; });
staffPost('information-requests', (c, b) => { if (c.status !== 'InReview') return 'Information requests require InReview.'; if (!b.question?.trim()) return 'question is required.'; c.informationRequests.push({ requestId: randomUUID(), question: b.question, status: 'Open', createdAt: new Date().toISOString() }); c.status = 'AwaitingInformation'; return null; });
staffPost('resume-review', (c) => { if (c.status !== 'AwaitingInformation') return 'Review can resume only from AwaitingInformation.'; c.status = 'InReview'; return null; });
staffPost('assessments', (c, b) => { if (!['InReview', 'Assessment'].includes(c.status)) return 'Assessment requires InReview or Assessment.'; if (!b.assessmentType || !b.rationale) return 'assessmentType and rationale are required.'; c.assessments.push(b); if (b.reserveEstimate) { c.reserve = b.reserveEstimate; c.reserveHistory.push(b.reserveEstimate); } c.status = 'Assessment'; return null; });
staffPost('decision', (c, b) => { if (!['InReview', 'Assessment'].includes(c.status)) return 'Decision requires InReview or Assessment.'; if (!['Approved', 'Rejected'].includes(b.type) || !b.reason) return 'type and reason are required.'; c.decision = { type: b.type, date: new Date().toISOString(), amount: b.amount || null }; c.decisionRationale = b.reason; c.status = b.type; return null; });
staffPost('internal-notes', (c, b) => { if (!b.noteText?.trim()) return 'noteText is required.'; c.internalNotes.push({ noteText: b.noteText, createdAt: new Date().toISOString() }); return null; });
staffPost('settlement-workflow', (c) => { if (c.status !== 'Approved') return 'Settlement workflow requires Approved.'; c.status = 'Settled'; return null; });

app.get('/api/v1/manager/workload', role('Manager'), (req, res) => { const scopedClaims = claims.filter((c) => scoped(req, c)); res.json({ asOfUtc: new Date().toISOString(), groups: [{ marketCode: req.get('x-mock-market'), teamId: req.get('x-mock-team'), statusCounts: Object.fromEntries(['Submitted', 'InReview', 'Assessment', 'AwaitingInformation', 'Approved'].map((s) => [s, scopedClaims.filter((c) => c.status === s).length])), unassignedCount: scopedClaims.filter((c) => !c.assignment).length, ageingBands: { '0-7': 0, '8-30': 0, '31-90': 0, '90+': 0 } }], ageingDefinition: 'Elapsed UTC days since submission; mock fixture does not represent an SLA.' }); });
app.get('/api/v1/manager/performance', role('Manager'), (req, res) => { const fromUtc = Date.parse(req.query.fromUtc), toUtc = Date.parse(req.query.toUtc); if (!Number.isFinite(fromUtc) || !Number.isFinite(toUtc) || fromUtc >= toUtc) return problem(res, 400, 'Bad Request', 'Require fromUtc < toUtc.'); res.json({ fromUtc: req.query.fromUtc, toUtc: req.query.toUtc, decisionCount: 0, averageDecisionElapsedDays: null, medianDecisionElapsedDays: null, missingDecisionDurationCount: 0, settlementCount: 0, averageSettlementElapsedDays: null, missingSettlementDurationCount: 0 }); });
app.get('/api/v1/manager/exposure', role('Manager'), (req, res) => res.json({ asOfUtc: new Date().toISOString(), groups: [], missingReserveCount: claims.filter((c) => scoped(req, c) && !c.reserve).length, includedStatuses: ['Submitted', 'InReview', 'Assessment', 'AwaitingInformation', 'Approved'], assumption: 'Mock fixtures contain no reserve amounts; no cross-currency totals.' }));
app.use((_req, res) => problem(res, 404, 'Not Found', 'The requested API route is not implemented by the mock.'));

if (require.main === module) app.listen(port, '127.0.0.1', () => console.log(`Claims mock API listening at http://localhost:${port}`));
module.exports = { app, reset: () => { claims = seed(); } };
