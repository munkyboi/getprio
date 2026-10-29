import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import MarketingErrorBoundary from "./MarketingErrorBoundary";
import MarketingApp from "../surfaces/MarketingApp";
import "../../../shared/typography.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode><BrowserRouter><MarketingErrorBoundary><MarketingApp /></MarketingErrorBoundary></BrowserRouter></React.StrictMode>
);
