import React, { useState } from 'react';
import { Bot, Plus, Wifi, WifiOff, ChevronDown, Check, Sun, Moon } from 'lucide-react';
import { BotConfig } from '../types/bot';

interface NavbarProps {
  currentBot: BotConfig | null;
  bots?: BotConfig[];
  onSelectBot?: (bot: BotConfig) => void;
  onBackToList: () => void;
  onCreateNewBot: () => void;
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  isJsonSectionOpen?: boolean;
  onOpenJsonSection?: () => void;
  isScanSectionOpen?: boolean;
  onOpenScanSection?: () => void;
  theme?: 'light' | 'dark';
  onChangeTheme?: (theme: 'light' | 'dark') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentBot,
  bots = [],
  onSelectBot,
  onBackToList,
  onCreateNewBot,
  activeTab,
  onSelectTab,
  isJsonSectionOpen = false,
  onOpenJsonSection,
  isScanSectionOpen = false,
  onOpenScanSection,
  theme = 'light',
  onChangeTheme,
}) => {
  const [showBotDropdown, setShowBotDropdown] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full bg-white/92 dark:bg-slate-900/90 backdrop-blur-md border-b border-sky-200/80 dark:border-slate-800/80 shadow-[0_1px_12px_rgba(14,116,144,0.06)] dark:shadow-none px-3 sm:px-4 xl:px-6 py-3 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-3 xl:gap-5 transition-colors duration-200">
      {/* Zone 1: Brand wordmark (TeleCraft + Akram System) with Bot Switcher */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onBackToList}
          className="flex items-center gap-1.5 sm:gap-2 text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer group shrink-0"
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-lg bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 group-hover:scale-105 transition-transform shadow-xs">
            <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <span className="flex flex-col sm:flex-row sm:items-center leading-tight sm:gap-1.5 whitespace-nowrap">
            <span className="text-xs sm:text-sm xl:text-base font-bold tracking-tight">
              TeleCraft Studio
            </span>
            <span className={`${currentBot ? 'hidden xl:inline' : 'hidden sm:inline'} text-sky-300 dark:text-slate-600 font-normal`}>|</span>
            <span className={`${currentBot ? 'hidden xl:inline' : 'inline'} text-[10px] sm:text-xs xl:text-sm font-bold tracking-tight text-sky-600 dark:text-sky-400`}>
              Akram System
            </span>
          </span>
        </button>

        {currentBot && (
          <div className="relative hidden sm:flex items-center gap-1.5 sm:gap-2 pr-2.5 sm:pr-3 border-r border-sky-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 min-w-0 shrink-0">
            <button
              onClick={onBackToList}
              className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>البوتات</span>
            </button>
            <span className="text-sky-300 dark:text-slate-600 shrink-0">/</span>

            {/* Quick Bot Switcher Dropdown */}
            {bots.length > 1 && onSelectBot ? (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowBotDropdown(!showBotDropdown)}
                  className="flex items-center gap-1 text-slate-800 dark:text-slate-200 font-semibold hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-sky-50 dark:hover:bg-slate-800"
                >
                  <span className="truncate max-w-[96px] xl:max-w-[130px]">{currentBot.name}</span>
                  <ChevronDown className="w-3 h-3 shrink-0 text-slate-500 dark:text-slate-400" />
                </button>

                {showBotDropdown && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-xl shadow-xl dark:shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 text-[10px] text-slate-500 font-semibold border-b border-sky-100 dark:border-slate-800">
                      التبديل بين البوتات ({bots.length}):
                    </div>
                    {bots.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          onSelectBot(b);
                          setShowBotDropdown(false);
                        }}
                        className="w-full text-right px-3 py-2 text-xs flex items-center justify-between hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <span className="truncate text-slate-800 dark:text-slate-200">{b.name}</span>
                        {b.id === currentBot.id && <Check className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-slate-800 dark:text-slate-200 font-medium truncate max-w-[110px] xl:max-w-[140px]">
                {currentBot.name}
              </span>
            )}

            {currentBot.isConnected ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20 whitespace-nowrap shrink-0">
                <Wifi className="w-3 h-3" />
                متصل
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700/40 whitespace-nowrap shrink-0">
                <WifiOff className="w-3 h-3" />
                غير متصل
              </span>
            )}
          </div>
        )}
      </div>

      {/* Zone 2: concise single-line nav tabs if inside bot editor, or home navigation */}
      <nav className="hidden lg:flex items-center gap-3 xl:gap-5 text-xs xl:text-[13px] font-medium text-slate-600 dark:text-slate-400 shrink-0">
        {currentBot ? (
          <>
            <button
              onClick={() => onSelectTab && onSelectTab('start')}
              className={`whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'start'
                  ? 'text-sky-600 dark:text-sky-400 font-semibold'
                  : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              رسالة البداية
            </button>
            <button
              onClick={() => onSelectTab && onSelectTab('buttons')}
              className={`whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'buttons' || activeTab === 'flow'
                  ? 'text-sky-600 dark:text-sky-400 font-semibold'
                  : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              الأزرار والتدفقات
            </button>
            <button
              onClick={() => onSelectTab && onSelectTab('token')}
              className={`whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'token'
                  ? 'text-sky-600 dark:text-sky-400 font-semibold'
                  : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              التوكن والربط
            </button>
            <button
              onClick={() => onSelectTab && onSelectTab('bot_settings')}
              className={`whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'bot_settings'
                  ? 'text-sky-600 dark:text-sky-400 font-semibold'
                  : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              إعدادات API
            </button>
            <button
              onClick={() => onSelectTab && onSelectTab('simulator')}
              className={`whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'simulator'
                  ? 'text-sky-600 dark:text-sky-400 font-semibold'
                  : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              المحاكي المباشر
            </button>
          </>
        ) : onOpenJsonSection ? (
          <>
            <button
              type="button"
              onClick={onBackToList}
              className={`whitespace-nowrap transition-colors cursor-pointer ${
                !isJsonSectionOpen && !isScanSectionOpen
                  ? 'text-sky-600 dark:text-sky-400 font-semibold'
                  : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              إدارة البوتات
            </button>
            <button
              type="button"
              onClick={onOpenJsonSection}
              className={`whitespace-nowrap transition-colors cursor-pointer ${
                isJsonSectionOpen
                  ? 'text-sky-600 dark:text-sky-400 font-semibold'
                  : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              قسم التفعيل بكود JSON
            </button>
            {onOpenScanSection && (
              <button
                type="button"
                onClick={onOpenScanSection}
                className={`whitespace-nowrap transition-colors cursor-pointer font-mono ${
                  isScanSectionOpen
                    ? 'text-sky-600 dark:text-sky-400 font-semibold'
                    : 'hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                scan Telegram
              </button>
            )}
          </>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            لوحة ويب مرئية لإعداد وتدفقات أزرار تيليجرام التفاعلية
          </span>
        )}
      </nav>

      {/* Zone 3: Day/Night theme switcher + primary action */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {onChangeTheme && (
          <div
            className="inline-flex items-center p-0.5 rounded-lg bg-sky-50 dark:bg-slate-800/90 border border-sky-200/90 dark:border-slate-700/70 shadow-xs"
            role="group"
            aria-label="التبديل بين الوضع النهاري والليلي"
          >
            <button
              type="button"
              onClick={() => onChangeTheme('light')}
              aria-label="الوضع النهاري"
              aria-pressed={theme === 'light'}
              title="الوضع النهاري (Arctic Blue Light)"
              className={`p-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center ${
                theme === 'light'
                  ? 'bg-white text-amber-500 shadow-xs ring-1 ring-sky-200/80'
                  : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChangeTheme('dark')}
              aria-label="الوضع الليلي"
              aria-pressed={theme === 'dark'}
              title="الوضع الليلي (Dark Mode)"
              className={`p-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center ${
                theme === 'dark'
                  ? 'bg-slate-900 text-sky-400 shadow-xs ring-1 ring-slate-700'
                  : 'text-slate-500 hover:text-sky-600'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {currentBot ? (
          <button
            onClick={onCreateNewBot}
            aria-label="إنشاء بوت آخر"
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-medium text-slate-700 dark:text-slate-200 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 hover:text-sky-800 dark:hover:text-white rounded-lg transition-colors border border-sky-200 dark:border-slate-700/60 whitespace-nowrap cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">إنشاء بوت آخر</span>
            <span className="sm:hidden">بوت جديد</span>
          </button>
        ) : (
          <button
            onClick={onCreateNewBot}
            aria-label="إنشاء بوت جديد"
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">إنشاء بوت جديد</span>
            <span className="sm:hidden">جديد</span>
          </button>
        )}
      </div>
    </header>
  );
};
