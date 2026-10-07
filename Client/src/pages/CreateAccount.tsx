import type { SyntheticEvent } from "react";
import { useState } from "react";

export default function CreateAccount() {
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
            return<div className="valid"></div>
        } else {
            return<div className="invalid">Account Email or Password invalid.</div>
        }
    }
    return(   
        <>
        <form className="form" method="post" onSubmit={handleSubmit}>
            <label>
                First Name: <input name="fname"/>
            </label>
            <label>
                Last Name: <input name="lname"/>
            </label>
            <label>
                Email: <input name="email"/>
            </label>
            <label>
                Password: <input name="password" type="password"/>
            </label>
            <label>
                Re-Type Password: <input name="password" type="password"/>
            </label>
            <button type="submit">Create Account</button>
        </form>
        </>
    )
}