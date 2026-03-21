import { api } from "./client";

export const getCompanies = (client = api) => client("/companies");

export const updateCompanySetup = (first, second, third) => {
  const [client, companyId] = typeof first === "function" ? [first, second] : [api, first];
  const payload = typeof first === "function" ? third : second;
  return client(`/companies/${companyId}/setup`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};
