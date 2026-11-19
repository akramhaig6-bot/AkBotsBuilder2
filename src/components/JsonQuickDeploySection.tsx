import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Braces,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  HelpCircle,
  Key,
  Layers,
  MessageSquare,
  RefreshCw,
  Rocket,
  Save,
  Sparkles,
  Trash2,
  Upload,
  AlertTriangle,
  Wand2,
  Download,
} from 'lucide-react';
import { BotConfig } from '../types/bot';
import { api } from '../services/api';
import { sanitizeBotToken, validateBotToken } from '../utils/telegramFormatters';
import { buildBotBackupFilename, downloadJsonTextFile } from '../utils/botBackupExport';
import {
  applyBlueprintUpdates,
  autoFixJsonCode,
  createPreviewBotFromBlueprint,
  exportBotDesignJson,
  parseBotDesignJson,
  SAMPLE_BOT_DESIGN_JSON,
} from '../utils/jsonBotBlueprint';
import { TelegramSimulator } from './TelegramSimulator';

interface JsonQuickDeploySectionProps {
  existingBots: BotConfig[];
  onBackToList: () => void;
  onBotCreated: (bot: BotConfig, openInEditor?: boolean) => void;
}

export const JsonQuickDeploySection: React.FC<JsonQuickDeploySectionProps> = ({
  existingBots,
  onBackToList,
  onBotCreated,
}) => {
  const [jsonInput, setJsonInput] = useState<string>('');
  const [tokenInput, setTokenInput] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deployedBot, setDeployedBot] = useState<BotConfig | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [fixReport, setFixReport] = useState<string[] | null>(null);
  const [selectedSourceBotId, setSelectedSourceBotId] = useState<string | null>(null);
  const [isUpdatingExisting, setIsUpdatingExisting] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parseResult = useMemo(() => parseBotDesignJson(jsonInput), [jsonInput]);

  useEffect(() => {
    if (parseResult.valid && parseResult.detectedToken && !tokenInput.trim()) {
      setTokenInput(parseResult.detectedToken);
    }
  }, [parseResult.valid, parseResult.detectedToken, tokenInput]);

  const selectedSourceBot = useMemo(
    () => (selectedSourceBotId ? existingBots.find((b) => b.id === selectedSourceBotId) || null : null),
    [selectedSourceBotId, existingBots]
  );

  const autoFixCandidate = useMemo(() => {
    if (parseResult.valid || !jsonInput.trim()) return null;
    const attempt = autoFixJsonCode(jsonInput);
    if (!attempt.fixed) return null;
    const reparsed = parseBotDesignJson(attempt.fixedJson);
    if (!reparsed.valid) return null;
    return attempt;
  }, [parseResult.valid, jsonInput]);

  const previewBot = useMemo(
    () =>
      createPreviewBotFromBlueprint(
        parseResult.valid ? parseResult.blueprint : undefined
      ),
    [parseResult]
  );

  const handleInsertSample = () => {
    setJsonInput(SAMPLE_BOT_DESIGN_JSON);
    setErrorMessage(null);
    setSuccessMessage(null);
    setDeployedBot(null);
    setFixReport(null);
  };

  const handleAutoFixJson = () => {
    if (!jsonInput.trim()) return;
    const res = autoFixJsonCode(jsonInput);
    if (res.fixed) {
      setJsonInput(res.fixedJson);
      setErrorMessage(null);
      setFixReport(
        res.appliedFixes.length > 0
          ? res.appliedFixes
          : ['تم التحقق من الكود وتنسيقه بنجاح']
      );
    } else {
      setFixReport(null);
      setErrorMessage(res.error || 'تعذر تصحيح كود JSON تلقائياً');
    }
  };

  const handleFormatJson = () => {
    if (!jsonInput.trim()) return;
    try {
      const cleaned = jsonInput
        .trim()
        .replace(/^```(?:json|JSON)?\s*\r?\n/, '')
        .replace(/\r?\n?```$/, '');
      const formatted = JSON.stringify(JSON.parse(cleaned), null, 2);
      setJsonInput(formatted);
      setErrorMessage(null);
      setFixReport(null);
    } catch {
      handleAutoFixJson();
    }
  };

  const handleLoadFromExistingBot = (botId: string) => {
    if (!botId) return;
    const found = existingBots.find((b) => b.id === botId);
    if (!found) return;
    setSelectedSourceBotId(found.id);
    if (found.token && !tokenInput.trim()) {
      setTokenInput(found.token);
    }
    setJsonInput(exportBotDesignJson(found));
    setErrorMessage(null);
    setSuccessMessage(null);
    setDeployedBot(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setJsonInput(reader.result);
        setErrorMessage(null);
        setSuccessMessage(null);
        setDeployedBot(null);
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleCopyJson = async () => {
    if (!jsonInput.trim()) return;
    try {
      await navigator.clipboard.writeText(jsonInput);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleActivateInTelegram = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setDeployedBot(null);

    let effectiveParse = parseResult;
    if ((!effectiveParse.valid || !effectiveParse.blueprint) && jsonInput.trim()) {
      const fixedAttempt = autoFixJsonCode(jsonInput);
      if (fixedAttempt.fixed) {
        const reparsed = parseBotDesignJson(fixedAttempt.fixedJson);
        if (reparsed.valid && reparsed.blueprint) {
          setJsonInput(fixedAttempt.fixedJson);
          setFixReport(fixedAttempt.appliedFixes);
          effectiveParse = reparsed;
        }
      }
    }

    if (!effectiveParse.valid || !effectiveParse.blueprint) {
      setErrorMessage(
        effectiveParse.error || 'يرجى إدخال كود JSON صالح لتصميم البوت أولاً.'
      );
      return;
    }

    const tokenCheck = validateBotToken(tokenInput);
    if (!tokenCheck.isValid) {
      setErrorMessage(tokenCheck.error || 'يرجى إدخال توكن البوت الصحيح من @BotFather.');
      return;
    }

    const cleanToken = tokenCheck.sanitizedToken || sanitizeBotToken(tokenInput);
    setTokenInput(cleanToken);

    try {
      setIsDeploying(true);
      const res = await api.importAndConnectBot(
        effectiveParse.blueprint,
        cleanToken
      );
      setDeployedBot(res.bot);
      setSuccessMessage(res.message);
      onBotCreated(res.bot, false);
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'فشل تفعيل البوت وربطه بتيليجرام، تأكد من صحة التوكن والاتصال.'
      );
    } finally {
      setIsDeploying(false);
    }
  };

  const handleSaveDraftWithoutToken = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setDeployedBot(null);

    let effectiveParse = parseResult;
    if ((!effectiveParse.valid || !effectiveParse.blueprint) && jsonInput.trim()) {
      const fixedAttempt = autoFixJsonCode(jsonInput);
      if (fixedAttempt.fixed) {
        const reparsed = parseBotDesignJson(fixedAttempt.fixedJson);
        if (reparsed.valid && reparsed.blueprint) {
          setJsonInput(fixedAttempt.fixedJson);
          setFixReport(fixedAttempt.appliedFixes);
          effectiveParse = reparsed;
        }
      }
    }

    if (!effectiveParse.valid || !effectiveParse.blueprint) {
      setErrorMessage(
        effectiveParse.error || 'يرجى إدخال كود JSON صالح لتصميم البوت أولاً.'
      );
      return;
    }

    try {
      setIsSavingDraft(true);
      const created = await api.createBotFromBlueprint(effectiveParse.blueprint);
      setDeployedBot(created);
      setSuccessMessage(
        `تم حفظ تصميم البوت "${created.name}" في قائمة البوتات بنجاح. يمكنك إضافة التوكن الآن أو لاحقاً.`
      );
      onBotCreated(created, false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل حفظ البوت من كود JSON');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleUpdateAndSyncSelectedBot = async () => {
    if (!selectedSourceBot) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setDeployedBot(null);

    let effectiveParse = parseResult;
    if ((!effectiveParse.valid || !effectiveParse.blueprint) && jsonInput.trim()) {
      const fixedAttempt = autoFixJsonCode(jsonInput);
      if (fixedAttempt.fixed) {
        const reparsed = parseBotDesignJson(fixedAttempt.fixedJson);
        if (reparsed.valid && reparsed.blueprint) {
          setJsonInput(fixedAttempt.fixedJson);
          setFixReport(fixedAttempt.appliedFixes);
          effectiveParse = reparsed;
        }
      }
    }

    if (!effectiveParse.valid || !effectiveParse.blueprint) {
      setErrorMessage(
        effectiveParse.error || 'يرجى إدخال كود JSON صالح لتصميم البوت أولاً.'
      );
      return;
    }

    try {
      setIsUpdatingExisting(true);
      await api.updateBot(selectedSourceBot.id, {
        name: effectiveParse.blueprint.name || selectedSourceBot.name,
        startMessage: effectiveParse.blueprint.startMessage,
        inlineButtons: effectiveParse.blueprint.inlineButtons || [],
        replyButtons: effectiveParse.blueprint.replyButtons || [],
        buttonFlows: effectiveParse.blueprint.buttonFlows || {},
        ...(effectiveParse.blueprint.commands ? { commands: effectiveParse.blueprint.commands } : {}),
        ...(effectiveParse.blueprint.profile ? { profile: effectiveParse.blueprint.profile } : {}),
        ...(effectiveParse.blueprint.apiFeatures ? { apiFeatures: effectiveParse.blueprint.apiFeatures } : {}),
        ...(effectiveParse.blueprint.inlinePagination
          ? { inlinePagination: effectiveParse.blueprint.inlinePagination }
          : {}),
        ...(effectiveParse.blueprint.replyPagination
          ? { replyPagination: effectiveParse.blueprint.replyPagination }
          : {}),
        ...(effectiveParse.blueprint.inlineLayoutSettings
          ? { inlineLayoutSettings: effectiveParse.blueprint.inlineLayoutSettings }
          : {}),
        ...(effectiveParse.blueprint.replyLayoutSettings
          ? { replyLayoutSettings: effectiveParse.blueprint.replyLayoutSettings }
          : {}),
        ...(effectiveParse.blueprint.settings ? { settings: effectiveParse.blueprint.settings } : {}),
      });

      if (selectedSourceBot.token) {
        const syncRes = await api.syncBot(selectedSourceBot.id);
        setDeployedBot(syncRes.bot);
        setSuccessMessage(syncRes.message || 'تم تحديث البوت ومزامنته مع تيليجرام بنجاح!');
        onBotCreated(syncRes.bot, false);
      } else {
        const updated = await api.getBot(selectedSourceBot.id);
        setDeployedBot(updated);
        setSuccessMessage(`تم تحديث تصميم البوت "${updated.name}" بنجاح!`);
        onBotCreated(updated, false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل تحديث البوت المحدد ومزامنته مع تيليجرام');
    } finally {
      setIsUpdatingExisting(false);
    }
  };

  const handleUpdatePreviewBot = async (updates: Partial<BotConfig>) => {
    const { exportedJson } = applyBlueprintUpdates(previewBot, updates);
    setJsonInput(exportedJson);
    setErrorMessage(null);
    setFixReport(null);

    if (deployedBot) {
      try {
        const updatedServerBot = await api.updateBot(deployedBot.id, updates);
        setDeployedBot(updatedServerBot);
        onBotCreated(updatedServerBot, false);
      } catch (err: any) {
        setErrorMessage(
          err?.message || 'تم تحديث الكود ولكن تعذر مزامنة التعديلات مع البوت المحفوظ.'
        );
      }
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6" dir="rtl">
      {/* Dedicated Section Header */}
      <div className="bg-white dark:bg-slate-900/70 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-4 md:p-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToList}
            className="p-2 rounded-xl bg-sky-50 dark:bg-slate-800/80 hover:bg-sky-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-sky-700 dark:hover:text-white transition-colors cursor-pointer border border-sky-200/80 dark:border-slate-700/60"
            title="الرجوع إلى قائمة البوتات"
            aria-label="الرجوع إلى قائمة البوتات"
          >
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <FileJson className="w-5 h-5" />
          </div>

          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              قسم التفعيل السريع بكود JSON
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              الصق كود JSON الذي يحمل تصميم البوت وأدخل التوكن فقط ليتفعل البوت ويظهر مباشرة في تيليجرام
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            type="button"
            onClick={handleInsertSample}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 border border-sky-200 dark:border-sky-500/30 rounded-xl transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>إدراج مثال JSON جاهز</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Right Input Workspace (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: JSON Design Input Card */}
          <div className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-sky-100 dark:border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    1. الصق كود JSON لتصميم البوت
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    يدعم جميع أنواع وكائنات JSON (TeleCraft، Telegram Bot API، القوائم، المصفوفات، أو أي كود JSON) مع تحرير وتفعيل فوري
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                  aria-label="اختيار ملف JSON"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700/80 rounded-lg transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>رفع ملف .json</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoFixJson}
                  disabled={!jsonInput.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 disabled:opacity-40 border border-amber-200 dark:border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                  title="تصحيح أخطاء الصيغة والفواصل والأقواس واقتباسات JSON تلقائياً"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تصحيح تلقائي</span>
                </button>

                <button
                  type="button"
                  onClick={handleFormatJson}
                  disabled={!jsonInput.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 disabled:opacity-40 border border-sky-200 dark:border-slate-700/80 rounded-lg transition-colors cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>تنسيق</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyJson}
                  disabled={!jsonInput.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 disabled:opacity-40 border border-sky-200 dark:border-slate-700/80 rounded-lg transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedJson ? 'تم النسخ ✓' : 'نسخ'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!jsonInput.trim()) return;
                    const filename = buildBotBackupFilename({
                      name: parseResult.summary?.botName || 'bot-design',
                      botUsername: null,
                    });
                    downloadJsonTextFile(filename, jsonInput);
                  }}
                  disabled={!jsonInput.trim()}
                  title="تنزيل كود البوت كملف JSON احتياطي"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 disabled:opacity-40 border border-sky-200 dark:border-slate-700/80 rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير .json</span>
                </button>

                {jsonInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setJsonInput('');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                      setDeployedBot(null);
                      setFixReport(null);
                    }}
                    aria-label="مسح كود JSON"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-rose-200 dark:border-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Load existing bot design helper */}
            {existingBots.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#F5F9FD] dark:bg-slate-950/50 border border-sky-200/70 dark:border-slate-800/70 rounded-xl px-3.5 py-2.5">
                <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Braces className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>أو استخرج كود JSON من أحد بوتاتك الحالية لتعديله أو نسخه:</span>
                </span>
                <select
                  aria-label="استيراد كود JSON من بوت حالي"
                  defaultValue=""
                  onChange={(e) => {
                    handleLoadFromExistingBot(e.target.value);
                    e.target.value = '';
                  }}
                  className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 cursor-pointer focus:outline-hidden focus:border-sky-500"
                >
                  <option value="" disabled>
                    اختر بوتاً لجلب تصميمه...
                  </option>
                  {existingBots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* JSON Textarea */}
            <div>
              <label
                htmlFor="json-blueprint-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                كود التصميم (JSON Code)
              </label>
              <textarea
                id="json-blueprint-input"
                dir="ltr"
                spellCheck={false}
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                  if (fixReport) setFixReport(null);
                }}
                rows={12}
                placeholder={`{\n  "name": "اسم البوت",\n  "startMessage": "أهلاً بك في البوت!",\n  "inlineButtons": [\n    { "text": "الخدمات", "style": "primary", "row": 0, "order": 0 }\n  ]\n}`}
                className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-700/80 focus:border-sky-500 rounded-xl p-4 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-hidden leading-relaxed resize-y text-left"
              />
            </div>

            {/* Auto-fix summary badge */}
            {fixReport && fixReport.length > 0 && parseResult.valid && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
                <Sparkles className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-800 dark:text-amber-300 block">
                    تم تصحيح كود JSON تلقائياً:
                  </span>
                  <span className="text-[11px] text-amber-800/90 dark:text-amber-200/90">
                    {fixReport.join(' • ')}
                  </span>
                </div>
              </div>
            )}

            {/* Live Parsed Summary or Syntax Error */}
            {jsonInput.trim().length > 0 && (
              parseResult.valid && parseResult.summary ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/8 border border-emerald-200 dark:border-emerald-500/25 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>تمت قراءة التصميم بنجاح ({parseResult.summary.formatLabel})</span>
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                      الاسم: <strong className="text-slate-900 dark:text-white">{parseResult.summary.botName}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="bg-white dark:bg-slate-950/60 border border-emerald-200/80 dark:border-slate-800/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                        البداية
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold">
                        {parseResult.summary.hasStartMessage ? 'جاهزة' : 'فارغة'}
                      </span>
                    </div>
                    <div className="bg-white dark:bg-slate-950/60 border border-emerald-200/80 dark:border-slate-800/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                        Inline
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold tabular-nums">
                        {parseResult.summary.inlineCount}
                      </span>
                    </div>
                    <div className="bg-white dark:bg-slate-950/60 border border-emerald-200/80 dark:border-slate-800/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Reply</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold tabular-nums">
                        {parseResult.summary.replyCount}
                      </span>
                    </div>
                    <div className="bg-white dark:bg-slate-950/60 border border-emerald-200/80 dark:border-slate-800/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">التدفقات</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold tabular-nums">
                        {parseResult.summary.flowsCount}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
                    <span>{parseResult.error}</span>
                  </div>
                  {autoFixCandidate && (
                    <button
                      type="button"
                      onClick={handleAutoFixJson}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-500/20 hover:bg-amber-200/80 dark:hover:bg-amber-500/30 border border-amber-300 dark:border-amber-400/40 rounded-lg transition-colors shrink-0 cursor-pointer self-end sm:self-auto"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
                      <span>تصحيح الكود تلقائياً</span>
                    </button>
                  )}
                </div>
              )
            )}
          </div>

          {/* Step 2: Token & Instant Telegram Activation */}
          <div className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-sky-100 dark:border-slate-800/80">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  2. أدخل توكن البوت فقط للتفعيل في تيليجرام
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  بمجرد الضغط على التفعيل يتم فحص التوكن وربط التصميم مباشرة ليظهر البوت ويعمل فوراً في تيليجرام
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="json-deploy-token-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  توكن البوت (Telegram Bot Token)
                </label>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  من <span className="font-mono text-sky-600 dark:text-sky-400">@BotFather</span>
                </span>
              </div>

              <div className="relative">
                <input
                  id="json-deploy-token-input"
                  type={showToken ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleActivateInTelegram();
                    }
                  }}
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-700/80 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-hidden focus:border-sky-500 pl-10 direction-ltr text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  aria-label={showToken ? 'إخفاء التوكن' : 'إظهار التوكن'}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer p-1"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {successMessage && deployedBot && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 shadow-sm space-y-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                      {deployedBot.isConnected
                        ? 'تم تفعيل البوت وظهوره في تيليجرام بنجاح!'
                        : 'تم حفظ تصميم البوت بنجاح!'}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      {successMessage}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-emerald-200/80 dark:border-emerald-500/15">
                  {deployedBot.botUsername && (
                    <a
                      href={`https://t.me/${deployedBot.botUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors shadow-sm cursor-pointer"
                    >
                      <span>فتح البوت في تيليجرام (@{deployedBot.botUsername})</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onBotCreated(deployedBot, true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
                  >
                    <span>إدارة البوت في المحرر</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveDraftWithoutToken}
                disabled={
                  isDeploying ||
                  isSavingDraft ||
                  isUpdatingExisting ||
                  (!parseResult.valid && !autoFixCandidate?.fixed)
                }
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 disabled:opacity-45 border border-sky-200 dark:border-slate-700/80 rounded-xl transition-colors cursor-pointer"
              >
                {isSavingDraft ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>حفظ كمسودة بدون توكن</span>
                  </>
                )}
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {selectedSourceBot && selectedSourceBot.token && (
                  <button
                    type="button"
                    onClick={handleUpdateAndSyncSelectedBot}
                    disabled={isDeploying || isSavingDraft || isUpdatingExisting}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 disabled:opacity-50 border border-emerald-200 dark:border-emerald-500/30 rounded-xl transition-colors cursor-pointer"
                  >
                    {isUpdatingExisting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>جاري التحديث والمزامنة...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>تحديث ومزامنة ({selectedSourceBot.name})</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleActivateInTelegram}
                  disabled={isDeploying || isSavingDraft || isUpdatingExisting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-sky-600/20 cursor-pointer"
                >
                  {isDeploying ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري تفعيل البوت والربط بتيليجرام...</span>
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4" />
                      <span>تفعيل البوت وظهوره في تيليجرام</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed bg-[#F5F9FD] dark:bg-slate-950/45 p-3.5 rounded-xl border border-sky-200/70 dark:border-slate-800/60">
              <HelpCircle className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <div>
                تظهر التعديلات أولاً في المحاكي فقط؛ ولكي تنعكس مباشرة على حسابك في تيليجرام اضغط على{' '}
                <strong className="text-slate-800 dark:text-slate-200">تفعيل البوت وظهوره في تيليجرام</strong> (أو تحديث البوت المحدد)، ثم أرسل{' '}
                <span className="font-mono text-sky-600 dark:text-sky-400">/start</span> في تيليجرام.
              </div>
            </div>
          </div>
        </div>

        {/* Live Simulator Preview Column (5 cols) */}
        <div className="lg:col-span-5 lg:sticky lg:top-20">
          <TelegramSimulator
            bot={previewBot}
            onUpdateBot={handleUpdatePreviewBot}
            onSelectButtonToEdit={
              deployedBot ? () => onBotCreated(deployedBot, true) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
};
