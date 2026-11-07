import Barcode from 'react-barcode';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { accountFetch } from '../accountApi.ts';

export default function Purchase() {
    const { ticketId } = useParams<{ ticketId: string }>();
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id');
    const [purchase, setPurchase] = useState<{ ticketId?: string, receiptUrl?: string, error?: string }>({ ticketId });
    // StrictMode runs effects twice in dev, which would save the ticket twice
    const saved = useRef(false);

    useEffect(() => {
        if (!sessionId || saved.current) {
            return;
        }
        saved.current = true;
        // accountFetch sends the login so the ticket goes on this account
        accountFetch('/api/purchase', { method: 'POST', body: JSON.stringify({ sessionId }) })
            .then(({ data }) => setPurchase(data))
            .catch(() => setPurchase({ error: 'Purchase failed. The server did not respond.' }));
    }, [sessionId]);

    return(
        <>
        <div className="purchase">
            <div>
                Thank you for your purchase!
            </div>
            {purchase.error && <div className="invalid">{purchase.error}</div>}
            {purchase.receiptUrl && <a href={purchase.receiptUrl} target="_blank">View your receipt</a>}
            <div>
                <Barcode value={purchase.ticketId || '1'} displayValue={false} />
            </div>
        </div>
        </>
    )
}
