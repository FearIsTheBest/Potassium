import { useState, useEffect, useRef } from "react";
import "./App.scss";
import { Icon } from "@iconify/react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { mkdir, exists } from "@tauri-apps/plugin-fs";
import { documentDir, join } from "@tauri-apps/api/path";
import { Command } from "@tauri-apps/plugin-shell";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

type TabId = "Editor" | "Settings" | "ScriptHub";
type EditorTab = { id: string; name: string; content: string; path: string | null };
document.addEventListener('contextmenu', e => e.preventDefault());

const DEFAULT_CONTENT = `print("Hello, World!")`;

interface Script {
  _id: string;
  title: string;
  slug: string;
  image?: string;
  script?: string;
  game?: {
    name?: string;
    imageUrl?: string;
  };
  isUniversal?: boolean;
}

interface ScriptApiResponse {
  result: {
    scripts: Script[];
    totalPages?: number;
    nextPage?: number;
  };
}

export default function App() {
  const appWindow = getCurrentWindow();
  const [activeTab, setActiveTab] = useState<TabId>("Editor");
  const [files, setFiles] = useState<{ name: string; path: string; content: string }[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tabs, setTabs] = useState<EditorTab[]>([
    { id: "1", name: "Untitled Tab", content: DEFAULT_CONTENT, path: null }
  ]);
  const [activeTabId, setActiveTabId] = useState("1");
  const activeTabIdRef = useRef("1");
  const [monacoSrc, setMonacoSrc] = useState("");
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const readyTabs = useRef<Set<string>>(new Set());
  const pendingContent = useRef<Record<string, string>>({ "1": DEFAULT_CONTENT });
  const [, setScripts] = useState<Script[]>([]);
  const [, setLoading] = useState(true);
  const [scriptHubSearch, setScriptHubSearch] = useState("");
  const [scriptHubScripts, setScriptHubScripts] = useState<Script[]>([]);
  const [scriptHubLoading, setScriptHubLoading] = useState(false);

  const [miniMap, setMiniMap] = useState(false);
  const [smoothCursor, setSmoothCursor] = useState(false);
  const [smoothScrolling, setSmoothScrolling] = useState(false);
  const [editorFolding, setEditorFolding] = useState(false);
  const [fontLigatures, setFontLigatures] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [autoAttach, setAutoAttach] = useState(false);

  const [attached, setAttached] = useState(false);
  const [attachLoading, setAttachLoading] = useState(false);
  const tabsRef = useRef(tabs);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  useEffect(() => {
    const unlisten = listen("disconnect", () => {
      setAttached(false);
      console.log("MacSploit disconnected.");
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  const syncActiveTabId = (id: string) => {
    activeTabIdRef.current = id;
    setActiveTabId(id);
  };

  const sendToTab = (tabId: string, msg: object) => {
    iframeRefs.current[tabId]?.contentWindow?.postMessage(msg, "*");
  };

  const sendToActive = (msg: object) => {
    sendToTab(activeTabIdRef.current, msg);
  };

  const toggleMiniMap = () => {
    const n = !miniMap;
    setMiniMap(n);
    sendToActive({ type: "setOption", option: "minimap", value: { enabled: n } });
  };

  const toggleSmoothCursor = () => { const n = !smoothCursor; setSmoothCursor(n); sendToActive({ type: "setOption", option: "cursorSmoothCaretAnimation", value: n ? "on" : "off" }); };
  const toggleSmoothScrolling = () => { const n = !smoothScrolling; setSmoothScrolling(n); sendToActive({ type: "setOption", option: "smoothScrolling", value: n }); };
  const toggleEditorFolding = () => { const n = !editorFolding; setEditorFolding(n); sendToActive({ type: "setOption", option: "folding", value: n }); };
  const toggleFontLigatures = () => { const n = !fontLigatures; setFontLigatures(n); sendToActive({ type: "setOption", option: "fontLigatures", value: n }); };
  const toggleWordWrap = () => { const n = !wordWrap; setWordWrap(n); sendToActive({ type: "setOption", option: "wordWrap", value: n ? "on" : "off" }); };
  const toggleAlwaysOnTop = () => {
    const n = !alwaysOnTop;
    setAlwaysOnTop(n);
    getCurrentWindow().setAlwaysOnTop(n);
  };
  const toggleAutoAttach = () => { setAutoAttach(p => !p); };

  const handleAttach = async () => {

    if (attached) {
      try {
        await invoke("detach");
        setAttached(false);
      } catch (e) {
        console.error("Detach failed:", e);
      }
      return;
    }

    setAttachLoading(true);
    let success = false;

    for (let port = 5553; port <= 5562; port++) {
      try {
        await invoke("attach", { port });
        setAttached(true);
        success = true;
        console.log("Attached on port", port);

        if (autoAttach) {
          const currentTab = tabsRef.current.find(t => t.id === activeTabIdRef.current);
          if (currentTab?.content) {
            await invoke("execute", { script: currentTab.content }).catch(console.error);
          }
        }

        break;
      } catch (e) {
        if (e === "AlreadyInjected") {
          setAttached(true);
          success = true;
          break;
        }

      }
    }

    if (!success) console.error("Could not attach to any Roblox instance.");
    setAttachLoading(false);
  };

  const handleExecute = async () => {
    const currentTab = tabsRef.current.find(t => t.id === activeTabIdRef.current);
    if (!currentTab?.content) return;
    try {
      await invoke("execute", { script: currentTab.content });
    } catch (e) {
      console.error("Execute failed:", e);
    }
  };

  useEffect(() => {
    const init = async () => { await initFolders(); await loadScripts(); };
    init();
    const interval = setInterval(loadScripts, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const getTabId = () => Object.entries(iframeRefs.current).find(
        ([, iframe]) => iframe?.contentWindow === e.source
      )?.[0];

      if (e.data?.type === "ready") {
        const tabId = getTabId();
        if (!tabId || readyTabs.current.has(tabId)) return;
        readyTabs.current.add(tabId);
        const content = pendingContent.current[tabId] ?? DEFAULT_CONTENT;
        sendToTab(tabId, { type: "setText", content });
        delete pendingContent.current[tabId];
      }

      if (e.data?.type === "contentChanged") {
        const tabId = getTabId();
        if (tabId) {
          setTabs(prev => prev.map(t => t.id === tabId ? { ...t, content: e.data.content } : t));
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!window.miniMap) window.miniMap = false;
    if (!window.SwitchMinimap) {
      window.SwitchMinimap = (flag: boolean) => {
        Object.values(iframeRefs.current).forEach(iframe => {
          iframe?.contentWindow?.postMessage({
            type: "setOption",
            option: "minimap",
            value: { enabled: flag }
          }, "*");
        });
      };
    }
  }, []);

  useEffect(() => {
    fetch("https://scriptblox.com/api/script/fetch")
      .then(res => res.json())
      .then((data: ScriptApiResponse) => {
        setScripts(data.result.scripts);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching scripts:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (activeTab === "ScriptHub") {
      fetchScriptHubScripts(scriptHubSearch);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "ScriptHub") return;
    const timer = setTimeout(() => fetchScriptHubScripts(scriptHubSearch), 400);
    return () => clearTimeout(timer);
  }, [scriptHubSearch]);

  const initFolders = async () => {
    const docPath = await documentDir();
    const potassiumPath = await join(docPath, "Potassium");
    const scriptsPath = await join(potassiumPath, "Scripts");
    const monacoPath = await join(potassiumPath, "monaco");

    if (!(await exists(scriptsPath))) await mkdir(scriptsPath, { recursive: true });

    if (!(await exists(monacoPath))) {
      const zipPath = await join(potassiumPath, "monaco.zip");
      const tempPath = await join(potassiumPath, "monaco_temp");
      await Command.create("curl", ["-L", "https://github.com/FearIsTheBest/PotassiumMonaco/archive/refs/heads/main.zip", "-o", zipPath]).execute();
      await Command.create("unzip", ["-o", zipPath, "-d", tempPath]).execute();
      await Command.create("mv", [await join(tempPath, "PotassiumMonaco-main"), monacoPath]).execute();
      await Command.create("rm", ["-rf", tempPath]).execute();
      await Command.create("rm", ["-f", zipPath]).execute();
    }

    const monacoIndex = await join(monacoPath, "index.html");
    const baseUrl = convertFileSrc(monacoPath) + "/";
    const html = await readTextFile(monacoIndex);
    const injected = html.replace("<head>", `<head><base href="${baseUrl}">`);
    const blob = new Blob([injected], { type: "text/html" });
    setMonacoSrc(URL.createObjectURL(blob));
  };

  const loadScripts = async () => {
    try {
      const docPath = await documentDir();
      const scriptsPath = await join(docPath, "Potassium", "Scripts");
      const entries = await readDir(scriptsPath).catch(() => []);
      const scriptFiles = await Promise.all(
        entries
          .filter(e => e.name && /\.(lua|txt)$/i.test(e.name))
          .map(async (e) => {
            const filePath = await join(scriptsPath, e.name!);
            try { return { name: e.name!, path: filePath, content: await readTextFile(filePath) }; }
            catch { return null; }
          })
      );
      setFiles(scriptFiles.filter(Boolean) as { name: string; path: string; content: string }[]);
    } catch (err) { console.error("loadScripts error:", err); }
  };

  const handleFileClick = (file: { name: string; path: string; content: string }) => {
    setActiveFile(file.name);
    setTabs(prev => prev.map(t => t.id === activeTabIdRef.current ? { ...t, name: file.name, content: file.content, path: file.path } : t));
    sendToTab(activeTabIdRef.current, { type: "setText", content: file.content });
  };

  const handleOpen = async () => {
    const path = await open({ filters: [{ name: "Scripts", extensions: ["lua", "txt"] }], multiple: false });
    if (!path) return;
    const content = await readTextFile(path as string);
    const name = (path as string).split("/").pop()!;
    setFiles(prev => prev.find(f => f.name === name) ? prev : [...prev, { name, path: path as string, content }]);
    const id = Date.now().toString();
    pendingContent.current[id] = content;
    setTabs(prev => [...prev, { id, name, content, path: path as string }]);
    syncActiveTabId(id);
    setActiveFile(name);
  };

  const handleClear = () => {
    sendToActive({ type: "setText", content: "" });
  };

  const handleSave = async () => {
    const currentTab = tabs.find(t => t.id === activeTabIdRef.current);
    if (!currentTab) return;

    const filePath = await save({
      filters: [{ name: "Scripts", extensions: ["lua", "txt"] }],
      defaultPath: currentTab.name !== "Untitled Tab" ? currentTab.name : "script.lua",
    });

    if (!filePath) return;
    await writeTextFile(filePath, currentTab.content);

    const name = filePath.split("/").pop()!;
    setTabs(prev => prev.map(t =>
      t.id === activeTabIdRef.current ? { ...t, name, path: filePath } : t
    ));
  };

  const fetchScriptHubScripts = async (query: string) => {
    setScriptHubLoading(true);
    try {
      const url = query.trim()
        ? `https://scriptblox.com/api/script/search?q=${encodeURIComponent(query)}&max=20`
        : `https://scriptblox.com/api/script/fetch?max=20`;
      const res = await fetch(url);
      const data: ScriptApiResponse = await res.json();
      setScriptHubScripts(data.result?.scripts ?? []);
    } catch (err) {
      console.error("ScriptBlox fetch error:", err);
      setScriptHubScripts([]);
    } finally {
      setScriptHubLoading(false);
    }
  };

  const addTab = () => {
    const id = Date.now().toString();
    pendingContent.current[id] = DEFAULT_CONTENT;
    setTabs(prev => [...prev, { id, name: "Untitled Tab", content: DEFAULT_CONTENT, path: null }]);
    syncActiveTabId(id);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== id);
      if (remaining.length === 0) return prev;
      if (activeTabIdRef.current === id) syncActiveTabId(remaining[remaining.length - 1].id);
      return remaining;
    });
    delete iframeRefs.current[id];
    readyTabs.current.delete(id);
  };

  const filteredFiles = files
    .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice()
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const CheckBox = ({ value, onToggle }: { value: boolean; onToggle: () => void }) => (
    <div className="checkbox-box" onClick={onToggle} style={{ backgroundColor: value ? "#92dafc" : "#262626" }}>
      {value && <Icon icon="mingcute:check-fill" width="22" height="22" style={{ color: "#000000" }} />}
    </div>
  );

  return (
    <div className="app">
      <div className="topbar" data-tauri-drag-region>
        <span className="topbar__logo">Potassium</span>
        <div className="topbar__tabs">
          <button className={`tab ${activeTab === "Editor" ? "tab--active" : ""}`} onClick={() => setActiveTab("Editor")}>
            <Icon icon="ri:brackets-fill" width="26" height="26" />
          </button>
          <button className={`tab ${activeTab === "Settings" ? "tab--active" : ""}`} onClick={() => setActiveTab("Settings")}>
            <Icon icon="mdi:wrench-outline" width="20" height="20" />
          </button>
          <button className={`tab ${activeTab === "ScriptHub" ? "tab--active" : ""}`} onClick={() => setActiveTab("ScriptHub")}>
            <Icon icon="famicons:earth" width="20" height="20" />
          </button>
        </div>
        <div className="topbar__win-controls">
          <button className="win-btn" onClick={() => appWindow.minimize()}>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M18 12.5H6V11.5H18V12.5Z" fill="currentColor" fillRule="evenodd" />
            </svg>
          </button>

        <button className="win-btn" onClick={async () => {
          if (await appWindow.isMaximized()) {
            appWindow.unmaximize();
          } else {
            appWindow.maximize();
          }
        }}>
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="6" y="6" width="11" height="11" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>

          <button className="win-btn win-btn--close" onClick={() => appWindow.close()}>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="editor-area" style={{ display: activeTab === "Editor" ? "flex" : "none" }}>
        <div className="editor-left">
          <div className="editor-main">
            <div className="tab-bar">
              <div className="tab-bar__scroll" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}>
                {tabs.map((tab, index) => (
                  <div
                    key={tab.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("tabIndex", String(index)); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = Number(e.dataTransfer.getData("tabIndex"));
                      if (from === index) return;
                      setTabs(prev => {
                        const u = [...prev];
                        const [m] = u.splice(from, 1);
                        u.splice(index, 0, m);
                        return u;
                      });
                    }}
                    className={`editor-tab ${activeTabId === tab.id ? "editor-tab--active" : ""}`}
                    onClick={() => syncActiveTabId(tab.id)}
                  >
                    <Icon icon="fa-solid:quote-left" width="14" height="14" />
                    <span>{tab.name}</span>
                    <button className="editor-tab__close" onClick={(e) => closeTab(tab.id, e)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
                        <rect width="20" height="20" fill="none" />
                        <path fill="currentColor" d="m12 13.4l-4.9 4.9q-.275.275-.7.275t-.7-.275t-.275-.7t.275-.7l4.9-4.9l-4.9-4.9q-.275-.275-.275-.7t.275-.7t.7-.275t.7.275l4.9 4.9l4.9-4.9q.275-.275.7-.275t.7.275t.275.7t-.275.7L13.4 12l4.9 4.9q.275.275.275.7t-.275.7t-.7.275t-.7-.275z" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button className="tab-bar__add" onClick={addTab}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                    <rect width="24" height="24" fill="none" />
                    <path fill="currentColor" d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="monaco-container">
              {monacoSrc ? (
                tabs.map(tab => (
                  <iframe
                    key={tab.id}
                    ref={el => { iframeRefs.current[tab.id] = el; }}
                    src={monacoSrc}
                    style={{ width: "100%", height: "100%", border: "none", display: activeTabId === tab.id ? "block" : "none" }}
                    onLoad={() => {
                      setTimeout(() => {
                        if (!readyTabs.current.has(tab.id)) {
                          readyTabs.current.add(tab.id);
                          const content = pendingContent.current[tab.id] ?? DEFAULT_CONTENT;
                          sendToTab(tab.id, { type: "setText", content });
                          delete pendingContent.current[tab.id];
                        }
                      }, 1000);
                    }}
                  />
                ))
              ) : (
                <div style={{ color: "#555", padding: "20px", fontSize: "13px" }}> </div>
              )}
            </div>
          </div>

          <div className="toolbar">
            <div className="left-buttons">
              <button className="btn" onClick={handleExecute} disabled={!attached}>
                <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.6" /><polygon points="6.5,5.5 11,8 6.5,10.5" fill="currentColor" /></svg>
                Execute
              </button>
              <button className="btn" onClick={handleClear}>
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="m16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.01 4.01 0 0 1-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0M4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53l-4.95-4.95z" /></svg>
                Clear
              </button>
              <button className="btn" onClick={handleOpen}>
                <svg viewBox="0 0 16 16" fill="none"><rect x="5" y="1.5" width="8" height="10" rx="1" stroke="currentColor" strokeWidth="1.6" /><path d="M3 4.5 H2.5 C1.9 4.5 1.5 4.9 1.5 5.5 V13.5 C1.5 14.1 1.9 14.5 2.5 14.5 H9.5 C10.1 14.5 10.5 14.1 10.5 13.5 V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                Open
              </button>
              <button className="btn btn--wide" onClick={handleSave}>
                <svg xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H9.5a1 1 0 0 0-1 1v7.293l2.646-2.647a.5.5 0 0 1 .708.708l-3.5 3.5a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L7.5 9.293V2a2 2 0 0 1 2-2H14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h2.5a.5.5 0 0 1 0 1z" /></svg>
                Save
              </button>
            </div>
            <div className="right-buttons">
              <button className="btn btn--wide" onClick={handleAttach} disabled={attachLoading}>
                <Icon icon="streamline:wifi-antenna-remix" width="22" height="22" />
                {attachLoading ? "Attaching..." : attached ? "Detach" : "Attach"}
              </button>
            </div>
          </div>
        </div>

        <div className="file-sidebar-wrapper">
          <div className="file-sidebar__search">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">
              <path fill="#7c7c7c" d="M9.5 16q-2.725 0-4.612-1.888T3 9.5t1.888-4.612T9.5 3t4.613 1.888T16 9.5q0 1.1-.35 2.075T14.7 13.3l5.6 5.6q.275.275.275.7t-.275.7t-.7.275t-.7-.275l-5.6-5.6q-.75.6-1.725.95T9.5 16m0-2q1.875 0 3.188-1.312T14 9.5t-1.312-3.187T9.5 5T6.313 6.313T5 9.5t1.313 3.188T9.5 14" strokeWidth="0.5" />
            </svg>
            <input className="file-sidebar__search-input" onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="file-sidebar">
            <div className="file-sidebar__list">
              {filteredFiles.map((file) => (
                <button
                  key={file.name}
                  className={`file-item ${activeFile === file.name ? "file-item--active" : ""}`}
                  onClick={() => handleFileClick(file)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#5974ba" d="M13 9V3.5L18.5 9M6 2c-1.11 0-2 .89-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" strokeWidth="0.5" stroke="#5974ba" />
                  </svg>
                  <span className="file-item__name">{file.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {activeTab === "Settings" && (
        <div className="settings-area">
          <div className="description-bar">
            <Icon icon="mingcute:code-line" width="18" height="18" />
            <p>Editor</p>
          </div>
          <div className="setting-row"><div className="setting-container"><p className="label">Mini Map</p><p className="description">Enables a mini map in the editor.</p></div><CheckBox value={miniMap} onToggle={toggleMiniMap} /></div>
          <div className="setting-row"><div className="setting-container"><p className="label">Smooth Cursor</p><p className="description">Enables smooth cursor movement.</p></div><CheckBox value={smoothCursor} onToggle={toggleSmoothCursor} /></div>
          <div className="setting-row"><div className="setting-container"><p className="label">Smooth Scrolling</p><p className="description">Enables smooth scrolling in the editor.</p></div><CheckBox value={smoothScrolling} onToggle={toggleSmoothScrolling} /></div>
          <div className="setting-row"><div className="setting-container"><p className="label">Editor Folding</p><p className="description">Enables folding in the editor.</p></div><CheckBox value={editorFolding} onToggle={toggleEditorFolding} /></div>
          <div className="setting-row"><div className="setting-container"><p className="label">Font Ligatures</p><p className="description">Enables whether font ligatures will be rendered.</p></div><CheckBox value={fontLigatures} onToggle={toggleFontLigatures} /></div>
          <div className="setting-row"><div className="setting-container"><p className="label">Word Wrap</p><p className="description">Wraps off-screen lines when enabled.</p></div><CheckBox value={wordWrap} onToggle={toggleWordWrap} /></div>

          <div className="description-bar">
            <Icon icon="iconamoon:settings-fill" width="18" height="18" />
            <p>Settings</p>
          </div>
          <div className="setting-row"><div className="setting-container"><p className="label">Always on top</p><p className="description">Keeps the app on top.</p></div><CheckBox value={alwaysOnTop} onToggle={toggleAlwaysOnTop} /></div>
          <div className="setting-row"><div className="setting-container"><p className="label">Auto attach</p><p className="description">Automatically attach to instances.</p></div><CheckBox value={autoAttach} onToggle={toggleAutoAttach} /></div>
        </div>
      )}

      <div className="script-row">
        {activeTab === "ScriptHub" && (
        <div className="scriptHub-area">
          <div className="scriptHub-search">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">
              <path fill="#7c7c7c" d="M9.5 16q-2.725 0-4.612-1.888T3 9.5t1.888-4.612T9.5 3t4.613 1.888T16 9.5q0 1.1-.35 2.075T14.7 13.3l5.6 5.6q.275.275.275.7t-.275.7t-.7.275t-.7-.275l-5.6-5.6q-.75.6-1.725.95T9.5 16m0-2q1.875 0 3.188-1.312T14 9.5t-1.312-3.187T9.5 5T6.313 6.313T5 9.5t1.313 3.188T9.5 14" strokeWidth="0.5" />
            </svg>
            <input
              className="scriptHub-search-input"
              value={scriptHubSearch}
              onChange={(e) => setScriptHubSearch(e.target.value)}
            />
          </div>

          <div className="script-row">
            {scriptHubLoading ? (
              <div style={{ color: "#555", padding: "20px", fontSize: "13px" }}>Loading scripts...</div>
            ) : scriptHubScripts.length === 0 ? (
              <div style={{ color: "#555", padding: "20px", fontSize: "13px" }}>No scripts found.</div>
            ) : (
              scriptHubScripts.map((script) => (
                <div className="script-card" key={script._id}>
                  <div className="script-image-wrapper">
                    <img
                      src={
                        script.game?.imageUrl
                          ? script.game.imageUrl.startsWith("http")
                            ? script.game.imageUrl
                            : `https://scriptblox.com${script.game.imageUrl}`
                          : script.image
                          ? script.image.startsWith("http")
                            ? script.image
                            : `https://scriptblox.com${script.image}`
                          : "https://via.placeholder.com/300x150"
                      }
                      alt={script.title}
                      className="script-image"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://via.placeholder.com/300x150";
                      }}
                    />
                  </div>

                  <div className="script-info">
                    <h3 className="script-title">{script.title}</h3>
                    <p className="script-sub">
                      {script.isUniversal
                        ? "🌐 Universal Script"
                        : script.game?.name
                        ? `🎮 ${script.game.name}`
                        : script.slug}
                    </p>
                  </div>
                  <div className="script-actions">
                    <button
                      className="execute-btn"
                      disabled={!script.script}
                      title={!script.script ? "Script content unavailable" : "Execute"}
                    >
                      Execute
                    </button>
                    <button
                      className="copy-btn"
                      disabled={!script.script}
                      onClick={() => script.script && sendToTab(activeTabIdRef.current, { type: "setText", content: script.script })}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 48 48">
                        <rect width="48" height="48" fill="none"/><path fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M28 6h14v14m0 9.474V39a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h9m7.8 16.2L41.1 6.9"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}