
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./contexts/AuthContext";
import { CartProvider } from "./contexts/CartContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AppRoutes } from "./routes/AppRoutes";

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "723731125344-qc4stoana3lits6t9r96voo7sdflfmc8.apps.googleusercontent.com";

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <AppRoutes />
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
