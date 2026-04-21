import Barcode from 'react-barcode';

export default function Purchase() {
    return(
        <>
        <div className="purchase">
            <div>
                Thank you for your purchase!
            </div>
            <div>
                <Barcode value="1" displayValue={false} />
            </div>
        </div>
        </>
    )
}