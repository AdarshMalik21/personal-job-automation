"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../../lib/api";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        setIsSubmitting(true);
        try {
            const result = await login(email, password);
            if (!result.data) throw new Error("Login response was incomplete");
            localStorage.setItem("job-automation-token", result.data.token);
            router.push("/dashboard");
        } catch (submissionError) {
            setError(submissionError instanceof Error ? submissionError.message : "Unable to sign in");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="auth-shell">
            <section className="auth-panel">
                <div className="eyebrow">PRIVATE WORKSPACE / PHASE 01</div>
                <h1>Make the next move count.</h1>
                <p className="lede">A focused command center for your job search, built for one operator.</p>
                <form onSubmit={handleSubmit} className="auth-form">
                    <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
                    <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in..." : "Open workspace"}</button>
                </form>
            </section>
            <aside className="auth-aside"><span>01</span><strong>Collect signal.<br />Keep agency.</strong><p>Discovery and automation arrive later. The foundation starts with visibility, control, and a clean source of truth.</p></aside>
        </main>
    );
}
