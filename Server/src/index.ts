import express from 'express';
import bwipjs, { toBuffer } from 'bwip-js';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import Stripe from 'stripe';
import { ImportInputError, ImportServiceError, parseShowtimeCsv, validateRows, type ValidRow } from './showtimeImport';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET!);

app.use(cors());
// Movie posters need a bigger limit
app.use(express.json({ limit: '10mb' }));

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
    port: Number(process.env.DB_PORT) || 3306,
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
const showtimePreviews = new Map<string, { sessionToken: string; expires: number; rows: ValidRow[] }>();

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
        theaterId: row.theater_id === null ? null : Number(row.theater_id),
        theaterName: row.theater_name ?? null,
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

// Makes sure you are logged in as an admin
async function authorizeAdmin(req: express.Request, res: express.Response): Promise<boolean> {
    const token = readSessionToken(req);
    const session = token ? sessions.get(token) : undefined;
    if (!session) {
        res.status(401).json({ error: 'Login required' });
        return false;
    }

    const [rows] = await pool.execute(
        'SELECT admin_permission FROM users WHERE users_id = ?',
        [session.userId]
    );
    if ((rows as any[])[0]?.admin_permission) {
        return true;
    }

    res.status(403).json({ error: 'Admin permission required' });
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

app.get('/api/theaters', async (_req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT theater_id, theater_name, theater_location, theater_address, screen_amount FROM theaters ORDER BY theater_name'
        );
        res.json({ theaters: rows });
    } catch (error) {
        console.error('Theaters error:', error);
        res.status(500).json({ error: 'Could not load theaters' });
    }
});

app.get('/api/formats', async (req, res) => {
    const theaterId = req.query.theaterId === undefined ? null : Number(req.query.theaterId);
    if (theaterId !== null && (!Number.isSafeInteger(theaterId) || theaterId < 1)) {
        return res.status(400).json({ error: 'Theater id must be a positive number' });
    }

    try {
        const [rows] = theaterId === null
            ? await pool.execute(
                'SELECT format_id, theater_id, format_name, price, format_description FROM formats ORDER BY format_name'
            )
            : await pool.execute(
                'SELECT format_id, theater_id, format_name, price, format_description FROM formats WHERE theater_id = ? ORDER BY format_name',
                [theaterId]
            );
        res.json({ formats: rows });
    } catch (error) {
        console.error('Formats error:', error);
        res.status(500).json({ error: 'Could not load formats' });
    }
});

app.get('/api/movies', async (_req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT movie_id, title, release_year, rating, length, description, poster AS image FROM movies ORDER BY title'
        );
        // sends image as text
        const movies = (rows as any[]).map((row) => ({
            ...row,
            image: row.image ? Buffer.from(row.image).toString('base64') : null,
        }));
        res.json({ movies });
    } catch (error) {
        console.error('Movies error:', error);
        res.status(500).json({ error: 'Could not load movies' });
    }
});

