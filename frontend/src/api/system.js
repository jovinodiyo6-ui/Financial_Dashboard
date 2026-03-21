import { api } from "./client";

export const getSystemStatus = (client = api) => client("/system-status");
