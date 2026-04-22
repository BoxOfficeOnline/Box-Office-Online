import type { SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function MovieListing() {
    const navigate = useNavigate();
    const [customerName, setCustomerName] = useState("");
    const [ticketTotal, setTicketTotal] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const customerName = formData.get("customerName") as string;
        const ticketTotal = formData.get("ticketTotal") as string;

        setLoading(true);
        try {
            const response = await fetch('/api/purchase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    customerName,
                    ticketTotal: parseInt(ticketTotal)
                }),
            });

            if (response.ok) {
                const data = await response.json();
                navigate(`/purchase/${data.ticketId}`);
            } else {
                alert('Purchase failed');
            }
        } catch (error) {
            console.error('Purchase error:', error);
            alert('Purchase failed');
        } finally {
            setLoading(false);
        }
    };

    return(
        <>
        <form className="movie-form" method="post" onSubmit={handleSubmit}>
            <label>
                Name: <input name="customerName"/>
            </label>
            <label>
                Ticket Total: <input name="ticketTotal" defaultValue="1"/>
            </label>
            <button type="submit" disabled={loading}>
                {loading ? 'Purchasing...' : 'Purchase'}
            </button>
        </form>
        </>
    )
}
