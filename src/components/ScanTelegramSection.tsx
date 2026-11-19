import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  Key,
  Link2,
  LogOut,
  MessageSquare,
  Phone,
  Plus,
  Radar,
  RefreshCw,
  Rocket,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
} from 'lucide-react';
import { BotConfig } from '../types/bot';
import { CapturedBotRecord, ScanStatusResponse } from '../types/scan';
import { api } from '../services/api';
import {
  createPreviewBotFromBlueprint,
  parseBotDesignJson,
} from '../utils/jsonBotBlueprint';
import { sanitizeBotToken, validateBotToken } from '../utils/telegramFormatters';
import { TelegramSimulator } from './TelegramSimulator';
import { ConfirmModal } from './ConfirmModal';

interface ScanTelegramSectionProps {
  onBackToList: () => void;
  onBotCreated: (bot: BotConfig, openInEditor?: boolean) => void;
}

type AuthMode = 'session' | 'phone';
type RightPanelTab = 'simulator' | 'json';

export const ScanTelegramSection: React.FC<ScanTelegramSectionProps> = ({
  onBackToList,
  onBotCreated,
}) => {
  const [status, setStatus] = useState<ScanStatusResponse>({
    state: 'disconnected',
    isConnected: false,
    account: null,
    hasSavedSession: false,
    sessionString: null,
    activeSavedAccountId: null,
    savedAccounts: [],
    activeTargetBot: null,
    error: null,
    capturedBotCount: 0,
  });

  const [selectedSavedId, setSelectedSavedId] = useState<string>('');
  const [showAddAccountForm, setShowAddAccountForm] = useState<boolean>(false);
  const [accountIdToDelete, setAccountIdToDelete] = useState<string | null>(null);
  const [isSyncingHistory, setIsSyncingHistory] = useState<boolean>(false);

  const [authMode, setAuthMode] = useState<AuthMode>('session');
  const [apiId, setApiId] = useState<string>('');
  const [apiHash, setApiHash] = useState<string>('');
  const [showApiHash, setShowApiHash] = useState<boolean>(false);
  const [sessionInput, setSessionInput] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [twoFaPassword, setTwoFaPassword] = useState<string>('');
  const [isCodeViaApp, setIsCodeViaApp] = useState<boolean>(true);
  const [isAuthBusy, setIsAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [copiedSession, setCopiedSession] = useState<boolean>(false);

  // Captured bots state
  const [capturedBots, setCapturedBots] = useState<CapturedBotRecord[]>([]);
  const [selectedBotKey, setSelectedBotKey] = useState<string | null>(null);
  const [targetBotInput, setTargetBotInput] = useState<string>('');
  const [customMessageInput, setCustomMessageInput] = useState<string>('');
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [interactionNotice, setInteractionNotice] = useState<string | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [botKeyToDelete, setBotKeyToDelete] = useState<string | null>(null);

  // Right-side preview + JSON + Deploy state
  const [rightTab, setRightTab] = useState<RightPanelTab>('simulator');
  const [editableJsonOverride, setEditableJsonOverride] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [deployBotName, setDeployBotName] = useState<string>('');
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState<string | null>(null);
  const [deployedBot, setDeployedBot] = useState<BotConfig | null>(null);

  const loadStatusAndCaptures = useCallback(async () => {
    try {
      const [nextStatus, nextBots] = await Promise.all([
        api.scan.getStatus(),
        api.scan.getBots(),
      ]);
      setStatus(nextStatus);
      const accounts = nextStatus.savedAccounts || [];
      setSelectedSavedId((prev) => {
        if (prev && accounts.some((a) => a.id === prev)) return prev;
        return nextStatus.activeSavedAccountId || accounts[0]?.id || '';
      });
      setCapturedBots(nextBots);
      setSelectedBotKey((prev) => {
        if (prev && nextBots.some((b) => b.botKey === prev)) return prev;
        return nextBots[0]?.botKey || null;
      });
    } catch {
      // ignore silent polling failure
    }
  }, []);

  useEffect(() => {
    loadStatusAndCaptures();
  }, [loadStatusAndCaptures]);

  // Live poll captures every 2.5s whenever connected so external Telegram interactions appear automatically
  useEffect(() => {
    if (!status.isConnected) return;
    const interval = setInterval(() => {
      loadStatusAndCaptures();
    }, 2500);
    return () => clearInterval(interval);
  }, [status.isConnected, loadStatusAndCaptures]);

  const selectedBot = useMemo(
    () => capturedBots.find((b) => b.botKey === selectedBotKey) || null,
    [capturedBots, selectedBotKey]
  );

  // Clear local JSON override & reset deploy notices when switching captured bot
  useEffect(() => {
    setEditableJsonOverride(null);
    setDeployBotName(selectedBot?.displayName || '');
    setDeployError(null);
    setDeploySuccess(null);
    setDeployedBot(null);
  }, [selectedBot?.botKey]);

  const activeJsonText = useMemo(() => {
    if (editableJsonOverride !== null) return editableJsonOverride;
    return selectedBot?.blueprintJson || '';
  }, [editableJsonOverride, selectedBot?.blueprintJson]);

  const parsedBlueprint = useMemo(() => {
    if (!activeJsonText.trim()) return null;
    const res = parseBotDesignJson(activeJsonText);
    if (!res.valid || !res.blueprint) return null;
    if (deployBotName.trim()) {
      return {
        ...res.blueprint,
        name: deployBotName.trim(),
      };
    }
    return res.blueprint;
  }, [activeJsonText, deployBotName]);

  const previewBot = useMemo(
    () => createPreviewBotFromBlueprint(parsedBlueprint || selectedBot?.blueprint),
    [parsedBlueprint, selectedBot?.blueprint]
  );

  const handleConnectWithSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (!apiId.trim() || !/^\d+$/.test(apiId.trim())) {
      setAuthError('يرجى إدخال API ID صحيح (أرقام فقط من my.telegram.org).');
      return;
    }
    if (!apiHash.trim() || apiHash.trim().length < 16) {
      setAuthError('يرجى إدخال API Hash صحيح من my.telegram.org.');
      return;
    }
    if (!sessionInput.trim() || sessionInput.trim().length < 20) {
      setAuthError('يرجى لصق كود الجلسة (StringSession) الصحيح.');
      return;
    }

    try {
      setIsAuthBusy(true);
      const nextStatus = await api.scan.connectWithSession({
        apiId: apiId.trim(),
        apiHash: apiHash.trim(),
        sessionString: sessionInput.trim(),
      });
      setStatus(nextStatus);
      if (nextStatus.activeSavedAccountId) {
        setSelectedSavedId(nextStatus.activeSavedAccountId);
      }
      setShowAddAccountForm(false);
      setSessionInput('');
      setAuthSuccess(
        'تم ربط وحفظ الجلسة بنجاح! افتح أي بوت داخل تيليجرام وتفاعل معه، أو استخدم البحث المباشر أدناه.'
      );
      await loadStatusAndCaptures();
    } catch (err: any) {
      setAuthError(err?.message || 'فشل الاتصال بحساب تيليجرام بالجلسة المدخلة.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleStartPhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (!apiId.trim() || !/^\d+$/.test(apiId.trim())) {
      setAuthError('يرجى إدخال API ID صحيح (أرقام فقط من my.telegram.org).');
      return;
    }
    if (!apiHash.trim() || apiHash.trim().length < 16) {
      setAuthError('يرجى إدخال API Hash صحيح.');
      return;
    }
    if (!phoneNumber.trim()) {
      setAuthError('يرجى إدخال رقم الهاتف بالصيغة الدولية (مثال: +967770000000).');
      return;
    }

    try {
      setIsAuthBusy(true);
      const res = await api.scan.startPhoneLogin({
        apiId: apiId.trim(),
        apiHash: apiHash.trim(),
        phoneNumber: phoneNumber.trim(),
      });
      setStatus(res);
      setIsCodeViaApp(res.isCodeViaApp !== false);
      setAuthSuccess(
        res.isCodeViaApp !== false
          ? 'تم إرسال رمز التحقق إلى محادثة Telegram الرسمية داخل حسابك.'
          : 'تم إرسال رمز التحقق عبر رسالة SMS إلى رقم هاتفك.'
      );
    } catch (err: any) {
      setAuthError(err?.message || 'فشل إرسال رمز التحقق.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleVerifyPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (status.state === 'awaiting_code' && !otpCode.trim()) {
      setAuthError('يرجى إدخال رمز التحقق المرسل من تيليجرام.');
      return;
    }
    if (status.state === 'awaiting_password' && !twoFaPassword) {
      setAuthError('يرجى إدخال كلمة مرور التحقق بخطوتين (2FA).');
      return;
    }

    try {
      setIsAuthBusy(true);
      const res = await api.scan.verifyPhoneCode({
        code: otpCode.trim() || undefined,
        password: twoFaPassword || undefined,
      });
      setStatus(res);
      if (res.state === 'awaiting_password') {
        setAuthSuccess('هذا الحساب محمي بالتحقق بخطوتين (2FA). يرجى إدخال كلمة المرور للمتابعة.');
      } else if (res.isConnected) {
        setOtpCode('');
        setTwoFaPassword('');
        setPhoneNumber('');
        if (res.activeSavedAccountId) {
          setSelectedSavedId(res.activeSavedAccountId);
        }
        setShowAddAccountForm(false);
        setAuthSuccess('تم تسجيل الدخول وتوليد الجلسة وحفظها في القائمة بنجاح!');
        await loadStatusAndCaptures();
      }
    } catch (err: any) {
      setAuthError(err?.message || 'فشل التحقق من الرمز أو كلمة المرور.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSwitchSavedAccount = async (targetSavedId?: string) => {
    const idToUse = targetSavedId || selectedSavedId;
    if (!idToUse) return;
    setAuthError(null);
    setAuthSuccess(null);
    try {
      setIsAuthBusy(true);
      const next = await api.scan.switchAccount(idToUse);
      setStatus(next);
      setSelectedSavedId(idToUse);
      setShowAddAccountForm(false);
      setAuthSuccess('تم الاتصال بالجلسة المحفوظة بنجاح وبدء الالتقاط المباشر من تيليجرام!');
      await loadStatusAndCaptures();
    } catch (err: any) {
      setAuthError(err?.message || 'تعذر الاتصال بالحساب المحفوظ.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleDeleteSavedAccountConfirm = async () => {
    if (!accountIdToDelete) return;
    try {
      setIsAuthBusy(true);
      const next = await api.scan.removeAccount(accountIdToDelete);
      setStatus(next);
      const nextList = next.savedAccounts || [];
      setSelectedSavedId(next.activeSavedAccountId || nextList[0]?.id || '');
      setAuthSuccess(null);
    } catch (err: any) {
      setAuthError(err?.message || 'تعذر حذف الحساب المحفوظ.');
    } finally {
      setIsAuthBusy(false);
      setAccountIdToDelete(null);
    }
  };

  const handleDisconnect = async (clearSaved: boolean) => {
    try {
      setIsAuthBusy(true);
      const next = await api.scan.disconnect(clearSaved);
      setStatus(next);
      setAuthError(null);
      setAuthSuccess(null);
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSyncRecentHistory = async () => {
    if (!status.isConnected) return;
    setInteractionError(null);
    setInteractionNotice(null);
    try {
      setIsSyncingHistory(true);
      const bots = await api.scan.syncTelegramHistory();
      setCapturedBots(bots);
      setSelectedBotKey((prev) => {
        if (prev && bots.some((b) => b.botKey === prev)) return prev;
        return bots[0]?.botKey || null;
      });
      setInteractionNotice('تمت مزامنة آخر تفاعلاتك مع البوتات من حسابك في تيليجرام بنجاح.');
    } catch (err: any) {
      setInteractionError(err?.message || 'فشل مزامنة المحادثات من تيليجرام.');
    } finally {
      setIsSyncingHistory(false);
    }
  };

  const handleCopySession = async () => {
    if (!status.sessionString) return;
    try {
      await navigator.clipboard.writeText(status.sessionString);
      setCopiedSession(true);
      setTimeout(() => setCopiedSession(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleScanBotUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = targetBotInput.trim();
    if (!target) {
      setInteractionError('أدخل معرف البوت مثل @BotFather لبدء مسحه.');
      return;
    }
    setInteractionError(null);
    setInteractionNotice(null);

    try {
      setIsInteracting(true);
      const res = await api.scan.interact({
        botUsernameOrKey: target,
        action: 'send_text',
        text: '/start',
      });
      await loadStatusAndCaptures();
      if (res.bot) {
        setSelectedBotKey(res.bot.botKey);
        setInteractionNotice(`تم إرسال /start إلى @${res.bot.username || res.bot.botKey} والتقاط الرد.`);
      }
    } catch (err: any) {
      setInteractionError(err?.message || 'فشل الاتصال بالبوت المستهدف.');
    } finally {
      setIsInteracting(false);
    }
  };

  const handleSendTextToSelectedBot = async (textToSend: string) => {
    if (!selectedBot || !textToSend.trim()) return;
    setInteractionError(null);
    setInteractionNotice(null);
    try {
      setIsInteracting(true);
      const res = await api.scan.interact({
        botUsernameOrKey: selectedBot.username || selectedBot.botKey,
        action: 'send_text',
        text: textToSend.trim(),
      });
      if (res.bot) {
        setCapturedBots((prev) =>
          prev.map((b) => (b.botKey === res.bot!.botKey ? res.bot! : b))
        );
      } else {
        await loadStatusAndCaptures();
      }
      setCustomMessageInput('');
    } catch (err: any) {
      setInteractionError(err?.message || 'فشل إرسال الأمر أو الرسالة إلى البوت.');
    } finally {
      setIsInteracting(false);
    }
  };

  const handleClickCapturedInlineButton = async (
    telegramMessageId: number,
    btnId: string,
    btnText: string,
    callbackData?: string
  ) => {
    if (!selectedBot || !callbackData) return;
    setInteractionError(null);
    setInteractionNotice(null);
    try {
      setIsInteracting(true);
      const res = await api.scan.interact({
        botUsernameOrKey: selectedBot.username || selectedBot.botKey,
        action: 'click_inline',
        messageId: telegramMessageId,
        callbackData,
        parentButtonId: btnId,
      });
      if (res.callbackAlert?.text) {
        setInteractionNotice(`تنبيه البوت (${btnText}): ${res.callbackAlert.text}`);
      }
      if (res.bot) {
        setCapturedBots((prev) =>
          prev.map((b) => (b.botKey === res.bot!.botKey ? res.bot! : b))
        );
      } else {
        await loadStatusAndCaptures();
      }
    } catch (err: any) {
      setInteractionError(err?.message || `فشل الضغط على الزر "${btnText}".`);
    } finally {
      setIsInteracting(false);
    }
  };

  const handleLinkStep = async (eventId: string, targetParentId: string) => {
    if (!selectedBot) return;
    try {
      const updated = await api.scan.linkStep(
        selectedBot.botKey,
        eventId,
        targetParentId === '__auto__' ? null : targetParentId
      );
      setCapturedBots((prev) =>
        prev.map((b) => (b.botKey === updated.botKey ? updated : b))
      );
    } catch (err: any) {
      setInteractionError(err?.message || 'تعذر ربط الرسالة بالزر.');
    }
  };

  const handleDeleteCapturedBotConfirm = async () => {
    if (!botKeyToDelete) return;
    try {
      await api.scan.deleteBot(botKeyToDelete);
      setCapturedBots((prev) => {
        const filtered = prev.filter((b) => b.botKey !== botKeyToDelete);
        if (selectedBotKey === botKeyToDelete) {
          setSelectedBotKey(filtered[0]?.botKey || null);
        }
        return filtered;
      });
    } finally {
      setBotKeyToDelete(null);
    }
  };

  const handleCopyJson = async () => {
    if (!activeJsonText.trim()) return;
    try {
      await navigator.clipboard.writeText(activeJsonText);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownloadJson = () => {
    if (!activeJsonText.trim()) return;
    const blob = new Blob([activeJsonText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedBot?.botKey || 'scanned_bot'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeployWithToken = async () => {
    setDeployError(null);
    setDeploySuccess(null);
    setDeployedBot(null);

    const blueprint = parsedBlueprint || selectedBot?.blueprint;
    if (!blueprint) {
      setDeployError('لا يوجد تصميم بوت صالح للنشر بعد. تفاعل مع بوت أولاً لالتقاط تصميمه.');
      return;
    }

    const tokenCheck = validateBotToken(tokenInput);
    if (!tokenCheck.isValid) {
      setDeployError(tokenCheck.error || 'يرجى إدخال توكن البوت الصحيح من @BotFather.');
      return;
    }

    const cleanToken = tokenCheck.sanitizedToken || sanitizeBotToken(tokenInput);
    setTokenInput(cleanToken);

    try {
      setIsDeploying(true);
      const res = await api.importAndConnectBot(blueprint, cleanToken);
      setDeployedBot(res.bot);
      setDeploySuccess(
        `تم إنشاء وتفعيل البوت بنجاح بنفس تصميم البوت الممسوح! يمكنك فتحه الآن وإرسال /start.`
      );
      onBotCreated(res.bot, false);
    } catch (err: any) {
      setDeployError(err?.message || 'فشل تفعيل البوت وربطه بتيليجرام.');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleSaveAsDraft = async () => {
    setDeployError(null);
    setDeploySuccess(null);
    setDeployedBot(null);

    const blueprint = parsedBlueprint || selectedBot?.blueprint;
    if (!blueprint) {
      setDeployError('لا يوجد تصميم بوت لحفظه بعد.');
      return;
    }

    try {
      setIsSavingDraft(true);
      const created = await api.createBotFromBlueprint(blueprint);
      setDeployedBot(created);
      setDeploySuccess(`تم حفظ البوت "${created.name}" في قائمة البوتات كمسودة.`);
      onBotCreated(created, false);
    } catch (err: any) {
      setDeployError(err?.message || 'فشل حفظ المسودة.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const blueprintStats = useMemo(() => {
    const bp = parsedBlueprint || selectedBot?.blueprint;
    return {
      inlineCount: bp?.inlineButtons?.length || 0,
      replyCount: bp?.replyButtons?.length || 0,
      flowsCount: bp?.buttonFlows ? Object.keys(bp.buttonFlows).length : 0,
      commandsCount: bp?.commands?.length || 0,
    };
  }, [parsedBlueprint, selectedBot?.blueprint]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-sky-200/80 dark:border-slate-800/80">
        <div>
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 mb-2 cursor-pointer"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>العودة إلى إدارة البوتات</span>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Radar className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight font-mono">
              scan Telegram
            </h1>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 max-w-3xl leading-relaxed">
            اربط حسابك في تيليجرام عبر{' '}
            <span className="font-mono text-xs text-slate-800 dark:text-slate-200">
              API ID · API Hash · Session
            </span>{' '}
            وتفاعل مع أي بوت داخل تطبيق تيليجرام أو مباشرة من هنا، وسيتم تسجيل الرسائل والأزرار والوسائط تلقائياً وتحويلها إلى كود JSON جاهز للتفعيل بتوكن بوتك.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0">
          {status.isConnected && (
            <button
              type="button"
              onClick={handleSyncRecentHistory}
              disabled={isSyncingHistory}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingHistory ? 'animate-spin' : ''}`} />
              <span>{isSyncingHistory ? 'جاري السحب...' : 'مزامنة تفاعلات تيليجرام الآن'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={loadStatusAndCaptures}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-sky-50 dark:hover:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث السجل</span>
          </button>
        </div>
      </div>

      {/* Section 1: Telegram User Account MTProto Connection + Saved Sessions Dropdown */}
      <section className="mb-6 bg-white dark:bg-slate-900/75 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_-6px_rgba(14,116,144,0.08)] space-y-5">
        {/* Saved Sessions Dropdown Bar (shown whenever at least 1 account session is saved) */}
        {status.savedAccounts.length > 0 && (
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 pb-4 border-b border-sky-100 dark:border-slate-800">
            <div className="flex-1 min-w-0">
              <label
                htmlFor="scan-saved-accounts-select"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                <Users className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span>الجلسات المحفوظة ({status.savedAccounts.length})</span>
              </label>
              <select
                id="scan-saved-accounts-select"
                value={selectedSavedId}
                onChange={(e) => setSelectedSavedId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-medium bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40 cursor-pointer"
              >
                {status.savedAccounts.map((acc) => {
                  const handle = acc.username ? `@${acc.username}` : acc.phone || acc.accountId;
                  const stateTag = acc.isActive ? ' (متصل حالياً)' : '';
                  return (
                    <option key={acc.id} value={acc.id}>
                      {acc.firstName} {acc.lastName || ''} — {handle}
                      {stateTag}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {selectedSavedId &&
                !(status.isConnected && status.activeSavedAccountId === selectedSavedId) && (
                  <button
                    type="button"
                    disabled={isAuthBusy}
                    onClick={() => handleSwitchSavedAccount(selectedSavedId)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
                  >
                    <Radar className="w-3.5 h-3.5" />
                    <span>{status.isConnected ? 'تبديل إلى هذا الحساب' : 'اتصال بالحساب المحفوظ'}</span>
                  </button>
                )}

              <button
                type="button"
                onClick={() => {
                  setShowAddAccountForm((prev) => !prev);
                  setAuthError(null);
                  setAuthSuccess(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                  showAddAccountForm
                    ? 'bg-sky-100 dark:bg-slate-800 text-sky-800 dark:text-sky-200 border-sky-300 dark:border-slate-600'
                    : 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-slate-800'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddAccountForm ? 'إخفاء نموذج إضافة حساب' : 'إضافة حساب آخر'}</span>
              </button>

              {selectedSavedId && (
                <button
                  type="button"
                  disabled={isAuthBusy}
                  onClick={() => setAccountIdToDelete(selectedSavedId)}
                  aria-label="حذف الجلسة المحددة"
                  title="حذف الحساب المحفوظ"
                  className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-sky-200/80 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {(authError || (status.state === 'error' && status.error)) && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{authError || status.error}</span>
          </div>
        )}

        {authSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{authSuccess}</span>
          </div>
        )}

        {status.isConnected && status.account && (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {status.account.firstName} {status.account.lastName || ''}
                  </h2>
                  {status.account.username && (
                    <span className="text-xs font-mono text-sky-700 dark:text-sky-400" dir="ltr">
                      @{status.account.username}
                    </span>
                  )}
                  <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    · متصل ومستمع مباشرة لتطبيق تيليجرام
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  تفاعل مع أي بوت من تطبيق تيليجرام على جوالك/حاسوبك أو من هنا وسيتم حفظ الرسائل والأزرار وتنسيق JSON تلقائياً.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {status.sessionString && (
                <button
                  type="button"
                  onClick={handleCopySession}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  {copiedSession ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>تم نسخ الجلسة</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ كود الجلسة</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => handleDisconnect(false)}
                disabled={isAuthBusy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>إيقاف الاتصال (مع بقاء الجلسة)</span>
              </button>
            </div>
          </div>
        )}

        {((!status.isConnected && status.savedAccounts.length === 0) ||
          showAddAccountForm ||
          status.state === 'awaiting_code' ||
          status.state === 'awaiting_password') && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {status.savedAccounts.length > 0
                    ? 'إضافة حساب تيليجرام آخر وحفظ جلسته'
                    : 'ربط حساب تيليجرام الشخصي'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  احصل على <span className="font-mono">API ID</span> و{' '}
                  <span className="font-mono">API Hash</span> من{' '}
                  <a
                    href="https://my.telegram.org/apps"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-600 dark:text-sky-400 underline hover:text-sky-500"
                  >
                    my.telegram.org
                  </a>
                </p>
              </div>

              <div
                className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex p-1 bg-sky-50 dark:bg-slate-800 border border-sky-200/80 dark:border-slate-700 rounded-xl sm:self-start"
                role="tablist"
                aria-label="طريقة تسجيل الدخول لحساب تيليجرام"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'session'}
                  onClick={() => {
                    setAuthMode('session');
                    setAuthError(null);
                  }}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    authMode === 'session'
                      ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>الدخول بالجلسة (Session)</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'phone'}
                  onClick={() => {
                    setAuthMode('phone');
                    setAuthError(null);
                  }}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    authMode === 'phone'
                      ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>تسجيل برقم الهاتف وتوليد جلسة</span>
                </button>
              </div>
            </div>

            {authMode === 'session' ? (
              <form onSubmit={handleConnectWithSession} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="scan-api-id"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      API ID
                    </label>
                    <input
                      id="scan-api-id"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={apiId}
                      onChange={(e) => setApiId(e.target.value)}
                      placeholder="12345678"
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="scan-api-hash"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      API Hash
                    </label>
                    <div className="relative">
                      <input
                        id="scan-api-hash"
                        type={showApiHash ? 'text' : 'password'}
                        dir="ltr"
                        value={apiHash}
                        onChange={(e) => setApiHash(e.target.value)}
                        placeholder="0123456789abcdef0123456789abcdef"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm font-mono bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiHash(!showApiHash)}
                        aria-label={showApiHash ? 'إخفاء API Hash' : 'إظهار API Hash'}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showApiHash ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="scan-string-session"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    كود الجلسة (GramJS StringSession)
                  </label>
                  <textarea
                    id="scan-string-session"
                    dir="ltr"
                    rows={3}
                    value={sessionInput}
                    onChange={(e) => setSessionInput(e.target.value)}
                    placeholder="1BVtsOHoBu..."
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    يتم حفظ الجلسة محلياً على الخادم فقط للاستماع المباشر لتفاعلاتك مع البوتات.
                  </span>
                  <button
                    type="submit"
                    disabled={isAuthBusy}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl transition-colors shadow-sm cursor-pointer"
                  >
                    {isAuthBusy ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري الاتصال بالحساب...</span>
                      </>
                    ) : (
                      <>
                        <Radar className="w-4 h-4" />
                        <span>اتصال وبدء المسح التلقائي</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : status.state === 'awaiting_code' || status.state === 'awaiting_password' ? (
              <form onSubmit={handleVerifyPhoneCode} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {status.state === 'awaiting_code' && (
                    <div>
                      <label
                        htmlFor="scan-otp-code"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        رمز التحقق ({isCodeViaApp ? 'مرسل داخل تطبيق تيليجرام' : 'مرسل برسالة SMS'})
                      </label>
                      <input
                        id="scan-otp-code"
                        type="text"
                        dir="ltr"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="12345"
                        className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40"
                      />
                    </div>
                  )}
                  {status.state === 'awaiting_password' && (
                    <div>
                      <label
                        htmlFor="scan-2fa-password"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        كلمة مرور التحقق بخطوتين (2FA Password)
                      </label>
                      <input
                        id="scan-2fa-password"
                        type="password"
                        dir="ltr"
                        value={twoFaPassword}
                        onChange={(e) => setTwoFaPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isAuthBusy}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
                  >
                    {isAuthBusy ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري التحقق...</span>
                      </>
                    ) : (
                      <span>تأكيد وتسجيل الدخول</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(false)}
                    className="px-4 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleStartPhoneLogin} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor="scan-phone-api-id"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      API ID
                    </label>
                    <input
                      id="scan-phone-api-id"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={apiId}
                      onChange={(e) => setApiId(e.target.value)}
                      placeholder="12345678"
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="scan-phone-api-hash"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      API Hash
                    </label>
                    <div className="relative">
                      <input
                        id="scan-phone-api-hash"
                        type={showApiHash ? 'text' : 'password'}
                        dir="ltr"
                        value={apiHash}
                        onChange={(e) => setApiHash(e.target.value)}
                        placeholder="0123456789abcdef..."
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm font-mono bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiHash(!showApiHash)}
                        aria-label={showApiHash ? 'إخفاء API Hash' : 'إظهار API Hash'}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showApiHash ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="scan-phone-number"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      رقم الهاتف (بالصيغة الدولية)
                    </label>
                    <input
                      id="scan-phone-number"
                      type="tel"
                      dir="ltr"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+967770000000"
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isAuthBusy}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl transition-colors shadow-sm cursor-pointer"
                  >
                    {isAuthBusy ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري إرسال رمز التحقق...</span>
                      </>
                    ) : (
                      <>
                        <Phone className="w-4 h-4" />
                        <span>إرسال رمز التحقق</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </section>

      {/* Quick Target Bot Scanner Form (when connected) */}
      {status.isConnected && (
        <section className="mb-6 bg-white dark:bg-slate-900/75 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <form
            onSubmit={handleScanBotUsername}
            className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
          >
            <div className="flex-1">
              <label
                htmlFor="scan-target-bot"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                فتح ومسح أي بوت مباشرة (أو افتح البوت في تيليجرام بنفسك ليظهر هنا تلقائياً)
              </label>
              <input
                id="scan-target-bot"
                type="text"
                dir="ltr"
                value={targetBotInput}
                onChange={(e) => setTargetBotInput(e.target.value)}
                placeholder="@example_bot"
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40"
              />
            </div>
            <button
              type="submit"
              disabled={isInteracting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl transition-colors cursor-pointer shrink-0 h-[42px]"
            >
              {isInteracting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>إرسال /start والتقاط التصميم</span>
            </button>
          </form>
        </section>
      )}

      {/* Feedback Alerts for Interactions */}
      {interactionError && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{interactionError}</span>
        </div>
      )}
      {interactionNotice && (
        <div className="mb-4 p-3 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/25 text-sky-800 dark:text-sky-200 text-xs flex items-center gap-2">
          <MessageSquare className="w-4 h-4 shrink-0" />
          <span>{interactionNotice}</span>
        </div>
      )}

      {/* Main Scan Workspace */}
      {capturedBots.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/75 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <Radar className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
            في انتظار التفاعل مع أول بوت تيليجرام
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
            {status.isConnected
              ? 'حسابك متصل الآن! افتح أي بوت داخل تيليجرام وأرسل /start أو اضغط على أزراره، أو أدخل معرف البوت أعلاه للبدء في التقاط تصميمه وتدفقاته ككود JSON.'
              : 'قم بتسجيل الدخول أعلاه باستخدام API ID و API Hash وكود الجلسة (أو برقم الهاتف) ليبدأ النظام بالتقاط تصميم أي بوت تتفاعل معه.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Captured Bots Switcher Strip */}
          <div className="flex flex-wrap items-center gap-2">
            {capturedBots.map((bot) => {
              const active = bot.botKey === selectedBotKey;
              return (
                <div key={bot.botKey} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => setSelectedBotKey(bot.botKey)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                      active
                        ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-sky-200 dark:border-slate-700 hover:border-sky-400'
                    }`}
                  >
                    <span>{bot.customName || bot.displayName}</span>
                    {bot.username && (
                      <span
                        dir="ltr"
                        className={`font-mono text-[11px] ${
                          active ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        @{bot.username}
                      </span>
                    )}
                    <span
                      className={`text-[11px] tabular-nums ${
                        active ? 'text-sky-100' : 'text-slate-400'
                      }`}
                    >
                      · {bot.events.length}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {selectedBot && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Right Column (7 cols): Live Interaction Mirror & Timeline */}
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-white dark:bg-slate-900/75 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-sky-100 dark:border-slate-800">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {selectedBot.displayName}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {selectedBot.username && (
                          <span className="font-mono text-sky-600 dark:text-sky-400" dir="ltr">
                            @{selectedBot.username}
                          </span>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{selectedBot.events.length} تفاعل مسجل</span>
                        {selectedBot.commands.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{selectedBot.commands.length} أوامر</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {status.isConnected && (
                        <button
                          type="button"
                          onClick={() => handleSendTextToSelectedBot('/start')}
                          disabled={isInteracting}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 rounded-xl cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>إعادة إرسال /start</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setBotKeyToDelete(selectedBot.botKey)}
                        aria-label={`حذف سجل ${selectedBot.displayName}`}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Send custom message/command to this bot */}
                  {status.isConnected && (
                    <div className="flex items-center gap-2 mb-4">
                      <input
                        type="text"
                        value={customMessageInput}
                        onChange={(e) => setCustomMessageInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSendTextToSelectedBot(customMessageInput);
                          }
                        }}
                        placeholder="أرسل أمراً أو رسالة للبوت مباشرة (مثل /help أو نص زر Reply)..."
                        className="flex-1 px-3.5 py-2 text-xs bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40"
                      />
                      <button
                        type="button"
                        disabled={isInteracting || !customMessageInput.trim()}
                        onClick={() => handleSendTextToSelectedBot(customMessageInput)}
                        className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-45 rounded-xl transition-colors cursor-pointer"
                      >
                        إرسال
                      </button>
                    </div>
                  )}

                  {/* Captured Steps Stream */}
                  <div className="space-y-3.5 max-h-[680px] overflow-y-auto pl-1">
                    {selectedBot.events.map((ev) => {
                      const resolved = selectedBot.resolvedEvents?.find(
                        (r) => r.eventId === ev.id
                      );
                      const overrideVal = selectedBot.manualParentOverrides?.[ev.id];
                      const selectValue =
                        overrideVal !== undefined ? overrideVal || '__auto__' : '__auto__';

                      return (
                        <div
                          key={ev.id}
                          className="p-4 rounded-xl bg-[#F7FAFE] dark:bg-slate-950/60 border border-sky-200/70 dark:border-slate-800 space-y-3"
                        >
                          {/* Step Header Metadata */}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-400">
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {ev.kind === 'start_response'
                                  ? 'استجابة البداية (/start)'
                                  : ev.kind === 'edit_message'
                                  ? 'تعديل رسالة'
                                  : ev.kind === 'callback_alert'
                                  ? 'تنبيه Callback Alert'
                                  : 'رسالة جديدة'}
                              </span>
                              {ev.triggerText && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono text-sky-700 dark:text-sky-400">
                                    {ev.triggerText}
                                  </span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  resolved?.assignedTo === 'unassigned'
                                    ? 'text-amber-600 dark:text-amber-400 font-medium'
                                    : 'text-emerald-700 dark:text-emerald-400 font-medium'
                                }
                              >
                                {resolved?.assignedLabel || 'قيد المعالجة'}
                              </span>
                            </div>

                            {/* Reassign / Link Control */}
                            <select
                              aria-label="تعيين ارتباط الرسالة في التصميم"
                              value={selectValue}
                              onChange={(e) => handleLinkStep(ev.id, e.target.value)}
                              className="px-2.5 py-1 text-[11px] bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              <option value="__auto__">ربط تلقائي ({resolved?.assignedLabel})</option>
                              <option value="__start__">تعيين كرسالة البداية (/start)</option>
                              {(resolved?.candidateButtons || []).map((cand) => (
                                <option key={cand.id} value={cand.id}>
                                  ربط بالزر: {cand.text}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Media Thumbnails if captured */}
                          {ev.media && ev.media.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {ev.media.map((m) => (
                                <div
                                  key={m.id}
                                  className="rounded-lg overflow-hidden border border-sky-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                >
                                  {m.type === 'photo' ? (
                                    <img
                                      src={m.url}
                                      alt={m.fileName || 'صورة ملتقطة'}
                                      className="max-h-36 w-auto object-cover"
                                    />
                                  ) : (
                                    <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300 font-mono">
                                      [{m.type}] {m.fileName || m.url}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Captured Text */}
                          {ev.text && (
                            <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-900/80 p-3 rounded-lg border border-sky-100 dark:border-slate-800/80">
                              {ev.text}
                            </div>
                          )}

                          {/* Callback Alert */}
                          {ev.callbackAlert && (
                            <div className="text-xs text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-500/10 px-3 py-2 rounded-lg border border-sky-200 dark:border-sky-500/20">
                              تنبيه: {ev.callbackAlert.text}
                            </div>
                          )}

                          {/* Interactive Captured Inline Buttons */}
                          {ev.inlineButtons.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                أزرار Inline (اضغط لاختبارها والتقاط تدفقها داخل النظام):
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {ev.inlineButtons.map((btn) => (
                                  <button
                                    key={btn.id}
                                    type="button"
                                    disabled={
                                      isInteracting ||
                                      !status.isConnected ||
                                      btn.actionType !== 'flow' ||
                                      !btn.callbackData
                                    }
                                    onClick={() =>
                                      handleClickCapturedInlineButton(
                                        ev.telegramMessageId,
                                        btn.id,
                                        btn.text,
                                        btn.callbackData
                                      )
                                    }
                                    title={
                                      btn.url
                                        ? `رابط خارجي: ${btn.url}`
                                        : btn.callbackData
                                        ? `callback_data: ${btn.callbackData}`
                                        : btn.text
                                    }
                                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-sky-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:border-sky-500 hover:text-sky-700 dark:hover:text-sky-300 disabled:opacity-60 transition-colors cursor-pointer"
                                  >
                                    {btn.text}
                                    {btn.url ? ' ↗' : ''}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Interactive Captured Reply Buttons */}
                          {ev.replyButtons.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                أزرار Reply (اضغط لإرسال نص الزر للبوت والتقاط رده):
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {ev.replyButtons.map((btn) => (
                                  <button
                                    key={btn.id}
                                    type="button"
                                    disabled={
                                      isInteracting ||
                                      !status.isConnected ||
                                      btn.actionType !== 'flow'
                                    }
                                    onClick={() => handleSendTextToSelectedBot(btn.text)}
                                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:border-sky-500 disabled:opacity-60 transition-colors cursor-pointer"
                                  >
                                    {btn.text}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Left Column (5 cols): Live Blueprint JSON + Simulator + Token Activation */}
              <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-20">
                <div className="bg-white dark:bg-slate-900/75 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                  {/* Unboxed Stats Summary Strip */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400 pb-3 border-b border-sky-100 dark:border-slate-800">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      ملخص التصميم المستخرج
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">Inline: {blueprintStats.inlineCount}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">Reply: {blueprintStats.replyCount}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">التدفقات: {blueprintStats.flowsCount}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">الأوامر: {blueprintStats.commandsCount}</span>
                  </div>

                  {/* Preview / JSON Toggle */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex p-1 bg-sky-50 dark:bg-slate-800 border border-sky-200/80 dark:border-slate-700 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setRightTab('simulator')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                          rightTab === 'simulator'
                            ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>المحاكي الفوري</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRightTab('json')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                          rightTab === 'json'
                            ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <FileJson className="w-3.5 h-3.5" />
                        <span>كود JSON</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyJson}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 rounded-lg cursor-pointer"
                      >
                        {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedJson ? 'تم النسخ' : 'نسخ JSON'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadJson}
                        aria-label="تنزيل ملف JSON"
                        className="p-1.5 text-slate-600 dark:text-slate-300 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 rounded-lg cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {rightTab === 'simulator' ? (
                    <TelegramSimulator bot={previewBot} />
                  ) : (
                    <div>
                      <textarea
                        aria-label="كود JSON المستخرج من البوت"
                        dir="ltr"
                        rows={15}
                        value={activeJsonText}
                        onChange={(e) => setEditableJsonOverride(e.target.value)}
                        className="w-full px-3.5 py-3 text-xs font-mono bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500/40"
                      />
                      {editableJsonOverride !== null && (
                        <button
                          type="button"
                          onClick={() => setEditableJsonOverride(null)}
                          className="mt-2 text-xs text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                        >
                          العودة إلى النسخة المزامنة تلقائياً
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Activate Captured Design on Own Bot Token */}
                <div className="bg-white dark:bg-slate-900/75 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    تفعيل نفس التصميم في بوتك بتوكن
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="scan-deploy-name"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        اسم البوت الجديد في اللوحة
                      </label>
                      <input
                        id="scan-deploy-name"
                        type="text"
                        value={deployBotName}
                        onChange={(e) => setDeployBotName(e.target.value)}
                        placeholder={selectedBot.displayName}
                        className="w-full px-3.5 py-2 text-xs bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="scan-deploy-token"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        توكن البوت الجديد (من @BotFather)
                      </label>
                      <div className="relative">
                        <input
                          id="scan-deploy-token"
                          type={showToken ? 'text' : 'password'}
                          dir="ltr"
                          value={tokenInput}
                          onChange={(e) => setTokenInput(e.target.value)}
                          placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                          className="w-full pl-10 pr-3.5 py-2.5 text-xs font-mono bg-[#F5F9FD] dark:bg-slate-950/70 border border-sky-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          aria-label={showToken ? 'إخفاء التوكن' : 'إظهار التوكن'}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                          {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {deployError && (
                    <div
                      role="alert"
                      className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{deployError}</span>
                    </div>
                  )}

                  {deploySuccess && (
                    <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-800 dark:text-emerald-200 text-xs space-y-2">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{deploySuccess}</span>
                      </div>
                      {deployedBot && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {deployedBot.botUsername && (
                            <a
                              href={`https://t.me/${deployedBot.botUsername}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>فتح @{deployedBot.botUsername}</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => onBotCreated(deployedBot, true)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-emerald-300 dark:border-slate-700 text-emerald-800 dark:text-emerald-200 rounded-lg cursor-pointer"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>فتح في المحرر الكامل</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleDeployWithToken}
                      disabled={isDeploying || isSavingDraft}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl transition-colors shadow-sm cursor-pointer"
                    >
                      {isDeploying ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جاري التفعيل في تيليجرام...</span>
                        </>
                      ) : (
                        <>
                          <Rocket className="w-4 h-4" />
                          <span>تفعيل البوت في تيليجرام الآن</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveAsDraft}
                      disabled={isDeploying || isSavingDraft}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>حفظ كمسودة</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(botKeyToDelete)}
        title="حذف سجل البوت الممسوح"
        message="هل تريد حذف سجل التفاعلات الملتقطة لهذا البوت من scan Telegram؟"
        confirmLabel="نعم، احذف السجل"
        cancelLabel="إلغاء"
        onConfirm={handleDeleteCapturedBotConfirm}
        onCancel={() => setBotKeyToDelete(null)}
      />

      <ConfirmModal
        isOpen={Boolean(accountIdToDelete)}
        title="حذف الجلسة المحفوظة"
        message="هل تريد حذف جلسة هذا الحساب من القائمة المحفوظة؟ يمكنك إعادة إضافتها لاحقاً في أي وقت."
        confirmLabel="نعم، احذف الجلسة"
        cancelLabel="إلغاء"
        onConfirm={handleDeleteSavedAccountConfirm}
        onCancel={() => setAccountIdToDelete(null)}
      />
    </div>
  );
};
