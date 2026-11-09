const {validateToken, validateApiKey} = require('../utils/auth');

const extractToken = (req) => {
    const cookie = req.headers.cookie;
    if (!cookie) return null;

    const match = cookie.split(';').find(c => c.trim().startsWith('quizzle_token='));
    if (!match) return null;

    return match.split('=')[1].trim();
};

const extractBearer = (req) => {
    const header = req.headers['authorization'];
    if (!header) return null;

    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
};

const optionalAuth = (req, res, next) => {
    const token = extractToken(req);
    if (token) {
        req.user = validateToken(token);
        req.token = token;
    } else {
        const apiKey = extractBearer(req);
        if (apiKey) req.user = validateApiKey(apiKey);
    }
    next();
};

const requireAuth = (req, res, next) => {
    const token = extractToken(req);
    if (token) {
        const user = validateToken(token);
        if (!user) {
            return res.status(401).json({message: 'Sitzung abgelaufen. Bitte erneut anmelden.'});
        }

        req.user = user;
        req.token = token;
        return next();
    }

    const apiKey = extractBearer(req);
    if (apiKey) {
        const user = validateApiKey(apiKey);
        if (user) {
            req.user = user;
            return next();
        }
    }

    return res.status(401).json({message: 'Authentifizierung erforderlich.'});
};

const requireAdmin = (req, res, next) => {
    requireAuth(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({message: 'Administratorrechte erforderlich.'});
        }
        next();
    });
};

module.exports = {extractToken, extractBearer, optionalAuth, requireAuth, requireAdmin};
