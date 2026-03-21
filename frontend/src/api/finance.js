import { api } from "./client";

const resolveClientArgs = (first, second) =>
  typeof first === "function" ? [first, second] : [api, first];

export const getDashboard = (client = api) => client("/finance/summary");

export const getInvoices = (client = api) => client("/finance/invoices");

export const createInvoice = (first, second) => {
  const [client, payload] = resolveClientArgs(first, second);
  return client("/finance/invoices", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const recordInvoicePayment = (first, second, third) => {
  const [client, invoiceId] = typeof first === "function" ? [first, second] : [api, first];
  const payload = typeof first === "function" ? third : second;
  return client(`/finance/invoices/${invoiceId}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const getBills = (client = api) => client("/finance/bills");

export const createBill = (first, second) => {
  const [client, payload] = resolveClientArgs(first, second);
  return client("/finance/bills", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const recordBillPayment = (first, second, third) => {
  const [client, billId] = typeof first === "function" ? [first, second] : [api, first];
  const payload = typeof first === "function" ? third : second;
  return client(`/finance/bills/${billId}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const getFinanceSummary = getDashboard;

export const getAccountingOverview = (client = api) => client("/finance/accounting/overview");

export const getChartOfAccounts = (client = api) => client("/finance/chart-of-accounts");

export const validateJournalEntry = (first, second) => {
  const [client, payload] = resolveClientArgs(first, second);
  return client("/finance/journal-entries/validate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const createJournalEntry = (first, second) => {
  const [client, payload] = resolveClientArgs(first, second);
  return client("/finance/journal-entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const getJournalEntries = (client = api) => client("/finance/journal-entries");

export const createGuidedEntries = (first, second) => {
  const [client, payload] = resolveClientArgs(first, second);
  return client("/finance/guided-entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const getTaxSummary = (client = api) => client("/finance/tax/summary");

export const getTaxProfile = (client = api) => client("/finance/tax/profile");

export const updateTaxProfile = (first, second) => {
  const [client, payload] = resolveClientArgs(first, second);
  return client("/finance/tax/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};

export const getTaxJurisdictions = (client = api) => client("/finance/tax/jurisdictions");

export const getTaxFilingPreview = (client = api) => client("/finance/tax/filing-preview");

export const createTaxFiling = (first = {}, second) => {
  const [client, payload] = resolveClientArgs(first, second);
  return client("/finance/tax/filings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const seedTaxDemo = (first = {}, second) => {
  const [client, payload] = resolveClientArgs(first, second);
  return client("/finance/tax/seed-demo", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};
