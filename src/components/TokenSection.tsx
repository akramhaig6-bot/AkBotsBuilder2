import React, { useState, useEffect } from 'react';
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
  PowerOff,
  AlertTriangle,
  Send,
  HelpCircle,
  Zap,
} from 'lucide-react';
import { BotConfig } from '../types/bot';
import { api } from '../services/api';
import { sanitizeBotToken, validateBotToken } from '../utils/telegramFormatters';

interface TokenSectionProps {
  bot: BotConfig;
  onUpdateBot: (updates: Partial<BotConfig>) => Promise<void>;
  onRefreshBot: () => Promise<void>;
}

export const TokenSection: React.FC<TokenSectionProps> = ({
  bot,
  onUpdateBot,
  onRefreshBot,
}) => {
  const [tokenInput, setTokenInput] = useState(bot.token || '');
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(bot.connectionError || null);

  useEffect(() => {
    setTokenInput(bot.token || '');
  }, [bot.id, bot.token]);

  useEffect(() => {
    if (bot.isConnected) {
      setErrorMessage(null);
    } else if (bot.connectionError) {
      setErrorMessage(bot.connectionError);
    }
  }, [bot.isConnected, bot.connectionError]);

  const handleConnect = async () => {
    setSuccessMessage(null);
    setErrorMessage(null);

    const validation = validateBotToken(tokenInput);
    if (!validation.isValid) {
      setErrorMessage(validation.error || 'الرجاء إدخال توكن صالح');
      return;
    }

    const cleanToken = validation.sanitizedToken || sanitizeBotToken(tokenInput);
    setTokenInput(cleanToken);

    try {
      setIsLoading(true);
      const res = await api.connectBot(bot.id, cleanToken);
      setSuccessMessage(res.message);
      await onRefreshBot();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل الاتصال بخوادم تيليجرام، تحقق من صحة التوكن');
      await onRefreshBot().catch(() => {});
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setIsLoading(true);
      setSuccessMessage(null);
      setErrorMessage(null);
      await api.disconnectBot(bot.id);
      await onRefreshBot();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل فصل البوت');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-sky-100 dark:border-slate-800/80 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              إدخال توكن البوت والربط المباشر
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              ربط البوت الفعلي بتيليجرام ليتم تطبيق رسائل البداية والأزرار والتدفقات فورياً
            </p>
          </div>
        </div>

        {/* Live Status Badge */}
        {bot.isConnected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            متصل بنجاح ويعمل الآن
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
            <XCircle className="w-3.5 h-3.5" />
            غير متصل
          </span>
        )}
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Connection Info Card if connected */}
      {bot.isConnected && bot.botUsername && (
        <div className="mb-6 p-4 rounded-xl bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-sky-100 dark:bg-sky-600/20 border border-sky-300 dark:border-sky-500/30 flex items-center justify-center text-sky-700 dark:text-sky-400 font-bold text-lg">
              {bot.botFirstName?.substring(0, 1) || 'B'}
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {bot.botFirstName || 'بوت تيليجرام'}
              </h4>
              <p className="text-xs text-sky-600 dark:text-sky-400 font-mono direction-ltr text-right">
                @{bot.botUsername}
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                خادم Polling يعمل في الخلفية ويستمع لرسائل /start والضغط على الأزرار
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={async () => {
                try {
                  setIsLoading(true);
                  await api.syncBot(bot.id);
                  await onRefreshBot();
                  setSuccessMessage('تمت مزامنة البوت بنجاح مع تيليجرام وتحديث كافة الأزرار والتدفقات!');
                } catch (e: any) {
                  setErrorMessage(e.message || 'فشلت المزامنة مع تيليجرام');
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-sky-700 dark:text-sky-400 hover:text-white bg-white dark:bg-slate-800 hover:bg-sky-600 rounded-xl transition-all cursor-pointer border border-sky-200 dark:border-slate-700"
              title="مزامنة فورية وتحديث الأوامر والأزرار في تيليجرام"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>مزامنة تيليجرام ⚡</span>
            </button>

            <a
              href={`https://t.me/${bot.botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <span>فتح البوت في تيليجرام</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isLoading}
              title="فصل البوت"
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl border border-sky-200 dark:border-slate-800 transition-colors cursor-pointer"
            >
              <PowerOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Token Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleConnect();
        }}
        className="space-y-4"
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="bot-token-input"
              className="block text-xs font-medium text-slate-800 dark:text-slate-200"
            >
              أدخل توكن البوت (Telegram Bot Token)
            </label>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              يتم جلبه من @BotFather
            </span>
          </div>

          <div className="relative">
            <input
              id="bot-token-input"
              type={showToken ? 'text' : 'password'}
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
              className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-700/80 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-hidden focus:border-sky-500 pl-10 direction-ltr text-left"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              aria-label={showToken ? 'إخفاء التوكن' : 'إظهار التوكن'}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer p-1"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
          <p className="text-[11px] text-slate-500">
            * لن يتم تطبيق أو تشغيل البوت في تيليجرام إلا بعد التحقق من صحة التوكن.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري التحقق والربط...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{bot.isConnected ? 'تحديث والتحقق من التوكن' : 'ربط البوت'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Help Note on how to get token */}
      <div className="mt-6 pt-5 border-t border-sky-100 dark:border-slate-800/80">
          <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-[#F5F9FD] dark:bg-slate-950/40 p-3.5 rounded-xl border border-sky-200/75 dark:border-slate-800/50">
            <HelpCircle className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-1">
                كيف تحصل على توكن البوت من تيليجرام؟
              </span>
              <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                <li>افتح تطبيق تيليجرام وابحث عن الحساب الرسمي <strong className="text-sky-600 dark:text-sky-400 font-mono">@BotFather</strong></li>
                <li>أرسل الأمر <span className="font-mono text-sky-600 dark:text-sky-400">/newbot</span> واتبع التعليمات لاختيار اسم ويوزرنيم لبوتك.</li>
                <li>انسخ التوكن (HTTP API Token) والصقه في الحقل أعلاه واضغط على <strong>ربط البوت</strong>.</li>
              </ol>
            </div>
          </div>
        </div>
    </div>
  );
};