app.get('/api/showings', async (_req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT showing.showing_id, showing.movie_id, showing.showtime, showing.theater_id,
                    movies.title, theaters.theater_name, theaters.theater_location,
                    showing.formats_id, formats.format_name, formats.price, formats.format_description
             FROM showing
             JOIN movies ON movies.movie_id = showing.movie_id
             JOIN theaters ON theaters.theater_id = showing.theater_id
             LEFT JOIN formats ON formats.format_id = showing.formats_id
             ORDER BY showing.showtime`
        );
        res.json({ showings: rows });
    } catch (error) {
        console.error('Showings error:', error);
        res.status(500).json({ error: 'Could not load showings' });
    }
});

app.post('/api/showings/import/preview', async (req, res) => {
    if (!await authorizeAdmin(req, res)) return;
    const csv: unknown = req.body?.csv;
    if (typeof csv !== 'string' || !csv.trim() || Buffer.byteLength(csv, 'utf8') > 1024 * 1024) {
        return res.status(400).json({ error: 'Choose a non-empty CSV file no larger than 1 MB.' });
    }

    let connection;
    try {
        const rows = await parseShowtimeCsv(csv);
        connection = await pool.getConnection();
        const result = await validateRows(connection, rows);
        let previewId: string | null = null;
        if (result.valid.length) {
            const now = Date.now();
            showtimePreviews.forEach((preview, id) => {
                if (preview.expires <= now || preview.sessionToken === readSessionToken(req)) {
                    showtimePreviews.delete(id);
                }
            });
            if (showtimePreviews.size >= 100) {
                return res.status(503).json({ error: 'Too many pending previews. Try again later.' });
            }
            previewId = crypto.randomUUID();
            showtimePreviews.set(previewId, {
                sessionToken: readSessionToken(req)!,
                expires: now + 15 * 60 * 1000,
                rows: result.valid,
            });
        }
        res.json({ previewId, ...result });
    } catch (error) {
        if (error instanceof ImportInputError) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof ImportServiceError) {
            return res.status(503).json({ error: error.message });
        }
        console.error('Showtime import preview error:', error);
        res.status(500).json({ error: 'Could not preview the CSV. Check the server logs.' });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/showings/import', async (req, res) => {
    if (!await authorizeAdmin(req, res)) return;
    const previewId: unknown = req.body?.previewId;
    if (typeof previewId !== 'string') {
        return res.status(400).json({ error: 'The preview is invalid or expired. Upload the CSV again.' });
    }
    const preview = showtimePreviews.get(previewId);
    if (!preview || preview.sessionToken !== readSessionToken(req) || preview.expires <= Date.now()) {
        return res.status(400).json({ error: 'The preview is invalid or expired. Upload the CSV again.' });
    }
    showtimePreviews.delete(previewId);

    let connection;
    let locked = false;
    let inTransaction = false;
    try {
        connection = await pool.getConnection();
        const [lockRows] = await connection.query<mysql.RowDataPacket[]>(
            "SELECT GET_LOCK('boxoffice_showtime_import', 10) AS acquired");
        locked = lockRows[0]?.acquired === 1;
        if (!locked) return res.status(503).json({ error: 'Another import is running. Preview the CSV again.' });
        await connection.beginTransaction();
        inTransaction = true;
        const result = await validateRows(connection, preview.rows);
        const approved = new Map(preview.rows.map((row) => [row.record, row]));
        const unchanged: ValidRow[] = [];
        for (const row of result.valid) {
            const original = approved.get(row.record);
            if (!original || original.movieId !== row.movieId || original.theaterId !== row.theaterId ||
                original.formatId !== row.formatId || original.showtime !== row.showtime) {
                result.invalid.push({ ...row, error: 'The matching database records changed since the preview.' });
            } else {
                unchanged.push(row);
            }
        }
        const [maxRows] = await connection.query<mysql.RowDataPacket[]>(
            'SELECT COALESCE(MAX(showing_id), 0) AS max_id FROM showing');
        let nextId = Number(maxRows[0].max_id) + 1;
        for (const row of unchanged) {
            await connection.execute(
                'INSERT INTO showing (showing_id, movie_id, showtime, theater_id, formats_id) VALUES (?, ?, ?, ?, ?)',
                [nextId++, row.movieId, row.showtime, row.theaterId, row.formatId]);
        }
        await connection.commit();
        inTransaction = false;
        res.json({ imported: unchanged.length, invalid: result.invalid });
    } catch (error) {
        if (connection && inTransaction) await connection.rollback();
        console.error('Showtime import error:', error);
        res.status(500).json({ error: 'Could not import showtimes. Preview the CSV again.' });
    } finally {
        if (connection) {
            if (locked) {
                try {
                    await connection.query("SELECT RELEASE_LOCK('boxoffice_showtime_import')");
                } catch (error) {
                    console.error('Could not release showtime import lock:', error);
                    connection.destroy();
                    return;
                }
            }
            connection.release();
        }
    }
});

// Add movie endpoint (admins only)
app.post('/api/movies', async (req, res) => {
    if (!await authorizeAdmin(req, res)) {
        return;
    }

    // Read the form fields, the poster comes in as base64 text, so turn it back into image bytes
    const title = String(req.body.title ?? '').trim();
    const description = String(req.body.description ?? '').trim();
    const image = Buffer.from(String(req.body.image ?? ''), 'base64');

    if (!title || title.length > 255) {
        return res.status(400).json({ error: 'Title is required and must be 255 characters or fewer' });
    }
    if (!description) {
        return res.status(400).json({ error: 'Synopsis is required' });
    }
    if (image.length === 0) {
        return res.status(400).json({ error: 'A poster image is required' });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        // movie_id is not auto-increment, so assign the next one
        const [maxRows] = await connection.execute('SELECT COALESCE(MAX(movie_id), 0) + 1 AS next_id FROM movies');
        const movieId = Number((maxRows as any[])[0].next_id);

        // The form does not ask for these yet, so use placeholders
        const releaseYear = new Date().getFullYear();
        const rating = 'NR';
        const length = 0;

        await connection.execute(
            'INSERT INTO movies (movie_id, title, release_year, rating, length, description, poster) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [movieId, title, releaseYear, rating, length, description, image]
        );

        res.status(201).json({ movie: { movie_id: movieId, title } });
    } catch (error) {
        console.error('Add movie error:', error);
        res.status(500).json({ error: 'Could not add the movie' });
    } finally {
        if (connection) connection.release();
    }
});

// Add showing endpoint (admins only)
app.post('/api/showings', async (req, res) => {
    if (!await authorizeAdmin(req, res)) {
        return;
    }

    const movieId = Number(req.body.movieId);
    const showtime = String(req.body.showtime ?? '');
    const theaterId = Number(req.body.theaterId);
    const formatId = Number(req.body.formatId);

    if (!Number.isSafeInteger(movieId) || movieId < 1) {
        return res.status(400).json({ error: 'A valid movie is required' });
    }
    if (!Number.isSafeInteger(theaterId) || theaterId < 1) {
        return res.status(400).json({ error: 'A valid theater is required' });
    }
    if (!Number.isSafeInteger(formatId) || formatId < 1) {
        return res.status(400).json({ error: 'A valid format is required' });
    }
    // showtime is a DATETIME, so it has to look like 2026-10-24 19:30:00
    const hasRightShape =
        showtime.length === 19 &&   // "2026-10-24 19:30:00" is 19 characters
        showtime[4] === '-' &&      // dash after the year
        showtime[7] === '-' &&      // dash after the month
        showtime[10] === ' ' &&     // space between the date and the time
        showtime[13] === ':' &&     // colon after the hour
        showtime[16] === ':';       // colon after the minutes

    // new Date() gives "Invalid Date" for things like month 13 or hour 99
    const isRealDate = !isNaN(new Date(showtime.replace(' ', 'T')).getTime());

    if (!hasRightShape || !isRealDate) {
        return res.status(400).json({ error: 'Showtime must be a valid date and time' });
    }

    let connection;
    let locked = false;

    try {
        connection = await pool.getConnection();
        const [lockRows] = await connection.query<mysql.RowDataPacket[]>(
            "SELECT GET_LOCK('boxoffice_showtime_import', 10) AS acquired");
        locked = lockRows[0]?.acquired === 1;
        if (!locked) return res.status(503).json({ error: 'Another showtime operation is running. Try again.' });

        const [movies] = await connection.execute('SELECT movie_id FROM movies WHERE movie_id = ?', [movieId]);
        if ((movies as any[]).length === 0) {
            return res.status(400).json({ error: 'The selected movie does not exist' });
        }
        const [formats] = await connection.execute(
            'SELECT format_id FROM formats WHERE format_id = ? AND theater_id = ?',
            [formatId, theaterId]
        );
        if ((formats as any[]).length === 0) {
            return res.status(400).json({ error: 'The selected format is not available at this theater' });
        }

        // showing_id is not auto-increment, so assign the next one
        const [maxRows] = await connection.execute('SELECT COALESCE(MAX(showing_id), 0) + 1 AS next_id FROM showing');
        const showingId = Number((maxRows as any[])[0].next_id);

        await connection.execute(
            'INSERT INTO showing (showing_id, movie_id, showtime, theater_id, formats_id) VALUES (?, ?, ?, ?, ?)',
            [showingId, movieId, showtime, theaterId, formatId]
        );

        res.status(201).json({ showingId });
    } catch (error) {
        console.error('Add showing error:', error);
        res.status(500).json({ error: 'Could not add the showing' });
    } finally {
        if (connection) {
            if (locked) {
                try {
                    await connection.query("SELECT RELEASE_LOCK('boxoffice_showtime_import')");
                } catch (error) {
                    console.error('Could not release showtime lock:', error);
                    connection.destroy();
                    return;
                }
            }
            connection.release();
        }
    }
});

// Purchase endpoint
app.post('/api/purchase', async (req, res) => {
    // After Stripe checkout the order details come back on the session
    const session = req.body.sessionId ? await stripe.checkout.sessions.retrieve(req.body.sessionId, { expand: ['payment_intent.latest_charge'] }) : null;
    const body = session ? session.metadata as any : req.body;
    const firstName = String(body.firstName ?? '').trim();
    const lastName = String(body.lastName ?? '').trim();
    const ticketTotal = Number(body.ticketTotal);
    const showingId = Number(body.showingId);

    if (!firstName || !lastName || firstName.length > 45 || lastName.length > 45) {
        return res.status(400).json({ error: 'First and last name are required and must be 45 characters or fewer' });
    }
    if (!Number.isSafeInteger(ticketTotal) || ticketTotal < 1 || ticketTotal > 2147483647) {
        return res.status(400).json({ error: 'Ticket total must be a positive whole number within the supported range' });
    }
    if (!Number.isSafeInteger(showingId) || showingId < 1) {
        return res.status(400).json({ error: 'A valid showing is required' });
    }
    if (!paymentMethod || paymentMethod.length > 45) {
        return res.status(400).json({ error: 'Payment method is required and must be 45 characters or fewer' });
    }

    let connection;
    let transactionStarted = false;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;
        const [showings] = await connection.execute(
            'SELECT showing.movie_id, COALESCE(formats.price, 1) AS price FROM showing LEFT JOIN formats ON formats.format_id = showing.formats_id WHERE showing_id = ?',
            [showingId]
        );
        if ((showings as any[]).length === 0) {
            return res.status(400).json({ error: 'The selected showing does not exist' });
        }
        const movieId = Number((showings as any[])[0].movie_id);

        // Send them to Stripe first, showings without a format are $1
        if (!session) {
            const origin = req.get('origin') || 'http://localhost:5173';
            const checkout = await stripe.checkout.sessions.create({
                mode: 'payment',
                line_items: [{ quantity: ticketTotal, price_data: { currency: 'usd', unit_amount: (showings as any[])[0].price * 100, product_data: { name: 'Movie ticket' } } }],
                success_url: `${origin}/purchase?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${origin}/movies`,
                metadata: { firstName, lastName, ticketTotal: String(ticketTotal), showingId: String(showingId) }
            });
            return res.json({ url: checkout.url });
        }
        if (session.payment_status !== 'paid') {
            return res.status(400).json({ error: 'The payment was not completed' });
        }
        const charge = (session.payment_intent as any).latest_charge;

        // Reloading the thank you page should not save the ticket again
        const [purchases] = await connection.execute(
            'SELECT tickets.ticket_id FROM purchases JOIN tickets ON tickets.purchase_id = purchases.purchase_id WHERE purchases.charge_id = ?',
            [charge.id]
        );
        if ((purchases as any[]).length > 0) {
            return res.json({ ticketId: (purchases as any[])[0].ticket_id, receiptUrl: charge.receipt_url });
        }

        const [users] = await connection.execute(
            'SELECT users_id FROM users WHERE first_name = ? AND last_name = ? LIMIT 1',
            [firstName, lastName]
        );
        // Logged in buyers get the ticket on their own account
        const login = sessions.get(readSessionToken(req) ?? '');
        let userId: number;
        if (login) {
            userId = login.userId;
        } else if ((users as any[]).length === 0) {
            // No matching user yet, so create one for this ticket
            // users_id is not auto-increment, so assign the next one
            const [maxRows] = await connection.execute('SELECT COALESCE(MAX(users_id), 0) + 1 AS next_id FROM users');
            userId = Number((maxRows as any[])[0].next_id);
            await connection.execute(
                'INSERT INTO users (users_id, first_name, last_name, email_address, password, employee_permission, admin_permission, theater_name) VALUES (?, ?, ?, \'\', \'\', 0, 0, NULL)',
                [userId, firstName, lastName]
            );
        } else {
            userId = (users as any[])[0].users_id;
        }

        const [purchase] = await connection.execute(
            'INSERT INTO purchases (payment_method, payment_made, charge_id) VALUES (\'card\', 1, ?)',
            [charge.id]
        );
        const ticketId = crypto.randomBytes(16).toString('hex');

        await connection.execute(
            'INSERT INTO tickets (ticket_id, movie_id, showing_id, user_id, purchase_time, ticket_amount, purchase_id) VALUES (?, ?, ?, ?, NOW(), ?, ?)',
            [ticketId, movieId, showingId, userId, ticketTotal, (purchase as any).insertId]
        );
        res.json({ ticketId, receiptUrl: charge.receipt_url, message: 'Purchase successful' });
    } catch (error) {
        if (connection && transactionStarted) {
            await connection.rollback();
            transactionStarted = false;
        }
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Purchase failed' });
    } finally {
        if (connection) {
            if (transactionStarted) {
                await connection.rollback();
            }
            connection.release();
        }
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

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ error: 'First name, last name, email, and password are required' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // These columns are all VARCHAR(45)
    if (firstName.length > 45 || lastName.length > 45 || email.length > 45 || password.length > 45) {
        return res.status(400).json({ error: 'First name, last name, email, and password can only be 45 characters' });
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
            'INSERT INTO users (users_id, first_name, last_name, email_address, password, employee_permission, admin_permission, theater_name) VALUES (?, ?, ?, ?, ?, 0, 0, NULL)',
            [userId, firstName, lastName, email, hashPassword(password)]
        );

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
            `SELECT users.users_id, users.first_name, users.last_name, users.email_address, users.password,
                    users.employee_permission, users.admin_permission, users.theater_name, theaters.theater_id
             FROM users
             LEFT JOIN theaters ON theaters.theater_name = users.theater_name
             WHERE users.email_address = ? LIMIT 1`,
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
            `SELECT users.users_id, users.first_name, users.last_name, users.email_address,
                    users.employee_permission, users.admin_permission, users.theater_name, theaters.theater_id
             FROM users
             LEFT JOIN theaters ON theaters.theater_name = users.theater_name
             WHERE users.users_id = ?`,
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
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        if (password.length > 45) {
            return res.status(400).json({ error: 'Password can only be 45 characters' });
        }
        updates.push('password = ?');
        values.push(hashPassword(password));
    }
    let theaterIdIndex = -1;
    if (req.body.theaterId !== undefined) {
        const rawTheaterId = req.body.theaterId;
        if (rawTheaterId === null || rawTheaterId === '') {
            updates.push('theater_name = ?');
            values.push(null);
        } else {
            const theaterId = Number(rawTheaterId);
            if (!Number.isSafeInteger(theaterId) || theaterId < 1) {
                return res.status(400).json({ error: 'Theater id must be a positive number or null' });
            }
            updates.push('theater_name = ?');
            theaterIdIndex = values.length;
            values.push(null);
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
            const [existing] = await connection.execute(
                'SELECT users_id FROM users WHERE email_address = ? AND users_id <> ? LIMIT 1',
                [email, accountId]
            );
            if ((existing as any[]).length > 0) {
                return res.status(409).json({ error: 'An account with that email already exists' });
            }
        }
        if (theaterIdIndex !== -1) {
            const [theaters] = await connection.execute(
                'SELECT theater_name FROM theaters WHERE theater_id = ?',
                [Number(req.body.theaterId)]
            );
            if ((theaters as any[]).length === 0) {
                return res.status(400).json({ error: 'The selected theater does not exist' });
            }
            values[theaterIdIndex] = (theaters as any[])[0].theater_name;
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
            `SELECT users.users_id, users.first_name, users.last_name, users.email_address,
                    users.employee_permission, users.admin_permission, users.theater_name, theaters.theater_id
             FROM users
             LEFT JOIN theaters ON theaters.theater_name = users.theater_name
             WHERE users.users_id = ?`,
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
        const [purchaseRows] = await connection.execute(
            'SELECT DISTINCT purchase_id FROM tickets WHERE user_id = ?',
            [accountId]
        );
        await connection.execute('DELETE FROM tickets WHERE user_id = ?', [accountId]);
        const purchaseIds = (purchaseRows as any[]).map((row) => row.purchase_id);
        if (purchaseIds.length > 0) {
            const placeholders = purchaseIds.map(() => '?').join(', ');
            await connection.execute(
                `DELETE FROM purchases
                 WHERE purchase_id IN (${placeholders})
                   AND NOT EXISTS (
                       SELECT 1 FROM tickets WHERE tickets.purchase_id = purchases.purchase_id
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM formats WHERE formats.purchase_ids = purchases.purchase_id
                   )`,
                purchaseIds
            );
        }
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

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}!`);
    });
}

export { app };
