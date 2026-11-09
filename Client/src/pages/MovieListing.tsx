import type { SyntheticEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import "../components/App.css"
import wallE from '../assets/WALL-E.webp';
import "../components/MovieListing.css"
import { posterSrc } from "../posterSrc.ts"
import { accountFetch, getAccountId, type Account } from "../accountApi.ts"

type Movie = {
    movie_id: number;
    title: string;
    description: string;
    length: number;
    release_year: number;
    rating: string;
    image: string | null;
};

type Showing = {
    showing_id: number;
    movie_id: number;
    showtime: string;
    title: string;
    theater_name: string;
    theater_location: string;
    format_name: string;
    price: number;
};

const API_BASE = import.meta.env.DEV
    ? "http://localhost:5000"
    : "https://box-office-online.onrender.com";


export default function MovieListing() {
    const [searchParams] = useSearchParams();
    // Set when you come here from a movie on the Showtimes page
    const movieId = Number(searchParams.get("movieId")) || null;
    const showingId = Number(searchParams.get("showingId")) || null;
    const [movie, setMovie] = useState<Movie | null>(null);
    const [showings, setShowings] = useState<Showing[]>([]);
    const [loadingShowings, setLoadingShowings] = useState(true);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [account, setAccount] = useState<Account | null>(null);

    useEffect(() => {
        // Fill in the name for logged in users
        const id = getAccountId();
        if (id) {
            accountFetch(`/api/account/${id}`).then(({ response, data }) => response.ok && setAccount(data.account));
        }
    }, []);

    useEffect(() => {
        fetch(`${API_BASE}/api/showings`)
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || "Could not load showings.");
                }
                const allShowings = data.showings as Showing[];
                setShowings(movieId ? allShowings.filter((showing) => showing.movie_id === movieId) : allShowings);
            })
            .catch((error: unknown) => {
                console.error("Showings error:", error);
                setMessage(error instanceof Error ? error.message : "Could not load showings.");
            })
            .finally(() => setLoadingShowings(false));
    }, [movieId]);

    useEffect(() => {
        if (!movieId) {
            return;
        }
        fetch(`${API_BASE}/api/movies`)
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || "Could not load the movie.");
                }
                setMovie((data.movies as Movie[]).find((m) => m.movie_id === movieId) ?? null);
            })
            .catch((error: unknown) => {
                console.error("Movie error:", error);
                setMessage(error instanceof Error ? error.message : "Could not load the movie.");
            });
    }, [movieId]);

    const [selectedShowingId, setSelectedShowingId] = useState(showingId ? String(showingId) : "")
    const [ticketTotal, setTicketTotal] = useState("1")
    const selectedShowing = showings.find((showing) => String(showing.showing_id) === selectedShowingId)
    const totalPrice = Number(selectedShowing?.price ?? 0) * Number(ticketTotal)

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
                window.location.href = data.url;
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
                <img src={movie?.image ? posterSrc(movie.image) : wallE} alt={movie?.title ?? "WALL-E"}/>
            </div>
            <div id="synopsis">
                <h2>{movie?.title}</h2>
                <h3>Synopsis</h3>
                <p>{movie?.description}</p>
                <p>{movie?.release_year} | {movie?.length} min | {movie?.rating}</p>
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
                        <label>First Name: <input name="firstName" key={account?.firstName} defaultValue={account?.firstName} maxLength={45} required /></label>
                        <label>Last Name: <input name="lastName" key={account?.lastName} defaultValue={account?.lastName} maxLength={45} required /></label>
                        <label>
                            Showing:
                            <select name="showingId" required defaultValue={searchParams.get("showingId") ?? ""}>
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
                        <div>
                            Total: ${totalPrice.toFixed(2)}
                        </div>
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
