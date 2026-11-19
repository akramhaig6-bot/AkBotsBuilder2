import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Layers,
  Key,
  Smartphone,
  ChevronLeft,
  Edit2,
  Check,
  Bot,
  ExternalLink,
  Save,
  ArrowRight,
  Zap,
  Cpu,
  Download,
} from 'lucide-react';
import { BotButton, BotConfig } from '../types/bot';
import { api } from '../services/api';
import { downloadBotBackupFile } from '../utils/botBackupExport';
import { StartMessageSection } from './StartMessageSection';
import { ButtonsSection } from './ButtonsSection';
import { ButtonFlowEditor } from './ButtonFlowEditor';
import { TokenSection } from './TokenSection';
import { TelegramSimulator } from './TelegramSimulator';
import { BotSettingsSection } from './BotSettingsSection';

interface BotEditorProps {
  bot: BotConfig;
  onUpdateBot: (updates: Partial<BotConfig>) => Promise<void>;
  onRefreshBot: () => Promise<void>;
  onBackToList: () => void;
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
}

export const BotEditor: React.FC<BotEditorProps> = ({
  bot,
  onUpdateBot,
  onRefreshBot,
  onBackToList,
  activeTab = 'start',
  onSelectTab,
}) => {
  // Navigation & Sub-views with Breadcrumb Stack for infinite sub-flows
  const [internalTab, setInternalTab] = useState<'start' | 'buttons' | 'token' | 'bot_settings' | 'flow'>('start');
  const [flowStack, setFlowStack] = useState<BotButton[]>([]);

  // Bot Name Editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [botNameInput, setBotNameInput] = useState(bot.name);

  useEffect(() => {
    setBotNameInput(bot.name);
  }, [bot.id, bot.name]);

  // Sync & Export state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const currentTab = onSelectTab ? activeTab : internalTab;
  const setTab = (tab: any) => {
    if (onSelectTab) onSelectTab(tab);
    setInternalTab(tab);
  };

  const handleOpenFlow = (btn: BotButton) => {
    setFlowStack([btn]);
    setTab('flow');
  };

  const handleNavigateSubFlow = (subBtn: BotButton) => {
    setFlowStack((prev) => [...prev, subBtn]);
    setTab('flow');
  };

  const handleBackFromFlow = () => {
    if (flowStack.length > 1) {
      setFlowStack((prev) => prev.slice(0, prev.length - 1));
    } else {
      setFlowStack([]);
      setTab('buttons');
    }
  };

  const handleSelectStackIndex = (index: number) => {
    setFlowStack((prev) => prev.slice(0, index + 1));
  };

  const handleSaveBotName = async () => {
    const trimmed = botNameInput.trim();
    if (trimmed && trimmed !== bot.name) {
      await onUpdateBot({ name: trimmed });
    }
    setIsEditingName(false);
  };

  const currentFlowButton = flowStack.length > 0 ? flowStack[flowStack.length - 1] : null;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6" dir="rtl">
      {/* Bot Editor Sub-Header */}
      <div className="bg-white dark:bg-slate-900/70 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-4 md:p-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToList}
            className="p-2 shrink-0 rounded-xl bg-sky-50 dark:bg-slate-800/80 hover:bg-sky-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-sky-700 dark:hover:text-white transition-colors cursor-pointer border border-sky-200 dark:border-slate-700/60"
            title="الرجوع إلى صفحة إدارة البوتات"
          >
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="w-10 h-10 shrink-0 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 font-bold text-lg">
            <Bot className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label="اسم البوت"
                  value={botNameInput}
                  onChange={(e) => setBotNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSaveBotName();
                    } else if (e.key === 'Escape') {
                      setBotNameInput(bot.name);
                      setIsEditingName(false);
                    }
                  }}
                  className="bg-white dark:bg-slate-950 border border-sky-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-sky-500"
                  autoFocus
                />
                <button
                  type="button"
                  aria-label="حفظ اسم البوت"
                  onClick={handleSaveBotName}
                  className="p-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-500 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{bot.name}</h1>
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  title="تعديل اسم البوت"
                  aria-label="تعديل اسم البوت"
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
              {bot.isConnected && bot.botUsername ? (
                <>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                    متصل ومباشر مع تيليجرام
                  </span>
                  <a
                    href={`https://t.me/${bot.botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-medium text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 border border-sky-200 dark:border-sky-500/30 transition-all font-mono direction-ltr"
                    title="فتح البوت مباشرة في تطبيق تيليجرام لتجربته حياً"
                  >
                    <span>@{bot.botUsername}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              ) : bot.botUsername ? (
                <>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400" />
                    غير متصل
                  </span>
                  <a
                    href={`https://t.me/${bot.botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 transition-all font-mono direction-ltr"
                    title="فتح البوت في تيليجرام"
                  >
                    <span>@{bot.botUsername}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">لم يتم ربط التوكن بعد</span>
              )}
            </div>
          </div>
        </div>

        {/* Sync & Direct Actions */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {bot.isConnected && (
            <button
              type="button"
              onClick={async () => {
                try {
                  setIsSyncing(true);
                  setSyncSuccess(false);
                  await api.syncBot(bot.id);
                  await onRefreshBot();
                  setSyncSuccess(true);
                  setTimeout(() => setSyncSuccess(false), 3000);
                } catch (e) {
                  // silent error
                } finally {
                  setIsSyncing(false);
                }
              }}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                syncSuccess
                  ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                  : 'bg-sky-50 dark:bg-slate-800/80 hover:bg-sky-100 dark:hover:bg-slate-800 text-sky-700 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 border-sky-200 dark:border-slate-700/80 hover:border-sky-300 dark:hover:border-sky-500/40'
              }`}
              title="مزامنة فورية وتحديث الأزرار والقوائم في تيليجرام"
            >
              <Zap className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{syncSuccess ? 'تمت المزامنة بنجاح ✓' : isSyncing ? 'جاري المزامنة...' : 'مزامنة تيليجرام ⚡'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              downloadBotBackupFile(bot);
              setExportSuccess(true);
              setTimeout(() => setExportSuccess(false), 2500);
            }}
            aria-label="تصدير إعدادات البوت إلى ملف JSON"
            title="تصدير إعدادات البوت الحالية كملف JSON احتياطي محلي"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              exportSuccess
                ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                : 'bg-white dark:bg-slate-800/80 hover:bg-sky-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-sky-700 dark:hover:text-sky-300 border-sky-200 dark:border-slate-700/80'
            }`}
          >
            {exportSuccess ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{exportSuccess ? 'تم تصدير النسخة ✓' : 'تصدير JSON'}</span>
          </button>

          {bot.botUsername && (
            <a
              href={`https://t.me/${bot.botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <span>جرّب في تيليجرام</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-center max-w-full gap-1 p-1 bg-sky-50/90 dark:bg-slate-950/80 rounded-xl border border-sky-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              setFlowStack([]);
              setTab('start');
            }}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              currentTab === 'start'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>رسالة البداية</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFlowStack([]);
              setTab('buttons');
            }}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              currentTab === 'buttons' || currentTab === 'flow'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>أزرار تيليجرام</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFlowStack([]);
              setTab('token');
            }}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              currentTab === 'token'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>توكن البوت</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFlowStack([]);
              setTab('bot_settings');
            }}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              currentTab === 'bot_settings'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>إعدادات الـ API</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Responsive Workspace: Editor on Left, Simulator on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Editor Workspace Column (7 cols on lg) */}
        <div className="lg:col-span-7 min-w-0 space-y-6">
          {currentTab === 'flow' && currentFlowButton ? (
            <ButtonFlowEditor
              bot={bot}
              targetButton={currentFlowButton}
              flowStack={flowStack}
              onBack={handleBackFromFlow}
              onUpdateBot={onUpdateBot}
              onNavigateSubFlow={handleNavigateSubFlow}
              onSelectStackIndex={handleSelectStackIndex}
            />
          ) : currentTab === 'start' ? (
            <StartMessageSection bot={bot} onUpdateBot={onUpdateBot} />
          ) : currentTab === 'buttons' ? (
            <ButtonsSection
              bot={bot}
              onUpdateBot={onUpdateBot}
              onOpenFlow={handleOpenFlow}
            />
          ) : currentTab === 'token' ? (
            <TokenSection
              bot={bot}
              onUpdateBot={onUpdateBot}
              onRefreshBot={onRefreshBot}
            />
          ) : currentTab === 'bot_settings' ? (
            <BotSettingsSection
              bot={bot}
              onUpdateBot={onUpdateBot}
              onRefreshBot={onRefreshBot}
            />
          ) : (
            <StartMessageSection bot={bot} onUpdateBot={onUpdateBot} />
          )}
        </div>

        {/* Telegram Simulator Column (5 cols on lg, sticky on desktop) */}
        <div className="lg:col-span-5 min-w-0 lg:sticky lg:top-20">
          <TelegramSimulator
            bot={bot}
            onSelectButtonToEdit={(btn) => handleOpenFlow(btn)}
            onUpdateBot={onUpdateBot}
          />
        </div>
      </div>
    </div>
  );
};
