import express from 'express';
import bwipjs, { toBuffer } from 'bwip-js';
import cors from 'cors';
import dotenv from 'dotenv';

const app = express();
const PORT = process.env.PORT || 5000;

dotenv.config();

app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
    console.log('Server is running!');
});