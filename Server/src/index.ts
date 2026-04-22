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

// This is the request to create a barcode from the client

// To test, start the server and then go to localhost:5000/api/barcode?text=123456

app.get('/api/barcode', async (req, res) => {
    const
    {
        text = '12345',         // The actual data we are encoding
        type = 'code128',       // Barcode type
        scale = 3,              // Scales the size of the barcode
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
    const { customerName, ticketTotal } = req.body;

    if (!customerName || !ticketTotal) {
        return res.status(400).json({ error: 'Customer name and ticket total are required' });
    }

    let connection;

    try {
        connection = await pool.getConnection();
        
        // Get the next ticket ID
        const [rows] = await connection.execute('SELECT COALESCE(MAX(CAST(ticket_id AS UNSIGNED)), 0) as max_id FROM tickets');
        const maxId = (rows as any)[0].max_id;
        const ticketId = (maxId + 1).toString();

        await connection.execute(
            'INSERT INTO tickets (ticket_id, movie_id, showing_id, customer_first_name, customer_last_name, customer_email_name, purchase_time, ticket_amount) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)',
            [ticketId, 1, 1, customerName, '', '', ticketTotal]
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

app.listen(PORT, () => {
    console.log('Server is running!');
});

app.listen(PORT as number, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}!`);
});