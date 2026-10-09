import { useEffect, useState } from "react"
import "../../components/App.css"
import { accountFetch, getAccountId, type Account } from "../../accountApi.ts"

export default function Account() {
    const [account, setAccount] = useState<Account | null>(null)
    const [message, setMessage] = useState("")
    const [ok, setOk] = useState(false)

    useEffect(() => {
        const id = getAccountId()
        if (!id) {
            setOk(false)
            setMessage("You need to log in first.")
            return
        }

        accountFetch(`/api/account/${id}`)
            .then(({ response, data }) => {
                if (response.ok) {
                    setAccount(data.account)
                    setOk(true)
                    setMessage("Account loaded.")
                } else {
                    setOk(false)
                    setMessage(data.error || "Could not load the account.")
                }
            })
            .catch((error) => {
                console.error("Account error:", error)
                setOk(false)
                setMessage("Could not load the account. The server did not respond.")
            })
    }, [])

    return (
        <div className="accountPage">
            {account && (
                <div className="employeeBanner">
                    <div>{account.firstName} {account.lastName}</div>
                    <div>{account.email}</div>
                    <div>Employee ID: {account.employeePermission ? account.id : "Not an employee"}</div>
                    <div>Theater Name: {account.theaterName || "None"}</div>
                </div>
            )}
            {message && <div className={ok ? "valid" : "invalid"}>{message}</div>}
        </div>
    )
}
