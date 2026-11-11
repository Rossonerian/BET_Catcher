import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { api } from "./api";
import type { MerchantSummary } from "./api";
import { AuditTimeline } from "./components/AuditTimeline";
import { CasePanel } from "./components/CasePanel";
import { DeclarationForm } from "./components/DeclarationForm";
import { DeclarationsList } from "./components/DeclarationsList";
import { DriftPanel } from "./components/DriftPanel";
import { FlowPanel } from "./components/FlowPanel";
import { IdentityPanel } from "./components/IdentityPanel";
import { InlineScorePanel } from "./components/InlineScorePanel";
import { MerchantHeader } from "./components/MerchantHeader";
import { MerchantQueue } from "./components/MerchantQueue";
import { NetworkPanel } from "./components/NetworkPanel";
import { PeerPanel } from "./components/PeerPanel";
import { ReassessmentBanner } from "./components/ReassessmentBanner";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { SignalsPanel } from "./components/SignalsPanel";
import { ErrorBox, Loading } from "./components/common";
import { useMerchantData } from "./useMerchantData";
import type { Loadable } from "./useMerchantData";

const TABS = [
  { id: "identity", label: "Identity" },
  { id: "drift", label: "Behaviour drift" },
  { id: "peer", label: "Peer context" },
  { id: "flow", label: "Fund flow" },
  { id: "network", label: "Network" },
  { id: "signals", label: "Signals & hypotheses" },
  { id: "response", label: "Declaration & response" },
  { id: "inline", label: "Inline scoring" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const DEFAULT_ACTOR = "analyst.priya";

/** Renders loading / error / content for one resource. */
function Gate<T>({ res, what, retry, children }: { res: Loadable<T>; what: string; retry: () => void; children: (d: T) => ReactNode }) {
  if (res.data) return <>{children(res.data)}</>;
  if (res.error) return <ErrorBox error={res.error} onRetry={retry} />;
  return <Loading what={what} />;
}

export function App() {
  const [merchants, setMerchants] = useState<MerchantSummary[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("identity");
  const [actor, setActor] = useState(DEFAULT_ACTOR);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dismissedEvent, setDismissedEvent] = useState<number | null>(null);

  const data = useMerchantData(selectedId);
  const { reload } = data;

  const loadQueue = useCallback(async () => {
    setQueueError(null);
    try {
      const list = await api.merchants();
      setMerchants(list);
      setSelectedId((cur) => (cur && list.some((m) => m.id === cur) ? cur : (list[0]?.id ?? null)));
    } catch (e) {
      setQueueError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const onReset = async () => {
    setResetting(true);
    setNotice(null);
    try {
      const r = await api.reset();
      setNotice(`Demo reset to seed (data version ${r.data_version}, ${r.transactions.toLocaleString("en-IN")} transactions).`);
      setDismissedEvent(null);
      await loadQueue();
      await reload();
    } catch (e) {
      setNotice(`Reset failed: ${(e as Error).message}`);
    } finally {
      setResetting(false);
    }
  };

  const afterReview = async () => {
    setDismissedEvent(null);
    await Promise.all([reload(), loadQueue()]);
  };
  const afterCaseChange = async () => {
    await Promise.all([reload(["caseBundle"]), loadQueue()]);
  };
  const afterSubmit = async () => {
    await reload(["profile", "caseBundle"]);
  };

  const audit = data.caseBundle.data?.audit ?? [];
  const lastUpdate = [...audit].filter((e) => e.event_type === "ASSESSMENT_UPDATED").sort((a, b) => b.id - a.id)[0];

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  const retryAll = () => void reload();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">VERITY</span>
          <span className="brand-sub">Merchant behavioural intelligence · investigator console</span>
        </div>
        <div className="topbar-right">
          <span className="synthetic-tag">Synthetic demo data</span>
          <label className="inline-field">
            <span>Acting analyst</span>
            <input value={actor} onChange={(e) => setActor(e.target.value)} size={14} />
          </label>
        </div>
      </header>
      <div className="layout">
        <MerchantQueue
          merchants={merchants}
          error={queueError}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onReset={onReset}
          resetting={resetting}
          onRetry={loadQueue}
        />
        <main className="main">
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setNotice(null)}>
                Dismiss
              </button>
            </div>
          )}
          {!selectedId ? (
            merchants && merchants.length === 0 ? <p className="muted">No merchants.</p> : null
          ) : (
            <>
              {data.profile.error && <ErrorBox error={data.profile.error} onRetry={retryAll} />}
              {data.assessment.error && <ErrorBox error={data.assessment.error} onRetry={retryAll} />}
              {data.profile.data && data.assessment.data ? (
                <MerchantHeader profile={data.profile.data} assessment={data.assessment.data} />
              ) : (
                !data.profile.error && !data.assessment.error && <Loading what="merchant assessment" />
              )}
              {lastUpdate && dismissedEvent !== lastUpdate.id && (
                <ReassessmentBanner
                  event={lastUpdate}
                  assessment={data.assessment.data}
                  onDismiss={() => setDismissedEvent(lastUpdate.id)}
                />
              )}
              <div className="tabs" role="tablist" aria-label="Investigation steps" onKeyDown={onTabKey}>
                {TABS.map((t, i) => (
                  <button
                    key={t.id}
                    id={`tab-${t.id}`}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    aria-controls="tabpanel"
                    tabIndex={tab === t.id ? 0 : -1}
                    className={`tab${tab === t.id ? " active" : ""}`}
                    onClick={() => setTab(t.id)}
                  >
                    <span className="tab-num">{i + 1}</span> {t.label}
                  </button>
                ))}
              </div>
              <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="tabpanel">
                {tab === "identity" && (
                  <Gate res={data.assessment} what="identity checks" retry={retryAll}>
                    {(a) => <IdentityPanel assessment={a} />}
                  </Gate>
                )}
                {tab === "drift" && (
                  <Gate res={data.timeseries} what="timeseries" retry={retryAll}>
                    {(ts) => (
                      <Gate res={data.assessment} what="assessment" retry={retryAll}>
                        {(a) => (
                          <Gate res={data.profile} what="profile" retry={retryAll}>
                            {(p) => <DriftPanel key={a.merchant_id} assessment={a} timeseries={ts} profile={p} />}
                          </Gate>
                        )}
                      </Gate>
                    )}
                  </Gate>
                )}
                {tab === "peer" && (
                  <Gate res={data.assessment} what="peer context" retry={retryAll}>
                    {(a) => <PeerPanel assessment={a} />}
                  </Gate>
                )}
                {tab === "flow" && (
                  <Gate res={data.assessment} what="fund flow" retry={retryAll}>
                    {(a) => <FlowPanel assessment={a} />}
                  </Gate>
                )}
                {tab === "network" && (
                  <Gate res={data.network} what="network" retry={retryAll}>
                    {(g) => <NetworkPanel key={g.focus ?? ""} graph={g} />}
                  </Gate>
                )}
                {tab === "signals" && (
                  <Gate res={data.assessment} what="signals" retry={retryAll}>
                    {(a) => <SignalsPanel assessment={a} />}
                  </Gate>
                )}
                {tab === "response" && (
                  <div className="response">
                    <Gate res={data.assessment} what="recommendation" retry={retryAll}>
                      {(a) => <RecommendationPanel assessment={a} />}
                    </Gate>
                    <div className="response-grid">
                      <div className="col">
                        <DeclarationForm merchantId={selectedId} onSubmitted={afterSubmit} />
                        <Gate res={data.profile} what="declarations" retry={retryAll}>
                          {(p) => <DeclarationsList declarations={p.declarations} actor={actor} onReviewed={afterReview} />}
                        </Gate>
                      </div>
                      <div className="col">
                        <Gate res={data.caseBundle} what="case" retry={retryAll}>
                          {(cb) => (
                            <>
                              <CasePanel key={selectedId} merchantId={selectedId} bundle={cb} actor={actor} onChanged={afterCaseChange} />
                              <AuditTimeline audit={cb.audit} />
                            </>
                          )}
                        </Gate>
                      </div>
                    </div>
                  </div>
                )}
                {tab === "inline" && <InlineScorePanel merchantId={selectedId} />}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
