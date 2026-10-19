"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bwip_js_1 = __importDefault(require("bwip-js"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const promise_1 = __importDefault(require("mysql2/promise"));
const crypto_1 = __importDefault(require("crypto"));
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 5000;
dotenv_1.default.config();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: [
        'https://kind-cliff-08e0f151e.1.azurestaticapps.net',
        'http://localhost:5173'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.get('/', (req, res) => {
    res.status(200).send('Box Office Online API is Live and Connected!');
});
// MySQL connection
const dbConfig = {
    host: process.env.DB_HOST || 'box-office-online.mysql.database.azure.com',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'rootBOO',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'boxofficedb',
    ssl: { rejectUnauthorized: false }
};
const pool = promise_1.default.createPool(dbConfig);
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('Connected to MySQL database');
        connection.release();
    }
    catch (error) {
        console.error('Database connection failed:', error);
    }
}
testConnection();
// Remembers who is logged in until the server restarts
const sessions = new Map();
// password is only VARCHAR(45), so the hash has to stay short enough to fit
function hashPassword(password) {
    const salt = crypto_1.default.randomBytes(8).toString('hex');
    const hash = crypto_1.default.scryptSync(password, salt, 14).toString('hex');
    return `${salt}:${hash}`;
}
function passwordMatches(password, stored) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) {
        return false;
    }
    const actual = crypto_1.default.scryptSync(password, salt, 14);
    const expected = Buffer.from(hash, 'hex');
    if (actual.length !== expected.length) {
        return false;
    }
    return crypto_1.default.timingSafeEqual(actual, expected);
}
function toAccount(row) {
    return {
        id: row.users_id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email_address,
        employeePermission: Boolean(row.employee_permission),
        adminPermission: Boolean(row.admin_permission),
        theaterId: row.theater_id === null ? null : Number(row.theater_id),
        theaterName: row.theater_name ?? null,
    };
}
function readSessionToken(req) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
        const token = header.slice('Bearer '.length).trim();
        if (token) {
            return token;
        }
    }
    const cookie = req.headers.cookie;
    if (!cookie) {
        return undefined;
    }
    for (const part of cookie.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === 'session') {
            return decodeURIComponent(rest.join('='));
        }
    }
    return undefined;
}
function setSessionCookie(res, token) {
    res.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`);
}
function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}
function parseAccountId(raw) {
    if (!/^\d+$/.test(raw)) {
        return null;
    }
    return Number(raw);
}
// Makes sure you are logged in as this account, or you are an admin
async function authorizeAccount(req, res, accountId) {
    const token = readSessionToken(req);
    const session = token ? sessions.get(token) : undefined;
    if (!session) {
        res.status(401).json({ error: 'Login required' });
        return false;
    }
    if (session.userId === accountId) {
        return true;
    }
    const [rows] = await pool.execute('SELECT admin_permission FROM users WHERE users_id = ?', [session.userId]);
    if (rows[0]?.admin_permission) {
        return true;
    }
    res.status(403).json({ error: 'You cannot access this account' });
    return false;
}
// This is the request to create a barcode from the client
// To test, start the server and then go to localhost:5000/api/barcode?text=123456
app.get('/api/barcode', async (req, res) => {
    const { text = '12345', // The actual data we are encoding
    type = 'code128', // Barcode type
    scale = 2, // Scales the size of the barcode
    height = 10, // Height in mm
    includetext = 'yes', // Shows the text below the bars
    textalign = 'center' } = req.query;
    // We are generating the barcode as a png
    const pngBuffer = await bwip_js_1.default.toBuffer({
        bcid: type,
        text: text,
        scale: Number(scale),
        height: Number(height),
        includetext: includetext === 'yes',
        textxalign: textalign,
    });
    // We are sending the barcode png to the client
    res.set('Content-Type', 'image/png');
    res.send(pngBuffer);
});
app.get('/api/theaters', async (_req, res) => {
    try {
        const [rows] = await pool.execute('SELECT theater_id, theater_name, theater_location, theater_address, screen_amount FROM theaters ORDER BY theater_name');
        res.json({ theaters: rows });
    }
    catch (error) {
        console.error('Theaters error:', error);
        res.status(500).json({ error: 'Could not load theaters' });
    }
});
app.get('/api/movies', async (_req, res) => {
    try {
        const [rows] = await pool.execute('SELECT movie_id, title, release_year, rating, length, description FROM movies ORDER BY title');
        res.json({ movies: rows });
    }
    catch (error) {
        console.error('Movies error:', error);
        res.status(500).json({ error: 'Could not load movies' });
    }
});
app.get('/api/showings', async (_req, res) => {
    try {
        const [rows] = await pool.execute(`SELECT showing.showing_id, showing.movie_id, showing.showtime, showing.theater_id,
                    movies.title, theaters.theater_name, theaters.theater_location
             FROM showing
             JOIN movies ON movies.movie_id = showing.movie_id
             JOIN theaters ON theaters.theater_id = showing.theater_id
             ORDER BY showing.showtime`);
        res.json({ showings: rows });
    }
    catch (error) {
        console.error('Showings error:', error);
        res.status(500).json({ error: 'Could not load showings' });
    }
});
// Purchase endpoint
app.post('/api/purchase', async (req, res) => {
    const firstName = String(req.body.firstName ?? '').trim();
    const lastName = String(req.body.lastName ?? '').trim();
    const ticketTotal = Number(req.body.ticketTotal);
    const showingId = Number(req.body.showingId);
    if (!firstName || !lastName || firstName.length > 45 || lastName.length > 45) {
        return res.status(400).json({ error: 'First and last name are required and must be 45 characters or fewer' });
    }
    if (!Number.isSafeInteger(ticketTotal) || ticketTotal < 1 || ticketTotal > 2147483647) {
        return res.status(400).json({ error: 'Ticket total must be a positive whole number within the supported range' });
    }
    if (!Number.isSafeInteger(showingId) || showingId < 1) {
        return res.status(400).json({ error: 'A valid showing is required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [showings] = await connection.execute('SELECT movie_id FROM showing WHERE showing_id = ?', [showingId]);
        if (showings.length === 0) {
            return res.status(400).json({ error: 'The selected showing does not exist' });
        }
        const movieId = Number(showings[0].movie_id);
        const [users] = await connection.execute('SELECT users_id FROM users WHERE first_name = ? AND last_name = ? LIMIT 1', [firstName, lastName]);
        let userId;
        if (users.length === 0) {
            // No matching user yet, so create one for this ticket
            // users_id is not auto-increment, so assign the next one
            const [maxRows] = await connection.execute('SELECT COALESCE(MAX(users_id), 0) + 1 AS next_id FROM users');
            userId = Number(maxRows[0].next_id);
            await connection.execute('INSERT INTO users (users_id, first_name, last_name, email_address, password, employee_permission, admin_permission, theater_id) VALUES (?, ?, ?, \'\', \'\', 0, 0, NULL)', [userId, firstName, lastName]);
        }
        else {
            userId = users[0].users_id;
        }
        const ticketId = crypto_1.default.randomBytes(16).toString('hex');
        await connection.execute('INSERT INTO tickets (ticket_id, movie_id, showing_id, user_id, purchase_time, ticket_amount) VALUES (?, ?, ?, ?, NOW(), ?)', [ticketId, movieId, showingId, userId, ticketTotal]);
        res.json({ ticketId, message: 'Purchase successful' });
    }
    catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Purchase failed' });
    }
    finally {
        if (connection)
            connection.release();
    }
});
// Validate ticket endpoint
app.post('/api/validate', async (req, res) => {
    const { ticketId } = req.body;
    if (!ticketId) {
        return res.status(400).json({ error: 'Ticket ID is required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT ticket_id FROM tickets WHERE ticket_id = ?', [ticketId]);
        const isValid = rows.length > 0;
        res.json({ isValid });
    }
    catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
    finally {
        if (connection)
            connection.release();
    }
});
// Create account endpoint
app.post('/api/account', async (req, res) => {
    const firstName = String(req.body.firstName ?? req.body.fname ?? '').trim();
    const lastName = String(req.body.lastName ?? req.body.lname ?? '').trim();
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ error: 'First name, last name, email, and password are required' });
    }
    // These columns are all VARCHAR(45)
    if (firstName.length > 45 || lastName.length > 45 || email.length > 45 || password.length > 45) {
        return res.status(400).json({ error: 'First name, last name, email, and password can only be 45 characters' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [existing] = await connection.execute('SELECT users_id FROM users WHERE email_address = ? LIMIT 1', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'An account with that email already exists' });
        }
        const [maxRows] = await connection.execute('SELECT COALESCE(MAX(users_id), 0) + 1 AS next_id FROM users');
        const userId = Number(maxRows[0].next_id);
        await connection.execute('INSERT INTO users (users_id, first_name, last_name, email_address, password, employee_permission, admin_permission, theater_id) VALUES (?, ?, ?, ?, ?, 0, 0, NULL)', [userId, firstName, lastName, email, hashPassword(password)]);
        res.status(201).json({
            account: {
                id: userId,
                firstName,
                lastName,
                email,
                employeePermission: false,
                adminPermission: false,
                theaterId: null,
                theaterName: null,
            },
        });
    }
    catch (error) {
        console.error('Create account error:', error);
        res.status(500).json({ error: 'Create account failed' });
    }
    finally {
        if (connection)
            connection.release();
    }
});
// Login endpoint
app.post('/api/login', async (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(`SELECT users.users_id, users.first_name, users.last_name, users.email_address, users.password,
                    users.employee_permission, users.admin_permission, users.theater_id, theaters.theater_name
             FROM users
             LEFT JOIN theaters ON theaters.theater_id = users.theater_id
             WHERE users.email_address = ? LIMIT 1`, [email]);
        const user = rows[0];
        if (!user || !passwordMatches(password, String(user.password ?? ''))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const token = crypto_1.default.randomBytes(32).toString('hex');
        sessions.set(token, { userId: user.users_id });
        setSessionCookie(res, token);
        res.json({ token, account: toAccount(user) });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
    finally {
        if (connection)
            connection.release();
    }
});
// This gets the account info
app.get('/api/account/:id', async (req, res) => {
    const accountId = parseAccountId(req.params.id);
    if (accountId === null) {
        return res.status(400).json({ error: 'Account id must be a number' });
    }
    if (!await authorizeAccount(req, res, accountId)) {
        return;
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(`SELECT users.users_id, users.first_name, users.last_name, users.email_address,
                    users.employee_permission, users.admin_permission, users.theater_id, theaters.theater_name
             FROM users
             LEFT JOIN theaters ON theaters.theater_id = users.theater_id
             WHERE users.users_id = ?`, [accountId]);
        const user = rows[0];
        if (!user) {
            return res.status(404).json({ error: 'Account not found' });
        }
        res.json({ account: toAccount(user) });
    }
    catch (error) {
        console.error('View account error:', error);
        res.status(500).json({ error: 'Could not load account' });
    }
    finally {
        if (connection)
            connection.release();
    }
});
// This changes the account info
app.put('/api/account/:id', async (req, res) => {
    const accountId = parseAccountId(req.params.id);
    if (accountId === null) {
        return res.status(400).json({ error: 'Account id must be a number' });
    }
    if (!await authorizeAccount(req, res, accountId)) {
        return;
    }
    const updates = [];
    const values = [];
    if (req.body.firstName !== undefined || req.body.fname !== undefined) {
        const firstName = String(req.body.firstName ?? req.body.fname).trim();
        if (!firstName) {
            return res.status(400).json({ error: 'First name cannot be empty' });
        }
        if (firstName.length > 45) {
            return res.status(400).json({ error: 'First name can only be 45 characters' });
        }
        updates.push('first_name = ?');
        values.push(firstName);
    }
    if (req.body.lastName !== undefined || req.body.lname !== undefined) {
        const lastName = String(req.body.lastName ?? req.body.lname).trim();
        if (!lastName) {
            return res.status(400).json({ error: 'Last name cannot be empty' });
        }
        if (lastName.length > 45) {
            return res.status(400).json({ error: 'Last name can only be 45 characters' });
        }
        updates.push('last_name = ?');
        values.push(lastName);
    }
    if (req.body.email !== undefined) {
        const email = String(req.body.email).trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ error: 'Email cannot be empty' });
        }
        if (email.length > 45) {
            return res.status(400).json({ error: 'Email can only be 45 characters' });
        }
        updates.push('email_address = ?');
        values.push(email);
    }
    if (req.body.password !== undefined) {
        const password = String(req.body.password);
        if (!password) {
            return res.status(400).json({ error: 'Password cannot be empty' });
        }
        if (password.length > 45) {
            return res.status(400).json({ error: 'Password can only be 45 characters' });
        }
        updates.push('password = ?');
        values.push(hashPassword(password));
    }
    if (req.body.theaterId !== undefined) {
        const rawTheaterId = req.body.theaterId;
        if (rawTheaterId === null || rawTheaterId === '') {
            updates.push('theater_id = ?');
            values.push(null);
        }
        else {
            const theaterId = Number(rawTheaterId);
            if (!Number.isSafeInteger(theaterId) || theaterId < 1) {
                return res.status(400).json({ error: 'Theater id must be a positive number or null' });
            }
            updates.push('theater_id = ?');
            values.push(theaterId);
        }
    }
    if (updates.length === 0) {
        return res.status(400).json({ error: 'No account fields to update' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        if (req.body.email !== undefined) {
            const email = String(req.body.email).trim().toLowerCase();
            const [existing] = await connection.execute('SELECT users_id FROM users WHERE email_address = ? AND users_id <> ? LIMIT 1', [email, accountId]);
            if (existing.length > 0) {
                return res.status(409).json({ error: 'An account with that email already exists' });
            }
        }
        if (req.body.theaterId !== undefined && req.body.theaterId !== null && req.body.theaterId !== '') {
            const [theaters] = await connection.execute('SELECT theater_id FROM theaters WHERE theater_id = ?', [Number(req.body.theaterId)]);
            if (theaters.length === 0) {
                return res.status(400).json({ error: 'The selected theater does not exist' });
            }
        }
        values.push(accountId);
        const [result] = await connection.execute(`UPDATE users SET ${updates.join(', ')} WHERE users_id = ?`, values);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Account not found' });
        }
        const [rows] = await connection.execute(`SELECT users.users_id, users.first_name, users.last_name, users.email_address,
                    users.employee_permission, users.admin_permission, users.theater_id, theaters.theater_name
             FROM users
             LEFT JOIN theaters ON theaters.theater_id = users.theater_id
             WHERE users.users_id = ?`, [accountId]);
        res.json({ account: toAccount(rows[0]) });
    }
    catch (error) {
        console.error('Update account error:', error);
        res.status(500).json({ error: 'Update account failed' });
    }
    finally {
        if (connection)
            connection.release();
    }
});
// This gets the tickets for an account
app.get('/api/account/:id/tickets', async (req, res) => {
    const accountId = parseAccountId(req.params.id);
    if (accountId === null) {
        return res.status(400).json({ error: 'Account id must be a number' });
    }
    if (!await authorizeAccount(req, res, accountId)) {
        return;
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(`SELECT tickets.ticket_id, tickets.purchase_time, tickets.ticket_amount, movies.title, showing.showtime
             FROM tickets
             LEFT JOIN movies ON movies.movie_id = tickets.movie_id
             LEFT JOIN showing ON showing.showing_id = tickets.showing_id
             WHERE tickets.user_id = ?`, [accountId]);
        res.json({ tickets: rows });
    }
    catch (error) {
        console.error('Tickets error:', error);
        res.status(500).json({ error: 'Could not load tickets' });
    }
    finally {
        if (connection)
            connection.release();
    }
});
// Logout endpoint
app.post('/api/logout', (req, res) => {
    const token = readSessionToken(req);
    if (token) {
        sessions.delete(token);
    }
    clearSessionCookie(res);
    res.json({ message: 'Logged out' });
});
// This deletes the account
app.delete('/api/account/:id', async (req, res) => {
    const accountId = parseAccountId(req.params.id);
    if (accountId === null) {
        return res.status(400).json({ error: 'Account id must be a number' });
    }
    if (!await authorizeAccount(req, res, accountId)) {
        return;
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        // Tickets point at the user, so those get removed first
        await connection.execute('DELETE FROM tickets WHERE user_id = ?', [accountId]);
        const [result] = await connection.execute('DELETE FROM users WHERE users_id = ?', [accountId]);
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Account not found' });
        }
        await connection.commit();
        sessions.forEach((session, token) => {
            if (session.userId === accountId) {
                sessions.delete(token);
            }
        });
        clearSessionCookie(res);
        res.json({ message: 'Account deleted' });
    }
    catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Delete account failed' });
    }
    finally {
        if (connection)
            connection.release();
    }
});
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}!`);
});
