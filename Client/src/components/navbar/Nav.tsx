import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import '../App.css'
import './navbar.css'
import kuLogo from '../../assets/KULogo.svg';
import logo from '../../assets/BOOLogo.png';
import { accountFetch, clearSession, getAccountId, isAdmin, saveAdminPermission, SESSION_EVENT, THEATER_EVENT, saveSelectedTheaterId } from '../../accountApi.ts'

type Theater = {
    theater_id: number
    theater_name: string
    theater_location: string
}

function Nav() {
    const [loggedIn, setLoggedIn] = useState(Boolean(getAccountId()))
    const [admin, setAdmin] = useState(isAdmin())
    const [theaters, setTheaters] = useState<Theater[]>([])

    useEffect(() => {
        Promise.all([
            accountFetch("/api/theaters"),
        ])
            .then(([theaterResult]) => {
                if (!theaterResult.response.ok) {
                    alert(theaterResult.data.error || "Could not load theaters.")
                    return
                }
                setTheaters(theaterResult.data.theaters as Theater[])
            })
            .catch((error) => {
                console.error("Navbar error:", error)
                alert("Could not load navbar data. The server did not respond.")
            })
        const update = () => {
            setLoggedIn(Boolean(getAccountId()))
            setAdmin(isAdmin())
        }
        window.addEventListener(SESSION_EVENT, update)

        // The server forgets logins when it restarts, so make sure the saved one still works
        const id = getAccountId()
        if (id) {
            accountFetch(`/api/account/${id}`)
                .then(({ response, data }) => {
                    if (response.ok) {
                        saveAdminPermission(Boolean(data.account.adminPermission))
                    } else if (response.status === 401 || response.status === 404) {
                        clearSession()
                    }
                })
                .catch((error) => console.error("Session check error:", error))
        }

        return () => window.removeEventListener(SESSION_EVENT, update)
    }, [])

    return (
        <nav className="navbar">
            <img src={kuLogo} alt="KU Logo" className="navLogo"/>
            <img src={logo} alt="BOO Logo" className="navLogo"/>
            <div className="navLinks" style={{ paddingLeft: '20px' }}>
                <Link to="/">
                    Home
                </Link>
                <Link to="/showtimes">
                    Showtimes
                </Link>
            <details className="navAccountDropdown" style={{ alignSelf: 'center' }}>
                <summary>Our Theaters</summary>
                <div className="navAccountMenu">
                    {theaters.map((theater) => (
                        <button key={theater.theater_id} type="button"
                            onClick={() => saveSelectedTheaterId(theater.theater_id)}
                        >
                            {theater.theater_name}
                        </button>
                    ))}
                </div>
            </details>
            </div>
            <div style={{ display: 'flex', marginLeft: 'auto' }}>
                {!loggedIn ? (
                    <>
                        <Link to="/login">
                            Log In
                        </Link>
                        <Link to="/createAccount">
                            Create Account
                        </Link>
                    </>
                ) : (
                    <details className="navAccountDropdown">
                        <summary>My Account</summary>
                        <div className="navAccountMenu">
                            <Link to="/account">
                                Account Dashboard
                            </Link>
                            <Link to="/logout">
                                Log Out
                            </Link>
                        </div>
                    </details>
                )}
            </div>
        </nav>
    )
}

export default Nav