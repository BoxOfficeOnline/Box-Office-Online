import type { SyntheticEvent } from "react"
import { useEffect, useState } from "react"
import "../../components/App.css"
import { accountFetch, getAccountId } from "../../accountApi.ts"

export default function Change() {
    const [firstName, setFirstName] = useState("")
    const [lastName, setLastName] = useState("")
    const [email, setEmail] = useState("")
    const [theaterName, setTheaterName] = useState("")
    const [password, setPassword] = useState("")
    const [message, setMessage] = useState("")
    const [ok, setOk] = useState(false)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const id = getAccountId()
        if (!id) {
            setOk(false)
            setMessage("You need to log in first.")
            return
        }

        accountFetch(`/api/account/${id}`)
            .then(({ response, data }) => {
                if (!response.ok) {
                    setOk(false)
                    setMessage(data.error || "Could not load the account.")
                    return
                }
                setFirstName(data.account.firstName)
                setLastName(data.account.lastName)
                setEmail(data.account.email)
                setTheaterName(data.account.theaterName || "")
            })
            .catch((error) => {
                console.error("Change account error:", error)
                setOk(false)
                setMessage("Could not load the account. The server did not respond.")
            })
    }, [])

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault()
        const id = getAccountId()
        if (!id) {
            setOk(false)
            setMessage("You need to log in first.")
            return
        }

        const body: Record<string, string> = { firstName, lastName, email, theaterName }
        if (password) {
            body.password = password
        }

        setLoading(true)
        try {
            const { response, data } = await accountFetch(`/api/account/${id}`, {
                method: "PUT",
                body: JSON.stringify(body),
            })
            if (response.ok) {
                setPassword("")
                setOk(true)
                setMessage("Account updated.")
            } else {
                setOk(false)
                setMessage(data.error || "Could not update the account.")
            }
        } catch (error) {
            console.error("Update account error:", error)
            setOk(false)
            setMessage("Could not update the account. The server did not respond.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="accountPage">
            <form className="form" onSubmit={handleSubmit}>
                <label>
                    First Name: <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </label>
                <label>
                    Last Name: <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </label>
                <label>
                    Email: <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <label>
                    Theater Name: <input value={theaterName} onChange={(e) => setTheaterName(e.target.value)} />
                </label>
                <label>
                    New Password: <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                <button type="submit" disabled={loading}>
                    {loading ? "Saving..." : "Save Changes"}
                </button>
            </form>
            {message && <div className={ok ? "valid" : "invalid"}>{message}</div>}
        </div>
    )
}
