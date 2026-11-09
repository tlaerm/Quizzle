const {test, expect, beforeAll, afterAll, beforeEach} = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

// Isolate the data folder to a throwaway temp dir. The server modules resolve
// data/ against process.cwd() at import time, so we chdir before requiring
// them to keep the repository's real data untouched.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quizzle-apikeys-'));
process.chdir(tmp);
const dataDir = path.join(tmp, 'data');
const usersFile = path.join(tmp, 'data', 'users.json');

const {
    createUser, login, validateApiKey, createApiKey
} = require('../server/utils/auth');
const {requireAuth, requireAdmin} = require('../server/middleware/auth');
const adminRouter = require('../server/routes/admin');
const authRouter = require('../server/routes/auth');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);
app.use('/api/auth', authRouter);
app.get('/api/probe', requireAuth, (req, res) => res.json({user: req.user}));
app.get('/api/probe-admin', requireAdmin, (req, res) => res.json({ok: true}));

let server;
let base;

beforeAll(async () => {
    await new Promise(resolve => {
        server = app.listen(0, '127.0.0.1', () => {
            base = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tmp, {recursive: true, force: true});
});

beforeEach(() => {
    fs.mkdirSync(dataDir, {recursive: true});
    if (fs.existsSync(usersFile)) fs.rmSync(usersFile);
});

const call = (method, p, {bearer, cookie, body} = {}) => {
    const headers = {};
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
    if (cookie) headers['cookie'] = cookie;
    const options = {method, headers};
    if (body !== undefined) {
        options.body = JSON.stringify(body);
        headers['content-type'] = 'application/json';
    }
    return fetch(base + p, options);
};

test('created key matches the qzk_ format and only the hash is persisted', () => {
    const {user} = createUser('alice', 'password1', 'teacher');
    const created = createApiKey(user.id, 'ci');

    expect(created.key).toMatch(/^qzk_[A-Za-z0-9_-]{43}$/);

    const file = fs.readFileSync(usersFile, 'utf8');
    const expectedHash = crypto.createHash('sha256').update(created.key).digest('hex');
    expect(file).toContain(expectedHash);
    expect(file).not.toContain(created.key);
});

test('valid key resolves the user; wrong, expired and missing keys are rejected', () => {
    const {user: alice} = createUser('alice', 'password1', 'teacher');
    const {user: bob} = createUser('bob', 'password1', 'admin');

    const good = createApiKey(alice.id, 'ok').key;
    expect(validateApiKey(good)).toEqual({id: alice.id, username: 'alice', role: 'teacher'});

    expect(validateApiKey('qzk_' + 'a'.repeat(43))).toBeNull();
    expect(validateApiKey(null)).toBeNull();
    expect(validateApiKey('')).toBeNull();

    const expired = createApiKey(bob.id, 'old', '2000-01-01T00:00:00.000Z').key;
    expect(validateApiKey(expired)).toBeNull();
});

test('Bearer auth on protected routes: admin passes requireAdmin, teacher gets 403', async () => {
    const {user: admin} = createUser('root', 'password1', 'admin');
    const {user: teacher} = createUser('teach', 'password1', 'teacher');
    const adminKey = createApiKey(admin.id, 'adm').key;
    const teacherKey = createApiKey(teacher.id, 'tch').key;

    const r1 = await call('GET', '/api/probe', {bearer: adminKey});
    expect(r1.status).toBe(200);
    expect((await r1.json()).user.username).toBe('root');

    const r2 = await call('GET', '/api/probe-admin', {bearer: adminKey});
    expect(r2.status).toBe(200);

    const r3 = await call('GET', '/api/probe-admin', {bearer: teacherKey});
    expect(r3.status).toBe(403);

    const r4 = await call('GET', '/api/probe', {});
    expect(r4.status).toBe(401);
});

test('cookie session still authenticates when no Bearer header is present', async () => {
    createUser('carol', 'password1', 'admin');
    const {token} = login('carol', 'password1');

    const r = await call('GET', '/api/probe', {cookie: `quizzle_token=${token}`});
    expect(r.status).toBe(200);
    expect((await r.json()).user.username).toBe('carol');
});

test('a present (invalid) cookie is not bypassed by a valid Bearer', async () => {
    const {user: dave} = createUser('dave', 'password1', 'admin');
    const key = createApiKey(dave.id, 'k').key;

    const r = await call('GET', '/api/probe', {cookie: 'quizzle_token=stalegarbage', bearer: key});
    expect(r.status).toBe(401);
});

test('GET api-keys returns meta and suffix only, never full key material', async () => {
    const {user: admin} = createUser('dana', 'password1', 'admin');
    const created = createApiKey(admin.id, 'ci');

    const r = await call('GET', `/api/admin/users/${admin.id}/api-keys`, {bearer: created.key});
    expect(r.status).toBe(200);

    const body = await r.json();
    const text = JSON.stringify(body);
    expect(text).not.toContain(created.key);
    expect(text).toContain(created.key.slice(-4));

    expect(body.keys.length).toBe(1);
    expect(body.keys[0].id).toBe(created.meta.id);
    expect(body.keys[0].name).toBe('ci');
    expect(body.keys[0].suffix).toBe(created.key.slice(-4));
    expect(body.keys[0].keyHash).toBeUndefined();
});

test('revoked key is rejected immediately after DELETE', async () => {
    const {user: admin} = createUser('eve', 'password1', 'admin');
    const gone = createApiKey(admin.id, 'gone');
    const authKey = createApiKey(admin.id, 'auth').key;

    const before = validateApiKey(gone.key);
    expect(before && before.id).toBe(admin.id);

    const d = await call('DELETE', `/api/admin/users/${admin.id}/api-keys/${gone.meta.id}`, {bearer: authKey});
    expect(d.status).toBe(200);

    expect(validateApiKey(gone.key)).toBeNull();
});

test('unknown own key yields 404 and a missing name yields 400', async () => {
    const {user: admin} = createUser('frank', 'password1', 'admin');
    const authKey = createApiKey(admin.id, 'a').key;

    const r1 = await call('DELETE', `/api/admin/users/${admin.id}/api-keys/nope`, {bearer: authKey});
    expect(r1.status).toBe(404);

    const r2 = await call('POST', `/api/admin/users/${admin.id}/api-keys`, {bearer: authKey, body: {name: ''}});
    expect(r2.status).toBe(400);
});

test('an admin cannot manage another user\'s keys (403 on all three methods)', async () => {
    const {user: ada} = createUser('ada', 'password1', 'admin');
    const {user: bob} = createUser('bob', 'password1', 'admin');
    const adaKey = createApiKey(ada.id, 'ada-key').key;

    const g = await call('GET', `/api/admin/users/${bob.id}/api-keys`, {bearer: adaKey});
    expect(g.status).toBe(403);

    const p = await call('POST', `/api/admin/users/${bob.id}/api-keys`, {bearer: adaKey, body: {name: 'x'}});
    expect(p.status).toBe(403);

    const d = await call('DELETE', `/api/admin/users/${bob.id}/api-keys/nope`, {bearer: adaKey});
    expect(d.status).toBe(403);
});

test('a non-admin cannot manage api keys (403)', async () => {
    const {user: admin} = createUser('root2', 'password1', 'admin');
    const {user: teacher} = createUser('teach2', 'password1', 'teacher');
    const teacherKey = createApiKey(teacher.id, 't').key;

    const r = await call('GET', `/api/admin/users/${admin.id}/api-keys`, {bearer: teacherKey});
    expect(r.status).toBe(403);
});

test('GET /me authenticates via Bearer key when no cookie is present', async () => {
    const {user} = createUser('mia', 'password1', 'admin');
    const key = createApiKey(user.id, 'me').key;

    const r = await call('GET', '/api/auth/me', {bearer: key});
    expect(r.status).toBe(200);

    const body = await r.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.id).toBe(user.id);
    expect(body.user.username).toBe('mia');
    expect(body.user.role).toBe('admin');
});

test('GET /me with a cookie session is unchanged (cookie wins over a Bearer key)', async () => {
    createUser('olga', 'password1', 'teacher');
    const {user: petra} = createUser('petra', 'password1', 'teacher');
    const {token} = login('olga', 'password1');
    const petraKey = createApiKey(petra.id, 'petra').key;

    const r = await call('GET', '/api/auth/me', {cookie: `quizzle_token=${token}`, bearer: petraKey});
    expect(r.status).toBe(200);

    const body = await r.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.username).toBe('olga');
});
