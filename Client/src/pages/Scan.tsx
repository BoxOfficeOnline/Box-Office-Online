import type { SyntheticEvent } from "react";
import { useState } from "react";

export default function Scan() {
    const [submitted, setSubmitted] = useState(false);
    const [isValid, setIsValid] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const ticketNumber = formData.get("ticketNumber") as string;
        
        setLoading(true);

        try {
            const response = await fetch('https://box-office-online.onrender.com/api/validate', {
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
                // If this alert shows, the request reached Render but failed there
                console.error("Server responded with error:", response.status);
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
        return (
            <div className="scan-result">
                {isValid 
                    ? <div className="valid"> Valid Ticket!</div> 
                    : <div className="invalid">Invalid Ticket</div>
                }
                <button onClick={() => setSubmitted(false)}>Scan Another</button>
            </div>
        );
    }

    return (
        <form className="movie-form" onSubmit={handleSubmit}>
            <label>
                Ticket Number: <input name="ticketNumber" required />
            </label>
            <button type="submit" disabled={loading}>
                {loading ? 'Validating...' : 'Validate'}
            </button>
        </form>
    );
}