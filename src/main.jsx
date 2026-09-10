import React from "react";
import { createRoot } from "react-dom/client";
import KunkunshiPlayer from "./KunkunshiPlayer.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <KunkunshiPlayer />
  </React.StrictMode>
);
