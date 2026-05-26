import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RegisterRequest } from '@cafe-project/types';
import { authService } from '../../services/auth.service';

const initialForm: RegisterRequest = {
    name: '',
    email: '',
    password: ''
};

export default function Register() {
    const navigate = useNavigate();
    const [form, setForm] = useState<RegisterRequest>(initialForm);
    const [error, setError] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            await authService.register(form);
            navigate('/login', { replace: true });
        } catch (requestError) {
            const message = requestError instanceof Error ? requestError.message : 'Registration failed.';
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
            <section className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm">
                <h1 className="text-2xl font-semibold text-slate-900">Register</h1>
                <p className="mt-1 text-sm text-slate-500">Create a staff account for the cafe system.</p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <label className="block text-sm font-medium text-slate-700">
                        Name
                        <input
                            type="text"
                            value={form.name}
                            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                            required
                            minLength={2}
                            autoComplete="name"
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                        />
                    </label>

                    <label className="block text-sm font-medium text-slate-700">
                        Email
                        <input
                            type="email"
                            value={form.email}
                            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                            required
                            autoComplete="email"
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                        />
                    </label>

                    <label className="block text-sm font-medium text-slate-700">
                        Password
                        <input
                            type="password"
                            value={form.password}
                            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                        />
                    </label>

                    {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                        {isSubmitting ? 'Creating account...' : 'Register'}
                    </button>
                </form>

                <p className="mt-4 text-center text-sm text-slate-600">
                    Already registered?{' '}
                    <Link to="/login" className="font-medium text-slate-900 underline">
                        Login
                    </Link>
                </p>
            </section>
        </main>
    );
}
