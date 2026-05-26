import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getUser } from '../utils/auth';
import ProtectedRoute from './ProtectedRoute';

type AdminRouteProps = {
    children: ReactNode;
};

export default function AdminRoute({ children }: AdminRouteProps) {
    const user = getUser();

    if (user && user.role !== 'ADMIN' && user.role !== 'MANAGER') {
        return <Navigate to="/" replace />;
    }

    return <ProtectedRoute>{children}</ProtectedRoute>;
}
