import { Link } from 'react-router-dom'
import '../App.css'
import kuLogo from '../assets/KULogo.svg';
import logo from '../assets/BOOLogo.png';

function Nav() {
    return (
        <nav className="navbar">
            <img src={kuLogo} alt="KU Logo" className="navLogo"/>
            <img src={logo} alt="BOO Logo" className="navLogo"/>
            <div className="navLinks">
                <Link to="/">
                    Home
                </Link>
                <Link to="/scan">
                    Scan Tickets
                </Link>
            </div>
        </nav>
    )
}

export default Nav