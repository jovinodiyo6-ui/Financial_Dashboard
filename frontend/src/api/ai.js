import { api } from "./client";

export const getAICFO = () => api("/ai-cfo/overview");

export const askAICFO = (question) =>
  api("/ai-cfo/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
