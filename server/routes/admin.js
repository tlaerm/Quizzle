const app = require('express').Router();
const {requireAdmin} = require('../middleware/auth');
const {getUsers, createUser, deleteUser, updateUserRole, changePassword, createApiKey, listApiKeys, revokeApiKey} = require('../utils/auth');
const fs = require('fs');
const path = require('path');
const {brandingFolder} = require('../utils/file');
const {createProvider} = require('../utils/ai');

app.post('/models', requireAdmin, async (req, res) => {
    const {provider, apiKey, baseUrl} = req.body;
    if (!provider) return res.status(400).json({message: 'Anbieter ist erforderlich.'});

    const instance = createProvider({provider, apiKey, baseUrl});
    if (!instance) return res.status(400).json({message: 'Ungültiger Anbieter.'});

    try {
        const models = await instance.listModels();
        res.json({models});
    } catch {
        res.json({models: []});
    }
});

app.get('/settings', requireAdmin, (req, res) => {
    const configPayload = JSON.parse(fs.readFileSync(path.join(brandingFolder, 'config.json'), 'utf8'));
    const brandingPayload = JSON.parse(fs.readFileSync(path.join(brandingFolder, 'branding.json'), 'utf8'));

    res.json({
        config: {
            ai: configPayload.ai || {provider: '', apiKey: '', model: '', baseUrl: ''},
            media: configPayload.media || {unsplashAccessKey: '', giphyApiKey: ''}
        },
        branding: brandingPayload
    });
});

app.put('/settings', requireAdmin, (req, res) => {
    const {config, branding} = req.body;

    if (config) {
        const configPath = path.join(brandingFolder, 'config.json');
        const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        if (config.ai) {
            existing.ai = {
                provider: config.ai.provider || '',
                apiKey: config.ai.apiKey || '',
                model: config.ai.model || '',
                baseUrl: config.ai.baseUrl || ''
            };
        }

        if (config.media) {
            existing.media = {
                unsplashAccessKey: config.media.unsplashAccessKey || '',
                giphyApiKey: config.media.giphyApiKey || ''
            };
        }

        delete existing.password;

        fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf8');

        delete require.cache[require.resolve(configPath)];
    }

    if (branding) {
        const brandingPath = path.join(brandingFolder, 'branding.json');
        const existing = JSON.parse(fs.readFileSync(brandingPath, 'utf8'));

        for (const key of ['name', 'color', 'imprint', 'privacy']) {
            if (branding[key] !== undefined) existing[key] = branding[key];
        }

        fs.writeFileSync(brandingPath, JSON.stringify(existing, null, 2), 'utf8');
        delete require.cache[require.resolve(brandingPath)];
    }

    res.json({success: true});
});

app.put('/branding/:type', requireAdmin, (req, res) => {
    const {type} = req.params;

    if (type !== 'logo' && type !== 'title') {
        return res.status(400).json({message: 'Ungültiger Bildtyp.'});
    }

    const {image} = req.body;

    if (!image || typeof image !== 'string') {
        return res.status(400).json({message: 'Kein Bild übermittelt.'});
    }

    const match = image.match(/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,(.+)$/);
    if (!match) {
        return res.status(400).json({message: 'Ungültiges Bildformat. Erlaubt: PNG, JPEG, GIF, WebP, SVG.'});
    }

    const buffer = Buffer.from(match[2], 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({message: 'Bild ist zu groß (max. 5 MB).'});
    }

    const filePath = path.join(brandingFolder, `${type}.png`);
    fs.writeFileSync(filePath, buffer);

    res.json({success: true});
});

app.delete('/branding/:type', requireAdmin, (req, res) => {
    const {type} = req.params;

    if (type !== 'logo' && type !== 'title') {
        return res.status(400).json({message: 'Ungültiger Bildtyp.'});
    }

    const defaultPath = path.join(process.cwd(), 'content', `${type}.png`);
    const targetPath = path.join(brandingFolder, `${type}.png`);

    if (!fs.existsSync(defaultPath)) {
        return res.status(404).json({message: 'Standard-Bild nicht gefunden.'});
    }

    fs.copyFileSync(defaultPath, targetPath);
    res.json({success: true});
});

