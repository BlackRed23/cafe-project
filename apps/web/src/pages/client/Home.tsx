import { Navigate } from 'react-router-dom';
import { getRoleRedirectPath } from '../../utils/auth';

export default function Home() {
    return <Navigate to={getRoleRedirectPath()} replace />;
}
