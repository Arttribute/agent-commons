import React from "react";
import { createRoot } from "react-dom/client";
import { PrivateWorkspace } from "@commons-desktop-ui/private-workspace";
import "@commons-desktop-ui/private-workspace.css";

const root = document.getElementById("root");
if (!root) throw new Error("Desktop root element is missing");
createRoot(root).render(
  <React.StrictMode>
    <PrivateWorkspace />
  </React.StrictMode>,
);
