import express from 'express';
import bwipjs, { toBuffer } from 'bwip-js';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 5000;

dotenv.config();

app.use(cors());
app.use(express.json());

app.use(cors({
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
    user: process.env.DB_USER || 'rootBOO',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'boxofficedb',
    ssl: { rejectUnauthorized: false }
};

const pool = mysql.createPool(dbConfig);

async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('Connected to MySQL database');
        connection.release();
    } catch (error) {
        console.error('Database connection failed:', error);
    }
}

testConnection();

// Remembers who is logged in until the server restarts
const sessions = new Map<string, { userId: number }>();

// password is only VARCHAR(45), so the hash has to stay short enough to fit
function hashPassword(password: string): string {
    const salt = crypto.randomBytes(8).toString('hex');
    const hash = crypto.scryptSync(password, salt, 14).toString('hex');
    return `${salt}:${hash}`;
}

function passwordMatches(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) {
        return false;
    }
    const actual = crypto.scryptSync(password, salt, 14);
    const expected = Buffer.from(hash, 'hex');
    if (actual.length !== expected.length) {
        return false;
    }
    return crypto.timingSafeEqual(actual, expected);
}

function toAccount(row: any) {
    return {
        id: row.users_id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email_address,
        employeePermission: Boolean(row.employee_permission),
        adminPermission: Boolean(row.admin_permission),
        theaterName: row.theater_name,
    };
}

