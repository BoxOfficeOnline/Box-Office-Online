import type { SyntheticEvent } from "react"
import { useEffect, useState } from "react"
import "../../components/App.css"
import { accountFetch, getAccountId } from "../../accountApi.ts"

type Movie = {
    movie_id: number
    title: string
}

type Theater = {
    theater_id: number
    theater_name: string
}

type Format = {
    format_id: number
    theater_id: number
    format_name: string
    price: number
}

type ImportRow = {
    record: number
    movie: string
    datetime: string
    theater: string
    format: string
}

type InvalidImportRow = ImportRow & { error: string }

type ImportPreview = {
    previewId: string | null
    valid: ImportRow[]
    invalid: InvalidImportRow[]
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
    const [theaters, setTheaters] = useState<Theater[]>([])
    const [formats, setFormats] = useState<Format[]>([])
    const [theaterId, setTheaterId] = useState("")
    const [csvFile, setCsvFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<ImportPreview | null>(null)
    const [importMessage, setImportMessage] = useState("")
    const [importError, setImportError] = useState("")
    const [importBusy, setImportBusy] = useState(false)

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

    const loadTheaters = () => {
        accountFetch("/api/theaters")
            .then(({ response, data }) => {
                if (!response.ok) {
                    alert(data.error || "Could not load theaters.")
                    return
                }
                setTheaters(data.theaters as Theater[])
            })
            .catch((error) => {
                console.error("Theaters error:", error)
                alert("Could not load theaters. The server did not respond.")
            })
    }

    useEffect(() => {
        loadMovies()
        loadTheaters()
    }, [])

    useEffect(() => {
        if (!theaterId) {
            return
        }
        let active = true
        accountFetch(`/api/formats?theaterId=${theaterId}`)
            .then(({ response, data }) => {
                if (!response.ok) {
                    if (active) {
                        alert(data.error || "Could not load formats.")
                    }
                    return
                }
                if (active) {
                    setFormats(data.formats as Format[])
                }
            })
            .catch((error) => {
                console.error("Formats error:", error)
                if (active) {
                    alert("Could not load formats. The server did not respond.")
                }
            })
        return () => {
            active = false
        }
    }, [theaterId])

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

    const handleCsvPreview = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault()
        setPreview(null)
        setImportMessage("")
        setImportError("")
        if (!getAccountId()) {
            setImportError("You need to log in as an administrator first.")
            return
        }
        if (!csvFile || !csvFile.name.toLowerCase().endsWith(".csv") || csvFile.size === 0 || csvFile.size > 1024 * 1024) {
            setImportError("Choose a non-empty CSV file no larger than 1 MB.")
            return
        }
        setImportBusy(true)
        try {
            const { response, data } = await accountFetch("/api/showings/import/preview", {
                method: "POST",
                body: JSON.stringify({ csv: await csvFile.text() }),
            })
            if (!response.ok) {
                setImportError(data.error || "Could not preview the CSV.")
            } else {
                setPreview(data as ImportPreview)
            }
        } catch (error) {
            console.error("Showtime preview error:", error)
            setImportError("Could not read the file or reach the server.")
        } finally {
            setImportBusy(false)
        }
    }

    const handleCsvImport = async () => {
        if (!preview?.previewId) return
        setImportBusy(true)
        setImportError("")
        try {
            const { response, data } = await accountFetch("/api/showings/import", {
                method: "POST",
                body: JSON.stringify({ previewId: preview.previewId }),
            })
            if (!response.ok) {
                setPreview(null)
                setImportError(data.error || "Could not import showtimes. Preview the CSV again.")
            } else {
                setImportMessage(`${data.imported} showtime(s) imported.`)
                setPreview({ previewId: null, valid: [], invalid: [...preview.invalid, ...data.invalid] })
            }
        } catch (error) {
            console.error("Showtime import error:", error)
            setPreview(null)
            setImportError("Could not confirm the import. Check existing showtimes before trying again.")
        } finally {
            setImportBusy(false)
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
                    theaterId: Number(formData.get("theaterId")),
                    formatId: Number(formData.get("formatId")),
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
            <h1 style={{ textAlign: "center" }}>Add a Format</h1>
            <form className="form">
                <input type="text" name="title" placeholder="Movie Title" required />
                <button type="submit">Add Format</button>
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
                <select
                    name="theaterId"
                    value={theaterId}
                    onChange={(event) => {
                        setTheaterId(event.target.value)
                        setFormats([])
                    }}
                    required
                >
                    <option value="" disabled>Select a theater</option>
                    {theaters.map((theater) => (
                        <option key={theater.theater_id} value={theater.theater_id}>
                            {theater.theater_name}
                        </option>
                    ))}
                </select>
                <select name="formatId" required defaultValue="" disabled={!formats.length}>
                    <option value="" disabled>Select a format</option>
                    {formats.map((format) => (
                        <option key={format.format_id} value={format.format_id}>
                            {format.format_name} (${Number(format.price).toFixed(2)})
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
            <h1 style={{ textAlign: "center" }}>Import Showtimes</h1>
            <form className="form" onSubmit={handleCsvPreview}>
                <p>CSV columns: movie, datetime, theater, format. Dates must use YYYY-MM-DD HH:MM[:SS].</p>
                <p>Claude interprets column headers. Review the matching showtimes before importing.</p>
                <label htmlFor="csv">Showtimes CSV (maximum 1 MB)</label>
                <input type="file" id="csv" name="csv" accept=".csv,text/csv" required disabled={importBusy}
                    onChange={(event) => {
                        setCsvFile(event.target.files?.[0] ?? null)
                        setPreview(null)
                        setImportError("")
                        setImportMessage("")
                    }} />
                <button type="submit" disabled={importBusy}>{importBusy ? "Working..." : "Preview Showtimes"}</button>
            </form>
            <div className="import-results" aria-live="polite">
                {importError && <p className="invalid">{importError}</p>}
                {importMessage && <p className="valid">{importMessage}</p>}
                {preview && (
                    <>
                        <p>{preview.valid.length} ready to import; {preview.invalid.length} rejected.</p>
                        {preview.valid.length > 0 && (
                            <>
                                <h2>Review valid showtimes</h2>
                                <div className="import-table">
                                    <table>
                                        <thead><tr><th>Record</th><th>Movie</th><th>Date and time</th><th>Theater</th><th>Format</th></tr></thead>
                                        <tbody>{preview.valid.map((row) => (
                                            <tr key={row.record}><td>{row.record}</td><td>{row.movie}</td><td>{row.datetime}</td><td>{row.theater}</td><td>{row.format}</td></tr>
                                        ))}</tbody>
                                    </table>
                                </div>
                                <div className="form"><button type="button" disabled={importBusy} onClick={handleCsvImport}>Import valid showtimes</button></div>
                            </>
                        )}
                        {preview.invalid.length > 0 && (
                            <>
                                <h2>Rejected records</h2>
                                <div className="import-table">
                                    <table>
                                        <thead><tr><th>Record</th><th>Movie</th><th>Date and time</th><th>Theater</th><th>Format</th><th>Reason</th></tr></thead>
                                        <tbody>{preview.invalid.map((row) => (
                                            <tr key={row.record}><td>{row.record}</td><td>{row.movie}</td><td>{row.datetime}</td><td>{row.theater}</td><td>{row.format}</td><td>{row.error}</td></tr>
                                        ))}</tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
