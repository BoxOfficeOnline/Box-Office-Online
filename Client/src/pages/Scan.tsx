import type { SyntheticEvent } from "react";
import { useState } from "react";

export default function Scan() {
    const [ticketNumber, setTicketNumber] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const ticketNumber = formData.get("ticketNumber") as string;
        setTicketNumber(ticketNumber);
        setSubmitted(true);
    };

    if (submitted) {
        if (ticketNumber === "1") {
            return<div className="valid">Valid Ticket!</div>
        } else {
            return<div className="invalid">Invalid Ticket</div>
        }
    }
    return(   
        <>
        <form className="movie-form" method="post" onSubmit={handleSubmit}>
            <label>
                Ticket Number: <input name="ticketNumber"/>
            </label>
            <button type="submit">Purchase</button>
        </form>
        </>
    )
}   
        