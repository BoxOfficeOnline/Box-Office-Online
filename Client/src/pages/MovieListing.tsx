import type { SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "../components/App.css"
import wallE from '../assets/WALL-E.webp';
import "../components/MovieListing.css"

type Showing = {
    showing_id: number;
    showtime: string;
    title: string;
    theater_name: string;
    theater_location: string;
};

const API_BASE = import.meta.env.DEV
    ? "http://localhost:5000"
    : "https://box-office-online.onrender.com";


export default function MovieListing() {
    const navigate = useNavigate();
    const [showings, setShowings] = useState<Showing[]>([]);
    const [loadingShowings, setLoadingShowings] = useState(true);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        fetch(`${API_BASE}/api/showings`)
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || "Could not load showings.");
                }
                setShowings(data.showings as Showing[]);
            })
            .catch((error: unknown) => {
                console.error("Showings error:", error);
                setMessage(error instanceof Error ? error.message : "Could not load showings.");
            })
            .finally(() => setLoadingShowings(false));
    }, []);

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const firstName = String(formData.get("firstName") ?? "");
        const lastName = String(formData.get("lastName") ?? "");
        const showingId = Number(formData.get("showingId"));
        const ticketTotal = Number(formData.get("ticketTotal"));

        setLoading(true);
        setMessage("");
        try {
            const response = await fetch(`${API_BASE}/api/purchase`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ firstName, lastName, showingId, ticketTotal }),
            });

            const data = await response.json();
            if (response.ok) {
                navigate(`/purchase/${data.ticketId}`);
            } else {
                setMessage(data.error || "Purchase failed.");
            }
        } catch (error) {
            console.error("Purchase error:", error);
            setMessage("Purchase failed. The server did not respond.");
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
                <>
                    {loadingShowings ? (
                        <div className="valid">Loading showings...</div>
                    ) : showings.length === 0 ? (
                        <div className="invalid">{message || "There are no showings available."}</div>
                    ) : (
                    <form className="form" onSubmit={handleSubmit}>
                        <label>First Name: <input name="firstName" maxLength={45} required /></label>
                        <label>Last Name: <input name="lastName" maxLength={45} required /></label>
                        <label>
                            Showing:
                            <select name="showingId" required defaultValue="">
                                <option value="" disabled>Select a showing</option>
                                {showings.map((showing) => (
                                    <option key={showing.showing_id} value={showing.showing_id}>
                                        {showing.title} - {showing.theater_name} ({showing.theater_location}) - {new Date(showing.showtime).toLocaleString()}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Ticket Total: <input name="ticketTotal" type="number" min="1" step="1" defaultValue="1" required />
                        </label>
                        <button type="submit" disabled={loading}>
                            {loading ? "Purchasing..." : "Purchase"}
                        </button>
                    </form>
                    )}
                {message && showings.length > 0 && <div className="invalid">{message}</div>}
                </>
            </div>
        </div>
    );
}
