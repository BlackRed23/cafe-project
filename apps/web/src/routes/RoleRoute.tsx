import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getRole, getRoleRedirectPath, getToken, type AppRole } from '../utils/auth';

type RoleRouteProps = {
    allowedRoles: AppRole[];
    children: ReactNode;
};

export default function RoleRoute({ allowedRoles, children }: RoleRouteProps) {
    const token = getToken();
    const role = getRole();

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    if (!role || !allowedRoles.includes(role)) {
        return <Navigate to={getRoleRedirectPath()} replace />;
    }

    return children;
}
