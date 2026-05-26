import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './components/layout/AdminLayout';
import ClientLayout from './components/layout/ClientLayout';
import ProtectedRoute from './routes/ProtectedRoute';
import RoleRoute from './routes/RoleRoute';
import AdminDashboard from './pages/admin/AdminDashboard';
import CategoryManagement from './pages/admin/categories/CategoryManagement';
import ProductManagement from './pages/admin/products/ProductManagement';
import Home from './pages/client/Home';
import Login from './pages/client/Login';
import ProductList from './pages/client/ProductList';
import Register from './pages/client/Register';
import StaffProducts from './pages/staff/StaffProducts';

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route
                    path="/products"
                    element={
                        <ClientLayout>
                            <ProductList />
                        </ClientLayout>
                    }
                />
                <Route
                    path="/staff/products"
                    element={
                        <ProtectedRoute>
                            <RoleRoute allowedRoles={['STAFF', 'ADMIN', 'MANAGER']}>
                                <ClientLayout>
                                    <StaffProducts />
                                </ClientLayout>
                            </RoleRoute>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin"
                    element={
                        <ProtectedRoute>
                            <RoleRoute allowedRoles={['ADMIN', 'MANAGER']}>
                                <AdminLayout>
                                    <AdminDashboard />
                                </AdminLayout>
                            </RoleRoute>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/categories"
                    element={
                        <ProtectedRoute>
                            <RoleRoute allowedRoles={['ADMIN', 'MANAGER', 'STAFF']}>
                                <AdminLayout>
                                    <CategoryManagement />
                                </AdminLayout>
                            </RoleRoute>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/products"
                    element={
                        <ProtectedRoute>
                            <RoleRoute allowedRoles={['ADMIN', 'MANAGER', 'STAFF']}>
                                <AdminLayout>
                                    <ProductManagement />
                                </AdminLayout>
                            </RoleRoute>
                        </ProtectedRoute>
                    }
                />
                <Route path="*" element={<Navigate to="/products" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
