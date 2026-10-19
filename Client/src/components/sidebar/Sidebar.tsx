import { Link } from 'react-router-dom'
import '../App.css'
import './sidebar.css'

function Sidebar() {
    return (
        <nav className="sidebar">
            <div className="navLinks">
                <Link to="/account">
                    Account Overview
                </Link>
                <Link to="/change">
                    Change Account Info
                </Link>
                <Link to="/tickets">
                    Tickets
                </Link>
                <Link to="/logout">
                    Log Out
                </Link>
                <Link to="/delete">
                    Delete Account
                </Link>
            </div>
        </nav>
    )
}

export default Sidebar