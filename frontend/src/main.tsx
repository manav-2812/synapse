import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./styles/app.css";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./hooks/useToast";
import { TipsProvider } from "./context/TipsContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <TipsProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </TipsProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
