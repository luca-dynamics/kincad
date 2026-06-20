import { useCallback, useEffect, useState } from "react";
import { Group, Panel as RPanel, Separator } from "react-resizable-panels";
import { useMobile } from "./hooks/useMobile";
import { MobileNav, type MobileTab } from "./components/MobileNav";
import {
  buildFourBarReport,
  buildSliderCrankReport,
  type AnalysisReport,
  type FourBarLinkage,
  type SliderCrankLinkage,
} from "./engine";
import { INITIAL_STATE, type MechanismKind, type WorkspaceState } from "./state";
import { Sidebar } from "./components/Sidebar";
import { Onboarding } from "./components/Onboarding";
import Viewport from "./components/Viewport";
import Panel from "./components/Panel";
import { ChatPanel } from "./components/ChatPanel";
import { Landing } from "./components/Landing";
import type { ViewMode } from "./components/TopBar";
import { exportCanvasPNG, exportReportPDF } from "./report/pdf";
import { buildCad } from "./cad/build";
import { normalizeCadModel } from "./cad/params";
import { exportSTL } from "./cad/stl";
import { getModel, OFFLINE, probeModels } from "./ai/models";
import { applyActions } from "./ai/apply";
import type { AgentContext, Attachment, ChatMessage } from "./ai/types";
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

  useEffect(() => {
    setConversations(loadConversations());
    probeModels().then(() => {
      // Pick the first available model in preference order. Gemini 3.5 Flash is the default
      // (most quota for the FYP demo); the rest are fallbacks if Google isn't keyed.
      const preferred = [
        "gemini-3.5-flash",
        "gemini-3-pro",
        "claude-opus-4-8",
        "claude-sonnet-4-6",
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

  const buildReport = (s: WorkspaceState): AnalysisReport =>
    s.kind === "fourbar" ? buildFourBarReport(s.fourbar, 360) : buildSliderCrankReport(s.slider, 360);

  const send = useCallback(
    async (text: string, attachments?: Attachment[]) => {
      setStarted(true);
      setBusy(true);
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
        report: buildReport(snapshot),
        user: profile.name ? { name: profile.name } : undefined,
      };

      let model = getModel(modelId);
      let prefix = "";
      if (!model.available) {
        prefix =
          "_(That model needs an API key — none is configured, so I'm answering in offline mode. Add a server key or paste your own in the model menu.)_\n\n";
        model = OFFLINE;
      }

      try {
        const reply = await model.respond([...messages, userMsg], ctx);
        if (reply.actions?.length) {
          const cadAction = reply.actions.find((a) => a.type === "set_cad");
          setState((s) => {
            const next = applyActions({ kind: s.kind, fourbar: s.fourbar, slider: s.slider }, reply.actions!);
            return {
              ...s,
              ...next,
              ...(cadAction && cadAction.type === "set_cad" ? { cadModel: normalizeCadModel(cadAction.model) } : {}),
              playing: true,
            };
          });
          if (cadAction) setViewMode("cad");
          // A mechanism / model is now in play → reveal the workspace and make room for it.
          setHasMechanism(true);
          setSidebarOpen(false);
          setMobileTab("view"); // on mobile, jump to the workspace tab after agent acts
        }
        setMessages((m) => [...m, { role: "assistant", content: prefix + reply.text, actions: reply.actions }]);
      } catch (err) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `⚠ Could not reach the model: ${(err as Error).message}. Try the Offline model from the selector.` },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [messages, modelId, currentId, state.kind, state.fourbar, state.slider, viewMode],
  );

  const newChat = () => {
    setMessages([]);
    setCurrentId(null);
    setStarted(false);
    setHasMechanism(false);
    setState(INITIAL_STATE);
  };
  const quickStart = (k: MechanismKind) => {
    setMessages([]);
    setCurrentId(null);
    setState({ ...INITIAL_STATE, kind: k });
    setStarted(true);
    setHasMechanism(true);
    setSidebarOpen(false);
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
    // Restore workspace visibility from whether the agent ever acted in this chat.
    const hm = c.messages.some((m) => m.actions && m.actions.length > 0);
    setHasMechanism(hm);
    if (hm) setSidebarOpen(false); // only ever auto-collapse, never auto-expand
  };
  const removeConversation = (id: string) => {
    deleteConversation(id);
    setConversations(loadConversations());
    if (id === currentId) newChat();
  };
  const resetParams = () => setState((s) => ({ ...INITIAL_STATE, kind: s.kind }));

  const exportPDF = () => exportReportPDF(buildReport(state), getCanvasDataUrl(), state);
  const exportPNG = () => {
    const cv = document.getElementById("cad-canvas") as HTMLCanvasElement | null;
    if (cv) exportCanvasPNG(cv);
  };
  const exportSTLModel = () => {
    if (!state.cadModel) return;
    const { mesh } = buildCad(state.cadModel.node, undefined, state.cadModel.params);
    exportSTL(mesh, `${state.cadModel.name.replace(/\s+/g, "-").toLowerCase() || "kincad-model"}.stl`);
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
        const next = { name, onboarded: true };
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
      onExportSTL={exportSTLModel}
    />
  );

  const chatPanelNode = (
    <ChatPanel
      messages={messages}
      busy={busy}
      modelId={modelId}
      onModelChange={setModelId}
      onSend={send}
      onNewChat={newChat}
    />
  );

  const paramsNode = (
    <Panel
      state={state}
      viewMode={viewMode}
      onPatchFourBar={patchFourBar}
      onPatchSlider={patchSlider}
      onPatchCad={patchCadParam}
      onResetParams={resetParams}
    />
  );

  /* ── MOBILE layout ────────────────────────────────────────────── */
  if (mobile) {
    return (
      // h-dvh (dynamic viewport height), NOT h-screen/100vh: on mobile browsers 100vh
      // includes the area behind the URL bar, which pushes the bottom tab bar off-screen.
      <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
        {onboarding}
        {/* Backdrop for overlay sidebar */}
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
          ) : !hasMechanism ? (
            <ChatPanel
              variant="full"
              messages={messages}
              busy={busy}
              modelId={modelId}
              onModelChange={setModelId}
              onSend={send}
              onNewChat={newChat}
            />
          ) : (
            <>
              <div className={`h-full ${mobileTab === "chat" ? "block" : "hidden"}`}>{chatPanelNode}</div>
              <div className={`h-full ${mobileTab === "view" ? "block" : "hidden"}`}>{viewportNode}</div>
              <div className={`h-full ${mobileTab === "params" ? "block" : "hidden"}`}>{paramsNode}</div>
            </>
          )}
        </div>

        {/* Bottom tab nav — only shown once a conversation is started */}
        {(started || hasMechanism) && (
          <MobileNav
            tab={mobileTab}
            onTab={(t) => { setMobileTab(t); }}
            onMenu={() => setSidebarOpen((o) => !o)}
          />
        )}
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
          <ChatPanel
            variant="full"
            messages={messages}
            busy={busy}
            modelId={modelId}
            onModelChange={setModelId}
            onSend={send}
            onNewChat={newChat}
          />
        </main>
      ) : (
        <Group orientation="horizontal" id="kincad-panels" className="min-w-0 flex-1">
          <RPanel id="chat" collapsible defaultSize="26%" minSize="320px" maxSize="520px">
            {chatPanelNode}
          </RPanel>

          <Handle />

          <RPanel id="view" minSize="30%">
            {viewportNode}
          </RPanel>

          <Handle />

          <RPanel id="params" collapsible defaultSize="24%" minSize="300px" maxSize="380px">
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

function getCanvasDataUrl(): string | undefined {
  const cv = document.getElementById("cad-canvas") as HTMLCanvasElement | null;
  return cv?.toDataURL("image/png");
}
