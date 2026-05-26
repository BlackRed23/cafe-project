import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { getRole, getToken, logout } from '../../utils/auth';

type ClientLayoutProps = {
    children: ReactNode;
};

const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
    `rounded-md px-3 py-2 text-sm font-medium ${
        isActive ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
    }`;

export default function ClientLayout({ children }: ClientLayoutProps) {
    const token = getToken();
    const role = getRole();

    return (
        <div className="min-h-screen bg-stone-50 text-stone-900">
            <header className="border-b border-stone-200 bg-white">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
                    <Link to="/products" className="text-lg font-semibold">
                        Cafe
                    </Link>
                    <nav className="flex items-center gap-2">
                        <NavLink to="/products" className={navLinkClass}>
                            Products
                        </NavLink>
                        {role === 'STAFF' ? (
                            <NavLink to="/staff/products" className={navLinkClass}>
                                Staff
                            </NavLink>
                        ) : null}
                        {role === 'ADMIN' || role === 'MANAGER' ? (
                            <NavLink to="/admin/products" className={navLinkClass}>
                                Admin
                            </NavLink>
                        ) : null}
                    </nav>
                    {token ? (
                        <button
                            type="button"
                            onClick={logout}
                            className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-100"
                        >
                            Logout
                        </button>
                    ) : (
                        <Link to="/login" className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white">
                            Login
                        </Link>
                    )}
                </div>
            </header>
            <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        </div>
    );
}
