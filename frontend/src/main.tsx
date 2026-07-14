import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTheme, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { queryClient } from "./lib/queryClient";
import "@mantine/core/styles.css";
import "@mantine/tiptap/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "./styles.css";

const theme = createTheme({
  fontFamily: 'Inter, Aptos, "Segoe UI", sans-serif',
  primaryColor: "orange",
  defaultRadius: "lg",
  colors: {
    prioInk: [
      "#f4f0ec",
      "#ded6cf",
      "#c6b9ae",
      "#a8998c",
      "#857567",
      "#67594c",
      "#493d34",
      "#332b25",
      "#241e19",
      "#17120f"
    ],
    prioGold: [
      "#fff8e7",
      "#f7e9bd",
      "#ecd58b",
      "#d8b95f",
      "#b8913c",
      "#986f25",
      "#76541b",
      "#573d15",
      "#3b2a10",
      "#23190a"
    ]
  },
  headings: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: "800",
    sizes: {
      h1: { fontSize: "clamp(2.9rem, 6vw, 5.75rem)", lineHeight: "0.96" },
      h2: { fontSize: "clamp(2rem, 4vw, 3.4rem)", lineHeight: "1.02" },
      h3: { fontSize: "1.35rem", lineHeight: "1.18" }
    }
  },
  components: {
    Button: {
      defaultProps: {
        radius: "xl"
      },
      styles: {
        root: {
          fontWeight: 800
        }
      }
    },
    Paper: {
      defaultProps: {
        radius: "xl"
      }
    },
    TextInput: {
      defaultProps: {
        radius: "md"
      }
    },
    PasswordInput: {
      defaultProps: {
        radius: "md"
      }
    },
    Textarea: {
      defaultProps: {
        radius: "md"
      }
    }
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme}>
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppErrorBoundary>
            <AuthProvider>
              <App />
            </AuthProvider>
          </AppErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>
);
