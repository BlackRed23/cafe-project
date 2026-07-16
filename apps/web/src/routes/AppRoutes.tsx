import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { CustomerLayout } from "../layouts/CustomerLayout";
import { AdminLayout } from "../layouts/AdminLayout";
import { ProtectedRoute } from "./ProtectedRoute";
import { AdminRoute } from "./AdminRoute";

// Customer pages
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { ProductListPage } from "../pages/ProductListPage";
import { ProductDetailPage } from "../pages/ProductDetailPage";
import { CartPage } from "../pages/CartPage";
import { CheckoutPage } from "../pages/CheckoutPage";
import { MyOrdersPage } from "../pages/MyOrdersPage";
import { ChangePasswordPage } from "../pages/ChangePasswordPage";
import { ProfilePage } from "../pages/ProfilePage";

// Admin pages
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { AdminProductsPage } from "../pages/admin/AdminProductsPage";
import { AdminProductFormPage } from "../pages/admin/AdminProductFormPage";
import { AdminInventoryPage } from "../pages/admin/AdminInventoryPage";
import { AdminInventoryDetailPage } from "../pages/admin/AdminInventoryDetailPage";
import { AdminInventoryTransactionsPage } from "../pages/admin/AdminInventoryTransactionsPage";
import { AdminSuppliersPage } from "../pages/admin/AdminSuppliersPage";
import { AdminOrdersPage } from "../pages/admin/AdminOrdersPage";
import { AdminOrderDetailPage } from "../pages/admin/AdminOrderDetailPage";
import { AdminSimulateSalePage } from "../pages/admin/AdminSimulateSalePage";
import { AdminPurchaseRequestsPage } from "../pages/admin/AdminPurchaseRequestsPage";
import { AdminPurchaseRequestDetailPage } from "../pages/admin/AdminPurchaseRequestDetailPage";
import { AdminAgentLogsPage } from "../pages/admin/AdminAgentLogsPage";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage";
import { AdminNotificationsPage } from "../pages/admin/AdminNotificationsPage";
import { AdminCategoriesPage } from "../pages/admin/AdminCategoriesPage";
import { AdminSystemSettingsPage } from "../pages/admin/AdminSystemSettingsPage";

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export const AppRoutes: React.FC = () => {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Customer Flow (using CustomerLayout) */}
        <Route path="/" element={<CustomerLayout />}>
          <Route index element={<HomePage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="products" element={<ProductListPage />} />
          <Route path="products/:id" element={<ProductDetailPage />} />
          <Route path="cart" element={<CartPage />} />
          
          {/* Protected Customer Routes */}
          <Route
            path="checkout"
            element={
              <ProtectedRoute>
                <CheckoutPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="my-orders"
            element={
              <ProtectedRoute>
                <MyOrdersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Admin Flow (using AdminLayout wrapped in AdminRoute) */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          {/* Redirect /admin to /admin/dashboard */}
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="products" element={<AdminProductsPage />} />
          <Route path="products/create" element={<AdminProductFormPage />} />
          <Route path="products/:id/edit" element={<AdminProductFormPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="inventory" element={<AdminInventoryPage />} />
          <Route path="inventory/transactions" element={<AdminInventoryTransactionsPage />} />
          <Route path="inventory/:inventoryId" element={<AdminInventoryDetailPage />} />
          <Route path="suppliers" element={<AdminSuppliersPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="orders/:id" element={<AdminOrderDetailPage />} />
          <Route path="simulate-sale" element={<AdminSimulateSalePage />} />
          <Route path="purchase-requests" element={<AdminPurchaseRequestsPage />} />
          <Route path="purchase-requests/:id" element={<AdminPurchaseRequestDetailPage />} />
          <Route path="agent-logs" element={<AdminAgentLogsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="change-password" element={<ChangePasswordPage />} />
          <Route path="system-settings" element={<AdminSystemSettingsPage />} />
          <Route path="notifications" element={<AdminNotificationsPage />} />
        </Route>

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
