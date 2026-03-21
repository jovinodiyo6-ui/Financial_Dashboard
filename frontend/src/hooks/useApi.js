import { useMemo } from "react";
import * as auth from "../api/auth";
import * as finance from "../api/finance";
import * as billing from "../api/billing";
import * as ai from "../api/ai";

export const useApi = () =>
  useMemo(
    () => ({
      auth,
      finance,
      billing,
      ai,
    }),
    [],
  );
