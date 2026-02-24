import { useState } from "react";
import "./App.scss";

type TabId = "code" | "settings" | "globe";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("code");

  return (
    <div className="app">
      {/* TOPBAR */}
      <div className="topbar" data-tauri-drag-region>
        <span className="topbar__logo">Potassium</span>

        <div className="topbar__tabs">
          <button className={`tab ${activeTab === "code" ? "tab--active" : ""}`} onClick={() => setActiveTab("code")} title="Code">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M5 3 L2 8 L5 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M11 3 L14 8 L11 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {activeTab === "code" && <span className="tab__underline" />}
          </button>

          <button className={`tab ${activeTab === "settings" ? "tab--active" : ""}`} onClick={() => setActiveTab("settings")} title="Settings">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M10.2 2.3C8.5 1.7 6.5 2.8 6.3 4.6C6.2 5.2 6.4 5.8 6.7 6.3L2.4 10.6C1.9 11.1 1.9 11.9 2.4 12.4L3.1 13.1C3.6 13.6 4.4 13.6 4.9 13.1L9.2 8.8C9.7 9.1 10.3 9.3 11 9.2C12.8 9 13.9 7 13.3 5.3L11.5 7.1L9.4 5L10.2 2.3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
            </svg>
            {activeTab === "settings" && <span className="tab__underline" />}
          </button>

          <button className={`tab ${activeTab === "globe" ? "tab--active" : ""}`} onClick={() => setActiveTab("globe")} title="Network">
            <svg viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M8 2.5 C6.5 4.5 6.5 11.5 8 13.5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M8 2.5 C9.5 4.5 9.5 11.5 8 13.5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M2.5 8 H13.5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M3 5.5 H13" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M3 10.5 H13" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
            {activeTab === "globe" && <span className="tab__underline" />}
          </button>
        </div>

        <div className="topbar__win-controls">
          <button className="win-btn" title="Minimize">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M17 12H7V11H17V12Z" fill="currentColor" fillRule="evenodd"/>
            </svg>
          </button>
          <button className="win-btn" title="Maximize">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="7" y="7" width="10" height="10" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
          </button>
          <button className="win-btn win-btn--close" title="Close">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M17 7L7 17M7 7L17 17" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="content">
        <button className="btn">
          <svg viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.6"/>
            <polygon points="6.5,5.5 11,8 6.5,10.5" fill="currentColor"/>
          </svg>
          Execute
        </button>
        <button className="btn btn--wide">
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M8 2 L14 8 L8 14 L2 8 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          </svg>
          Clear
        </button>
        <button className="btn btn--wide">
          <svg viewBox="0 0 16 16" fill="none">
            <rect x="5" y="1.5" width="8" height="10" rx="1" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M3 4.5 H2.5 C1.9 4.5 1.5 4.9 1.5 5.5 V13.5 C1.5 14.1 1.9 14.5 2.5 14.5 H9.5 C10.1 14.5 10.5 14.1 10.5 13.5 V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          Open
        </button>
        <button className="btn btn--wide">
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M8 2 L8 9 M5.5 6.5 L8 9.5 L10.5 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2.5 11 V13 C2.5 13.3 2.7 13.5 3 13.5 H13 C13.3 13.5 13.5 13.3 13.5 13 V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          Save
        </button>
      </div>
    </div>
  );
}