import express from 'express';
import bwipjs from 'bwip-js';
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
let db;
async function connectDB() {
    try {
        db = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database');
    }
    catch (error) {
        console.error('Database connection failed:', error);
    }
}
connectDB();
// This is the request to create a barcode from the client
// To test, start the server and then go to localhost:5000/api/barcode?text=123456
app.get('/api/barcode', async (req, res) => {
    const { text = '12345', // The actual data we are encoding
    type = 'code128', // Barcode type
    scale = 3, // Scales the size of the barcode
    height = 10, // Height in mm
    includetext = 'yes', // Shows the text below the bars
    textalign = 'center' } = req.query;
    // We are generating the barcode as a png
    const pngBuffer = await bwipjs.toBuffer({
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
// Purchase endpoint
app.post('/api/purchase', async (req, res) => {
    const { customerName, ticketTotal } = req.body;
    if (!customerName || !ticketTotal) {
        return res.status(400).json({ error: 'Customer name and ticket total are required' });
    }
    const ticketId = crypto.randomUUID();
    try {
        await db.execute('INSERT INTO tickets (ticket_id, movie_id, showing_id, customer_first_name, customer_last_name, customer_email_name, purchase_time, ticket_amount) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)', [ticketId, 1, 1, customerName, '', '', ticketTotal]);
        res.json({ ticketId, message: 'Purchase successful' });
    }
    catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Purchase failed' });
    }
});
app.listen(PORT, () => {
    console.log('Server is running!');
});
