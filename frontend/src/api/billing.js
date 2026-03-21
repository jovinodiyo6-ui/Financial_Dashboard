import { api } from "./client";

const resolveClientArgs = (first, second) =>
  typeof first === "function" ? [first, second] : [api, first];

export const getBillingPlans = (client = api) => client("/billing/plans");

export const getBillingSummary = (client = api) => client("/billing/summary");

export const createMpesaCheckout = (first, second) => {
  const [client, payload] = resolveClientArgs(first, second);
  return client("/billing/mpesa/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const startMpesaPayment = (phone, amount, planCode = null) =>
  api("/billing/mpesa/stk-push", {
    method: "POST",
    body: JSON.stringify({
      phone,
      amount,
      ...(planCode ? { plan_code: planCode } : {}),
    }),
  });

export const getMpesaRequestStatus = (first, second) => {
  const [client, requestId] = resolveClientArgs(first, second);
  return client(`/billing/mpesa/requests/${requestId}`);
};
