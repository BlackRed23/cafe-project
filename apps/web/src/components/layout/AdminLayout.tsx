import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { getRole, logout } from '../../utils/auth';

type AdminLayoutProps = {
    children: ReactNode;
};

const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
    `rounded-md px-3 py-2 text-sm font-medium ${
        isActive ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
    }`;

export default function AdminLayout({ children }: AdminLayoutProps) {
    const navigate = useNavigate();
    const role = getRole();

    const handleLogout = (): void => {
        logout();
        navigate('/products', { replace: true });
    };

    return (
        <div className="min-h-screen bg-stone-50 text-stone-900">
            <header className="border-b border-stone-200 bg-white">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
                    <Link to="/admin/products" className="text-lg font-semibold">
                        Cafe Admin
                    </Link>
                    <nav className="flex items-center gap-2">
                        <NavLink to="/admin/products" className={navLinkClass}>
                            Products
                        </NavLink>
                        <NavLink to="/admin/categories" className={navLinkClass}>
                            Categories
                        </NavLink>
                        <NavLink to="/staff/products" className={navLinkClass}>
                            Staff View
                        </NavLink>
                    </nav>
                    <div className="flex items-center gap-3">
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                            {role ?? 'USER'}
                        </span>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-100"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        </div>
    );
}
