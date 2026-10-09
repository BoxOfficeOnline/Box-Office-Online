import type { SyntheticEvent } from "react"
import { useState } from "react"
import "../../components/App.css"
import { accountFetch, clearSession, getAccountId } from "../../accountApi.ts"

export default function Delete() {
    const [message, setMessage] = useState("")
    const [ok, setOk] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault()
        const id = getAccountId()
        if (!id) {
            setOk(false)
            setMessage("You need to log in first.")
            return
        }

        const formData = new FormData(e.currentTarget)
        const password = formData.get("password") as string

        setLoading(true)
        try {
            const accountResult = await accountFetch(`/api/account/${id}`)
            if (!accountResult.response.ok) {
                setOk(false)
                setMessage(accountResult.data.error || "Could not load the account.")
                return
            }

            const loginResult = await accountFetch("/api/login", {
                method: "POST",
                body: JSON.stringify({ email: accountResult.data.account.email, password }),
            })
            if (!loginResult.response.ok) {
                setOk(false)
                setMessage("Password is incorrect.")
                return
            }

            const { response, data } = await accountFetch(`/api/account/${id}`, { method: "DELETE" })
            if (response.ok) {
                clearSession()
                setOk(true)
                setMessage("Account deleted.")
            } else {
                setOk(false)
                setMessage(data.error || "Could not delete the account.")
            }
        } catch (error) {
            console.error("Delete account error:", error)
            setOk(false)
            setMessage("Could not delete the account. The server did not respond.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="accountPage">
            <div>
                Are you sure you want to delete your account? This action cannot be undone.
            </div>
            <div>
                <form className="form" onSubmit={handleSubmit}>
                    <label>
                        Confirm Password: <input name="password" type="password" required />
                    </label>
                    <button type="submit" disabled={loading}>
                        {loading ? "Deleting..." : "Delete Account"}
                    </button>
                </form>
            </div>
            {message && <div className={ok ? "valid" : "invalid"}>{message}</div>}
        </div>
    )
}
