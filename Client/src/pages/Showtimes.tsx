import { useEffect, useState } from "react"
import "../components/App.css"
import "../components/Showtime.css"
import { accountFetch, getAccountId } from "../accountApi.ts"
import { Link } from "react-router-dom"
import wallE from '../assets/WALL-E.webp';

export default function Showtimes() {
    return (
        <body>
            <div className="showtimes-header">
                <h1 style={{ textAlign: "center" }}>Showtimes</h1>
                <div>
                    <input type="date" />
                </div>
            </div>
            <div className="showtimes">
                <div className="showtime">
                    <div id="poster">
                        <Link to="/movies">
                        <img src={wallE} alt="WALL-E"/>
                        </Link>
                    </div>
                    <div id="synopsis">
                        <p>Synopsis goes here...</p>
                    </div>
                    <div id="times">
                        <button>12:00 PM</button>
                        <button>3:00 PM</button>
                        <button>6:00 PM</button>
                        <button>9:00 PM</button>
                    </div>
                </div>
                <div className="showtime">
                    <div id="poster">
                        <Link to="/movies">
                        <img src={wallE} alt="WALL-E"/>
                        </Link>
                    </div>
                    <div id="synopsis">
                        <p>Synopsis goes here...</p>
                    </div>
                    <div id="times">
                        <button>12:00 PM</button>
                        <button>3:00 PM</button>
                        <button>6:00 PM</button>
                        <button>9:00 PM</button>
                        <button>12:00 AM</button>
                    </div>
                </div>
            </div>
        </body>
    )
}