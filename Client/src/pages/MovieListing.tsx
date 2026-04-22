import type { SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function MovieListing() {
    const navigate = useNavigate();
    const [customerName, setCustomerName] = useState("");
    const [ticketTotal, setTicketTotal] = useState("");
    const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const customerName = formData.get("customerName") as string;
      const ticketTotal = formData.get("ticketTotal") as string;
      navigate("/purchase");
    };

    return(
        <>
        <form className="movie-form" method="post" onSubmit={handleSubmit}>
            <label>
                Name: <input name="customerName"/>
            </label>
            <label>
                Ticket Total: <input name="ticketTotal" defaultValue="1"/>
            </label>
            <button type="submit">Purchase</button>
        </form>
        </>
    )
}
