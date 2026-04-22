import type { SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

// FORCE the Render URL for production to bypass Azure /api hijacking
const API_BASE = import.meta.env.PROD 
    ? 'https://box-office-online.onrender.com' 
    : '';

export default function MovieListing() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const customerName = formData.get("customerName") as string;
        const ticketTotal = formData.get("ticketTotal") as string;

        setLoading(true);
        try {
            // Using the full URL ensures the request goes to Render, not Azure
            const response = await fetch(`${API_BASE}/api/purchase`, {
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
                // If it still says 405, Azure is still intercepting the relative part of the path
                alert('Purchase failed - Method Not Allowed');
            }
        } catch (error) {
            console.error('Purchase error:', error);
            alert('Purchase failed - Connection Error');
        } finally {
            setLoading(false);
        }
    };

    return(
        <form className="movie-form" onSubmit={handleSubmit}>
            <label>
                Name: <input name="customerName" required />
            </label>
            <label>
                Ticket Total: <input name="ticketTotal" defaultValue="1" required />
            </label>
            <button type="submit" disabled={loading}>
                {loading ? 'Purchasing...' : 'Purchase'}
            </button>
        </form>
    )
}