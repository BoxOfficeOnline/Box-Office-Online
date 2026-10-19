import { useEffect, useState } from "react"
import "../../components/App.css"
import { accountFetch, getAccountId } from "../../accountApi.ts"

export default function Admin() {
    return (
        <div>
            <h1>Add a Showtime</h1>
            <form>
                <select>
                    <option value="movie1">Movie 1</option>
                </select>
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
                <button type="submit">Add Showtime</button>
            </form>
        </div>
    )
}
