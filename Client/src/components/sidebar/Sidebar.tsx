import { Link } from 'react-router-dom'
import '../App.css'
import './sidebar.css'

function Sidebar() {
    return (
        <nav className="sidebar">
            <div className="navLinks">
                <Link to="/Account">
                    Account Ovewview
                </Link>
                <Link to="/Change">
                    Change Account Info
                </Link>
                <Link to="/Tickets">
                    Tickets
                </Link>
                <Link to="/Logout">
                    Log Out
                </Link>
                <Link to="/Delete">
                    Delete Account
                </Link>
            </div>
        </nav>
    )
}

export default Sidebar