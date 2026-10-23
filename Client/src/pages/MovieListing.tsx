import type { SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import "../components/App.css"
import wallE from '../assets/WALL-E.webp';
import "../components/MovieListing.css"

export default function MovieListing() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const firstName = formData.get("firstName") as string;
        const lastName = formData.get("lastName") as string;
        const ticketTotal = formData.get("ticketTotal") as string;

        setLoading(true);
        try {
            const response = await fetch('https://box-office-online.onrender.com/api/purchase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName,
                    lastName,
                    ticketTotal: parseInt(ticketTotal)
                }),
            });

            if (response.ok) {
                const data = await response.json();
                navigate(`/purchase/${data.ticketId}`);
            } else {
                alert(response.status === 404 ? 'No user found with that name' : 'Purchase failed - API rejected the request');
            }
        } catch (error) {
            console.error('Purchase error:', error);
            alert('Purchase failed - Network Error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="listing">
            <div id="poster">
                <img src={wallE} alt="WALL-E"/>
            </div>
            <div id="synopsis">
                <p>Synopsis goes here...</p>
            </div>
            <div id="order">
                <h2>Order Tickets</h2>
                <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
                    <p>Showtimes for date:</p>
                    <input type="date" />
                </div>
                <br/>
                <div id="showtimes">
                    <button>12:00 PM</button>
                    <button>3:00 PM</button>
                    <button>6:00 PM</button>
                </div>
                <form className="form" onSubmit={handleSubmit}>
                    <label>First Name: <input name="firstName" required /></label>
                    <label>Last Name: <input name="lastName" required /></label>
                    <label>
                        Ticket Total: <input name="ticketTotal" type="number" min="1" step="1" defaultValue="1" required />
                    </label>
                    <button type="submit" disabled={loading}>
                        {loading ? 'Purchasing...' : 'Purchase'}
                    </button>
                </form>
            </div>
        </div>
    );
}