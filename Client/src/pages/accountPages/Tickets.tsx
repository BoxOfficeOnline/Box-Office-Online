import { useEffect, useState } from "react"
import "../../components/App.css"
import { accountFetch, getAccountId } from "../../accountApi.ts"
import { Link } from "react-router"
import wallE from "../../assets/WALL-E.webp"

type Ticket = {
    ticket_id: string
    title: string | null
    showtime: string | null
    purchase_time: string
    ticket_amount: number
}

export default function Tickets() {
    const [tickets, setTickets] = useState<Ticket[]>([])
    const [message, setMessage] = useState(() =>
        getAccountId() ? "" : "You need to log in first."
    )
    const [ok, setOk] = useState(false)

    useEffect(() => {
        const id = getAccountId()
        if (!id) {
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
            <h1 style={{ textAlign: "center" }}>Purchased Tickets</h1>
            {message && <div className={ok ? "valid" : "invalid"}>{message}</div>}
            <div className="tickets">
                {tickets.map((ticket) => (
                    <div className="ticket" key={ticket.ticket_id}>  
                        <div className="ticketPoster">
                        </div>
                        <span>
                            {ticket.title || "Ticket"} {ticket.ticket_id}
                            {ticket.showtime ? ` — ${new Date(ticket.showtime).toLocaleString()}` : ""}
                            {` — ${ticket.ticket_amount} ticket${ticket.ticket_amount === 1 ? "" : "s"}`}
                        </span>
                        <Link className="barcodeButton" to={`/purchase/${ticket.ticket_id}`}>
                            View Barcode
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    )
}
