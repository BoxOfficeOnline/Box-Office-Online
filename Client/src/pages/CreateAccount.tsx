import type { SyntheticEvent } from "react";
import { useState } from "react";
import { accountFetch } from "../accountApi.ts";

export default function CreateAccount() {
    const [message, setMessage] = useState("");
    const [ok, setOk] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const firstName = formData.get("fname") as string;
        const lastName = formData.get("lname") as string;
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;
        const confirmPassword = formData.get("confirmPassword") as string;

        if (password !== confirmPassword) {
            setOk(false);
            setMessage("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            const { response, data } = await accountFetch("/api/account", {
                method: "POST",
                body: JSON.stringify({ firstName, lastName, email, password }),
            });

            if (response.ok) {
                setOk(true);
                setMessage("Account created.");
            } else {
                setOk(false);
                setMessage(data.error || "Could not create the account.");
            }
        } catch (error) {
            console.error("Create account error:", error);
            setOk(false);
            setMessage("Could not create the account. The server did not respond.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <form className="form" onSubmit={handleSubmit}>
                <input name="fname" placeholder="First Name" required />
                <input name="lname" placeholder="Last Name" required />
                <input name="email" type="email" placeholder="Email" required />
                <input name="password" type="password" placeholder="Password" required />
                <input name="confirmPassword" type="password" placeholder="Re-Type Password" required />
                <button type="submit" disabled={loading}>
                    {loading ? "Creating..." : "Create Account"}
                </button>
            </form>
            {message && <div className={ok ? "valid" : "invalid"}>{message}</div>}
        </>
    );
}
