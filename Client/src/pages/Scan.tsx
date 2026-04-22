import type { SyntheticEvent } from "react";
import { useState } from "react";

export default function Scan() {
    const [ticketNumber, setTicketNumber] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [isValid, setIsValid] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const ticketNumber = formData.get("ticketNumber") as string;
        setTicketNumber(ticketNumber);
        setLoading(true);

        try {
            const response = await fetch('/api/validate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ticketId: ticketNumber }),
            });

            if (response.ok) {
                const data = await response.json();
                setIsValid(data.isValid);
            } else {
                setIsValid(false);
            }
        } catch (error) {
            console.error('Validation error:', error);
            setIsValid(false);
        } finally {
            setLoading(false);
            setSubmitted(true);
        }
    };

    if (submitted) {
        if (isValid) {
            return <div className="valid">Valid Ticket!</div>;
        } else {
            return <div className="invalid">Invalid Ticket</div>;
        }
    }

    return (
        <>
        <form className="movie-form" method="post" onSubmit={handleSubmit}>
            <label>
                Ticket Number: <input name="ticketNumber" />
            </label>
            <button type="submit" disabled={loading}>
                {loading ? 'Validating...' : 'Validate'}
            </button>
        </form>
        </>
    );
}   
        