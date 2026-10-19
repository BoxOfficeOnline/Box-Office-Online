import { useEffect, useState } from "react"
import "../../components/App.css"
import { accountFetch, clearSession } from "../../accountApi.ts"

export default function Logout() {
    const [message, setMessage] = useState("")
    const [ok, setOk] = useState(false)

    useEffect(() => {
        accountFetch("/api/logout", { method: "POST" })
            .then(({ response, data }) => {
                clearSession()
                if (response.ok) {
                    setOk(true)
                    setMessage("Logged out.")
                } else {
                    setOk(false)
                    setMessage(data.error || "Could not log out.")
                }
            })
            .catch((error) => {
                console.error("Logout error:", error)
                clearSession()
                setOk(false)
                setMessage("Could not log out. The server did not respond.")
            })
    }, [])

    return (
        <div className="accountPage">
            {message && <div className={ok ? "valid" : "invalid"}>{message}</div>}
        </div>
    )
}
