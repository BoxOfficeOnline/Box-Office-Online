import type { SyntheticEvent } from "react"
import { useEffect, useState } from "react"
import "../../components/App.css"
import { accountFetch, getAccountId } from "../../accountApi.ts"

type Movie = {
    movie_id: number
    title: string
}

// coded by Claude
type Theater = {
    theater_id: number
    theater_name: string
    theater_location: string
}

// coded by Claude
type CsvShowing = {
    row: number
    movieTitle: string
    theaterName: string
    formatName: string | null
    showtime: string
    note: string | null
}

// coded by Claude
type CsvPreview = {
    showings: CsvShowing[]
    problems: { row: number; message: string }[]
    columns: { heading: string; meaning: string }[]
}

// coded by Claude
// Excel and other programs save CSV files in different text encodings, so try the common ones
async function readCsvFile(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer())
    // .xlsx and .numbers files start with PK, old .xls files start with D0 CF
    if ((bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) {
        throw new Error("This is a spreadsheet file, not a CSV file. Open it in Excel (or Google Sheets), choose File > Save As (or Download), pick CSV, and upload that file instead.")
    }
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder("utf-16le").decode(bytes)
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder("utf-16be").decode(bytes)
    }
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
        return new TextDecoder("windows-1252").decode(bytes)
    }
}

// coded by Claude
// "2026-11-13 19:30:00" -> "Fri, Nov 13, 2026" and "7:30 PM"
function showtimeParts(showtime: string) {
    const [y, m, d, h, min] = showtime.split(/[- :]/).map(Number)
    const date = new Date(y, m - 1, d, h, min)
    return {
        date: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
        time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    }
}

