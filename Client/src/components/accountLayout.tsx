import Sidebar from "./sidebar/Sidebar.tsx"
import { Outlet } from "react-router-dom"

export default function AccountLayout() {
    return (
        <>
            <Sidebar />
            <Outlet />
        </>
    )
}