function readSessionToken(req: express.Request): string | undefined {
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

function setSessionCookie(res: express.Response, token: string) {
    res.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`);
}

function clearSessionCookie(res: express.Response) {
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

function parseAccountId(raw: string): number | null {
    if (!/^\d+$/.test(raw)) {
        return null;
    }
    return Number(raw);
}

// Makes sure you are logged in as this account, or you are an admin
async function authorizeAccount(req: express.Request, res: express.Response, accountId: number): Promise<boolean> {
    const token = readSessionToken(req);
    const session = token ? sessions.get(token) : undefined;
    if (!session) {
        res.status(401).json({ error: 'Login required' });
        return false;
    }
    if (session.userId === accountId) {
        return true;
    }

    const [rows] = await pool.execute(
        'SELECT admin_permission FROM users WHERE users_id = ?',
        [session.userId]
    );
    if ((rows as any[])[0]?.admin_permission) {
        return true;
    }

    res.status(403).json({ error: 'You cannot access this account' });
    return false;
}

// This is the request to create a barcode from the client

// To test, start the server and then go to localhost:5000/api/barcode?text=123456

app.get('/api/barcode', async (req, res) => {
    const
    {
        text = '12345',         // The actual data we are encoding
        type = 'code128',       // Barcode type
        scale = 2,              // Scales the size of the barcode
        height = 10,            // Height in mm
        includetext = 'yes',    // Shows the text below the bars
        textalign = 'center'
    } = req.query;

    // We are generating the barcode as a png
    const pngBuffer = await bwipjs.toBuffer({
        bcid: type as string,
        text: text as string,
        scale: Number(scale),
        height: Number(height),
        includetext: includetext === 'yes',
        textxalign: textalign as any,
    })

    // We are sending the barcode png to the client
    res.set('Content-Type', 'image/png');
    res.send(pngBuffer);
});

// Purchase endpoint
app.post('/api/purchase', async (req, res) => {
    const { firstName, lastName, ticketTotal } = req.body;

    if (!firstName || !lastName || !ticketTotal) {
        return res.status(400).json({ error: 'First name, last name and ticket total are required' });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        const [users] = await connection.execute(
            'SELECT users_id FROM users WHERE first_name = ? AND last_name = ? LIMIT 1',
            [firstName, lastName]
        );
        let userId: number;
        if ((users as any[]).length === 0) {
            // No matching user yet, so create one for this ticket
            // users_id is not auto-increment, so assign the next one
            const [maxRows] = await connection.execute('SELECT COALESCE(MAX(users_id), 0) + 1 AS next_id FROM users');
            userId = Number((maxRows as any[])[0].next_id);
            await connection.execute(
                'INSERT INTO users (users_id, first_name, last_name, email_address, password, employee_permission, admin_permission) VALUES (?, ?, ?, \'\', \'\', 0, 0)',
                [userId, firstName, lastName]
            );
        } else {
            userId = (users as any[])[0].users_id;
        }

        // Get the next ticket ID
        const [rows] = await connection.execute('SELECT COALESCE(MAX(CAST(ticket_id AS UNSIGNED)), 0) as max_id FROM tickets');
        const maxId = (rows as any)[0].max_id;
        const ticketId = crypto.randomBytes(4).toString('hex');

        await connection.execute(
            'INSERT INTO tickets (ticket_id, movie_id, showing_id, user_id, purchase_time, ticket_amount) VALUES (?, ?, ?, ?, NOW(), ?)',
            [ticketId, 1, 1, userId, ticketTotal]
        );
        res.json({ ticketId, message: 'Purchase successful' });
    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Purchase failed' });
    } finally {
        if (connection) connection.release();
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
        const [rows] = await connection.execute(
            'SELECT ticket_id FROM tickets WHERE ticket_id = ?',
            [ticketId]
        );
        const isValid = (rows as any[]).length > 0;
        res.json({ isValid });
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({ error: 'Validation failed' });
    } finally {
        if (connection) connection.release();
    }
});

// Create account endpoint
app.post('/api/account', async (req, res) => {
    const firstName = String(req.body.firstName ?? req.body.fname ?? '').trim();
    const lastName = String(req.body.lastName ?? req.body.lname ?? '').trim();
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    // theater_name can be left empty
    const theaterName = String(req.body.theaterName ?? req.body.theater_name ?? '').trim();

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ error: 'First name, last name, email, and password are required' });
    }

    // These columns are all VARCHAR(45)
    if (firstName.length > 45 || lastName.length > 45 || email.length > 45 || password.length > 45 || theaterName.length > 45) {
        return res.status(400).json({ error: 'First name, last name, email, password, and theater name can only be 45 characters' });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        const [existing] = await connection.execute(
            'SELECT users_id FROM users WHERE email_address = ? LIMIT 1',
            [email]
        );
        if ((existing as any[]).length > 0) {
            return res.status(409).json({ error: 'An account with that email already exists' });
        }

        const [maxRows] = await connection.execute('SELECT COALESCE(MAX(users_id), 0) + 1 AS next_id FROM users');
        const userId = Number((maxRows as any[])[0].next_id);

        await connection.execute(
            'INSERT INTO users (users_id, first_name, last_name, email_address, password, employee_permission, admin_permission, theater_name) VALUES (?, ?, ?, ?, ?, 0, 0, ?)',
            [userId, firstName, lastName, email, hashPassword(password), theaterName || null]
        );

        res.status(201).json({
            account: {
                id: userId,
                firstName,
                lastName,
                email,
                employeePermission: false,
                adminPermission: false,
                theaterName: theaterName || null,
            },
        });
    } catch (error) {
        console.error('Create account error:', error);
        res.status(500).json({ error: 'Create account failed' });
    } finally {
        if (connection) connection.release();
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
        const [rows] = await connection.execute(
            'SELECT users_id, first_name, last_name, email_address, password, employee_permission, admin_permission, theater_name FROM users WHERE email_address = ? LIMIT 1',
            [email]
        );
        const user = (rows as any[])[0];
        if (!user || !passwordMatches(password, String(user.password ?? ''))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, { userId: user.users_id });
        setSessionCookie(res, token);

        res.json({ token, account: toAccount(user) });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    } finally {
        if (connection) connection.release();
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
        const [rows] = await connection.execute(
            'SELECT users_id, first_name, last_name, email_address, employee_permission, admin_permission, theater_name FROM users WHERE users_id = ?',
            [accountId]
        );
        const user = (rows as any[])[0];
        if (!user) {
            return res.status(404).json({ error: 'Account not found' });
        }
        res.json({ account: toAccount(user) });
    } catch (error) {
        console.error('View account error:', error);
        res.status(500).json({ error: 'Could not load account' });
    } finally {
        if (connection) connection.release();
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

    const updates: string[] = [];
    const values: Array<string | number | null> = [];

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
    if (req.body.theaterName !== undefined || req.body.theater_name !== undefined) {
        const theaterName = String(req.body.theaterName ?? req.body.theater_name).trim();
        if (theaterName.length > 45) {
            return res.status(400).json({ error: 'Theater name can only be 45 characters' });
        }
        updates.push('theater_name = ?');
        values.push(theaterName || null);
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No account fields to update' });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        if (req.body.email !== undefined) {
            const email = String(req.body.email).trim().toLowerCase();
            const [existing] = await connection.execute(
                'SELECT users_id FROM users WHERE email_address = ? AND users_id <> ? LIMIT 1',
                [email, accountId]
            );
            if ((existing as any[]).length > 0) {
                return res.status(409).json({ error: 'An account with that email already exists' });
            }
        }

        values.push(accountId);
        const [result] = await connection.execute(
            `UPDATE users SET ${updates.join(', ')} WHERE users_id = ?`,
            values
        );
        if ((result as any).affectedRows === 0) {
            return res.status(404).json({ error: 'Account not found' });
        }

        const [rows] = await connection.execute(
            'SELECT users_id, first_name, last_name, email_address, employee_permission, admin_permission, theater_name FROM users WHERE users_id = ?',
            [accountId]
        );
        res.json({ account: toAccount((rows as any[])[0]) });
    } catch (error) {
        console.error('Update account error:', error);
        res.status(500).json({ error: 'Update account failed' });
    } finally {
        if (connection) connection.release();
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
        const [rows] = await connection.execute(
            `SELECT tickets.ticket_id, tickets.purchase_time, tickets.ticket_amount, movies.title, showing.showtime
             FROM tickets
             LEFT JOIN movies ON movies.movie_id = tickets.movie_id
             LEFT JOIN showing ON showing.showing_id = tickets.showing_id
             WHERE tickets.user_id = ?`,
            [accountId]
        );
        res.json({ tickets: rows });
    } catch (error) {
        console.error('Tickets error:', error);
        res.status(500).json({ error: 'Could not load tickets' });
    } finally {
        if (connection) connection.release();
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
        if ((result as any).affectedRows === 0) {
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
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Delete account failed' });
    } finally {
        if (connection) connection.release();
    }
});

app.listen(PORT, () => {
    console.log('Server is running!');
});

app.listen(PORT as number, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}!`);
});
