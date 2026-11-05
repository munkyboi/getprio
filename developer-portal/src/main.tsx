import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createTheme, MantineProvider } from "@mantine/core";
import DeveloperPortalPage from "./DeveloperPortalPage";
import DeveloperReferencePage from "./DeveloperReferencePage";
import "./styles.css";
import "@mantine/core/styles.css";

const developerTheme = createTheme({
  fontFamily: 'Inter, system-ui, sans-serif',
  primaryColor: "blue",
  defaultRadius: "lg",
  headings: { fontFamily: '"Aleo", Georgia, serif', fontWeight: "600" },
  components: {
    Button: { defaultProps: { radius: "xl" }, styles: { root: { fontWeight: 700 } } },
    Paper: { defaultProps: { radius: "xl" } },
    TextInput: { defaultProps: { radius: "md" } },
    Select: { defaultProps: { radius: "md" } },
  },
});

const path = window.location.pathname.replace(/\/+$/, "") || "/";
const isReference = ["/reference", "/docs/reference"].includes(path);

createRoot(document.getElementById("root")!).render(
  <StrictMode><MantineProvider theme={developerTheme}>{isReference ? <DeveloperReferencePage /> : <DeveloperPortalPage />}</MantineProvider></StrictMode>,
);
