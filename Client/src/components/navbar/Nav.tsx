import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import '../App.css'
import './navbar.css'
import kuLogo from '../../assets/KULogo.svg';
import logo from '../../assets/BOOLogo.png';
import { accountFetch, clearSession, getAccountId, isAdmin, saveAdminPermission, SESSION_EVENT } from '../../accountApi.ts'

function Nav() {
    const [loggedIn, setLoggedIn] = useState(Boolean(getAccountId()))
    const [admin, setAdmin] = useState(isAdmin())

    useEffect(() => {
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
            <div className="navLinks">
                <Link to="/">
                    Home
                </Link>
                <Link to="/showtimes">
                    Showtimes
                </Link>
                <Link to="/scan">
                    Scan Tickets
                </Link>
                <Link to="/account">
                    Account Test
                </Link>
                {admin && (
                    <Link to="/addshowtime">
                        Admin Dashboard
                    </Link>
                )}
            </div>
            <div style={{ display: 'flex', marginLeft: 'auto' }}>
                {!loggedIn && (
                    <Link to="/login">
                        Log In
                    </Link>
                )}
                <Link to="/createAccount">
                    Create Account
                </Link>
            </div>
        </nav>
    )
}

export default Nav