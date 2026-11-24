import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { CustomerNotificationsBridge } from "./components/CustomerNotificationsBridge";
import { BrowserRouter } from "react-router-dom";
import App from "@surface-app";
import CustomerTheme from "./CustomerTheme";
import AppErrorBoundary from "../components/AppErrorBoundary";
import ModalWheelBridge from "../components/ModalWheelBridge";
import { AuthProvider } from "../context/AuthContext";
import { queryClient } from "../lib/queryClient";
import "../../../shared/typography.css";
import "../styles.css";
import "./shadcn-theme.css";
import "./customer-theme.css";

// Establish the Customer theme scope before the first paint; CustomerTheme
// keeps this value synchronized after mount and on preference changes.
const initialCustomerTheme = (() => {
  try {
    const stored = localStorage.getItem("getprio.customer.theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* Use the system preference when storage is unavailable. */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
})();
document.documentElement.setAttribute("data-customer-theme", initialCustomerTheme);
document.documentElement.style.colorScheme = initialCustomerTheme;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
      <MantineProvider>
      <CustomerTheme>
      <CustomerNotificationsBridge />
      <ModalWheelBridge />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppErrorBoundary>
            <AuthProvider>
              <App />
            </AuthProvider>
          </AppErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
      </CustomerTheme>
      </MantineProvider>
  </React.StrictMode>
);
