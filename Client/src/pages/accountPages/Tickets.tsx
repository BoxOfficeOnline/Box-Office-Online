import { useEffect, useState } from "react"
import "../../components/App.css"
import { accountFetch, getAccountId } from "../../accountApi.ts"

type Ticket = {
    ticket_id: string
    title: string | null
    showtime: string | null
    purchase_time: string
    ticket_amount: number
}

export default function Tickets() {
    const [tickets, setTickets] = useState<Ticket[]>([])
    const [message, setMessage] = useState("")
    const [ok, setOk] = useState(false)

    useEffect(() => {
        const id = getAccountId()
        if (!id) {
            setOk(false)
            setMessage("You need to log in first.")
            return
        }

        accountFetch(`/api/account/${id}/tickets`)
            .then(({ response, data }) => {
                if (response.ok) {
                    const rows = data.tickets as Ticket[]
                    setTickets(rows)
                    setOk(true)
                    setMessage(rows.length ? "Tickets loaded." : "You don't have any tickets yet.")
                } else {
                    setOk(false)
                    setMessage(data.error || "Could not load tickets.")
                }
            })
            .catch((error) => {
                console.error("Tickets error:", error)
                setOk(false)
                setMessage("Could not load tickets. The server did not respond.")
            })
    }, [])

    return (
        <div className="accountPage">
            {tickets.map((ticket) => (
                <div key={ticket.ticket_id}>
                    {ticket.title || "Ticket"} {ticket.ticket_id}
                    {ticket.showtime ? ` — ${new Date(ticket.showtime).toLocaleString()}` : ""}
                    {` — ${ticket.ticket_amount} ticket${ticket.ticket_amount === 1 ? "" : "s"}`}
                </div>
            ))}
            {message && <div className={ok ? "valid" : "invalid"}>{message}</div>}
        </div>
    )
}
