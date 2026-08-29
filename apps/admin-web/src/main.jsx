import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import InstallApp from "./InstallApp.jsx";
import "./global.scss";

const buildVersion = import.meta.env.VITE_BUILD_VERSION || "dev";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter><App /></BrowserRouter>
    <InstallApp />
    <footer className="app-version-footer" title="Version de build UTC">v{buildVersion}</footer>
  </React.StrictMode>,
);
