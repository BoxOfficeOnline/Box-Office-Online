import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import "../components/App.css"
import "../components/home.css"
import wallE from "../assets/WALL-E.webp"
import { accountFetch, THEATER_EVENT, getSelectedTheaterId } from "../accountApi.ts"
import { posterSrc } from "../posterSrc.ts"

type Theater = {
    theater_id: number
    theater_name: string
    theater_location: string
}

type Movie = {
    movie_id: number
    title: string
    image: string | null
}

type Showing = {
    showing_id: number
    movie_id: number
    theater_id: number
}

export default function Home() {
    const [theaters, setTheaters] = useState<Theater[]>([])
    const [movies, setMovies] = useState<Movie[]>([])
    const [showings, setShowings] = useState<Showing[]>([])
    const [message, setMessage] = useState("")
    const [selectedTheaterId, setSelectedTheaterId] =
        useState(getSelectedTheaterId)

    useEffect(() => {
        Promise.all([
            accountFetch("/api/theaters"),
            accountFetch("/api/movies"),
            accountFetch("/api/showings"),
        ])
            .then(([theaterResult, movieResult, showingResult]) => {
                if (!movieResult.response.ok) {
                    alert(movieResult.data.error || "Could not load movies.")
                    return
                }
                if (!theaterResult.response.ok) {
                    alert(theaterResult.data.error || "Could not load theaters.")
                    return
                }
                if (!showingResult.response.ok) {
                    alert(showingResult.data.error || "Could not load showings.")
                    return
                }
                setTheaters(theaterResult.data.theaters as Theater[])
                setMovies(movieResult.data.movies as Movie[]) 
                setShowings(showingResult.data.showings as Showing[])
            })
            .catch((error) => {
                console.error("Home page error:", error)
                alert("Could not load home page data. The server did not respond.")
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
                showing.movie_id === movie.movie_id
        )
    , [])

    return (
        <body className="homePage">
            <div className="theaterBar">
                <h1>{theaters.find((t) => String(t.theater_id) === selectedTheaterId)?.theater_name || "Selected Theater"}</h1>
                <p>{theaters.find((t) => String(t.theater_id) === selectedTheaterId)?.theater_location || "Theater Location"}</p>
            </div>
            <div id="nowShowing">
                <h2 id="now-showing-heading">Now Showing</h2>
            </div>
            <div className="nowShowing">
                {atSelectedTheater.length > 0 ? (
                    <div className="moviePosters">
                        {atSelectedTheater.map((movie) => (
                            <Link
                                className="moviePoster"
                                to={`/movies?movieId=${movie.movie_id}`}
                                key={movie.movie_id}
                            >
                                <img
                                    src={movie.image ? posterSrc(movie.image) : wallE}
                                    alt={`${movie.image} poster`}
                                />
                            </Link>
                        ))}
                    </div>
                ) : (
                    <p id="homeMessage">
                        {message || "There are no movies available right now."}
                    </p>
                )}
            </div>
        </body>
    )
}
