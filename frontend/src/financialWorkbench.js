const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const safeDivide = (numerator, denominator) => {
  const top = safeNumber(numerator);
  const bottom = safeNumber(denominator);
  if (!bottom) {
    return 0;
  }
  return top / bottom;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const csvEscape = (value) => {
  const text = value ?? "";
  const normalized = String(text).replace(/"/g, "\"\"");
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
};

export const INITIAL_SCENARIO_INPUTS = {
  revenueGrowth: 8,
  expenseGrowth: 4,
  collectionsDrag: 6,
  inventoryShock: 4,
  capexPlan: 0,
};

export const SCENARIO_PRESETS = [
  {
    id: "steady",
    label: "Steady",
    description: "Moderate growth with controlled expense expansion.",
    values: {
      revenueGrowth: 8,
      expenseGrowth: 4,
      collectionsDrag: 6,
      inventoryShock: 4,
      capexPlan: 0,
    },
  },
  {
    id: "growth",
    label: "Growth Push",
    description: "Accelerate revenue with higher operating pressure.",
    values: {
      revenueGrowth: 18,
      expenseGrowth: 9,
      collectionsDrag: 8,
      inventoryShock: 10,
      capexPlan: 18000,
    },
  },
  {
    id: "stress",
    label: "Stress Test",
    description: "Lower collections quality and heavier inventory needs.",
    values: {
      revenueGrowth: 2,
      expenseGrowth: 8,
      collectionsDrag: 16,
      inventoryShock: 18,
      capexPlan: 10000,
    },
  },
];

export const buildExecutiveMetrics = (statement, dashboardStats, stats) => {
  const currentRatio = safeDivide(statement.assetsCurrent, statement.liabilitiesCurrent);
  const quickRatio = safeDivide(
    statement.cashBalance + statement.receivablesBalance,
    statement.liabilitiesCurrent,
  );
  const debtToEquity = safeDivide(statement.totalLiabilities, statement.equity);
  const grossMargin = safeDivide(statement.grossProfit, statement.netSales);
  const netMargin = safeDivide(statement.netProfitAfterTax, statement.netSales);
  const workingCapital = statement.assetsCurrent - statement.liabilitiesCurrent;
  const monthlyExpenseRunRate = safeDivide(statement.totalExpensesDetailed, 12);
  const cashRunwayMonths = monthlyExpenseRunRate > 0
    ? safeDivide(statement.cashBalance, monthlyExpenseRunRate)
    : 0;
  const balancePenalty = Math.min(35, Math.abs(statement.balanceDelta) / 250);
  const liquidityScore = clamp(currentRatio * 35, 0, 35);
  const marginScore = clamp((grossMargin * 100 + netMargin * 150) / 2, 0, 30);
  const leverageScore = clamp((1.6 - debtToEquity) * 15, 0, 15);
  const cashScore = clamp(cashRunwayMonths * 5, 0, 20);
  const healthScore = Math.round(clamp(liquidityScore + marginScore + leverageScore + cashScore - balancePenalty, 0, 100));

  return {
    currentRatio,
    quickRatio,
    debtToEquity,
    grossMargin,
    netMargin,
    workingCapital,
    monthlyExpenseRunRate,
    cashRunwayMonths,
    healthScore,
    activeUsers: stats?.active_users || dashboardStats?.active_users || 0,
    reportUsage: stats?.usage || 0,
  };
};

export const buildOperatingSignals = (statement) => {
  const workingCapitalGap = statement.assetsCurrent - statement.liabilitiesCurrent;
  const cashConversionGap = statement.receivablesBalance + statement.inventoryBalance - statement.payablesBalance;
  const arCoverage = safeDivide(statement.receivablesBalance, statement.netSales);
  const inventoryIntensity = safeDivide(statement.inventoryBalance, statement.netSales);
  const payablesCoverage = statement.payablesBalance
    ? safeDivide(statement.cashBalance, statement.payablesBalance)
    : 0;

  return [
    {
      label: "Working Capital",
      value: workingCapitalGap,
      tone: workingCapitalGap >= 0 ? "positive" : "critical",
      description: "Current assets minus current liabilities.",
    },
    {
      label: "Cash Conversion Gap",
      value: cashConversionGap,
      tone: cashConversionGap <= 0 ? "positive" : "warning",
      description: "Receivables + inventory less payables.",
    },
    {
      label: "A/R Exposure",
      value: arCoverage,
      tone: arCoverage <= 0.18 ? "positive" : arCoverage <= 0.3 ? "warning" : "critical",
      description: "Receivables as a share of annualized revenue.",
      format: "percent",
    },
    {
      label: "Inventory Intensity",
      value: inventoryIntensity,
      tone: inventoryIntensity <= 0.16 ? "positive" : inventoryIntensity <= 0.28 ? "warning" : "critical",
      description: "Inventory held against sales volume.",
      format: "percent",
    },
    {
      label: "Cash vs Payables",
      value: payablesCoverage,
      tone: payablesCoverage >= 1 ? "positive" : payablesCoverage >= 0.6 ? "warning" : "critical",
      description: "Cash available to cover current payables.",
      format: "ratio",
    },
  ];
};

export const buildForecastModel = (statement, scenarioInputs) => {
  const baseRevenue = Math.max(statement.netSales || statement.grossSales || 0, 0);
  const baseExpense = Math.max(statement.totalExpensesDetailed || 0, 0);
  const baseCashFlow = safeNumber(statement.netCashFromOperations || statement.netCashFlow);
  const startingCash = safeNumber(statement.cashBalance);
  const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  let cashPosition = startingCash;
  let lowestCash = startingCash;
  let highestRevenue = 0;
  let financingNeed = 0;

  const data = months.map((month, index) => {
    const step = index + 1;
    const monthlyRevenue = (baseRevenue / 12) * Math.pow(1 + safeNumber(scenarioInputs.revenueGrowth) / 100, step);
    const monthlyExpense = (baseExpense / 12) * Math.pow(1 + safeNumber(scenarioInputs.expenseGrowth) / 100, step);
    const monthlyCollectionsDrag = monthlyRevenue * (safeNumber(scenarioInputs.collectionsDrag) / 100);
    const monthlyInventoryShock = (safeNumber(statement.inventoryBalance) * (safeNumber(scenarioInputs.inventoryShock) / 100)) / 6;
    const monthlyCapex = step === 1 ? safeNumber(scenarioInputs.capexPlan) : 0;
    const monthlyCashMovement = monthlyRevenue - monthlyExpense - monthlyCollectionsDrag - monthlyInventoryShock - monthlyCapex + (baseCashFlow / 12);

    cashPosition += monthlyCashMovement;
    lowestCash = Math.min(lowestCash, cashPosition);
    highestRevenue = Math.max(highestRevenue, monthlyRevenue);
    if (cashPosition < 0) {
      financingNeed = Math.max(financingNeed, Math.abs(cashPosition));
    }

    return {
      month,
      revenue: Math.round(monthlyRevenue),
      expense: Math.round(monthlyExpense),
      cash: Math.round(cashPosition),
      collectionsGap: Math.round(monthlyCollectionsDrag),
    };
  });

  return {
    data,
    summary: {
      endingCash: cashPosition,
      lowestCash,
      financingNeed,
      peakRevenueMonth: highestRevenue,
    },
  };
};

export const buildFinanceAlerts = (statement, executiveMetrics, forecastModel) => {
  const alerts = [];

  if (Math.abs(statement.balanceDelta) >= 0.01) {
    alerts.push({
      severity: "critical",
      title: "Balance sheet is not balancing",
      detail: "Assets do not match liabilities plus equity, which means the ledger needs review before leadership or lender reporting.",
      action: "Review capital, drawings, and missing liability postings until the balance delta returns to zero.",
    });
  }

  if (executiveMetrics.currentRatio < 1) {
    alerts.push({
      severity: "critical",
      title: "Current ratio is below 1.0",
      detail: "Short-term liabilities exceed short-term assets.",
      action: "Accelerate collections, trim payables timing risk, and preserve cash until liquidity improves.",
    });
  }

  if (forecastModel.summary.lowestCash < 0) {
    alerts.push({
      severity: "critical",
      title: "Scenario forecast turns cash negative",
      detail: "The six-month model suggests the business could require outside funding or a faster collection cycle.",
      action: "Reduce capex, lower collection drag assumptions, or plan a financing buffer before the low-cash month arrives.",
    });
  }

  if (executiveMetrics.netMargin < 0.1) {
    alerts.push({
      severity: "warning",
      title: "Net margin is thin",
      detail: "The business is keeping too little profit after expenses.",
      action: "Review pricing, direct costs, and overhead before scaling volume.",
    });
  }

  if (statement.receivablesBalance > statement.payablesBalance * 1.4 && statement.receivablesBalance > 0) {
    alerts.push({
      severity: "warning",
      title: "Receivables are stretching faster than payables",
      detail: "Customers are tying up more working capital than suppliers are funding.",
      action: "Introduce collection reminders, deposits, or credit limits for slower accounts.",
    });
  }

  if (statement.inventoryBalance > statement.netSales * 0.25 && statement.inventoryBalance > 0) {
    alerts.push({
      severity: "warning",
      title: "Inventory is heavy relative to sales",
      detail: "Stock is consuming cash that could be redeployed.",
      action: "Review slow-moving lines, reorder thresholds, and bundle promotions to release cash.",
    });
  }

  if (!alerts.length) {
    alerts.push({
      severity: "positive",
      title: "Core indicators look healthy",
      detail: "Liquidity, profitability, and balance quality are within a strong operating range.",
      action: "Use the scenario planner to test growth and defend margins before expanding.",
    });
  }

  return alerts;
};

export const buildBoardNarrative = (companyName, statement, executiveMetrics, forecastModel) => {
  const business = companyName || "the selected company";
  const marginPercent = `${Math.round(executiveMetrics.netMargin * 100)}%`;
  const runwayText = executiveMetrics.cashRunwayMonths
    ? `${executiveMetrics.cashRunwayMonths.toFixed(1)} months`
    : "no clear runway yet";
  const lowestCashText = forecastModel.summary.lowestCash.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return [
    `Executive summary for ${business}: net sales are ${statement.netSales.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} with a net margin of ${marginPercent}.`,
    `The current ratio is ${executiveMetrics.currentRatio.toFixed(2)} and available cash supports roughly ${runwayText} at the current expense run rate.`,
    `Under the active six-month scenario, the lowest projected cash position is ${lowestCashText}${forecastModel.summary.financingNeed > 0 ? ", so a financing cushion or collection improvement is recommended." : ", which keeps the business above zero without extra funding."}`,
  ].join(" ");
};

export const statementToCsv = (statement) => {
  const rows = [
    ["Metric", "Value"],
    ["Gross Sales", statement.grossSales],
    ["Net Sales", statement.netSales],
    ["Gross Profit", statement.grossProfit],
    ["Net Profit After Tax", statement.netProfitAfterTax],
    ["Cash", statement.cashBalance],
    ["Accounts Receivable", statement.receivablesBalance],
    ["Inventory", statement.inventoryBalance],
    ["Accounts Payable", statement.payablesBalance],
    ["Total Assets", statement.totalAssets],
    ["Total Liabilities", statement.totalLiabilities],
    ["Equity", statement.equity],
    ["Net Cash Flow", statement.netCashFromOperations || statement.netCashFlow],
  ];

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
};

export const ledgerRowsToCsv = (rows) => {
  const data = [["Account", "Type", "Class", "Amount", "Depreciation"]];
  rows.forEach((row) => {
    data.push([row.account, row.type, row.subtype, row.amount, row.depreciation]);
  });
  return data.map((row) => row.map(csvEscape).join(",")).join("\n");
};
