import { useEffect, useState } from "react"
import "../components/App.css"
import "../components/Showtime.css"
import { accountFetch, getAccountId, getSelectedTheaterId, THEATER_EVENT } from "../accountApi.ts"
import { Link } from "react-router-dom"
import wallE from '../assets/WALL-E.webp';
import { posterSrc } from "../posterSrc.ts"

type Movie = {
    movie_id: number
    title: string
    description: string
    length : number
    release_year : number
    rating : string
    image: string | null
}

type Showing = {
    showing_id: number
    movie_id: number
    theater_id: number
    showtime: string
}

type Theater = {
    theater_id: number
    theater_name: string
}

// Turns a showtime into the same YYYY-MM-DD the date picker gives back
function toDateValue(showtime: string) {
    const date = new Date(showtime)
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${date.getFullYear()}-${month}-${day}`
}

export default function Showtimes() {
    const [movies, setMovies] = useState<Movie[]>([])
    const [showings, setShowings] = useState<Showing[]>([])
    const [date, setDate] = useState("")
    const [theaters, setTheaters] = useState<Theater[]>([])
    const [selectedTheaterId, setSelectedTheaterId] =
        useState(getSelectedTheaterId)

    useEffect(() => {
        Promise.all([
            accountFetch("/api/movies"),
            accountFetch("/api/showings"),
            accountFetch("/api/theaters"),
        ])
            .then(([movieResult, showingResult, theaterResult]) => {
                if (!movieResult.response.ok) {
                    alert(movieResult.data.error || "Could not load movies.")
                    return
                }
                if (!showingResult.response.ok) {
                    alert(showingResult.data.error || "Could not load showings.")
                    return
                }
                if (!theaterResult.response.ok) {
                    alert(theaterResult.data.error || "Could not load theaters.")
                    return
                }
                setMovies(movieResult.data.movies as Movie[])
                setShowings(showingResult.data.showings as Showing[])
                setTheaters(theaterResult.data.theaters as Theater[])
            })
            .catch((error) => {
                console.error("Showtimes error:", error)
                alert("Could not load showtimes. The server did not respond.")
            })
            const updateTheater = () => {
                setSelectedTheaterId(getSelectedTheaterId())
            }
            window.addEventListener(THEATER_EVENT, updateTheater)
            return () => window.removeEventListener(THEATER_EVENT, updateTheater)
    }, [])
    const atSelectedTheater = movies.filter((movie) =>
        selectedTheaterId !== null &&
        showings.some(
            (showing) =>
                String(showing.theater_id) === selectedTheaterId &&
                showing.movie_id === movie.movie_id &&
                (!date || toDateValue(showing.showtime) === date)
        )
    , [])

    return (
        <body>
            <div className="showtimes-header">
                <h1>Showtimes at {theaters.find((t) => String(t.theater_id) === selectedTheaterId)?.theater_name || "Selected Theater"}</h1>
                <form className="form">
                    <div>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                </form>
            </div>
            <div className="showtimes">
                {atSelectedTheater.map((movie) => (
                    <div className="showtime" key={movie.movie_id}>
                        <div id="poster">
                            <Link to={`/movies?movieId=${movie.movie_id}`}>
                            <img src={movie.image ? posterSrc(movie.image) : wallE} alt={movie.title}/>
                            </Link>
                        </div>
                        <div id="synopsis">
                            <h2>{movie.title}</h2>
                            <h3>Synopsis</h3>
                            <p>{movie.description}</p>
                            <p>{movie.release_year} | {movie.length} min | {movie.rating}</p>
                        </div>
                        <div id="times">
                            {showings
                                .filter((showing) => String(showing.theater_id) === selectedTheaterId)
                                .filter((showing) => showing.movie_id === movie.movie_id)
                                .filter((showing) => !date || toDateValue(showing.showtime) === date)
                                .map((showing) => (
                                    <button key={showing.showing_id}>
                                        {new Date(showing.showtime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                    </button>
                                ))}
                        </div>
                    </div>
                ))}
            </div>
        </body>
    )
}
