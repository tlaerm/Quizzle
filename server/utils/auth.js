const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dataFolder = path.join(process.cwd(), 'data');
const usersFile = path.join(dataFolder, 'users.json');

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const TOKEN_LENGTH = 48;
const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
const API_KEY_PREFIX = 'qzk_';
const API_KEY_BYTES = 32;
const LAST_USED_STALE_MS = 60 * 60 * 1000; // 1h

const sessions = new Map();

const hashPassword = (password) => {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
    return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
    const [salt, hash] = stored.split(':');
    const verify = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verify, 'hex'));
};

const generateToken = () => crypto.randomBytes(TOKEN_LENGTH).toString('hex');

const readUsers = () => {
    try {
        if (!fs.existsSync(usersFile)) return {users: []};
        const data = fs.readFileSync(usersFile, 'utf8');
        const parsed = JSON.parse(data);
        delete parsed.sessions;
        return parsed;
    } catch {
        return {users: []};
    }
};

const writeUsers = (data) => {
    fs.writeFileSync(usersFile, JSON.stringify(data, null, 2), 'utf8');
};

const isSetupComplete = () => {
    const data = readUsers();
    return data.users.length > 0;
};

const createUser = (username, password, role = 'teacher') => {
    const data = readUsers();

    if (data.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        return {error: 'Benutzername existiert bereits.'};
    }

    const user = {
        id: crypto.randomUUID(),
        username,
        password: hashPassword(password),
        role,
        createdAt: new Date().toISOString()
    };

    data.users.push(user);
    writeUsers(data);

    return {user: {id: user.id, username: user.username, role: user.role}};
};

const login = (username, password) => {
    const data = readUsers();
    const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return {error: 'Ungültige Anmeldedaten.'};

    try {
        if (!verifyPassword(password, user.password)) {
            return {error: 'Ungültige Anmeldedaten.'};
        }
    } catch {
        return {error: 'Ungültige Anmeldedaten.'};
    }

    const token = generateToken();
    const expiresAt = Date.now() + TOKEN_EXPIRY;

    for (const [t, s] of sessions) {
        if (s.expiresAt <= Date.now()) sessions.delete(t);
    }

    sessions.set(token, {userId: user.id, expiresAt});

    return {
        token,
        user: {id: user.id, username: user.username, role: user.role}
    };
};

const validateToken = (token) => {
    if (!token) return null;

    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        if (session) sessions.delete(token);
        return null;
    }

    const data = readUsers();
    const user = data.users.find(u => u.id === session.userId);
    if (!user) return null;

    return {id: user.id, username: user.username, role: user.role};
};

const logout = (token) => {
    sessions.delete(token);
};

const getUsers = () => {
    const data = readUsers();
    return data.users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        createdAt: u.createdAt
    }));
};

const deleteUser = (userId) => {
    const data = readUsers();
    const idx = data.users.findIndex(u => u.id === userId);
    if (idx === -1) return {error: 'Benutzer nicht gefunden.'};

    const user = data.users[idx];
    data.users.splice(idx, 1);
    for (const [t, s] of sessions) {
        if (s.userId === userId) sessions.delete(t);
    }
    writeUsers(data);

    return {success: true, username: user.username};
};

const updateUserRole = (userId, role) => {
    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    if (!user) return {error: 'Benutzer nicht gefunden.'};

    user.role = role;
    writeUsers(data);

    return {user: {id: user.id, username: user.username, role: user.role}};
};

const changePassword = (userId, newPassword) => {
    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    if (!user) return {error: 'Benutzer nicht gefunden.'};

    user.password = hashPassword(newPassword);
    writeUsers(data);

    return {success: true};
};

const generateApiKeyPlaintext = () => {
    return API_KEY_PREFIX + crypto.randomBytes(API_KEY_BYTES).toString('base64url');
};

const hashApiKey = (plaintext) => {
    return crypto.createHash('sha256').update(plaintext).digest('hex');
};

const normalizeExpiry = (expiresAt) => {
    if (expiresAt === undefined || expiresAt === null || expiresAt === '') return undefined;
    const parsed = new Date(expiresAt);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
};

const createApiKey = (userId, name, expiresAt) => {
    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    if (!user) return {error: 'Benutzer nicht gefunden.', status: 404};

    const normalized = normalizeExpiry(expiresAt);
    if (normalized === null) return {error: 'Ungültiges Ablaufdatum.', status: 400};

    const key = generateApiKeyPlaintext();
    const record = {
        id: crypto.randomUUID(),
        name,
        keyHash: hashApiKey(key),
        suffix: key.slice(-4),
        createdAt: new Date().toISOString()
    };
    if (normalized) record.expiresAt = normalized;

    user.apiKeys = user.apiKeys || [];
    user.apiKeys.push(record);
    writeUsers(data);

    return {key, meta: {id: record.id, name: record.name, createdAt: record.createdAt, expiresAt: record.expiresAt || null}};
};

const validateApiKey = (plaintext) => {
    if (!plaintext || typeof plaintext !== 'string') return null;

    const data = readUsers();
    const needle = hashApiKey(plaintext);

    for (const user of data.users) {
        const keys = user.apiKeys || [];
        for (const entry of keys) {
            if (!entry.keyHash) continue;

            let match = false;
            try {
                match = crypto.timingSafeEqual(Buffer.from(needle, 'hex'), Buffer.from(entry.keyHash, 'hex'));
            } catch {
                continue;
            }
            if (!match) continue;
            if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= Date.now()) continue;

            if (!entry.lastUsedAt || Date.now() - new Date(entry.lastUsedAt).getTime() > LAST_USED_STALE_MS) {
                entry.lastUsedAt = new Date().toISOString();
                writeUsers(data);
            }

            return {id: user.id, username: user.username, role: user.role};
        }
    }

    return null;
};

const listApiKeys = (userId) => {
    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    if (!user) return {error: 'Benutzer nicht gefunden.', status: 404};

    return {keys: (user.apiKeys || []).map(k => ({
        id: k.id,
        name: k.name,
        createdAt: k.createdAt,
        expiresAt: k.expiresAt || null,
        lastUsedAt: k.lastUsedAt || null,
        suffix: k.suffix
    }))};
};

const revokeApiKey = (userId, keyId) => {
    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    if (!user) return {error: 'Benutzer nicht gefunden.', status: 404};

    const idx = (user.apiKeys || []).findIndex(k => k.id === keyId);
    if (idx === -1) return {error: 'API-Schlüssel nicht gefunden.', status: 404};

    user.apiKeys.splice(idx, 1);
    writeUsers(data);

    return {success: true};
};

module.exports = {
    isSetupComplete,
    createUser,
    login,
    validateToken,
    logout,
    getUsers,
    deleteUser,
    updateUserRole,
    changePassword,
    createApiKey,
    validateApiKey,
    listApiKeys,
    revokeApiKey
};
