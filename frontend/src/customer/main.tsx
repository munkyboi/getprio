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
