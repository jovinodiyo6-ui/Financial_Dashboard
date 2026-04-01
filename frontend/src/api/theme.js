import { api } from "./client";

export const getThemeSetting = (client = api) => client("/settings/theme");

export const updateThemeSetting = (theme, client = api) =>
  client("/settings/theme", {
    method: "PUT",
    body: JSON.stringify({ theme }),
  });
