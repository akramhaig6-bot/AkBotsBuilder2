import React, { useState, useEffect, useMemo } from 'react';
import {
  Terminal,
  UserCircle2,
  Cpu,
  Plus,
  Trash2,
  Save,
  Zap,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  MessageCircleHeart,
  Search,
  Globe,
  Download,
} from 'lucide-react';
import {
  BotApiFeaturesConfig,
  BotCommandConfig,
  BotConfig,
  BotProfileConfig,
} from '../types/bot';
import { api } from '../services/api';
import { downloadBotBackupFile } from '../utils/botBackupExport';

interface BotSettingsSectionProps {
  bot: BotConfig;
  onUpdateBot: (updates: Partial<BotConfig>) => Promise<void>;
  onRefreshBot?: () => Promise<void>;
}

export const BotSettingsSection: React.FC<BotSettingsSectionProps> = ({
  bot,
  onUpdateBot,
  onRefreshBot,
}) => {
  const [commands, setCommands] = useState<BotCommandConfig[]>(bot.commands || []);
  const [newCmdName, setNewCmdName] = useState('');
  const [newCmdDesc, setNewCmdDesc] = useState('');
  const [newCmdTarget, setNewCmdTarget] = useState('main');

  const [profile, setProfile] = useState<BotProfileConfig>(
    bot.profile || { menuButtonType: 'default' }
  );
  const [apiFeatures, setApiFeatures] = useState<BotApiFeaturesConfig>(
    bot.apiFeatures || {}
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setCommands(bot.commands || []);
    setProfile(bot.profile || { menuButtonType: 'default' });
    setApiFeatures(bot.apiFeatures || {});
  }, [bot.id, bot.commands, bot.profile, bot.apiFeatures]);

  // Collect all valid flow targets across root buttons and nested buttonFlows
  const availableFlowTargets = useMemo(() => {
    const items: Array<{ id: string; label: string }> = [
      { id: 'main', label: 'القائمة الرئيسية (/start)' },
    ];
    const seen = new Set<string>(['main']);

    for (const btn of bot.inlineButtons || []) {
      if (!seen.has(btn.id)) {
        seen.add(btn.id);
        items.push({ id: btn.id, label: `زر Inline: ${btn.text}` });
      }
    }
    for (const btn of bot.replyButtons || []) {
      if (!seen.has(btn.id)) {
        seen.add(btn.id);
        items.push({ id: btn.id, label: `زر Reply: ${btn.text}` });
      }
    }
    for (const flow of Object.values(bot.buttonFlows || {})) {
      for (const sub of flow.subButtons || []) {
        if (!seen.has(sub.id)) {
          seen.add(sub.id);
          items.push({ id: sub.id, label: `زر فرعي: ${sub.text}` });
        }
      }
    }
    return items;
  }, [bot.inlineButtons, bot.replyButtons, bot.buttonFlows]);

  const handleAddCommand = () => {
    const cleanCmd = newCmdName
      .replace(/^\//, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 32);

    if (!cleanCmd) {
      setErrorMessage(
        'الرجاء إدخال اسم أمر صالح بالإنجليزية بدون مسافات (أحرف وأرقام و _ فقط، مثال: offers).'
      );
      return;
    }

    const cleanDesc = newCmdDesc.trim() || `تشغيل /${cleanCmd}`;
    setErrorMessage(null);

    const existingIdx = commands.findIndex(
      (c) => c.command.toLowerCase() === cleanCmd
    );
    let next: BotCommandConfig[];
    if (existingIdx !== -1) {
      next = commands.map((c, idx) =>
        idx === existingIdx
          ? { command: cleanCmd, description: cleanDesc, targetFlowId: newCmdTarget }
          : c
      );
    } else {
      next = [
        ...commands,
        { command: cleanCmd, description: cleanDesc, targetFlowId: newCmdTarget },
      ];
    }

    setCommands(next);
    setNewCmdName('');
    setNewCmdDesc('');
  };

  const handleRemoveCommand = (cmdName: string) => {
    setCommands((prev) => prev.filter((c) => c.command !== cmdName));
  };

  const handleSaveAll = async (alsoSyncTelegram: boolean) => {
    try {
      setErrorMessage(null);
      setStatusMessage(null);
      if (alsoSyncTelegram) setIsSyncing(true);
      else setIsSaving(true);

      await onUpdateBot({
        commands,
        profile,
        apiFeatures,
      });

      if (alsoSyncTelegram && bot.isConnected) {
        const res = await api.syncBot(bot.id);
        if (onRefreshBot) await onRefreshBot();
        setStatusMessage(res.message || 'تم حفظ الإعدادات ومزامنة البوت مع تيليجرام بنجاح ⚡');
      } else {
        setStatusMessage('تم حفظ إعدادات الأوامر والملف والميزات بنجاح ✅');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSaving(false);
      setIsSyncing(false);
    }
  };

  const caps = bot.capabilities;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header & Save Bar */}
      <div className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              إعدادات البوت وواجهة Bot API 9.x – 10.4
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              إدارة أوامر القائمة المخصصة، هوية وملف البوت، التفاعلات، ووضع Inline / الضيف
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={isSaving || isSyncing}
            onClick={() => handleSaveAll(false)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl shadow-sm cursor-pointer transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</span>
          </button>

          {bot.isConnected && (
            <button
              type="button"
              disabled={isSaving || isSyncing}
              onClick={() => handleSaveAll(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/15 hover:bg-sky-100 dark:hover:bg-sky-500/25 border border-sky-200 dark:border-sky-500/30 disabled:opacity-50 rounded-xl cursor-pointer transition-all"
            >
              <Zap className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'جاري المزامنة...' : 'حفظ ومزامنة مع تيليجرام ⚡'}</span>
            </button>
          )}

          <button
            type="button"
            disabled={isSaving || isSyncing}
            onClick={() => {
              const liveSnapshot: BotConfig = {
                ...bot,
                commands,
                profile,
                apiFeatures,
              };
              const { filename } = downloadBotBackupFile(liveSnapshot);
              setErrorMessage(null);
              setStatusMessage(`تم تصدير إعدادات البوت الحالية كنسخة احتياطية (${filename})`);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 rounded-xl cursor-pointer transition-all"
            title="تصدير جميع إعدادات البوت الحالية كملف JSON محلي"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير JSON</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 1. Custom Slash Commands */}
      <div className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-sky-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                أوامر البوت المخصصة (setMyCommands &amp; Slash Routing)
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                اربط أي أمر مثل <code className="font-mono text-sky-600 dark:text-sky-400">/offers</code> ليفتح تدفقاً أو زراً محدداً مباشرة في المحاكي وتيليجرام
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end bg-[#F5F9FD] dark:bg-slate-950/80 p-3.5 rounded-xl border border-sky-200/80 dark:border-slate-800">
          <div className="sm:col-span-3">
            <label
              htmlFor="cmd-name-input"
              className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              الأمر (بدون /):
            </label>
            <input
              id="cmd-name-input"
              type="text"
              value={newCmdName}
              onChange={(e) => setNewCmdName(e.target.value)}
              placeholder="offers"
              className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 dir-ltr text-left"
            />
          </div>

          <div className="sm:col-span-4">
            <label
              htmlFor="cmd-desc-input"
              className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              الوصف الظاهر في قائمة تيليجرام:
            </label>
            <input
              id="cmd-desc-input"
              type="text"
              value={newCmdDesc}
              onChange={(e) => setNewCmdDesc(e.target.value)}
              placeholder="عرض العروض والخصومات"
              className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="sm:col-span-3">
            <label
              htmlFor="cmd-target-select"
              className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              التدفق المرتبط بالأمر:
            </label>
            <select
              id="cmd-target-select"
              value={newCmdTarget}
              onChange={(e) => setNewCmdTarget(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
            >
              {availableFlowTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={handleAddCommand}
              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة أمر</span>
            </button>
          </div>
        </div>

        {commands.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4 bg-[#F5F9FD]/60 dark:bg-slate-950/40 rounded-xl border border-sky-200/60 dark:border-slate-800/60">
            يستخدم البوت حالياً الأوامر الافتراضية (<code className="font-mono">/start</code>، <code className="font-mono">/menu</code>، <code className="font-mono">/help</code>). أضف أوامر مخصصة لتوجيه المستخدمين لتدفقات محددة.
          </p>
        ) : (
          <div className="space-y-2">
            {commands.map((c) => {
              const targetLabel =
                availableFlowTargets.find((t) => t.id === (c.targetFlowId || 'main'))
                  ?.label || c.targetFlowId;
              return (
                <div
                  key={c.command}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                    <span className="px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 font-mono font-bold border border-sky-200 dark:border-sky-500/30">
                      /{c.command}
                    </span>
                    <span className="text-slate-800 dark:text-slate-200">{c.description}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                      ← {targetLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCommand(c.command)}
                    aria-label={`حذف الأمر /${c.command}`}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Bot Profile & Chat Menu Button */}
      <div className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm">
        <div className="flex items-center gap-2.5 pb-3 border-b border-sky-100 dark:border-slate-800/80">
          <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
            <UserCircle2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              ملف البوت العام وزر القائمة (setMyName / setMyDescription / setChatMenuButton)
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
              تحديث اسم البوت ووصفه الترحيبي وزر القائمة الجانبي مباشرة في تيليجرام عند المزامنة
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              الاسم الظاهر في تيليجرام (setMyName):
            </label>
            <input
              type="text"
              maxLength={64}
              value={profile.displayName || ''}
              onChange={(e) =>
                setProfile((p) => ({ ...p, displayName: e.target.value }))
              }
              placeholder="مثال: متجر تيليكرافت الذكي"
              className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              الوصف المختصر في البروفايل (setMyShortDescription):
            </label>
            <input
              type="text"
              maxLength={120}
              value={profile.shortDescription || ''}
              onChange={(e) =>
                setProfile((p) => ({ ...p, shortDescription: e.target.value }))
              }
              placeholder="نبذة سريعة تظهر في صفحة معلومات البوت..."
              className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="text-xs">
          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            الوصف الكامل قبل بدء المحادثة (setMyDescription):
          </label>
          <textarea
            rows={2}
            maxLength={512}
            value={profile.description || ''}
            onChange={(e) =>
              setProfile((p) => ({ ...p, description: e.target.value }))
            }
            placeholder="ما الذي يستطيع هذا البوت فعله؟ يظهر للمستخدم قبل ضغط Start..."
            className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-xl p-3 text-slate-900 dark:text-slate-100 resize-none"
          />
        </div>

        <div className="p-3.5 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 space-y-3 text-xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>نوع زر القائمة الجانبية (setChatMenuButton):</span>
            </span>
            <select
              value={profile.menuButtonType || 'default'}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  menuButtonType: e.target.value as 'default' | 'commands' | 'web_app',
                }))
              }
              className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
            >
              <option value="default">افتراضي (default)</option>
              <option value="commands">قائمة الأوامر (commands)</option>
              <option value="web_app">تطبيق ويب (Mini App)</option>
            </select>
          </div>

          {profile.menuButtonType === 'web_app' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  نص زر التطبيق:
                </label>
                <input
                  type="text"
                  value={profile.menuButtonText || ''}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, menuButtonText: e.target.value }))
                  }
                  placeholder="فتح المتجر"
                  className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  رابط تطبيق الويب HTTPS:
                </label>
                <input
                  type="url"
                  value={profile.menuButtonWebAppUrl || ''}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, menuButtonWebAppUrl: e.target.value }))
                  }
                  placeholder="https://app.example.com"
                  className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 dark:text-slate-100 dir-ltr text-left"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Live Capabilities & Bot API 9.x - 10.x Features */}
      <div className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm">
        <div className="flex items-center gap-2.5 pb-3 border-b border-sky-100 dark:border-slate-800/80">
          <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              قدرات البوت من تيليجرام وتفاعلات API 9.x – 10.4
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
              استعراض صلاحيات البوت الحقيقية من <code className="font-mono">getMe</code> وضبط التفاعلات ووضع Inline / الضيف
            </p>
          </div>
        </div>

        {/* Capabilities Badges */}
        <div className="p-3.5 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 space-y-2">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
            القدرات المكتشفة من حساب البوت (getMe):
          </span>
          {caps ? (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {[
                { key: 'canJoinGroups', label: 'الانضمام للمجموعات', val: caps.canJoinGroups },
                { key: 'canReadAllGroupMessages', label: 'قراءة رسائل المجموعات', val: caps.canReadAllGroupMessages },
                { key: 'supportsInlineQueries', label: 'استعلامات Inline', val: caps.supportsInlineQueries },
                { key: 'hasTopicsEnabled', label: 'مواضيع الدردشة (API 9.3+)', val: caps.hasTopicsEnabled },
                { key: 'allowsUsersToCreateTopics', label: 'إنشاء مواضيع للمستخدمين (API 9.4+)', val: caps.allowsUsersToCreateTopics },
                { key: 'hasMainWebApp', label: 'تطبيق ويب رئيسي', val: caps.hasMainWebApp },
              ].map((c) => (
                <span
                  key={c.key}
                  className={`px-2.5 py-1 rounded-full border font-medium ${
                    c.val
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                      : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-sky-200/80 dark:border-slate-800'
                  }`}
                >
                  {c.val ? '✓' : '—'} {c.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              لم يتم فحص قدرات البوت بعد — قم بربط التوكن في تبويب التوكن أو اضغط «مزامنة» لقراءتها مباشرة من خوادم تيليجرام.
            </p>
          )}
        </div>

        {/* Reactions & Bot API 10.0 Guest/Inline Mode */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 space-y-2.5">
            <label className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(apiFeatures.enableReactions)}
                onChange={(e) =>
                  setApiFeatures((prev) => ({ ...prev, enableReactions: e.target.checked }))
                }
              />
              <MessageCircleHeart className="w-4 h-4 text-rose-500" />
              <span>الرد على تفاعلات الإيموجي (message_reaction)</span>
            </label>
            <input
              type="text"
              value={apiFeatures.reactionAutoReply || ''}
              onChange={(e) =>
                setApiFeatures((prev) => ({
                  ...prev,
                  reactionAutoReply: e.target.value,
                }))
              }
              placeholder="مثال: شكراً لتفاعلك الجميل {emoji}!"
              className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
            />
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              عند تفاعل المستخدم على رسالة البوت بإيموجي، يرسل البوت الرد تلقائياً مع استبدال {'{emoji}'}.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 space-y-2.5">
            <label className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(apiFeatures.enableInlineGuestMode)}
                onChange={(e) =>
                  setApiFeatures((prev) => ({
                    ...prev,
                    enableInlineGuestMode: e.target.checked,
                  }))
                }
              />
              <Search className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>وضع Inline / وضع الضيف (Bot API 10.0+)</span>
            </label>
            <input
              type="text"
              value={apiFeatures.inlineGuestTitle || ''}
              onChange={(e) =>
                setApiFeatures((prev) => ({
                  ...prev,
                  inlineGuestTitle: e.target.value,
                }))
              }
              placeholder="عنوان النتيجة عند كتابة @username البوت..."
              className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              value={apiFeatures.inlineGuestMessageText || ''}
              onChange={(e) =>
                setApiFeatures((prev) => ({
                  ...prev,
                  inlineGuestMessageText: e.target.value,
                }))
              }
              placeholder="نص الرسالة المرسلة عند اختيار النتيجة..."
              className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
