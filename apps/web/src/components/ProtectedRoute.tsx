import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../services/auth.service';
import { getToken, getUser } from '../utils/auth';

type ProtectedRouteProps = {
    children: ReactNode;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
    const [user, setUser] = useState(() => getUser());
    const [isLoading, setIsLoading] = useState<boolean>(Boolean(getToken()));

    useEffect(() => {
        let mounted = true;
        const token = getToken();

        if (!token) {
            setIsLoading(false);
            return;
        }

        authService
            .profile()
            .then((currentUser) => {
                if (mounted) {
                    setUser(currentUser);
                }
            })
            .catch(() => {
                authService.logout();
                if (mounted) {
                    setUser(null);
                }
            })
            .finally(() => {
                if (mounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            mounted = false;
        };
    }, []);

    if (isLoading) {
        return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}
