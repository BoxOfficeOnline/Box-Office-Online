import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import "../components/App.css"
import "../components/home.css"
import wallE from "../assets/WALL-E.webp"
import { accountFetch } from "../accountApi.ts"
import { posterSrc } from "../posterSrc.ts"

type Theater = {
    theater_id: number
    theater_name: string
    theater_location: string
}

type Movie = {
    movie_id: number
    title: string
    poster: string | null
}

export default function Home() {
    const [theaters, setTheaters] = useState<Theater[]>([])
    const [movies, setMovies] = useState<Movie[]>([])
    const [message, setMessage] = useState("")

    useEffect(() => {
        Promise.all([
            accountFetch("/api/theaters"),
            accountFetch("/api/movies"),
        ])
            .then(([theaterResult, movieResult]) => {
                if (!movieResult.response.ok) {
                    alert(movieResult.data.error || "Could not load movies.")
                    return
                }
                if (!theaterResult.response.ok) {
                    alert(theaterResult.data.error || "Could not load theaters.")
                    return
                }
                setTheaters(theaterResult.data.theaters as Theater[])
                setMovies(movieResult.data.movies as Movie[]) 
            })
            .catch((error) => {
                console.error("Home page error:", error)
                alert("Could not load home page data. The server did not respond.")
            })
    }, [])

    return (
        <body className="homePage">
            <div className="theaterBar">
                <h1>Theater Name</h1>
                <p>Theater Address</p>
            </div>
            <div id="nowShowing">
                <h2 id="now-showing-heading">Now Showing</h2>
            </div>
            <div className="nowShowing">
                {movies.length > 0 ? (
                    <div className="moviePosters">
                        {movies.map((movie) => (
                            <Link
                                className="moviePoster"
                                to={`/movies?movieId=${movie.movie_id}`}
                                key={movie.movie_id}
                            >
                                <img
                                    src={movie.poster ? posterSrc(movie.poster) : wallE}
                                    alt={`${movie.title} poster`}
                                />
                                <span>{movie.title}</span>
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
