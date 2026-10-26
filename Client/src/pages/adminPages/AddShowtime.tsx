import type { SyntheticEvent } from "react"
import { useEffect, useState } from "react"
import "../../components/App.css"
import { accountFetch, getAccountId } from "../../accountApi.ts"

type Movie = {
    movie_id: number
    title: string
}

// Sends the image file as text
function readImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
    })
}

export default function AddShowtime() {
    const [movies, setMovies] = useState<Movie[]>([])

    const loadMovies = () => {
        accountFetch("/api/movies")
            .then(({ response, data }) => {
                if (!response.ok) {
                    alert(data.error || "Could not load movies.")
                    return
                }
                setMovies(data.movies as Movie[])
            })
            .catch((error) => {
                console.error("Movies error:", error)
                alert("Could not load movies. The server did not respond.")
            })
    }

    useEffect(() => {
        loadMovies()
    }, [])

    const handleMovieSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault()
        const form = e.currentTarget
        if (!getAccountId()) {
            alert("You need to log in first.")
            return
        }

        const formData = new FormData(form)
        const poster = formData.get("movie-poster")
        if (!(poster instanceof File) || poster.size === 0) {
            alert("Choose a poster image first.")
            return
        }

        try {
            const { response, data } = await accountFetch("/api/movies", {
                method: "POST",
                body: JSON.stringify({
                    title: String(formData.get("title") ?? ""),
                    description: String(formData.get("description") ?? ""),
                    image: await readImage(poster),
                }),
            })
            if (response.ok) {
                form.reset()
                alert(`${data.movie.title} added.`)
                loadMovies()
            } else {
                alert(data.error || "Could not add the movie.")
            }
        } catch (error) {
            console.error("Add movie error:", error)
            alert("Could not add the movie. The server did not respond.")
        }
    }

    const handleShowtimeSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!getAccountId()) {
            alert("You need to log in first.")
            return
        }

        const formData = new FormData(e.currentTarget)
        // Turn the 12 hour picker into the 24 hour time MySQL expects
        let hour = Number(formData.get("hour")) % 12
        if (formData.get("period") === "PM") {
            hour += 12
        }
        const showtime = `${formData.get("date")} ${String(hour).padStart(2, "0")}:${formData.get("minute")}:00`

        try {
            const { response, data } = await accountFetch("/api/showings", {
                method: "POST",
                body: JSON.stringify({
                    movieId: Number(formData.get("movieId")),
                    showtime,
                }),
            })
            if (response.ok) {
                alert("Showtime added.")
            } else {
                alert(data.error || "Could not add the showtime.")
            }
        } catch (error) {
            console.error("Add showtime error:", error)
            alert("Could not add the showtime. The server did not respond.")
        }
    }

    return (

        <div>
            <h1 style={{ textAlign: "center" }}>Add a Movie</h1>
            <form className="form" onSubmit={handleMovieSubmit}>
                <input type="text" name="title" placeholder="Movie Title" required />
                <input type="text" name="description" placeholder="Movie Synopsis" required />
                <input type="file" id="movie-poster" name="movie-poster" accept="image/*" required />
                <button type="submit">Add Movie</button>
            </form>
            <br/>
            <h1 style={{ textAlign: "center" }}>Add a Showtime</h1>
            <form className="form" onSubmit={handleShowtimeSubmit}>
                <select name="movieId" required>
                    {movies.map((movie) => (
                        <option key={movie.movie_id} value={movie.movie_id}>
                            {movie.title}
                        </option>
                    ))}
                </select>
                <input type="date" name="date" required />
                <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
                    <select name="hour">
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                        <option value="7">7</option>
                        <option value="8">8</option>
                        <option value="9">9</option>
                        <option value="10">10</option>
                        <option value="11">11</option>
                        <option value="12">12</option>
                    </select>
                    <select name="minute">
                        <option value="00">00</option>
                        <option value="15">15</option>
                        <option value="30">30</option>
                        <option value="45">45</option>
                    </select>
                    <select name="period">
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                    </select>
                </div>
                <button type="submit">Add Showtime</button>
            </form>
        </div>
    )
}
