import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import '../App.css'
import './navbar.css'
import kuLogo from '../../assets/KULogo.svg';
import logo from '../../assets/BOOLogo.png';
import { getAccountId, SESSION_EVENT } from '../../accountApi.ts'

function Nav() {
    const [loggedIn, setLoggedIn] = useState(Boolean(getAccountId()))

    useEffect(() => {
        const update = () => setLoggedIn(Boolean(getAccountId()))
        window.addEventListener(SESSION_EVENT, update)
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
                <Link to="/addshowtime">
                    Admin Dashboard
                </Link>
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