app.get('/users', requireAdmin, (req, res) => {
    res.json({users: getUsers()});
});

app.post('/users', requireAdmin, (req, res) => {
    const {username, password, role} = req.body;

    if (!username || !password) {
        return res.status(400).json({message: 'Benutzername und Passwort sind erforderlich.'});
    }

    if (username.length < 3 || username.length > 32) {
        return res.status(400).json({message: 'Benutzername muss zwischen 3 und 32 Zeichen lang sein.'});
    }

    if (password.length < 6) {
        return res.status(400).json({message: 'Passwort muss mindestens 6 Zeichen lang sein.'});
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        return res.status(400).json({message: 'Benutzername darf nur Buchstaben, Zahlen, Punkte, Bindestriche und Unterstriche enthalten.'});
    }

    if (role && !['admin', 'teacher'].includes(role)) {
        return res.status(400).json({message: 'Ungültige Rolle.'});
    }

    const result = createUser(username, password, role || 'teacher');
    if (result.error) {
        return res.status(400).json({message: result.error});
    }

    res.json(result);
});

app.delete('/users/:userId', requireAdmin, (req, res) => {
    const {userId} = req.params;

    if (userId === req.user.id) {
        return res.status(400).json({message: 'Du kannst deinen eigenen Account nicht löschen.'});
    }

    const result = deleteUser(userId);
    if (result.error) {
        return res.status(400).json({message: result.error});
    }

    res.json(result);
});

app.put('/users/:userId/role', requireAdmin, (req, res) => {
    const {userId} = req.params;
    const {role} = req.body;

    if (!role || !['admin', 'teacher'].includes(role)) {
        return res.status(400).json({message: 'Ungültige Rolle.'});
    }

    if (userId === req.user.id) {
        return res.status(400).json({message: 'Du kannst deine eigene Rolle nicht ändern.'});
    }

    const result = updateUserRole(userId, role);
    if (result.error) {
        return res.status(400).json({message: result.error});
    }

    res.json(result);
});

app.put('/users/:userId/password', requireAdmin, (req, res) => {
    const {userId} = req.params;
    const {password} = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({message: 'Passwort muss mindestens 6 Zeichen lang sein.'});
    }

    const result = changePassword(userId, password);
    if (result.error) {
        return res.status(400).json({message: result.error});
    }

    res.json(result);
});

app.post('/users/:userId/api-keys', requireAdmin, (req, res) => {
    const {userId} = req.params;
    const {name, expiresAt} = req.body;

    if (userId !== req.user.id) {
        return res.status(403).json({message: 'Du kannst nur deine eigenen API-Schlüssel verwalten.'});
    }

    if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({message: 'Name ist erforderlich.'});
    }

    const result = createApiKey(userId, name.trim(), expiresAt);
    if (result.error) {
        return res.status(result.status || 400).json({message: result.error});
    }

    res.json(result);
});

app.get('/users/:userId/api-keys', requireAdmin, (req, res) => {
    const {userId} = req.params;

    if (userId !== req.user.id) {
        return res.status(403).json({message: 'Du kannst nur deine eigenen API-Schlüssel verwalten.'});
    }

    const result = listApiKeys(userId);
    if (result.error) {
        return res.status(result.status || 400).json({message: result.error});
    }

    res.json(result);
});

app.delete('/users/:userId/api-keys/:keyId', requireAdmin, (req, res) => {
    const {userId, keyId} = req.params;

    if (userId !== req.user.id) {
        return res.status(403).json({message: 'Du kannst nur deine eigenen API-Schlüssel verwalten.'});
    }

    const result = revokeApiKey(userId, keyId);
    if (result.error) {
        return res.status(result.status || 400).json({message: result.error});
    }

    res.json(result);
});

module.exports = app;
