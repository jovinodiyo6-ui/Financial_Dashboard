import { useEffect, useRef, useState } from "react";
import { getSystemStatus } from "../api/system";
import { useToast } from "../hooks/useToast";

export default function SystemStatusPill() {
  const toast = useToast();
  const hasWarnedRef = useRef(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let active = true;

    getSystemStatus()
      .then((payload) => {
        if (!active) {
          return;
        }
        setStatus(payload);
        if (payload?.maintenance && !hasWarnedRef.current) {
          hasWarnedRef.current = true;
          toast.info("Maintenance mode", payload.message || "Some actions may be temporarily unavailable.");
        }
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setStatus({ maintenance: false, environment: "offline", version: "n/a" });
      });

    return () => {
      active = false;
    };
  }, [toast]);

  return (
    <span
      className={`status-pill ${
        status?.maintenance ? "status-pill--warning" : "status-pill--ready"
      }`}
      title={status?.message || "System status"}
    >
      {status?.maintenance ? "Maintenance" : "Live"} {status?.version ? `· ${status.version}` : ""}
    </span>
  );
}
