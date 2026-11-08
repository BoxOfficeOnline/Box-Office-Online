import { Link } from 'react-router-dom'
import '../App.css'
import './sidebar.css'
import { accountFetch, clearSession, getAccountId, isAdmin, isEmployee, saveAdminPermission, saveEmployeePermission, SESSION_EVENT } from '../../accountApi.ts'
import { useEffect, useState } from 'react'

function Sidebar() {
    const [loggedIn, setLoggedIn] = useState(Boolean(getAccountId()))
    const [admin, setAdmin] = useState(isAdmin())
    const [employee, setEmployee] = useState(isEmployee())

    useEffect(() => {
        const update = () => {
            setLoggedIn(Boolean(getAccountId()))
            setAdmin(isAdmin())
            setEmployee(isEmployee())
        }
        window.addEventListener(SESSION_EVENT, update)

        // The server forgets logins when it restarts, so make sure the saved one still works
        const id = getAccountId()
        if (id) {
            accountFetch(`/api/account/${id}`)
                .then(({ response, data }) => {
                    if (response.ok) {
                        saveAdminPermission(Boolean(data.account.adminPermission))
                        saveEmployeePermission(Boolean(data.account.employeePermission))
                    } else if (response.status === 401 || response.status === 404) {
                        clearSession()
                    }
                })
                .catch((error) => console.error("Session check error:", error))
        }

        return () => window.removeEventListener(SESSION_EVENT, update)
    }, [])
    return (
        <nav className="sidebar">
            <div className="navLinks">
                {admin && (
                    <Link to="/addshowtime">
                        Admin Dashboard
                    </Link>
                )}
                {(employee || admin) && (
                    <Link to="/scan">
                        Scan Tickets
                    </Link>
                )}
                <Link to="/account">
                    Account Overview
                </Link>
                <Link to="/change">
                    Change Account Info
                </Link>
                <Link to="/tickets">
                    My Tickets
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