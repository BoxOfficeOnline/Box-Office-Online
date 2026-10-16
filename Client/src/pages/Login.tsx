import type { SyntheticEvent } from "react";
import { useState } from "react";
import { accountFetch, saveSession } from "../accountApi.ts";

export default function Login() {
    const [message, setMessage] = useState("");
    const [ok, setOk] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;

        setLoading(true);
        try {
            const { response, data } = await accountFetch("/api/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });

            if (response.ok) {
                saveSession(data.token, data.account.id);
                setOk(true);
                setMessage("Logged in.");
            } else {
                setOk(false);
                setMessage(data.error || "Login failed.");
            }
        } catch (error) {
            console.error("Login error:", error);
            setOk(false);
            setMessage("Login failed. Could not reach the server.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <form className="form" onSubmit={handleSubmit}>
                <label>
                    Email: <input name="email" type="email" required />
                </label>
                <label>
                    Password: <input name="password" type="password" required />
                </label>
                <button type="submit" disabled={loading}>
                    {loading ? "Logging in..." : "Login"}
                </button>
            </form>
            {message && <div className={ok ? "valid" : "invalid"}>{message}</div>}
        </>
    );
}
