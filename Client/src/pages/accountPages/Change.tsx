import type { SyntheticEvent } from "react"
import { useEffect, useState } from "react"
import "../../components/App.css"
import { accountFetch, getAccountId } from "../../accountApi.ts"

type Theater = {
    theater_id: number
    theater_name: string
    theater_location: string
}

export default function Change() {
    const [firstName, setFirstName] = useState("")
    const [lastName, setLastName] = useState("")
    const [email, setEmail] = useState("")
    const [theaterId, setTheaterId] = useState("")
    const [theaters, setTheaters] = useState<Theater[]>([])
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

        Promise.all([
            accountFetch(`/api/account/${id}`),
            accountFetch("/api/theaters"),
        ])
            .then(([accountResult, theaterResult]) => {
                if (!accountResult.response.ok) {
                    setOk(false)
                    setMessage(accountResult.data.error || "Could not load the account.")
                    return
                }
                if (!theaterResult.response.ok) {
                    setOk(false)
                    setMessage(theaterResult.data.error || "Could not load theaters.")
                    return
                }
                setFirstName(accountResult.data.account.firstName)
                setLastName(accountResult.data.account.lastName)
                setEmail(accountResult.data.account.email)
                setTheaterId(accountResult.data.account.theaterId ? String(accountResult.data.account.theaterId) : "")
                setTheaters(theaterResult.data.theaters as Theater[])
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

        const body: {
            firstName: string
            lastName: string
            email: string
            theaterId: number | null
            password?: string
        } = {
            firstName,
            lastName,
            email,
            theaterId: theaterId ? Number(theaterId) : null,
        }
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
                    Theater:
                    <select value={theaterId} onChange={(e) => setTheaterId(e.target.value)}>
                        <option value="">None</option>
                        {theaters.map((theater) => (
                            <option key={theater.theater_id} value={theater.theater_id}>
                                {theater.theater_name} ({theater.theater_location})
                            </option>
                        ))}
                    </select>
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
