import Barcode from 'react-barcode';
import { useParams } from 'react-router-dom';

export default function Purchase() {
    const { ticketId } = useParams<{ ticketId: string }>();

    return(
        <>
        <div className="purchase">
            <div>
                Thank you for your purchase!
            </div>
            <div>
                <Barcode value={ticketId || '1'} displayValue={false} />
            </div>
        </div>
        </>
    )
}