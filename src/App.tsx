import { useCallback, useEffect, useMemo, useState } from "react";
import { Group, Panel as RPanel, Separator, usePanelRef } from "react-resizable-panels";
import { useMobile } from "./hooks/useMobile";
import { MobileNav, type MobileTab } from "./components/MobileNav";
import { TabEmpty } from "./components/TabEmpty";
import { LineChart, Monitor, SlidersHorizontal } from "lucide-react";
import type { FourBarLinkage, SliderCrankLinkage } from "./engine";
import { INITIAL_STATE, type MechanismKind, type WorkspaceState } from "./state";
import { Sidebar } from "./components/Sidebar";
import { Onboarding } from "./components/Onboarding";
import Viewport from "./components/Viewport";
import Plots from "./components/Plots";
import Panel from "./components/Panel";
import { ChatPanel } from "./components/ChatPanel";
import { Landing } from "./components/Landing";
import type { ViewMode } from "./components/TopBar";
import { exportReportPDF } from "./report/pdf";
import { exportPartSheetPDF } from "./report/partsheet";
import { captureViewPNG, downloadViewPNG } from "./report/capture";
import { buildCad } from "./cad/build";
import { normalizeCadModel } from "./cad/params";
import { exportMesh, modelSlug, type MeshFormat } from "./cad/export";
import { getModel, OFFLINE, probeModels } from "./ai/models";
import { QuotaError } from "./ai/proxy";
import { nextFallback } from "../shared/models";
import { applyActions } from "./ai/apply";
import { isMutating, markAt, supersedePending, tookEffect } from "./ai/approval";
import { reportFor } from "./insight";
import { buildItems } from "./components/chat/activity";
import type {
  AgentContext,
  ApprovalState,
  Attachment,
  ChatMessage,
  WorkspaceAction,
} from "./ai/types";
import {
  deleteConversation,
  getConversation,
  loadConversations,
  newConversationId,
  saveConversation,
  titleFrom,
  type Conversation,
} from "./store/conversations";
import { loadProfile, saveProfile } from "./store/user";

/**
 * Bottom-nav tabs whose content only exists once a mechanism has been analysed. Used to disable them
 * on the landing screen; once a session has started they are live and land on a `TabEmpty` instead.
 */
const MECHANISM_TABS = ["view", "insight", "params"] as const;

