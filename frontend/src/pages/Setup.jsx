import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import GuidedEntryWizard from "../components/GuidedEntryWizard";
import Loader from "../components/Loader";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";

const businessTypeLabels = {
  sole_proprietor: "Sole proprietor",
  partnership: "Partnership",
  manufacturing: "Manufacturing",
  company: "Company",
};

const buildProfileState = (company) => ({
  business_type: company?.business_type || "sole_proprietor",
  partner_names:
    company?.business_type === "partnership"
      ? company?.partner_names?.length
        ? [...company.partner_names]
        : ["", ""]
      : [],
});

export default function Setup() {
  const navigate = useNavigate();
  const { companies, finance } = useApi();
  const { user, loading, refreshUser } = useAuth();
  const [profile, setProfile] = useState(buildProfileState(user?.default_company));
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const company = user?.default_company || null;

  useEffect(() => {
    setProfile(buildProfileState(user?.default_company));
  }, [user?.default_company?.id, user?.default_company?.business_type, (user?.default_company?.partner_names || []).join("|")]);

  const partnerNames = useMemo(
    () => (profile.partner_names || []).map((name) => name.trim()).filter(Boolean),
    [profile.partner_names],
  );

  const previewCompany = useMemo(
    () => ({
      ...(company || {}),
      business_type: profile.business_type,
      partner_names: profile.business_type === "partnership" ? profile.partner_names : [],
    }),
    [company, profile.business_type, profile.partner_names],
  );

  if (loading) {
    return <Loader label="Loading setup workspace..." />;
  }

  if (!company) {
    return (
      <section className="page-shell">
        <div className="form-error">No company is attached to this workspace yet.</div>
      </section>
    );
  }

  if (company.onboarding_complete) {
    return <Navigate to="/app" replace />;
  }

  const updatePartnerName = (index, value) => {
    setProfile((current) => ({
      ...current,
      partner_names: current.partner_names.map((name, partnerIndex) =>
        partnerIndex === index ? value : name,
      ),
    }));
  };

  const addPartner = () => {
    setProfile((current) => ({
      ...current,
      partner_names: [...(current.partner_names || []), ""],
    }));
  };

  const removePartner = (index) => {
    setProfile((current) => ({
      ...current,
      partner_names: current.partner_names.filter((_, partnerIndex) => partnerIndex !== index),
    }));
  };

  const handleGuidedSetup = async ({ entry_date, business_type, inputs }) => {
    const payload = {
      business_type,
      partner_names: business_type === "partnership" ? partnerNames : [],
    };

    if (business_type === "partnership" && partnerNames.length < 2) {
      throw new Error("Add at least two partner names before continuing.");
    }

    setSubmittingProfile(true);
    try {
      await companies.updateCompanySetup(company.id, payload);
      const result = await finance.createGuidedEntries({
        entry_date,
        business_type,
        inputs,
      });
      await refreshUser();
      navigate("/reports", { replace: true });
      return result;
    } finally {
      setSubmittingProfile(false);
    }
  };

  return (
    <section className="page-shell">
      <header className="hero-banner">
        <div>
          <span className="eyebrow">Setup Workspace</span>
          <h2>Start with the business structure, then let the system build the books.</h2>
          <p className="lead">
            Choose the business type, answer guided finance questions, and the backend will turn
            those answers into entries, statements, and forecast-ready data.
          </p>
        </div>

        <div className="hero-actions">
          <span className="status-pill">{businessTypeLabels[profile.business_type]}</span>
          <span className="status-pill">{company.name}</span>
        </div>
      </header>

      <div className="dashboard-grid">
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Step 1</span>
              <h3>Business structure</h3>
            </div>
          </div>

          <p className="lead">
            This choice controls the guided questions, journal rules, statements, and the forecast
            narrative that follows.
          </p>

          <div className="wizard-grid">
            <label className="field">
              <span>Business type</span>
              <select
                value={profile.business_type}
                onChange={(event) =>
                  setProfile((current) => ({
                    business_type: event.target.value,
                    partner_names:
                      event.target.value === "partnership"
                        ? current.partner_names?.length
                          ? current.partner_names
                          : ["", ""]
                        : [],
                  }))
                }
              >
                <option value="sole_proprietor">Sole proprietor</option>
                <option value="partnership">Partnership</option>
                <option value="manufacturing">Manufacturing</option>
                <option value="company">Company</option>
              </select>
            </label>
          </div>

          {profile.business_type === "partnership" ? (
            <div className="stack">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Partners</span>
                  <h3>Define who shares the business</h3>
                </div>
              </div>

              <div className="stack">
                {profile.partner_names.map((name, index) => (
                  <div key={`partner-${index}`} className="partner-name-row">
                    <label className="field">
                      <span>Partner {index + 1}</span>
                      <input
                        value={name}
                        placeholder={`Partner ${index + 1} name`}
                        onChange={(event) => updatePartnerName(index, event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => removePartner(index)}
                      disabled={profile.partner_names.length <= 2}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="button-row">
                <button type="button" className="ghost-button" onClick={addPartner}>
                  Add Partner
                </button>
              </div>
            </div>
          ) : null}

          <div className="signal-grid">
            <article className="insight-card">
              <strong>Input</strong>
              <p>Simple business facts instead of manual debits and credits.</p>
            </article>
            <article className="insight-card">
              <strong>Structure</strong>
              <p>The backend converts those facts into double-entry journals.</p>
            </article>
            <article className="insight-card">
              <strong>Output</strong>
              <p>Financial statements and forecast-ready metrics appear immediately after setup.</p>
            </article>
          </div>
        </section>

        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Step 2</span>
              <h3>Seed opening activity</h3>
            </div>
          </div>

          <GuidedEntryWizard
            companyOverride={previewCompany}
            onSubmitData={handleGuidedSetup}
            title="Guided Setup"
            subtitle="workspace"
            submitLabel={submittingProfile ? "Building workspace..." : "Build Statements And Forecast"}
            intro="Answer these questions in business language. The system will post the matching journals, unlock onboarding, and take you into statements and AI forecast."
          />
        </section>
      </div>
    </section>
  );
}
