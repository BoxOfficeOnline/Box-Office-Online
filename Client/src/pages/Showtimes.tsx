import { useEffect, useState } from "react"
import "../components/App.css"
import "../components/Showtime.css"
import { accountFetch, getAccountId } from "../accountApi.ts"
import { Link } from "react-router-dom"
import wallE from '../assets/WALL-E.webp';
import { posterSrc } from "../posterSrc.ts"

type Movie = {
    movie_id: number
    title: string
    description: string
    image: string | null
}

type Showing = {
    showing_id: number
    movie_id: number
    showtime: string
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

    useEffect(() => {
        Promise.all([
            accountFetch("/api/movies"),
            accountFetch("/api/showings"),
        ])
            .then(([movieResult, showingResult]) => {
                if (!movieResult.response.ok) {
                    alert(movieResult.data.error || "Could not load movies.")
                    return
                }
                if (!showingResult.response.ok) {
                    alert(showingResult.data.error || "Could not load showings.")
                    return
                }
                setMovies(movieResult.data.movies as Movie[])
                setShowings(showingResult.data.showings as Showing[])
            })
            .catch((error) => {
                console.error("Showtimes error:", error)
                alert("Could not load showtimes. The server did not respond.")
            })
    }, [])

    return (
        <body>
            <div className="showtimes-header">
                <h1 style={{ textAlign: "center" }}>Showtimes</h1>
                <div>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
            </div>
            <div className="showtimes">
                {movies.map((movie) => (
                    <div className="showtime" key={movie.movie_id}>
                        <div id="poster">
                            <Link to={`/movies?movieId=${movie.movie_id}`}>
                            <img src={movie.image ? posterSrc(movie.image) : wallE} alt={movie.title}/>
                            </Link>
                        </div>
                        <div id="synopsis">
                            <p>{movie.description}</p>
                        </div>
                        <div id="times">
                            {showings
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
