import Nav from "./navbar/Nav"
import { Outlet } from "react-router-dom"

export default function Layout() {
    return (
        <>
            <Nav />
            <Outlet />
        </>
    )
}

