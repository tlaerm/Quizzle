const rateLimit = require('express-rate-limit');
const app = require('express').Router();
const {isSetupComplete, createUser, login, validateToken, logout, validateApiKey} = require('../utils/auth');
const {extractToken, extractBearer} = require('../middleware/auth');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: {message: 'Zu viele Anmeldeversuche. Bitte versuche es später erneut.'}
});

const setupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: {message: 'Zu viele Versuche. Bitte versuche es später erneut.'}
});

const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const setTokenCookie = (res, token) => {
    res.cookie('quizzle_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: TOKEN_MAX_AGE,
        path: '/'
    });
};

app.get('/setup-status', (req, res) => {
    res.json({setupComplete: isSetupComplete()});
});

app.post('/setup', setupLimiter, (req, res) => {
    if (isSetupComplete()) {
        return res.status(400).json({message: 'Setup wurde bereits abgeschlossen.'});
    }

    const {username, password} = req.body;

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

    const result = createUser(username, password, 'admin');
    if (result.error) {
        return res.status(400).json({message: result.error});
    }

    const loginResult = login(username, password);
    if (loginResult.error) {
        return res.status(500).json({message: 'Setup erfolgreich, aber Anmeldung fehlgeschlagen.'});
    }

    setTokenCookie(res, loginResult.token);
    res.json({user: loginResult.user});
});

app.post('/login', loginLimiter, (req, res) => {
    const {username, password} = req.body;

    if (!username || !password) {
        return res.status(400).json({message: 'Benutzername und Passwort sind erforderlich.'});
    }

    const result = login(username, password);
    if (result.error) {
        return res.status(401).json({message: result.error});
    }

    setTokenCookie(res, result.token);
    res.json({user: result.user});
});

app.get('/me', (req, res) => {
    const token = extractToken(req);
    if (token) {
        const user = validateToken(token);
        if (!user) {
            return res.json({authenticated: false});
        }

        return res.json({authenticated: true, user});
    }

    // No session cookie: fall back to a Bearer API-key, mirroring requireAuth
    // (the key is consulted only when no quizzle_token cookie is present).
    const apiKey = extractBearer(req);
    const user = apiKey ? validateApiKey(apiKey) : null;
    res.json(user ? {authenticated: true, user} : {authenticated: false});
});

app.post('/logout', (req, res) => {
    const token = extractToken(req);
    if (token) {
        logout(token);
    }

    res.clearCookie('quizzle_token', {path: '/'});
    res.json({success: true});
});

module.exports = app;
