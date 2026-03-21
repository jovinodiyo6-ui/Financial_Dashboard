import { api } from "./client";

export const getCompanies = (client = api) => client("/companies");
