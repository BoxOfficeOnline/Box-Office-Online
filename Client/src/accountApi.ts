// npm run dev talks to this computer. The built site talks to the live API.
const API_BASE = import.meta.env.DEV
    ? "http://localhost:5000"
    : "https://box-office-online.onrender.com";

export type Account = {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    employeePermission: boolean;
    adminPermission: boolean;
    theaterName: string | null;
};

export function saveSession(token: string, accountId: number) {
    localStorage.setItem("token", token);
    localStorage.setItem("accountId", String(accountId));
}

export function clearSession() {
    localStorage.removeItem("token");
    localStorage.removeItem("accountId");
}

export function getAccountId() {
    return localStorage.getItem("accountId");
}

export async function accountFetch(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const token = localStorage.getItem("token");
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    return { response, data };
}