// coded by Claude
// A small file admins can copy from, using the next couple of days so none of it is in the past
function downloadExample(movieTitle: string) {
    const day = (offset: number) => {
        const date = new Date()
        date.setDate(date.getDate() + offset)
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
    }
    const title = `"${movieTitle.replace(/"/g, '""')}"`
    const csv = [
        "Movie,Date,Time,Format",
        `${title},${day(1)},1:30 PM,`,
        `${title},${day(1)},7:00 PM,`,
        `${title},${day(2)},4:15 PM,`,
    ].join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "showtimes-example.csv"
    link.click()
    URL.revokeObjectURL(url)
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

    // coded by Claude
    const [theaters, setTheaters] = useState<Theater[]>([])
    const [csvMovieId, setCsvMovieId] = useState("")
    const [csvTheaterId, setCsvTheaterId] = useState("")
    const [csvText, setCsvText] = useState("")
    const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null)
    const [csvMessage, setCsvMessage] = useState("")
    const [csvBusy, setCsvBusy] = useState(false)
    // Changing the key clears the file picker after an upload
    const [csvInputKey, setCsvInputKey] = useState(0)

    // coded by Claude
    // Start with the admin's own theater picked
    useEffect(() => {
        const accountId = getAccountId()
        Promise.all([
            accountFetch("/api/theaters"),
            accountId ? accountFetch(`/api/account/${accountId}`) : Promise.resolve(null),
        ])
            .then(([theaterResult, accountResult]) => {
                if (!theaterResult.response.ok) {
                    setCsvMessage(theaterResult.data.error || "Could not load theaters.")
                    return
                }
                const list = theaterResult.data.theaters as Theater[]
                setTheaters(list)
                const ownTheater = accountResult?.response.ok ? accountResult.data.account.theaterId : null
                setCsvTheaterId(String(ownTheater ?? list[0]?.theater_id ?? ""))
            })
            .catch((error) => {
                console.error("Theaters error:", error)
                setCsvMessage("Could not load theaters. The server did not respond.")
            })
    }, [])

    // coded by Claude
    useEffect(() => {
        if (!csvMovieId && movies.length > 0) {
            setCsvMovieId(String(movies[0].movie_id))
        }
    }, [movies, csvMovieId])

    // coded by Claude
    // Show how the file was read as soon as it is picked, and again if the movie or theater changes
    useEffect(() => {
        if (!csvText || !csvMovieId || !csvTheaterId) {
            return
        }
        let current = true
        setCsvBusy(true)
        accountFetch("/api/showings/csv", {
            method: "POST",
            body: JSON.stringify({ csv: csvText, movieId: Number(csvMovieId), theaterId: Number(csvTheaterId), preview: true }),
        })
            .then(({ response, data }) => {
                if (!current) return
                if (response.ok) {
                    setCsvPreview(data as CsvPreview)
                    setCsvMessage("")
                } else {
                    setCsvPreview(null)
                    setCsvMessage(data.error || "Could not read the file.")
                }
            })
            .catch((error) => {
                if (!current) return
                console.error("CSV preview error:", error)
                setCsvMessage("Could not read the file. The server did not respond.")
            })
            .finally(() => {
                if (current) setCsvBusy(false)
            })
        return () => {
            current = false
        }
    }, [csvText, csvMovieId, csvTheaterId])

    // coded by Claude
    const handleCsvFile = async (file: File | undefined) => {
        setCsvPreview(null)
        setCsvMessage("")
        setCsvText("")
        if (!file) return
        if (!getAccountId()) {
            alert("You need to log in first.")
            return
        }
        try {
            const text = await readCsvFile(file)
            if (!text.trim()) {
                setCsvMessage("That file is empty.")
                return
            }
            setCsvText(text)
        } catch (error) {
            setCsvMessage(error instanceof Error ? error.message : "Could not open that file.")
        }
    }

    // coded by Claude
    const handleCsvSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!csvText || !csvPreview || csvPreview.showings.length === 0) {
            return
        }
        setCsvBusy(true)
        try {
            const { response, data } = await accountFetch("/api/showings/csv", {
                method: "POST",
                body: JSON.stringify({ csv: csvText, movieId: Number(csvMovieId), theaterId: Number(csvTheaterId) }),
            })
            if (response.ok) {
                const skipped = data.problems?.length ? ` ${data.problems.length} row(s) were skipped.` : ""
                alert(`Added ${data.added} showtime${data.added === 1 ? "" : "s"}.${skipped}`)
                setCsvText("")
                setCsvPreview(null)
                setCsvInputKey((key) => key + 1)
            } else {
                alert(data.error || "Could not add the showtimes.")
            }
        } catch (error) {
            console.error("CSV upload error:", error)
            alert("Could not add the showtimes. The server did not respond.")
        } finally {
            setCsvBusy(false)
        }
    }

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
            {/* coded by Claude */}
            <h1 style={{ textAlign: "center" }}>Add Showtimes from a File</h1>
            <form className="form csvUpload" onSubmit={handleCsvSubmit}>
                <p className="csvHelp">
                    Upload your theater's showtime spreadsheet saved as a CSV file. It only needs a date and a time
                    for each showing, in whatever layout you already use. You will see everything before it is added.
                </p>
                <label>
                    Movie (used when the file does not name one):{" "}
                    <select value={csvMovieId} onChange={(e) => setCsvMovieId(e.target.value)} required>
                        {movies.map((movie) => (
                            <option key={movie.movie_id} value={movie.movie_id}>
                                {movie.title}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Theater (used when the file does not name one):{" "}
                    <select value={csvTheaterId} onChange={(e) => setCsvTheaterId(e.target.value)} required>
                        {theaters.map((theater) => (
                            <option key={theater.theater_id} value={theater.theater_id}>
                                {theater.theater_name} ({theater.theater_location})
                            </option>
                        ))}
                    </select>
                </label>
                <input
                    key={csvInputKey}
                    type="file"
                    accept=".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values"
                    onChange={(e) => handleCsvFile(e.target.files?.[0])}
                />
                <button type="button" className="csvLink" onClick={() => downloadExample(movies.find((movie) => String(movie.movie_id) === csvMovieId)?.title ?? "Movie Title")}>
                    Not sure how to set up the file? Download an example
                </button>

                {csvBusy && <p>Reading the file...</p>}
                {csvMessage && <p className="csvError">{csvMessage}</p>}

                {csvPreview && (
                    <div className="csvPreview">
                        {csvPreview.columns.length > 0 && (
                            <p className="csvHelp">
                                How we read your columns:{" "}
                                {csvPreview.columns.map((column) => `${column.heading} = ${column.meaning}`).join(", ")}
                            </p>
                        )}
                        {csvPreview.problems.length > 0 && (
                            <div className="csvProblems">
                                <strong>
                                    {csvPreview.problems.length} {csvPreview.problems.length === 1 ? "thing" : "things"} will be skipped:
                                </strong>
                                <ul>
                                    {csvPreview.problems.map((problem, index) => (
                                        <li key={index}>
                                            {problem.row > 0 ? `Row ${problem.row}: ` : ""}
                                            {problem.message}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {csvPreview.showings.length > 0 && (
                            <>
                                <strong>
                                    {csvPreview.showings.length} showtime{csvPreview.showings.length === 1 ? "" : "s"} ready to add. Check that these look right:
                                </strong>
                                <table className="csvTable">
                                    <thead>
                                        <tr>
                                            <th>Row</th>
                                            <th>Movie</th>
                                            <th>Theater</th>
                                            <th>Date</th>
                                            <th>Time</th>
                                            <th>Format</th>
                                            <th>Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {csvPreview.showings.map((showing, index) => {
                                            const parts = showtimeParts(showing.showtime)
                                            return (
                                                <tr key={index} className={showing.note ? "csvGuess" : undefined}>
                                                    <td>{showing.row}</td>
                                                    <td>{showing.movieTitle}</td>
                                                    <td>{showing.theaterName}</td>
                                                    <td>{parts.date}</td>
                                                    <td>{parts.time}</td>
                                                    <td>{showing.formatName ?? ""}</td>
                                                    <td>{showing.note ?? ""}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                                <button type="submit" disabled={csvBusy}>
                                    Add {csvPreview.showings.length} Showtime{csvPreview.showings.length === 1 ? "" : "s"}
                                </button>
                            </>
                        )}
                    </div>
                )}
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
