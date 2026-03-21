import { useMemo } from "react";
import * as auth from "../api/auth";
import * as finance from "../api/finance";
import * as billing from "../api/billing";
import * as ai from "../api/ai";
import * as companies from "../api/companies";
import * as system from "../api/system";

export const useApi = () =>
  useMemo(
    () => ({
      auth,
      finance,
      billing,
      ai,
      companies,
      system,
    }),
    [],
  );
