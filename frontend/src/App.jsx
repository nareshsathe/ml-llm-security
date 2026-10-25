import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import ChatPage from "./pages/ChatPage";
import DashboardPage from "./pages/DashboardPage";
import Sidebar from "./components/Sidebar";
import useTheme from "./hooks/useTheme";
import useChatSessions from "./hooks/useChatSessions";
import { DomainProvider } from "./context/DomainContext";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const {
    sessions, activeId, messages,
    setMessages, autoTitle, newChat,
    selectSession, deleteSession, renameSession,
  } = useChatSessions();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = () => setSidebarOpen((v) => !v);

  return (
    <DomainProvider>
      <div className="flex h-screen bg-base overflow-hidden theme-transition">
        <Sidebar
        sessions={sessions}
        activeId={activeId}
        onNewChat={newChat}
        onSelect={(id) => { selectSession(id); setSidebarOpen(false); }}
        onDelete={deleteSession}
        onRename={renameSession}
        theme={theme}
        onToggleTheme={toggleTheme}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Routes>
          <Route
            path="/"
            element={
              <ChatPage
                key={activeId}
                messages={messages}
                setMessages={setMessages}
                autoTitle={autoTitle}
                sessionId={activeId}
                onSidebarToggle={toggleSidebar}
              />
            }
          />
          <Route
            path="/dashboard"
            element={
              <DashboardPage
                theme={theme}
                onSidebarToggle={toggleSidebar}
              />
            }
          />
        </Routes>
        </main>
      </div>
    </DomainProvider>
  );
}