export default function App() {
  const [state, setState] = useState<WorkspaceState>(INITIAL_STATE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [modelId, setModelId] = useState("offline");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // collapsed by default; user expands
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [plotsOpen, setPlotsOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  // Workspace (viewport + parameters) appears only once a mechanism is in play — i.e. the
  // agent has run a workspace action. Conceptual Q&A stays in a clean chat-only layout.
  const [hasMechanism, setHasMechanism] = useState(false);
  const [profile, setProfile] = useState(loadProfile);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const mobile = useMobile();

  // Imperative handles for the two collapsible docks. The buttons that drive them live in three
  // places — each dock's own header, plus both ends of the workspace toolbar — so the panel group is
  // the shared source of truth rather than a `collapsed` boolean threaded through props.
  //
  // The mirrored booleans exist ONLY to point the toolbar's icons the right way, and EVERY path that
  // moves a dock sets them. The click handlers below set them directly, because they know what they
  // just did; `onResize` on each RPanel is the corrective for the one path they can't see — dragging
  // a Separator to the edge. Leaving it to `onResize` alone is not enough: that callback is driven by
  // a ResizeObserver, which a browser only delivers while the page is actually being rendered, so a
  // background or occluded tab would collapse the dock and leave the icon pointing the wrong way.
  // `collapsedSize` defaults to 0, so collapsing means zero width and every pixel goes to the canvas.
  const chatRef = usePanelRef();
  const paramsRef = usePanelRef();
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [paramsCollapsed, setParamsCollapsed] = useState(false);

  const collapseChat = () => {
    chatRef.current?.collapse();
    setChatCollapsed(true);
  };
  const collapseParams = () => {
    paramsRef.current?.collapse();
    setParamsCollapsed(true);
  };
  const toggleChat = () => {
    if (!chatRef.current?.isCollapsed()) return collapseChat();
    chatRef.current.expand();
    setChatCollapsed(false);
  };
  const toggleParams = () => {
    if (!paramsRef.current?.isCollapsed()) return collapseParams();
    paramsRef.current.expand();
    setParamsCollapsed(false);
  };

  useEffect(() => {
    setConversations(loadConversations());
    probeModels().then(() => {
      // Pick the first available model in preference order. Gemini 2.5 Flash is the default
      // (most quota for the FYP demo); the rest are fallbacks if Google isn't keyed.
      const preferred = [
        "gemini-2.5-flash",
        "gemini-3.5-flash",
        "gemini-3-pro",
        "gemini-2.5-pro",
        "gemini-2.0-flash",
        "claude-opus-5",
        "claude-sonnet-5",
        "gpt-5.5",
      ];
      const pick = preferred.map(getModel).find((m) => m.available);
      if (pick) setModelId(pick.id);
    });
  }, []);

  // Auto-save the active conversation (debounced) whenever its content changes.
  useEffect(() => {
    if (!currentId || !started) return;
    const t = setTimeout(() => {
      const existing = getConversation(currentId);
      if (!existing) return;
      const conv: Conversation = {
        ...existing,
        modelId,
        messages,
        workspace: { kind: state.kind, fourbar: state.fourbar, slider: state.slider, viewMode, cadModel: state.cadModel },
        updatedAt: Date.now(),
      };
      saveConversation(conv);
      setConversations(loadConversations());
    }, 500);
    return () => clearTimeout(t);
  }, [messages, state.kind, state.fourbar, state.slider, state.cadModel, viewMode, modelId, currentId, started]);

  const patch = useCallback((p: Partial<WorkspaceState>) => setState((s) => ({ ...s, ...p })), []);
  const patchFourBar = useCallback(
    (p: Partial<FourBarLinkage>) => setState((s) => ({ ...s, fourbar: { ...s.fourbar, ...p } })),
    [],
  );
  const patchSlider = useCallback(
    (p: Partial<SliderCrankLinkage>) => setState((s) => ({ ...s, slider: { ...s.slider, ...p } })),
    [],
  );
  const setTheta2 = useCallback((t: number) => setState((s) => ({ ...s, theta2: t })), []);
  const patchCadParam = useCallback(
    (key: string, value: number) =>
      setState((s) =>
        s.cadModel?.params
          ? { ...s, cadModel: { ...s.cadModel, params: s.cadModel.params.map((p) => (p.key === key ? { ...p, value } : p)) } }
          : s,
      ),
    [],
  );

  /**
   * The live linkages, as one stable object. θ₂ ticks every animation frame but the geometry does
   * not, so memoizing this keeps the chat subtree — and the two reports the approval card builds
   * from it — off the 60 Hz path.
   */
  const current = useMemo(
    () => ({ kind: state.kind, fourbar: state.fourbar, slider: state.slider }),
    [state.kind, state.fourbar, state.slider],
  );

  /**
   * The single path by which agent actions reach the workspace. Both the Apply button and the
   * auto-apply mode go through here, so an approved change lands exactly as an automatic one
   * does. Non-mutating actions are filtered out here rather than by each caller, so this stays
   * the one place that decides what an agent turn is allowed to touch.
   */
  const applyToWorkspace = useCallback((actions: WorkspaceAction[]) => {
    const changes = actions.filter(isMutating);
    const cad = changes.find((a) => a.type === "set_cad");
    setState((s) => ({
      ...s,
      ...applyActions({ kind: s.kind, fourbar: s.fourbar, slider: s.slider }, changes),
      ...(cad?.type === "set_cad" ? { cadModel: normalizeCadModel(cad.model) } : {}),
      playing: true,
    }));
    if (cad) setViewMode("cad");
    setHasMechanism(true);
    setSidebarOpen(false);
    setMobileTab("view");
  }, []);

  const send = useCallback(
    async (text: string, attachments?: Attachment[]) => {
      setStarted(true);
      setBusy(true);
      // Measured from the moment the user sends, so the duration reported in the activity
      // trace matches the counter they watched tick in the loader.
      const t0 = Date.now();
      const userMsg: ChatMessage = { role: "user", content: text, attachments };
      setMessages((m) => [...m, userMsg]);

      // Create the conversation on the first message so it appears in history.
      if (!currentId) {
        const id = newConversationId();
        const now = Date.now();
        saveConversation({
          id,
          title: titleFrom(text),
          createdAt: now,
          updatedAt: now,
          modelId,
          messages: [userMsg],
          workspace: { kind: state.kind, fourbar: state.fourbar, slider: state.slider, viewMode, cadModel: state.cadModel },
        });
        setCurrentId(id);
        setConversations(loadConversations());
      }

      const snapshot = await new Promise<WorkspaceState>((resolve) =>
        setState((s) => {
          resolve(s);
          return s;
        }),
      );
      const ctx: AgentContext = {
        kind: snapshot.kind,
        fourbar: snapshot.fourbar,
        slider: snapshot.slider,
        omega2: snapshot.omega2,
        unit: snapshot.unit,
        report: reportFor(snapshot, snapshot.omega2),
        user: profile.name ? { name: profile.name } : undefined,
        // Tells the model to speak in proposals ("that would give…"). Only true in the gated
        // mode, so the prompt never claims a change is pending when it already landed.
        approvalRequired: !profile.autoApply,
      };

      let model = getModel(modelId);
      let prefix = "";
      if (!model.available) {
        prefix =
          "_(That model needs an API key, and none is configured, so I'm answering in offline mode. Add a server key or paste your own in the model menu.)_\n\n";
        model = OFFLINE;
      }

      try {
        // Auto-fallback loop: if the chosen model hits a quota/rate-limit error,
        // step down the chain automatically until something responds or we reach offline.
        let activeModel = model;
        let reply;
        while (true) {
          try {
            reply = await activeModel.respond([...messages, userMsg], ctx);
            break;
          } catch (err) {
            if (err instanceof QuotaError) {
              const fallbackId = nextFallback(activeModel.id);
              const fallbackModel = fallbackId ? getModel(fallbackId) : null;
              if (fallbackModel && fallbackModel.available) {
                prefix =
                  `_⚡ ${activeModel.label} hit its quota limit, so I switched to **${fallbackModel.label}** automatically._\n\n` +
                  prefix;
                setModelId(fallbackModel.id);
                activeModel = fallbackModel;
                continue;
              }
              // No more fallbacks with keys — try offline as last resort
              prefix =
                `_⚡ ${activeModel.label} hit its quota limit and no fallback model is available, so I'm answering in offline mode._\n\n` +
                prefix;
              setModelId(OFFLINE.id);
              activeModel = OFFLINE;
              continue;
            }
            throw err; // non-quota errors propagate normally
          }
        }

        // The agent proposes; the engineer decides. Anything that would change the workspace
        // waits behind an approval card — unless the user has explicitly turned that off.
        const mutating = (reply.actions ?? []).filter(isMutating);
        // `omega2` rides along because the trace rebuilds full-cycle reports from this snapshot to
        // show what a proposal would change — and a report is only meaningful at a stated speed.
        // `unit` for the label those figures carry, so a restored transcript reads in the unit it
        // was written in rather than in whatever the workspace was later switched to.
        const before = {
          kind: snapshot.kind,
          fourbar: snapshot.fourbar,
          slider: snapshot.slider,
          omega2: snapshot.omega2,
          unit: snapshot.unit,
        };
        // Ask the same builder the card renders with whether there is anything visible to
        // approve. Agents routinely re-send parameters at the value they already hold ("what if
        // the coupler were 3.5?" when it already is), and a card whose Apply would do nothing is
        // worse than no card at all.
        const visible = mutating.length > 0 && buildItems(mutating, before).length > 0;
        const propose = visible && !profile.autoApply;

        if (!propose && (mutating.length > 0 || reply.actions?.some((a) => a.type === "run_analysis"))) {
          // Either auto-apply is on, or there is nothing to decide: a turn that only ran the
          // solver still reveals the workspace, exactly as it did before this gate existed.
          applyToWorkspace(reply.actions ?? []);
        }

        const approval: ApprovalState | undefined = propose ? "pending" : visible ? "auto" : undefined;

        setMessages((m) => [
          // A new proposal lapses any older one — two live Apply buttons would be ambiguous
          // about which wins. A turn that merely answered a question leaves it standing.
          ...(propose ? supersedePending(m) : m),
          {
            role: "assistant",
            content: prefix + reply.text,
            actions: reply.actions,
            approval,
            meta: {
              modelLabel: activeModel.label,
              // `model` is the model the turn started with; if the quota fallback swapped it out,
              // say so rather than silently crediting the answer to the wrong one.
              fellBackFrom: activeModel.id !== model.id ? model.label : undefined,
              elapsedMs: Date.now() - t0,
              // Pre-turn linkages — what the trace diffs each action's new values against.
              before,
            },
          },
        ]);
      } catch (err) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `⚠ Could not reach the model: ${(err as Error).message}. Try the Offline model from the selector.` },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [
      messages,
      modelId,
      currentId,
      state.kind,
      state.fourbar,
      state.slider,
      state.cadModel,
      viewMode,
      profile.name,
      // Read when deciding whether to propose — a stale value here would gate a turn the user
      // had just un-gated, or vice versa.
      profile.autoApply,
      applyToWorkspace,
    ],
  );

  /**
   * Apply a proposal. The actions arrive from the card rather than being read back out of
   * `messages`, so this needs no dependency on the transcript — and no state updater has to
   * call another setter, which StrictMode would double-invoke.
   */
  const applyProposal = useCallback(
    (index: number, actions: WorkspaceAction[]) => {
      applyToWorkspace(actions);
      setMessages((m) => markAt(m, index, "applied"));
    },
    [applyToWorkspace],
  );

  const discardProposal = useCallback((index: number) => {
    setMessages((m) => markAt(m, index, "discarded"));
  }, []);

  const toggleAutoApply = useCallback(() => {
    const next = { ...profile, autoApply: !profile.autoApply };
    saveProfile(next);
    setProfile(next);
  }, [profile]);

  const newChat = () => {
    setMessages([]);
    setCurrentId(null);
    setStarted(false);
    setHasMechanism(false);
    setState(INITIAL_STATE);
    // Back to the landing screen, where the three mechanism tabs are disabled — leaving the mobile
    // tab wherever it was would park the active indicator on a tab that can no longer be selected.
    setMobileTab("chat");
  };
  const quickStart = (k: MechanismKind) => {
    setMessages([]);
    setCurrentId(null);
    setState({ ...INITIAL_STATE, kind: k });
    setStarted(true);
    setHasMechanism(true);
    setSidebarOpen(false);
    // A quick start IS a request to see the mechanism, so land on it — same as when an analysis
    // lands from the agent. Otherwise the phone shows an empty chat with the linkage a tab away.
    setMobileTab("view");
  };
  const openConversation = (id: string) => {
    const c = getConversation(id);
    if (!c) return;
    setCurrentId(id);
    setMessages(c.messages);
    setModelId(c.modelId);
    setViewMode(c.workspace.viewMode);
    setState((s) => ({
      ...s,
      kind: c.workspace.kind,
      fourbar: c.workspace.fourbar,
      slider: c.workspace.slider,
      cadModel: c.workspace.cadModel ? normalizeCadModel(c.workspace.cadModel) : null,
      theta2: 0,
      playing: true,
    }));
    setStarted(true);
    // Restore workspace visibility from whether the agent's actions ever actually landed — a
    // chat whose only proposal was discarded left the workspace untouched, so it reopens clean.
    const hm = c.messages.some(tookEffect);
    setHasMechanism(hm);
    if (hm) setSidebarOpen(false); // only ever auto-collapse, never auto-expand
  };
  const removeConversation = (id: string) => {
    deleteConversation(id);
    setConversations(loadConversations());
    if (id === currentId) newChat();
  };
  // `kind` and `unit` survive a reset: neither is a parameter. The mechanism is what you are
  // resetting the parameters OF, and the unit is a declaration about the workspace — silently
  // putting an inch-declared dock back to mm would relabel every number on screen, which is the
  // one thing units.ts promises switching a unit never does.
  const resetParams = () => setState((s) => ({ ...INITIAL_STATE, kind: s.kind, unit: s.unit }));

  // ── Exports ──────────────────────────────────────────────────────────────────────────
  // Every one of these reads the view that is on screen. The snapshot comes from
  // [capture.ts](report/capture.ts), which finds the canvas inside the shared surface container
  // instead of by a per-view id — the 3D report used to lose its drawing silently for exactly that
  // reason, and in CAD there was no report to lose it from.

  /**
   * CAD gets a part sheet, not a kinematic report: the part has no motion to report on, and a
   * linkage report printed against it would be describing the mechanism behind it, not the geometry
   * on screen. Rebuilt here rather than cached because `buildCad` is what produced the mesh the view
   * is showing, so the sheet's bounding box and triangle count are the ones actually rendered.
   */
  const exportPDF = () => {
    if (viewMode === "cad" && state.cadModel) {
      const built = buildCad(state.cadModel.node, undefined, state.cadModel.params);
      exportPartSheetPDF(state.cadModel, built, captureViewPNG());
      return;
    }
    exportReportPDF(reportFor(state, state.omega2), captureViewPNG(), state);
  };

  /** `kincad-2d.png` / `kincad-3d.png` / `<model-name>.png` — the file says which view it came from. */
  const exportPNG = () =>
    downloadViewPNG(
      viewMode === "cad" && state.cadModel ? modelSlug(state.cadModel.name) : `kincad-${viewMode}`,
    );

  const exportModel = (format: MeshFormat) => {
    if (!state.cadModel) return;
    const { mesh } = buildCad(state.cadModel.node, undefined, state.cadModel.params);
    // Fire-and-forget: `exportMesh` is async only because it code-splits the three exporters, and
    // its one side effect is the download itself.
    void exportMesh(mesh, format, state.cadModel.name);
  };

  const sidebarNode = (
    <Sidebar
      open={sidebarOpen}
      onToggle={() => setSidebarOpen((o) => !o)}
      conversations={conversations}
      currentId={currentId}
      onNewChat={newChat}
      onOpenConversation={(id) => { openConversation(id); if (mobile) setSidebarOpen(false); }}
      onDeleteConversation={removeConversation}
      onQuickStart={(k) => { quickStart(k); if (mobile) setSidebarOpen(false); }}
      onReplayIntro={() => {
        const next = { ...profile, onboarded: false };
        saveProfile(next);
        setProfile(next);
      }}
      mobile={mobile}
    />
  );

  const onboarding = !profile.onboarded && (
    <Onboarding
      onComplete={(name) => {
        // Spread, don't rebuild: a fresh literal would silently drop the auto-apply preference.
        const next = { ...profile, name, onboarded: true };
        saveProfile(next);
        setProfile(next);
      }}
    />
  );

  const viewportNode = (
    <Viewport
      state={state}
      viewMode={viewMode}
      onSetViewMode={setViewMode}
      plotsOpen={plotsOpen}
      onTogglePlots={() => setPlotsOpen((o) => !o)}
      onPatch={patch}
      onPatchFourBar={patchFourBar}
      onPatchSlider={patchSlider}
      onSetTheta2={setTheta2}
      onTogglePlay={() => patch({ playing: !state.playing })}
      onReset={resetParams}
      onExportPDF={exportPDF}
      onExportPNG={exportPNG}
      onExportModel={exportModel}
      // Mobile shows one panel at a time, so there is no neighbour to collapse — and this node is
      // rendered by both layouts, so the toggles have to be withheld here rather than hidden in CSS.
      panels={
        mobile
          ? undefined
          : { chatCollapsed, paramsCollapsed, onToggleChat: toggleChat, onToggleParams: toggleParams }
      }
    />
  );

  // Mobile-only: the plots drawer is `hidden sm:block` inside Viewport, so on a phone this tab is
  // the only route to the curves. The cycle figures and the engine's warnings are one tab over, in
  // Params. Scrollable — three stacked plots are taller than a phone.
  const insightNode = (
    <div className="h-full overflow-y-auto bg-bg">
      <Plots state={state} onScrub={(t) => patch({ theta2: t, playing: false })} />
    </div>
  );

  // One prop bundle for all three ChatPanel sites (docked, and the two "full" variants below),
  // so the approval wiring cannot drift between them.
  const chatProps = {
    messages,
    busy,
    modelId,
    onModelChange: setModelId,
    onSend: send,
    onNewChat: newChat,
    // Live linkages, not the turn's snapshot: a pending card must state what Apply would do now.
    current,
    onApply: applyProposal,
    onDiscard: discardProposal,
    autoApply: profile.autoApply,
    onToggleAutoApply: toggleAutoApply,
  };

  // `onCollapse` is set here and not in `chatProps`: that bundle also feeds the two `variant="full"`
  // sites, where there is no panel group to collapse into. It only ever collapses — a button inside a
  // panel can't be reached when that panel is closed, which is what the toolbar's toggles are for.
  const chatPanelNode = (
    <ChatPanel {...chatProps} onCollapse={mobile ? undefined : collapseChat} />
  );

  const paramsNode = (
    <Panel
      state={state}
      viewMode={viewMode}
      onPatchFourBar={patchFourBar}
      onPatchSlider={patchSlider}
      onPatchCad={patchCadParam}
      onPatchState={patch}
      onResetParams={resetParams}
      onCollapse={mobile ? undefined : collapseParams}
    />
  );

  /* ── MOBILE layout ────────────────────────────────────────────── */
  if (mobile) {
    // Every tab renders its own pane, in every started state. Before an analysis lands there is no
    // workspace, no curves and no parameter sheet — but the fix for that is a pane that SAYS so, not
    // a tab wired to state no rendered branch reads. That was the defect: `mobileTab` switched, the
    // label tinted, the rule slid across, and the content stayed on the full-width chat, because the
    // pre-mechanism branch ignored the tab entirely. A tap that is acknowledged and then does
    // nothing reads as a dead button.
    const pane = (t: MobileTab) => `h-full ${mobileTab === t ? "block" : "hidden"}`;
    return (
      // h-dvh (dynamic viewport height), NOT h-screen/100vh: on mobile browsers 100vh
      // includes the area behind the URL bar, which pushes the bottom tab bar off-screen.
      <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
        {onboarding}
        {/* Backdrop for overlay sidebar. Stays below the nav (z-[60]) on purpose — see MobileNav. */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {sidebarNode}

        {/* Main content area — switches on mobileTab */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {!started ? (
            <Landing name={profile.name} modelId={modelId} onModelChange={setModelId} onSend={send} busy={busy} />
          ) : (
            <>
              <div className={pane("chat")}>
                {/* Without a mechanism there is no second panel to share the width with, so the chat
                    gets the wide reading layout — the same call the old branch made, now per-tab. */}
                {hasMechanism ? chatPanelNode : <ChatPanel {...chatProps} variant="full" />}
              </div>
              <div className={pane("view")}>
                {hasMechanism ? (
                  viewportNode
                ) : (
                  <TabEmpty
                    icon={Monitor}
                    title="No mechanism yet"
                    detail="Ask the assistant to analyse a four-bar or slider-crank, or pick a quick start from the menu, and the workspace opens here."
                    actionLabel="Ask the assistant"
                    onAction={() => setMobileTab("chat")}
                  />
                )}
              </div>
              <div className={pane("insight")}>
                {hasMechanism ? (
                  insightNode
                ) : (
                  <TabEmpty
                    icon={LineChart}
                    title="No curves yet"
                    detail="Position, velocity and acceleration plots are drawn from an analysis. Run one and they appear here."
                    actionLabel="Ask the assistant"
                    onAction={() => setMobileTab("chat")}
                  />
                )}
              </div>
              <div className={pane("params")}>
                {hasMechanism ? (
                  paramsNode
                ) : (
                  <TabEmpty
                    icon={SlidersHorizontal}
                    title="No parameters yet"
                    detail="Link lengths, speed and the results that follow from them live here once a mechanism is on screen."
                    actionLabel="Ask the assistant"
                    onAction={() => setMobileTab("chat")}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Bottom tab nav — always visible so the Menu button is always reachable. On the landing
            screen nothing has started at all, so the three mechanism tabs are disabled rather than
            given placeholders: there is no session to navigate within yet. */}
        <MobileNav
          tab={mobileTab}
          onTab={(t) => {
            setMobileTab(t);
            // The drawer is now under the nav rather than over it, so a tab tap while it is open
            // means "go there", not "dismiss". Closing it keeps that a single gesture.
            setSidebarOpen(false);
          }}
          onMenu={() => setSidebarOpen((o) => !o)}
          unavailable={started ? [] : MECHANISM_TABS}
        />
      </div>
    );
  }

  /* ── DESKTOP layout ───────────────────────────────────────────── */
  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      {onboarding}
      {sidebarNode}

      {!started ? (
        <main className="flex min-w-0 flex-1 flex-col">
          <Landing name={profile.name} modelId={modelId} onModelChange={setModelId} onSend={send} busy={busy} />
        </main>
      ) : !hasMechanism ? (
        <main className="min-w-0 flex-1">
          <ChatPanel {...chatProps} variant="full" />
        </main>
      ) : (
        <Group orientation="horizontal" id="kincad-panels" className="min-w-0 flex-1">
          <RPanel
            id="chat"
            panelRef={chatRef}
            collapsible
            defaultSize="26%"
            minSize="320px"
            maxSize="520px"
            onResize={(s) => setChatCollapsed(s.inPixels < 1)}
          >
            {chatPanelNode}
          </RPanel>

          <Handle />

          <RPanel id="view" minSize="30%">
            {viewportNode}
          </RPanel>

          <Handle />

          {/* The dock is a column of label/slider/value rows, so it stops improving past ~340px
              while the centre column — which holds the canvas AND the toolbar — is still short.
              Every pixel taken off here goes to the workspace: at a 1362px window this hands the
              view panel ~50px, which is what carries row 1 of the toolbar over the width where
              the θ₂ scrub stops being crushed. */}
          <RPanel
            id="params"
            panelRef={paramsRef}
            collapsible
            defaultSize="20%"
            minSize="260px"
            maxSize="340px"
            onResize={(s) => setParamsCollapsed(s.inPixels < 1)}
          >
            {paramsNode}
          </RPanel>
        </Group>
      )}
    </div>
  );
}

/** A thin resize handle that highlights on hover/drag. */
function Handle() {
  return (
    <Separator className="group relative w-1 cursor-col-resize bg-line transition-colors hover:bg-accent" />
  );
}
