import { useEffect, useState } from "react"
import "../../components/App.css"
import { accountFetch, getAccountId } from "../../accountApi.ts"

export default function AddShowtime() {
    return (

        <div>
            <h1 style={{ textAlign: "center" }}>Add a Movie</h1>
            <form className="form">
                <input type="text" placeholder="Movie Title" />
                <input type="text" placeholder="Movie Synopsis" />
                <input type="file" id="movie-poster" name="movie-poster" />
                <button type="submit">Add Movie</button>
            </form>
            <br/>
            <h1 style={{ textAlign: "center" }}>Add a Showtime</h1>
            <form className="form">
                <select>
                    <option value="movie1">Movie 1</option>
                </select>
                <input type="date" />
                <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
                    <select>
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
                    <select>
                        <option value="00">00</option>
                        <option value="15">15</option>
                        <option value="30">30</option>
                        <option value="45">45</option>
                    </select>
                    <select>
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                    </select>
                </div>
                <button type="submit">Add Showtime</button>
            </form>
        </div>
    )
}
