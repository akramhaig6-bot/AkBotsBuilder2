import React, { useState, useEffect, useRef } from 'react';
import { BotConfig } from './types/bot';
import { api } from './services/api';
import { Navbar } from './components/Navbar';
import { BotList } from './components/BotList';
import { BotEditor } from './components/BotEditor';
import { JsonQuickDeploySection } from './components/JsonQuickDeploySection';
import { ScanTelegramSection } from './components/ScanTelegramSection';
import { AlertCircle } from 'lucide-react';

export default function App() {
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [currentBotId, setCurrentBotId] = useState<string | null>(null);
  const [isJsonSectionOpen, setIsJsonSectionOpen] = useState(false);
  const [isScanSectionOpen, setIsScanSectionOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('start');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('telecraft_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const updateSeqRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('telecraft_theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  // Load bots on mount
  const loadBots = async () => {
    try {
      setIsLoading(true);
      setGlobalError(null);
      const data = await api.getBots();
      setBots(data);

      // If we had a selected bot, ensure it's up to date
      if (currentBotId) {
        const found = data.find((b) => b.id === currentBotId);
        if (!found && data.length > 0) {
          setCurrentBotId(null);
        }
      }
    } catch (err: any) {
      setGlobalError(err.message || 'حدث خطأ أثناء تحميل البوتات');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBots();
  }, []);

  // Poll connection status for selected bot
  useEffect(() => {
    if (!currentBotId) return;

    const interval = setInterval(async () => {
      try {
        const status = await api.getBotStatus(currentBotId);
        setBots((prev) =>
          prev.map((b) => {
            if (b.id === currentBotId) {
              return {
                ...b,
                isConnected: status.isConnected,
                connectionError: status.isConnected
                  ? null
                  : status.lastError || b.connectionError || null,
                botUsername: status.botUsername || b.botUsername,
              };
            }
            return b;
          })
        );
      } catch (e) {
        // quiet background poll
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [currentBotId]);

  const handleCreateNewBot = async () => {
    try {
      setIsLoading(true);
      const newBot = await api.createBot();
      setBots((prev) => [...prev, newBot]);
      setIsJsonSectionOpen(false);
      setIsScanSectionOpen(false);
      setCurrentBotId(newBot.id);
      setActiveTab('start');
    } catch (err: any) {
      setGlobalError(err.message || 'فشل إنشاء بوت جديد');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectBot = (bot: BotConfig) => {
    setIsJsonSectionOpen(false);
    setIsScanSectionOpen(false);
    setCurrentBotId(bot.id);
    setActiveTab('start');
  };

  const handleBackToList = () => {
    setCurrentBotId(null);
    setIsJsonSectionOpen(false);
    setIsScanSectionOpen(false);
    loadBots();
  };

  const handleOpenJsonSection = () => {
    setCurrentBotId(null);
    setIsScanSectionOpen(false);
    setIsJsonSectionOpen(true);
  };

  const handleOpenScanSection = () => {
    setCurrentBotId(null);
    setIsJsonSectionOpen(false);
    setIsScanSectionOpen(true);
  };

  const handleJsonBotCreated = (createdBot: BotConfig, openInEditor: boolean = false) => {
    setBots((prev) => {
      const exists = prev.some((b) => b.id === createdBot.id);
      return exists
        ? prev.map((b) => (b.id === createdBot.id ? createdBot : b))
        : [...prev, createdBot];
    });
    if (openInEditor) {
      setIsJsonSectionOpen(false);
      setIsScanSectionOpen(false);
      setCurrentBotId(createdBot.id);
      setActiveTab('start');
    }
  };

  const handleDeleteBot = async (botId: string) => {
    await api.deleteBot(botId);
    setBots((prev) => prev.filter((b) => b.id !== botId));
    if (currentBotId === botId) {
      setCurrentBotId(null);
    }
  };

  const handleUpdateBot = async (updates: Partial<BotConfig>) => {
    if (!currentBotId) return;
    const targetId = currentBotId;
    const seq = (updateSeqRef.current[targetId] || 0) + 1;
    updateSeqRef.current[targetId] = seq;

    const previousBot = bots.find((b) => b.id === targetId);
    setBots((prev) =>
      prev.map((b) => (b.id === targetId ? { ...b, ...updates } : b))
    );
    try {
      const updated = await api.updateBot(targetId, updates);
      if (updateSeqRef.current[targetId] === seq) {
        setBots((prev) => prev.map((b) => (b.id === targetId ? updated : b)));
      }
    } catch (err) {
      if (previousBot && updateSeqRef.current[targetId] === seq) {
        setBots((prev) =>
          prev.map((b) => (b.id === targetId ? previousBot : b))
        );
      }
      throw err;
    }
  };

  const handleRefreshBot = async () => {
    if (!currentBotId) return;
    const refreshed = await api.getBot(currentBotId);
    setBots((prev) => prev.map((b) => (b.id === currentBotId ? refreshed : b)));
  };

  const currentBot = bots.find((b) => b.id === currentBotId) || null;

  return (
    <div className="min-h-screen bg-[#F2F7FC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased selection:bg-sky-600 selection:text-white transition-colors duration-200" dir="rtl">
      {/* Universal Top Bar */}
      <Navbar
        currentBot={currentBot}
        bots={bots}
        onSelectBot={handleSelectBot}
        onBackToList={handleBackToList}
        onCreateNewBot={handleCreateNewBot}
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        isJsonSectionOpen={isJsonSectionOpen}
        onOpenJsonSection={handleOpenJsonSection}
        isScanSectionOpen={isScanSectionOpen}
        onOpenScanSection={handleOpenScanSection}
        theme={theme}
        onChangeTheme={setTheme}
      />

      {/* Global Error Banner */}
      {globalError && (
        <div className="w-full max-w-7xl mx-auto px-4 mt-4">
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
              <span>{globalError}</span>
            </div>
            <button
              onClick={() => setGlobalError(null)}
              className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {currentBot ? (
          <BotEditor
            key={currentBot.id}
            bot={currentBot}
            onUpdateBot={handleUpdateBot}
            onRefreshBot={handleRefreshBot}
            onBackToList={handleBackToList}
            activeTab={activeTab}
            onSelectTab={(tab) => setActiveTab(tab)}
          />
        ) : isScanSectionOpen ? (
          <ScanTelegramSection
            onBackToList={handleBackToList}
            onBotCreated={handleJsonBotCreated}
          />
        ) : isJsonSectionOpen ? (
          <JsonQuickDeploySection
            existingBots={bots}
            onBackToList={handleBackToList}
            onBotCreated={handleJsonBotCreated}
          />
        ) : (
          <BotList
            bots={bots}
            isLoading={isLoading}
            onSelectBot={handleSelectBot}
            onCreateBot={handleCreateNewBot}
            onDeleteBot={handleDeleteBot}
            onOpenJsonSection={handleOpenJsonSection}
            onOpenScanSection={handleOpenScanSection}
          />
        )}
      </main>
    </div>
  );
}
