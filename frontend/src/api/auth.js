import { api } from "./client";

const resolveClientArgs = (first, second) =>
  typeof first === "function" ? [first, second] : [api, first];

export const loginRequest = (first, second) => {
  const [client, credentials] = resolveClientArgs(first, second);
  return client("/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
};

export const registerRequest = (first, second) => {
  const [client, payload] = resolveClientArgs(first, second);
  return client("/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const getMe = (client = api) => client("/me");

export const login = loginRequest;
export const register = registerRequest;
