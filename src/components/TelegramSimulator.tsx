import React, { useState, useEffect, useRef } from 'react';
import {
  RotateCcw,
  Sun,
  Moon,
  Smartphone,
  Send,
  MoreVertical,
  CheckCheck,
  Workflow,
  Sparkles,
  Link as LinkIcon,
  Phone,
  MapPin,
  Move,
  GripVertical,
  LayoutGrid,
  Layers,
  Code,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Edit3,
  Check,
  X,
  Maximize2,
  Minimize2,
  FileText,
  Globe,
  Copy as CopyIcon,
  Shield,
  Terminal,
  Eye,
  BellOff,
  Link2,
  CheckSquare,
  Square,
  BarChart2,
} from 'lucide-react';
import {
  BotButton,
  BotConfig,
  MediaItem,
  NavigationBreadcrumb,
  TelegramMessageOptions,
} from '../types/bot';
import {
  getButtonColorClasses,
  groupButtonsIntoRows,
  findButtonById,
  LAYOUT_TEMPLATES,
  applyLayoutTemplate,
} from '../utils/telegramFormatters';
import { clampPage } from '../utils/pagination';
import {
  findContextAwareReplyAction,
  findParentFlowId,
  resolveMenuView,
  resolveSlashCommand,
} from '../utils/flowEngine';
import { TELEGRAM_MESSAGE_EFFECTS } from '../utils/telegramDelivery';
import { SimulatorQuickEditor } from './SimulatorQuickEditor';
import { RowArrangerModal } from './RowArrangerModal';
import { TelegramApiInspectorModal } from './TelegramApiInspectorModal';

interface TelegramSimulatorProps {
  bot: BotConfig;
  onSelectButtonToEdit?: (button: BotButton) => void;
  onUpdateBot?: (updates: Partial<BotConfig>) => Promise<void>;
  scanMode?: boolean;
  isScanning?: boolean;
  onScanTriggerButton?: (button: BotButton) => Promise<boolean | void>;
  onScanSendText?: (text: string) => Promise<boolean | void>;
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text?: string;
  media?: MediaItem[];
  timestamp: string;
  triggeredButton?: BotButton;
  page?: number;
  menuId?: string;
  breadcrumbs?: NavigationBreadcrumb[];
  isSystemNotice?: boolean;
  messageOptions?: TelegramMessageOptions;
  reactionEmoji?: string;
  poll?: {
    question: string;
    options: string[];
    type: 'regular' | 'quiz';
    allowsMultiple?: boolean;
    correctIndex?: number;
    explanation?: string;
    selectedIndices?: number[];
  };
  checklist?: {
    title: string;
    tasks: { text: string; done: boolean }[];
  };
  dice?: {
    emoji: string;
    value: number;
  };
  isStreaming?: boolean;
}

const CHAT_ACTION_STATUS_LABELS: Record<string, string> = {
  typing: 'يكتب الآن...',
  upload_photo: 'يرسل صورة...',
  record_video: 'يسجل فيديو...',
  upload_video: 'يرسل فيديو...',
  record_voice: 'يسجل رسالة صوتية...',
  upload_document: 'يرسل ملفاً...',
  choose_sticker: 'يختار ملصقاً...',
};

export const TelegramSimulator: React.FC<TelegramSimulatorProps> = ({
  bot,
  onSelectButtonToEdit,
  onUpdateBot,
  scanMode = false,
  isScanning = false,
  onScanTriggerButton,
  onScanSendText,
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(
    bot.settings?.simulatorTheme || 'dark'
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [simulatedInput, setSimulatedInput] = useState('');
  const [showReplyKeyboard, setShowReplyKeyboard] = useState(true);
  const [forceReplyPlaceholder, setForceReplyPlaceholder] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [typingActionLabel, setTypingActionLabel] = useState<string | null>(null);
  const [callbackAlertModal, setCallbackAlertModal] = useState<{ text: string } | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});
  const [showSlashMenu, setShowSlashMenu] = useState(false);

  // Modes: 'preview' (live Telegram behavior) vs 'design' (click opens quick editor)
  const [simulatorMode, setSimulatorMode] = useState<'preview' | 'design'>(
    scanMode ? 'preview' : 'design'
  );
  const [isReorderMode, setIsReorderMode] = useState(false);

  const prevBotIdRef = useRef<string>(bot.id);
  const pendingScanNavRef = useRef<{
    type: 'button';
    button: BotButton;
    sourceMsgId?: string;
    latestBotRef: BotConfig;
  } | {
    type: 'command';
    text: string;
    latestBotRef: BotConfig;
  } | null>(null);

  // Selected button for in-simulator quick editing
  const [selectedButton, setSelectedButton] = useState<BotButton | null>(null);
  const [flowBreadcrumbs, setFlowBreadcrumbs] = useState<BotButton[]>([]);

  // Row Arranger modal state directly triggered from simulator
  const [isArrangerModalOpen, setIsArrangerModalOpen] = useState(false);
  const [arrangerTarget, setArrangerTarget] = useState<'inline' | 'reply'>('inline');

  // Reply keyboard pagination & navigation state
  const [replyPage, setReplyPage] = useState<number>(0);
  const [replyMenuId, setReplyMenuId] = useState<string>('main');
  const [replyBreadcrumbs, setReplyBreadcrumbs] = useState<NavigationBreadcrumb[]>([]);

  // Drag and drop states
  const [draggingBtnId, setDraggingBtnId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<'inline' | 'reply' | null>(null);
  const [dragOverBtnId, setDragOverBtnId] = useState<string | null>(null);

  // Telegram API Inspector modal & placeholder state
  const [isApiInspectorOpen, setIsApiInspectorOpen] = useState(false);
  const [isEditingPlaceholder, setIsEditingPlaceholder] = useState(false);
  const [customPlaceholder, setCustomPlaceholder] = useState(
    bot.settings?.inputFieldPlaceholder || ''
  );
  const [quickTemplateTarget, setQuickTemplateTarget] = useState<'inline' | 'reply'>('inline');

  const notifyAction = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 3500);
  };

  // Initialize or reset chat to start message (completely faithful to flowEngine without forced defaults)
  const resetToStart = () => {
    setReplyPage(0);
    setReplyMenuId('main');
    setReplyBreadcrumbs([]);
    setShowReplyKeyboard(true);
    setForceReplyPlaceholder(null);

    const startView = resolveMenuView(bot, 'main', 0);
    const hasContent =
      startView.hasExplicitText ||
      startView.media.length > 0 ||
      startView.inlineRows.length > 0;

    if (!hasContent) {
      setMessages([]);
      return;
    }

    const initialMessages: ChatMessage[] = [
      {
        id: 'msg_user_start',
        sender: 'user',
        text: '/start',
        timestamp: '10:00',
      },
      {
        id: 'msg_bot_start',
        sender: 'bot',
        menuId: 'main',
        page: 0,
        breadcrumbs: [],
        timestamp: '10:00',
      },
    ];

    setMessages(initialMessages);
  };

  // Automatically sync /start message when bot config changes & consume pending live scan navigation
  useEffect(() => {
    const botIdChanged = prevBotIdRef.current !== bot.id;
    if (botIdChanged) {
      prevBotIdRef.current = bot.id;
      pendingScanNavRef.current = null;
      resetToStart();
      return;
    }

    if (pendingScanNavRef.current && pendingScanNavRef.current.latestBotRef !== bot) {
      const pending = pendingScanNavRef.current;
      pendingScanNavRef.current = null;
      if (pending.type === 'button') {
        const refreshedBtn = findButtonById(bot, pending.button.id)?.button || pending.button;
        executePreviewMenu(refreshedBtn.id, 0, pending.sourceMsgId, refreshedBtn);
        return;
      }
      if (pending.type === 'command') {
        if (pending.text === '/start') {
          resetToStart();
          return;
        }
        const slashRes = resolveSlashCommand(bot, pending.text);
        if (slashRes.matched) {
          executePreviewMenu(slashRes.targetMenuId, 0);
          return;
        }
      }
    }

    const startView = resolveMenuView(bot, 'main', 0);
    const hasContent =
      startView.hasExplicitText ||
      startView.media.length > 0 ||
      startView.inlineRows.length > 0;

    if (messages.length === 0 && hasContent) {
      resetToStart();
    }
  }, [bot, bot.id, bot.startMessage, bot.inlineButtons, bot.inlinePagination]);

  const nowTime = () =>
    new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });

  // Execute a menu/flow navigation in Preview Mode (parity with server.ts)
  const executePreviewMenu = (
    targetMenuId: string,
    targetPage: number,
    sourceMsgId?: string,
    triggeredButton?: BotButton
  ) => {
    const view = resolveMenuView(bot, targetMenuId, targetPage);
    if (view.isSkipped) {
      notifyAction(`تم تخطي التدفق للزر "${triggeredButton?.text || targetMenuId}"`);
      return;
    }

    // Update Reply Keyboard if the target flow has reply subButtons or keyboard control
    if (view.replySettings.removeKeyboard) {
      setShowReplyKeyboard(false);
    } else if (view.replySettings.forceReply) {
      setForceReplyPlaceholder(
        view.replySettings.inputFieldPlaceholder || 'اكتب ردك هنا...'
      );
    } else if (view.replyButtons.length > 0) {
      setReplyBreadcrumbs((prev) => [
        ...prev,
        { menuId: replyMenuId, page: replyPage },
      ]);
      setReplyMenuId(targetMenuId);
      setReplyPage(targetPage);
      setShowReplyKeyboard(true);
    }

    // Execute explicit FlowActions if present
    if (view.actions && view.actions.length > 0) {
      let flowRendered = false;
      for (const action of view.actions) {
        if (!action.enabled) continue;
        switch (action.type) {
          case 'delete_message':
            if (sourceMsgId) {
              setMessages((prev) => prev.filter((m) => m.id !== sourceMsgId));
            }
            break;
          case 'send_message':
            if (action.config?.text?.trim()) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `msg_act_${Date.now()}_${Math.random()}`,
                  sender: 'bot',
                  text: action.config!.text,
                  timestamp: nowTime(),
                },
              ]);
            }
            break;
          case 'edit_message':
            if (sourceMsgId && action.config?.text?.trim()) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === sourceMsgId ? { ...m, text: action.config!.text } : m
                )
              );
            }
            break;
          case 'remove_reply_keyboard':
            setShowReplyKeyboard(false);
            notifyAction('تم تنفيذ remove_reply_keyboard');
            break;
          case 'force_reply':
            setForceReplyPlaceholder(action.config?.placeholder || 'الرجاء كتابة ردك...');
            break;
          case 'callback_alert': {
            const alertTxt = action.config?.text?.trim() || 'تم تنفيذ الإجراء بنجاح ✅';
            if (action.config?.showAlert) {
              setCallbackAlertModal({ text: alertTxt });
            } else {
              notifyAction(alertTxt);
            }
            break;
          }
          case 'send_chat_action': {
            const label =
              CHAT_ACTION_STATUS_LABELS[action.config?.chatAction || 'typing'] || 'يكتب الآن...';
            setTypingActionLabel(label);
            setTimeout(() => setTypingActionLabel(null), 1300);
            break;
          }
          case 'set_reaction': {
            const emoji = action.config?.reactionEmoji?.trim() || '👍';
            setMessages((prev) => {
              const targetIdx = sourceMsgId
                ? prev.findIndex((m) => m.id === sourceMsgId)
                : prev.length - 1;
              if (targetIdx === -1) return prev;
              return prev.map((m, idx) =>
                idx === targetIdx ? { ...m, reactionEmoji: emoji } : m
              );
            });
            break;
          }
          case 'send_dice': {
            const emoji = action.config?.diceEmoji || '🎲';
            const maxVal = emoji === '🎰' ? 64 : emoji === '🏀' || emoji === '⚽' ? 5 : 6;
            const value = Math.floor(Math.random() * maxVal) + 1;
            setMessages((prev) => [
              ...prev,
              {
                id: `msg_dice_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
                sender: 'bot',
                dice: { emoji, value },
                timestamp: nowTime(),
              },
            ]);
            break;
          }
          case 'send_poll': {
            const question = action.config?.pollQuestion?.trim() || 'ما رأيك؟';
            const options =
              action.config?.pollOptions && action.config.pollOptions.length >= 2
                ? action.config.pollOptions
                : ['نعم', 'لا'];
            setMessages((prev) => [
              ...prev,
              {
                id: `msg_poll_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
                sender: 'bot',
                poll: {
                  question,
                  options,
                  type: action.config?.pollType === 'quiz' ? 'quiz' : 'regular',
                  allowsMultiple: Boolean(action.config?.pollAllowsMultiple),
                  correctIndex: action.config?.pollCorrectOptionIndex,
                  explanation: action.config?.pollExplanation,
                  selectedIndices: [],
                },
                timestamp: nowTime(),
              },
            ]);
            break;
          }
          case 'send_checklist': {
            const title = action.config?.checklistTitle?.trim() || 'قائمة المهام';
            const taskTexts =
              action.config?.checklistTasks && action.config.checklistTasks.length > 0
                ? action.config.checklistTasks
                : ['مهمة 1', 'مهمة 2'];
            setMessages((prev) => [
              ...prev,
              {
                id: `msg_chk_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
                sender: 'bot',
                checklist: {
                  title,
                  tasks: taskTexts.map((t) => ({ text: t, done: false })),
                },
                timestamp: nowTime(),
              },
            ]);
            break;
          }
          case 'send_draft_stream': {
            const fullText =
              action.config?.text?.trim() || 'جاري تجهيز الرد المباشر عبر البث المتدرج (Draft Stream)...';
            const words = fullText.split(/\s+/);
            const streamMsgId = `msg_stream_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
            setMessages((prev) => [
              ...prev,
              {
                id: streamMsgId,
                sender: 'bot',
                text: words[0] || fullText,
                isStreaming: words.length > 1,
                timestamp: nowTime(),
              },
            ]);
            if (words.length > 1) {
              const stepSize = Math.max(1, Math.ceil(words.length / 4));
              let step = 1;
              const interval = setInterval(() => {
                step += 1;
                const endIdx = step * stepSize;
                const done = endIdx >= words.length;
                const partial = words.slice(0, endIdx).join(' ');
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamMsgId ? { ...m, text: partial, isStreaming: !done } : m
                  )
                );
                if (done) clearInterval(interval);
              }, 160);
            }
            break;
          }
          case 'jump_to_flow':
            if (action.config?.targetFlowId) {
              executePreviewMenu(
                action.config.targetFlowId,
                action.config.targetPage ?? 0,
                sourceMsgId,
                triggeredButton
              );
              return;
            }
            break;
          case 'go_back':
            handleInlineNav('nav:back', sourceMsgId);
            return;
          case 'go_parent':
            handleInlineNav('nav:parent', sourceMsgId);
            return;
          case 'go_home':
            handleInlineNav('nav:main', sourceMsgId);
            return;
          case 'close_flow':
            if (sourceMsgId) {
              setMessages((prev) => prev.filter((m) => m.id !== sourceMsgId));
            }
            return;
          default:
            flowRendered = false;
            break;
        }
      }
      if (flowRendered) return;
    }

    const enabledActionsCount = (view.actions || []).filter((a) => a.enabled).length;
    const shouldRenderBubble =
      view.hasExplicitText ||
      view.media.length > 0 ||
      view.inlineRows.length > 0 ||
      (view.replyButtons.length === 0 && enabledActionsCount === 0);

    if (!shouldRenderBubble) return;

    const sourceMsg = sourceMsgId ? messages.find((m) => m.id === sourceMsgId) : undefined;
    const isInlineTriggered = !triggeredButton || triggeredButton.type === 'inline';

    if (isInlineTriggered && view.updateMode === 'edit' && sourceMsg && sourceMsgId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === sourceMsgId
            ? {
                ...m,
                text: undefined,
                media: undefined,
                menuId: targetMenuId,
                page: view.page,
                breadcrumbs: [
                  ...(sourceMsg.breadcrumbs || []),
                  { menuId: sourceMsg.menuId || 'main', page: sourceMsg.page ?? 0 },
                ],
                triggeredButton,
              }
            : m
        )
      );
    } else {
      const botMsg: ChatMessage = {
        id: `msg_bot_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        sender: 'bot',
        menuId: targetMenuId,
        page: view.page,
        breadcrumbs: sourceMsg
          ? [
              ...(sourceMsg.breadcrumbs || []),
              { menuId: sourceMsg.menuId || 'main', page: sourceMsg.page ?? 0 },
            ]
          : [],
        timestamp: nowTime(),
        triggeredButton,
      };
      setMessages((prev) => [...prev, botMsg]);
    }
  };

  // Handle clicking any button in Design OR Preview mode
  const handleButtonClick = (button: BotButton, sourceMsgId?: string) => {
    if (simulatorMode === 'design') {
      setSelectedButton(button);
      setFlowBreadcrumbs([button]);
      return;
    }

    const now = nowTime();

    // Handle non-flow native Telegram Bot API actions cleanly
    switch (button.actionType) {
      case 'url':
        notifyAction(`رابط خارجي: ${button.url || ''}`);
        return;
      case 'web_app':
        notifyAction(`فتح Web App: ${button.webAppUrl || ''}`);
        return;
      case 'login_url':
        notifyAction(`تسجيل دخول عبر: ${button.loginUrlConfig?.url || ''}`);
        return;
      case 'copy_text':
        if (button.copyText && navigator.clipboard) {
          navigator.clipboard.writeText(button.copyText).catch(() => {});
        }
        notifyAction(`تم نسخ النص: ${button.copyText || ''}`);
        return;
      case 'switch_inline_query':
      case 'switch_inline_query_current_chat':
      case 'switch_inline_query_chosen_chat':
        notifyAction(`بحث Inline: "${button.switchInlineQuery || button.switchInlineChosenChat?.query || ''}"`);
        return;
      case 'callback_game':
        notifyAction('تشغيل لعبة تيليجرام (callback_game)');
        return;
      case 'pay':
        notifyAction('زر الدفع (يتطلب رسالة فاتورة sendInvoice)');
        return;
      case 'request_contact':
        setMessages((prev) => [
          ...prev,
          { id: `u_${Date.now()}`, sender: 'user', text: '📱 تم إرسال جهة الاتصال (+966500000000)', timestamp: now },
          { id: `b_${Date.now()}`, sender: 'bot', text: 'شكراً لك! تم استلام رقم الهاتف بنجاح ✅', timestamp: now },
        ]);
        return;
      case 'request_location':
        setMessages((prev) => [
          ...prev,
          { id: `u_${Date.now()}`, sender: 'user', text: '📍 تم مشاركة الموقع الجغرافي', timestamp: now },
          { id: `b_${Date.now()}`, sender: 'bot', text: 'شكراً لك! تم استلام موقعك الجغرافي بنجاح 📍', timestamp: now },
        ]);
        return;
      case 'request_poll':
        setMessages((prev) => [
          ...prev,
          { id: `u_${Date.now()}`, sender: 'user', text: '📊 تم إرسال الاستطلاع', timestamp: now },
          { id: `b_${Date.now()}`, sender: 'bot', text: 'تم استلام الاستطلاع بنجاح 📊', timestamp: now },
        ]);
        return;
      case 'request_users':
        notifyAction('فتح منتقي المستخدمين في تيليجرام (request_users)');
        return;
      case 'request_chat':
        notifyAction('فتح منتقي القنوات/المجموعات في تيليجرام (request_chat)');
        return;
      case 'none':
        return;
    }

    if (button.type === 'reply') {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_user_${Date.now()}`,
          sender: 'user',
          text: button.text,
          timestamp: now,
        },
      ]);
    }

    if (scanMode && simulatorMode === 'preview' && onScanTriggerButton) {
      if (isScanning) return;
      const snapshotBot = bot;
      pendingScanNavRef.current = {
        type: 'button',
        button,
        sourceMsgId,
        latestBotRef: snapshotBot,
      };
      void onScanTriggerButton(button).then((ok) => {
        if (ok === false && pendingScanNavRef.current?.type === 'button') {
          pendingScanNavRef.current = null;
        }
      });
      return;
    }

    executePreviewMenu(button.id, 0, sourceMsgId, button);
  };

  const handleInlineNav = (navData: string, msgId?: string) => {
    if (!msgId) return;
    if (navData === 'nav:parent') {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId) return m;
          const parentId = findParentFlowId(bot, m.menuId || 'main') || 'main';
          return {
            ...m,
            text: undefined,
            media: undefined,
            menuId: parentId,
            page: 0,
            breadcrumbs: parentId === 'main' ? [] : (m.breadcrumbs || []).slice(0, -1),
            triggeredButton:
              parentId === 'main' ? undefined : findButtonById(bot, parentId)?.button,
          };
        })
      );
      return;
    }

    if (navData === 'nav:back') {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId) return m;
          const breadcrumbs = m.breadcrumbs || [];
          if (breadcrumbs.length === 0) {
            return {
              ...m,
              text: undefined,
              media: undefined,
              menuId: 'main',
              page: 0,
              breadcrumbs: [],
              triggeredButton: undefined,
            };
          }
          const prevCrumb = breadcrumbs[breadcrumbs.length - 1];
          const remaining = breadcrumbs.slice(0, -1);
          return {
            ...m,
            text: undefined,
            media: undefined,
            menuId: prevCrumb.menuId,
            page: prevCrumb.page,
            breadcrumbs: remaining,
            triggeredButton:
              prevCrumb.menuId === 'main'
                ? undefined
                : findButtonById(bot, prevCrumb.menuId)?.button,
          };
        })
      );
      return;
    }

    if (navData === 'nav:main') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                text: undefined,
                media: undefined,
                menuId: 'main',
                page: 0,
                breadcrumbs: [],
                triggeredButton: undefined,
              }
            : m
        )
      );
    }
  };

  const handleInlineItemClick = (msgId: string, item: any) => {
    if (simulatorMode === 'design') {
      const btnId = item.id || item.callback_data;
      const found = findButtonById(bot, btnId);
      if (found?.button) {
        setSelectedButton(found.button);
        setFlowBreadcrumbs([found.button]);
        return;
      }
    }

    if (item.url) {
      notifyAction(`رابط خارجي: ${item.url}`);
      return;
    }
    if (item.web_app?.url) {
      notifyAction(`فتح Web App: ${item.web_app.url}`);
      return;
    }
    if (item.copy_text?.text) {
      navigator.clipboard?.writeText(item.copy_text.text).catch(() => {});
      notifyAction(`تم نسخ النص: ${item.copy_text.text}`);
      return;
    }
    if (item.login_url?.url) {
      notifyAction(`تسجيل دخول: ${item.login_url.url}`);
      return;
    }

    const callbackData: string = item.callback_data || '';
    if (callbackData === 'pg:info') return;

    if (callbackData.startsWith('pg:')) {
      const targetPage = parseInt(callbackData.slice(3), 10);
      if (!isNaN(targetPage)) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, page: targetPage } : m))
        );
      }
      return;
    }

    if (
      callbackData === 'nav:back' ||
      callbackData === 'nav:parent' ||
      callbackData === 'nav:main'
    ) {
      handleInlineNav(callbackData, msgId);
      return;
    }

    let found = findButtonById(bot, item.id || callbackData);
    if (!found && callbackData) {
      found = findButtonById(bot, callbackData);
    }
    if (!found && callbackData) {
      const matchByCallback = (btns?: BotButton[]): BotButton | undefined =>
        btns?.find((b) => b.callbackData === callbackData || b.id === callbackData);
      let matchedBtn = matchByCallback(bot.inlineButtons);
      if (!matchedBtn && bot.buttonFlows) {
        for (const flow of Object.values(bot.buttonFlows)) {
          matchedBtn = matchByCallback(flow.subButtons);
          if (matchedBtn) break;
        }
      }
      if (matchedBtn) {
        found = { button: matchedBtn };
      }
    }
    if (found?.button) {
      handleButtonClick(found.button, msgId);
    }
  };

  const handleReplyItemClick = (item: any) => {
    if (simulatorMode === 'design') {
      const btnId = item.id;
      const found = btnId ? findButtonById(bot, btnId) : null;
      if (found?.button) {
        setSelectedButton(found.button);
        setFlowBreadcrumbs([found.button]);
        return;
      }
      const matchInReply = bot.replyButtons?.find(
        (b) => b.text.trim() === item.text?.trim()
      );
      if (matchInReply) {
        setSelectedButton(matchInReply);
        setFlowBreadcrumbs([matchInReply]);
        return;
      }
    }

    const text: string = item.text || '';
    const view = resolveMenuView(bot, replyMenuId, replyPage);
    const totalPages = view.totalReplyPages;

    const match = findContextAwareReplyAction(
      bot,
      { currentMenuId: replyMenuId, currentPage: replyPage },
      text
    );

    if (match) {
      switch (match.kind) {
        case 'page_next':
          setReplyPage((p) => clampPage(p + 1, totalPages));
          return;
        case 'page_prev':
          setReplyPage((p) => clampPage(p - 1, totalPages));
          return;
        case 'page_first':
          setReplyPage(0);
          return;
        case 'page_last':
          setReplyPage(Math.max(0, totalPages - 1));
          return;
        case 'page_number':
          setReplyPage(clampPage(match.page, totalPages));
          return;
        case 'page_indicator':
          return;
        case 'nav_back':
          if (replyBreadcrumbs.length > 0) {
            const prev = replyBreadcrumbs[replyBreadcrumbs.length - 1];
            setReplyBreadcrumbs((arr) => arr.slice(0, -1));
            setReplyMenuId(prev.menuId);
            setReplyPage(prev.page);
          } else {
            setReplyMenuId('main');
            setReplyPage(0);
          }
          return;
        case 'nav_parent': {
          const parentId = findParentFlowId(bot, replyMenuId) || 'main';
          setReplyMenuId(parentId);
          setReplyPage(0);
          return;
        }
        case 'nav_main':
          setReplyBreadcrumbs([]);
          setReplyMenuId('main');
          setReplyPage(0);
          return;
        case 'jump_flow':
          executePreviewMenu(match.flowId, 0);
          return;
        case 'button':
          handleButtonClick(match.button);
          return;
      }
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `msg_user_${Date.now()}`,
        sender: 'user',
        text,
        timestamp: nowTime(),
      },
    ]);
  };

  const executeSlashCommandText = (rawCommand: string) => {
    const trimmed = rawCommand.trim();
    if (!trimmed) return;

    setShowSlashMenu(false);
    setForceReplyPlaceholder(null);

    if (scanMode && simulatorMode === 'preview' && onScanSendText) {
      if (isScanning) return;
      if (trimmed !== '/start') {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_user_cmd_${Date.now()}`,
            sender: 'user',
            text: trimmed,
            timestamp: nowTime(),
          },
        ]);
      }
      const snapshotBot = bot;
      pendingScanNavRef.current = {
        type: 'command',
        text: trimmed,
        latestBotRef: snapshotBot,
      };
      setSimulatedInput('');
      void onScanSendText(trimmed).then((ok) => {
        if (ok === false && pendingScanNavRef.current?.type === 'command') {
          pendingScanNavRef.current = null;
        }
      });
      return;
    }

    if (trimmed === '/start') {
      resetToStart();
      setSimulatedInput('');
      return;
    }

    const slashRes = resolveSlashCommand(bot, trimmed);
    if (slashRes.matched) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_user_cmd_${Date.now()}`,
          sender: 'user',
          text: trimmed,
          timestamp: nowTime(),
        },
      ]);
      executePreviewMenu(slashRes.targetMenuId, 0);
      setSimulatedInput('');
      return;
    }

    handleReplyItemClick({ text: trimmed });
    setSimulatedInput('');
  };

  const handleSendSimulatedText = (e: React.FormEvent) => {
    e.preventDefault();
    executeSlashCommandText(simulatedInput);
  };

  // Drag & Drop handlers (top-level buttons)
  const handleButtonDragStart = (e: React.DragEvent, btnId: string, type: 'inline' | 'reply') => {
    e.dataTransfer.setData('text/plain', btnId);
    setDraggingBtnId(btnId);
    setDraggingType(type);
  };

  const handleButtonDragOver = (e: React.DragEvent, btnId: string) => {
    e.preventDefault();
    if (btnId !== draggingBtnId) setDragOverBtnId(btnId);
  };

  const handleButtonDrop = async (
    e: React.DragEvent,
    targetBtnId: string,
    targetType: 'inline' | 'reply'
  ) => {
    e.preventDefault();
    const sourceId = draggingBtnId;
    const sType = draggingType;
    setDraggingBtnId(null);
    setDraggingType(null);
    setDragOverBtnId(null);

    if (!sourceId || sourceId === targetBtnId || sType !== targetType || !onUpdateBot) return;

    const list =
      targetType === 'inline'
        ? [...(bot.inlineButtons || [])]
        : [...(bot.replyButtons || [])];
    const sourceIndex = list.findIndex((b) => b.id === sourceId);
    const targetIndex = list.findIndex((b) => b.id === targetBtnId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const [moved] = list.splice(sourceIndex, 1);
    list.splice(targetIndex, 0, moved);
    const reordered = list.map((b, idx) => ({ ...b, order: idx }));

    if (targetType === 'inline') await onUpdateBot({ inlineButtons: reordered });
    else await onUpdateBot({ replyButtons: reordered });
  };

  const handleDropToNewRow = async (e: React.DragEvent, targetType: 'inline' | 'reply') => {
    e.preventDefault();
    const sourceId = draggingBtnId;
    setDraggingBtnId(null);
    setDraggingType(null);
    setDragOverBtnId(null);
    if (!sourceId || !onUpdateBot) return;

    const list =
      targetType === 'inline'
        ? [...(bot.inlineButtons || [])]
        : [...(bot.replyButtons || [])];
    const target = list.find((b) => b.id === sourceId);
    if (!target) return;

    target.row = (target.row || 0) + 1;
    if (targetType === 'inline') await onUpdateBot({ inlineButtons: list });
    else await onUpdateBot({ replyButtons: list });
  };

  const handleMoveButtonHorizontal = async (
    btnId: string,
    direction: 'left' | 'right',
    type: 'inline' | 'reply'
  ) => {
    if (!onUpdateBot) return;
    const list =
      type === 'inline' ? [...(bot.inlineButtons || [])] : [...(bot.replyButtons || [])];
    const grouped = groupButtonsIntoRows(list);
    for (let r = 0; r < grouped.length; r++) {
      const row = grouped[r];
      const idx = row.findIndex((b) => b.id === btnId);
      if (idx !== -1) {
        const targetIdx = direction === 'left' ? idx + 1 : idx - 1;
        if (targetIdx >= 0 && targetIdx < row.length) {
          [row[idx], row[targetIdx]] = [row[targetIdx], row[idx]];
          const updatedList: BotButton[] = [];
          grouped.forEach((gRow, gRIdx) => {
            gRow.forEach((btn, gOIdx) => {
              updatedList.push({ ...btn, row: gRIdx, order: gOIdx });
            });
          });
          if (type === 'inline') await onUpdateBot({ inlineButtons: updatedList });
          else await onUpdateBot({ replyButtons: updatedList });
        }
        break;
      }
    }
  };

  const handleMoveButtonVertical = async (
    btnId: string,
    direction: 'up' | 'down',
    type: 'inline' | 'reply'
  ) => {
    if (!onUpdateBot) return;
    const list =
      type === 'inline' ? [...(bot.inlineButtons || [])] : [...(bot.replyButtons || [])];
    const grouped = groupButtonsIntoRows(list);
    for (let r = 0; r < grouped.length; r++) {
      const row = grouped[r];
      const idx = row.findIndex((b) => b.id === btnId);
      if (idx !== -1) {
        const targetRowIdx = direction === 'up' ? r - 1 : r + 1;
        const [moved] = row.splice(idx, 1);
        if (targetRowIdx < 0) grouped.unshift([moved]);
        else if (targetRowIdx >= grouped.length) grouped.push([moved]);
        else grouped[targetRowIdx].push(moved);

        const cleaned = grouped.filter((g) => g.length > 0);
        const updatedList: BotButton[] = [];
        cleaned.forEach((gRow, gRIdx) => {
          gRow.forEach((btn, gOIdx) => {
            updatedList.push({ ...btn, row: gRIdx, order: gOIdx });
          });
        });
        if (type === 'inline') await onUpdateBot({ inlineButtons: updatedList });
        else await onUpdateBot({ replyButtons: updatedList });
        break;
      }
    }
  };

  const handleMoveRow = async (
    rowIdx: number,
    direction: 'up' | 'down',
    type: 'inline' | 'reply'
  ) => {
    if (!onUpdateBot) return;
    const list =
      type === 'inline' ? [...(bot.inlineButtons || [])] : [...(bot.replyButtons || [])];
    const grouped = groupButtonsIntoRows(list);
    const targetIdx = direction === 'up' ? rowIdx - 1 : rowIdx + 1;
    if (targetIdx < 0 || targetIdx >= grouped.length) return;

    [grouped[rowIdx], grouped[targetIdx]] = [grouped[targetIdx], grouped[rowIdx]];
    const updatedList: BotButton[] = [];
    grouped.forEach((gRow, gRIdx) => {
      gRow.forEach((btn, gOIdx) => {
        updatedList.push({ ...btn, row: gRIdx, order: gOIdx });
      });
    });

    if (type === 'inline') await onUpdateBot({ inlineButtons: updatedList });
    else await onUpdateBot({ replyButtons: updatedList });
  };

  const handleApplyQuickTemplate = async (templateId: string, type: 'inline' | 'reply') => {
    if (!onUpdateBot) return;
    const sourceButtons = type === 'inline' ? bot.inlineButtons || [] : bot.replyButtons || [];
    if (sourceButtons.length === 0) return;

    const arranged = applyLayoutTemplate(sourceButtons, templateId);
    if (type === 'inline') await onUpdateBot({ inlineButtons: arranged });
    else await onUpdateBot({ replyButtons: arranged });
  };

  const handleToggleResizeKeyboard = async () => {
    if (!onUpdateBot) return;
    const current = bot.settings?.resizeKeyboard !== false;
    await onUpdateBot({
      settings: { ...(bot.settings || {}), resizeKeyboard: !current },
    });
  };

  const handleSavePlaceholder = async () => {
    if (!onUpdateBot) return;
    await onUpdateBot({
      settings: {
        ...(bot.settings || {}),
        inputFieldPlaceholder: customPlaceholder.trim() || undefined,
      },
    });
    setIsEditingPlaceholder(false);
  };

  const isDark = theme === 'dark';
  const activeSelectedButton = selectedButton
    ? findButtonById(bot, selectedButton.id)?.button || selectedButton
    : null;
  const activeReplyView = resolveMenuView(bot, replyMenuId, replyPage);
  const replyKeyboardRows: any[][] = activeReplyView.replyMarkup?.keyboard || [];

  return (
    <div
      className="flex flex-col h-full bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm"
      dir="rtl"
    >
      {/* Simulator Master Toolbar */}
      <div className="flex flex-col gap-2 pb-3 mb-3 border-b border-sky-200/80 dark:border-slate-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">محاكي ومحرر تيليجرام</h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] border font-medium ${
                simulatorMode === 'design'
                  ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30'
                  : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
              }`}
            >
              {simulatorMode === 'design' ? 'وضع التحرير والتصميم' : 'وضع المعاينة الحية'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={resetToStart}
              title="إعادة بدء المحادثة (/start)"
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:text-sky-700 dark:hover:text-white bg-[#F5F9FD] dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer border border-sky-200 dark:border-slate-700/60"
            >
              <RotateCcw className="w-3 h-3" />
              <span>/start</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              title="تبديل مظهر تيليجرام"
              aria-label="تبديل مظهر تيليجرام"
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-sky-700 dark:hover:text-slate-200 bg-[#F5F9FD] dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer border border-sky-200 dark:border-slate-700/60"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Mode & Action Switcher Strip */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-sky-200/60 dark:border-slate-800/50 flex-wrap">
          {scanMode ? (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>وضع مسح القوائم التفاعلي</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-[#F5F9FD] dark:bg-slate-950 p-0.5 rounded-lg border border-sky-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setSimulatorMode('design');
                  setIsReorderMode(false);
                }}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  simulatorMode === 'design' && !isReorderMode
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Workflow className="w-3 h-3" />
                <span>تحرير الزر والتدفق</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimulatorMode('design');
                  setIsReorderMode(true);
                }}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  isReorderMode
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Move className="w-3 h-3" />
                <span>سحب وترتيب</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimulatorMode('preview');
                  setIsReorderMode(false);
                  setSelectedButton(null);
                }}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  simulatorMode === 'preview'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span>معاينة المستخدم</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsApiInspectorOpen(true)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-white bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 rounded-lg border border-purple-200 dark:border-purple-800/60 cursor-pointer shadow-xs transition-colors"
            >
              <Code className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>كود تيليجرام (API JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setArrangerTarget('inline');
                setIsArrangerModalOpen(true);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-sky-700 dark:hover:text-white bg-[#F5F9FD] dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 rounded-lg border border-sky-200 dark:border-slate-700/60 cursor-pointer"
            >
              <LayoutGrid className="w-3 h-3 text-sky-600 dark:text-sky-400" />
              <span>قوالب Inline</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setArrangerTarget('reply');
                setIsArrangerModalOpen(true);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-amber-700 dark:hover:text-white bg-[#F5F9FD] dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 rounded-lg border border-sky-200 dark:border-slate-700/60 cursor-pointer"
            >
              <LayoutGrid className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>قوالب Reply</span>
            </button>
          </div>
        </div>

        {/* Quick Templates Strip */}
        {isReorderMode && (
          <div className="flex items-center gap-2 pt-2 border-t border-sky-200/70 dark:border-slate-800/60 overflow-x-auto pb-1 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 shrink-0 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>قوالب سريعة:</span>
              <select
                value={quickTemplateTarget}
                onChange={(e) => setQuickTemplateTarget(e.target.value as any)}
                className="bg-[#F5F9FD] dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-sky-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 text-[10px] cursor-pointer"
              >
                <option value="inline">أزرار Inline</option>
                <option value="reply">أزرار Reply</option>
              </select>
            </div>
            <div className="flex items-center gap-1 flex-nowrap">
              {LAYOUT_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleApplyQuickTemplate(tmpl.id, quickTemplateTarget)}
                  className="px-2 py-1 bg-[#F5F9FD] dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-sky-700 dark:hover:text-white rounded-md text-[10px] font-medium border border-sky-200 dark:border-slate-700/60 shrink-0 cursor-pointer transition-colors"
                >
                  {tmpl.name.split('(')[0].trim()}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Embedded Quick Editor */}
      {activeSelectedButton && (
        <SimulatorQuickEditor
          button={activeSelectedButton}
          bot={bot}
          onClose={() => {
            setSelectedButton(null);
            setFlowBreadcrumbs([]);
          }}
          onUpdateBot={onUpdateBot || (async () => {})}
          onOpenFullFlow={
            onSelectButtonToEdit ? (btn) => onSelectButtonToEdit(btn) : undefined
          }
          onSelectSubButton={(subBtn) => {
            setSelectedButton(subBtn);
            setFlowBreadcrumbs((prev) => [...prev, subBtn]);
          }}
          flowBreadcrumbs={flowBreadcrumbs}
          onNavigateBreadcrumb={(idx) => {
            if (idx === -1) {
              setSelectedButton(null);
              setFlowBreadcrumbs([]);
            } else {
              const target = flowBreadcrumbs[idx];
              setSelectedButton(target);
              setFlowBreadcrumbs((prev) => prev.slice(0, idx + 1));
            }
          }}
        />
      )}

      {/* Telegram Phone Shell Frame */}
      <div
        className={`relative flex flex-col flex-1 rounded-2xl overflow-hidden border shadow-2xl transition-colors duration-200 min-h-[520px] max-h-[640px] ${
          isDark
            ? 'bg-[#0e1621] border-slate-800 text-slate-100'
            : 'bg-[#e6f0f8] border-sky-200 text-slate-900'
        }`}
      >
        {/* Telegram Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            isDark
              ? 'bg-[#17212b] border-[#101921] text-slate-100'
              : 'bg-[#517da2] text-white border-transparent'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-sky-500 flex items-center justify-center text-white font-bold text-sm shadow-xs">
                {bot.name.substring(0, 1)}
              </div>
              {bot.isConnected && (
                <span
                  className={`absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 ${
                    isDark ? 'border-[#17212b]' : 'border-[#517da2]'
                  }`}
                />
              )}
            </div>

            <div>
              <h4 className="text-xs font-bold leading-tight truncate max-w-[170px]">
                {bot.profile?.displayName?.trim() || bot.name}
              </h4>
              <p className="text-[10px] opacity-80 font-mono">
                {typingActionLabel ? (
                  <span className="text-sky-300 font-sans font-semibold animate-pulse">
                    {typingActionLabel}
                  </span>
                ) : bot.botUsername ? (
                  `@${bot.botUsername}`
                ) : (
                  'بوت تجريبي (bot)'
                )}
              </p>
            </div>
          </div>

          <MoreVertical className="w-4 h-4 opacity-80" />
        </div>

        {/* Simulated Action Feedback Banner */}
        {actionToast && (
          <div className="px-3 py-1.5 bg-sky-600/90 text-white text-[11px] text-center font-medium shrink-0">
            {actionToast}
          </div>
        )}
        {isScanning && (
          <div className="px-3 py-1.5 bg-emerald-600/95 text-white text-[11px] text-center font-semibold shrink-0 animate-pulse">
            جاري التفاعل مع البوت والتقاط جميع أزرار القائمة...
          </div>
        )}

        {/* Callback Alert Popup Overlay (show_alert: true) */}
        {callbackAlertModal && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]">
            <div
              className={`w-full max-w-[260px] rounded-2xl p-4 shadow-2xl border space-y-3 text-center ${
                isDark
                  ? 'bg-[#17212b] border-slate-700 text-slate-100'
                  : 'bg-white border-sky-200 text-slate-900'
              }`}
            >
              <p className="text-xs font-bold text-sky-500">تنبيه من {bot.name}</p>
              <p className="text-xs leading-relaxed whitespace-pre-wrap">
                {callbackAlertModal.text}
              </p>
              <button
                type="button"
                onClick={() => setCallbackAlertModal(null)}
                className="w-full py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
              >
                حسناً
              </button>
            </div>
          </div>
        )}

        {/* Chat Stream */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          style={{
            backgroundImage: isDark
              ? 'radial-gradient(#1e2c3a 0.75px, transparent 0.75px)'
              : 'radial-gradient(#a3c2db 0.75px, transparent 0.75px)',
            backgroundSize: '16px 16px',
          }}
        >
          {messages.length === 0 ? (
            <div
              className={`h-full flex flex-col items-center justify-center text-center p-6 ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              <p className="text-xs">لم يتم إعداد محتوى بعد.</p>
              <p className="text-[11px] opacity-75 mt-1">
                اكتب رسالة البداية أو أضف زراً للبدء بتصميم البوت.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isBot = msg.sender === 'bot';
              const view =
                isBot && msg.menuId
                  ? resolveMenuView(bot, msg.menuId, msg.page ?? 0)
                  : null;

              const displayText = msg.text !== undefined ? msg.text : view?.hasExplicitText ? view.text : '';
              const displayMedia = msg.media !== undefined ? msg.media : view?.media || [];
              const inlineRows =
                isBot && view
                  ? isReorderMode && view.isMain
                    ? groupButtonsIntoRows(view.inlineButtons)
                    : view.inlineRows
                  : [];

              const effectiveOptions = msg.messageOptions || view?.messageOptions;
              const effectMeta = effectiveOptions?.messageEffectId
                ? TELEGRAM_MESSAGE_EFFECTS.find((e) => e.id === effectiveOptions.messageEffectId)
                : undefined;

              const showBubble = Boolean(
                !isBot ||
                  displayText ||
                  displayMedia.length > 0 ||
                  msg.triggeredButton ||
                  msg.poll ||
                  msg.checklist ||
                  msg.dice ||
                  msg.isStreaming
              );

              const lp = effectiveOptions?.linkPreviewOptions;
              const linkPreviewBlock =
                lp && !lp.is_disabled && (lp.url || displayText.includes('http')) ? (
                  <div
                    className={`my-1.5 p-2 rounded-lg border-r-2 text-[10px] ${
                      isDark
                        ? 'bg-sky-950/30 border-sky-400 text-slate-300'
                        : 'bg-sky-50 border-sky-500 text-slate-700'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-1 text-sky-500">
                      <Link2 className="w-3 h-3" />
                      <span>معاينة الرابط {lp.prefer_large_media ? '(صورة كبيرة)' : lp.prefer_small_media ? '(صورة صغيرة)' : ''}</span>
                    </div>
                    {lp.url && <div className="font-mono opacity-80 truncate dir-ltr text-left">{lp.url}</div>}
                  </div>
                ) : null;

              const togglePollOption = (optIdx: number) => {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== msg.id || !m.poll) return m;
                    const currentSelected = m.poll.selectedIndices || [];
                    if (m.poll.type === 'quiz') {
                      if (currentSelected.length > 0) return m;
                      return { ...m, poll: { ...m.poll, selectedIndices: [optIdx] } };
                    }
                    const nextSelected = m.poll.allowsMultiple
                      ? currentSelected.includes(optIdx)
                        ? currentSelected.filter((x) => x !== optIdx)
                        : [...currentSelected, optIdx]
                      : [optIdx];
                    return { ...m, poll: { ...m.poll, selectedIndices: nextSelected } };
                  })
                );
              };

              const toggleChecklistTask = (taskIdx: number) => {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== msg.id || !m.checklist) return m;
                    return {
                      ...m,
                      checklist: {
                        ...m.checklist,
                        tasks: m.checklist.tasks.map((t, i) =>
                          i === taskIdx ? { ...t, done: !t.done } : t
                        ),
                      },
                    };
                  })
                );
              };

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
                >
                  {showBubble && (
                    <div
                      className={`max-w-[85%] rounded-2xl p-3 shadow-xs relative transition-all ${
                        isBot
                          ? isDark
                            ? 'bg-[#182533] text-slate-100 rounded-tr-xs border border-slate-800/40'
                            : 'bg-white text-slate-900 rounded-tr-xs shadow-sm'
                          : isDark
                          ? 'bg-[#2b5278] text-white rounded-tl-xs'
                          : 'bg-[#eef5fa] text-slate-900 rounded-tl-xs border border-sky-200'
                      }`}
                    >
                      {/* Bot API Message Options Badges (Effect / Protect / Silent) */}
                      {isBot &&
                        (effectiveOptions?.messageEffectId ||
                          effectiveOptions?.protectContent ||
                          effectiveOptions?.disableNotification ||
                          lp?.is_disabled) && (
                          <div className="flex flex-wrap items-center gap-1 mb-1.5">
                            {effectiveOptions?.messageEffectId && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                title="تأثير الرسالة (message_effect_id)"
                              >
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>{effectMeta ? effectMeta.emoji : '✨'} تأثير</span>
                              </span>
                            )}
                            {effectiveOptions?.protectContent && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                title="محمية ضد التوجيه والحفظ"
                              >
                                <Shield className="w-2.5 h-2.5" />
                                <span>محمي</span>
                              </span>
                            )}
                            {effectiveOptions?.disableNotification && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-slate-500/15 text-slate-400 border border-slate-500/30">
                                <BellOff className="w-2.5 h-2.5" />
                                <span>صامت</span>
                              </span>
                            )}
                            {lp?.is_disabled && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                <Link2 className="w-2.5 h-2.5" />
                                <span>بدون معاينة</span>
                              </span>
                            )}
                          </div>
                        )}

                      {displayMedia.length > 0 && (
                        <div className="space-y-2 mb-2">
                          {displayMedia.map((m) => {
                            const spoilerKey = `${msg.id}_${m.id}`;
                            const isBlurred = Boolean(m.hasSpoiler && !revealedSpoilers[spoilerKey]);
                            const captionEl =
                              !m.skipCaption && m.caption ? (
                                <p className="text-[11px] my-1 opacity-85 px-1">{m.caption}</p>
                              ) : null;

                            return (
                              <div key={m.id} className="rounded-xl overflow-hidden">
                                {m.showCaptionAboveMedia && captionEl}
                                <div className="relative">
                                  {m.type === 'photo' && (
                                    <img
                                      src={m.url}
                                      alt={m.caption || ''}
                                      className={`w-full max-h-48 object-cover rounded-xl transition-all duration-300 ${
                                        isBlurred ? 'blur-xl scale-105' : ''
                                      }`}
                                      referrerPolicy="no-referrer"
                                    />
                                  )}
                                  {m.type === 'video' && (
                                    <video
                                      src={m.url}
                                      controls={!isBlurred}
                                      className={`w-full max-h-48 object-cover rounded-xl transition-all duration-300 ${
                                        isBlurred ? 'blur-xl scale-105' : ''
                                      }`}
                                    />
                                  )}
                                  {isBlurred && (m.type === 'photo' || m.type === 'video') && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRevealedSpoilers((prev) => ({
                                          ...prev,
                                          [spoilerKey]: true,
                                        }))
                                      }
                                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900/45 text-white text-xs font-semibold cursor-pointer backdrop-blur-xs rounded-xl"
                                    >
                                      <Eye className="w-4 h-4 text-purple-300" />
                                      <span>محتوى مموّه (انقر للكشف)</span>
                                    </button>
                                  )}
                                </div>
                                {(m.type === 'audio' || m.type === 'voice') && (
                                  <div className={`p-2 rounded-xl ${isDark ? 'bg-slate-950/20' : 'bg-sky-50'}`}>
                                    <audio src={m.url} controls className="w-full h-8" />
                                  </div>
                                )}
                                {m.type === 'document' && (
                                  <div
                                    className={`border p-2.5 rounded-xl flex items-center gap-2 text-xs ${
                                      isDark
                                        ? 'bg-slate-950/30 border-slate-700/50'
                                        : 'bg-sky-50 border-sky-200'
                                    }`}
                                  >
                                    <FileText className={`w-4 h-4 shrink-0 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                                    <span className="truncate">{m.fileName || m.url}</span>
                                  </div>
                                )}
                                {!m.showCaptionAboveMedia && captionEl}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {lp?.show_above_text && linkPreviewBlock}

                      {/* Interactive Dice */}
                      {msg.dice && (
                        <div className="flex items-center gap-2.5 py-1">
                          <span className="text-3xl leading-none animate-bounce">{msg.dice.emoji}</span>
                          <div className="text-xs">
                            <span className="font-bold block">نتيجة الرمي: {msg.dice.value}</span>
                            <span className="text-[10px] opacity-70 font-mono">sendDice</span>
                          </div>
                        </div>
                      )}

                      {/* Interactive Poll / Quiz */}
                      {msg.poll && (
                        <div className="space-y-2 min-w-[200px]">
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <BarChart2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            <span>{msg.poll.question}</span>
                          </div>
                          <div className="text-[10px] opacity-70">
                            {msg.poll.type === 'quiz'
                              ? 'اختبار (Quiz)'
                              : msg.poll.allowsMultiple
                              ? 'اختيار متعدد'
                              : 'استطلاع (Poll)'}
                          </div>
                          <div className="space-y-1">
                            {msg.poll.options.map((opt, oIdx) => {
                              const selected = (msg.poll?.selectedIndices || []).includes(oIdx);
                              const answeredQuiz =
                                msg.poll?.type === 'quiz' &&
                                (msg.poll?.selectedIndices || []).length > 0;
                              const isCorrect =
                                answeredQuiz && msg.poll?.correctIndex === oIdx;
                              const isWrong = answeredQuiz && selected && !isCorrect;
                              return (
                                <button
                                  key={oIdx}
                                  type="button"
                                  onClick={() => togglePollOption(oIdx)}
                                  className={`w-full text-right px-2.5 py-1.5 rounded-lg text-[11px] border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                                    isCorrect
                                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold'
                                      : isWrong
                                      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                                      : selected
                                      ? 'bg-sky-500/20 border-sky-400 font-semibold'
                                      : isDark
                                      ? 'bg-slate-950/40 border-slate-700/60 hover:border-sky-500/50'
                                      : 'bg-sky-50 border-sky-200 hover:bg-sky-100'
                                  }`}
                                >
                                  <span>{opt}</span>
                                  {selected && <Check className="w-3 h-3 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                          {msg.poll.type === 'quiz' &&
                            (msg.poll.selectedIndices || []).length > 0 &&
                            msg.poll.explanation && (
                              <p className="text-[10px] text-amber-400 bg-amber-500/10 rounded p-1.5">
                                💡 {msg.poll.explanation}
                              </p>
                            )}
                        </div>
                      )}

                      {/* Interactive Checklist (API 9.2+) */}
                      {msg.checklist && (
                        <div className="space-y-2 min-w-[200px]">
                          <div className="flex items-center justify-between gap-2 text-xs font-bold">
                            <span>{msg.checklist.title}</span>
                            <span className="text-[10px] font-mono opacity-75">
                              {msg.checklist.tasks.filter((t) => t.done).length}/
                              {msg.checklist.tasks.length}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {msg.checklist.tasks.map((task, tIdx) => (
                              <button
                                key={tIdx}
                                type="button"
                                onClick={() => toggleChecklistTask(tIdx)}
                                className={`w-full text-right px-2 py-1 rounded-lg text-[11px] flex items-center gap-2 cursor-pointer transition-colors ${
                                  isDark ? 'hover:bg-slate-800/60' : 'hover:bg-sky-50'
                                }`}
                              >
                                {task.done ? (
                                  <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <Square className="w-3.5 h-3.5 opacity-60 shrink-0" />
                                )}
                                <span className={task.done ? 'line-through opacity-60' : ''}>
                                  {task.text}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {displayText ? (
                        <p className="text-xs whitespace-pre-wrap leading-relaxed select-text">
                          {displayText}
                          {msg.isStreaming && (
                            <span className="inline-block w-1.5 h-3 mr-1 bg-sky-400 animate-pulse align-middle" />
                          )}
                        </p>
                      ) : isBot &&
                        inlineRows.length > 0 &&
                        displayMedia.length === 0 &&
                        !msg.poll &&
                        !msg.checklist &&
                        !msg.dice ? (
                        <p className={`text-[10px] italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          (قائمة أزرار بدون نص رسالة)
                        </p>
                      ) : null}

                      {!lp?.show_above_text && linkPreviewBlock}

                      {msg.triggeredButton && onSelectButtonToEdit && (
                        <div
                          className={`mt-2 pt-1 border-t flex justify-end ${
                            isDark ? 'border-slate-800/40' : 'border-sky-100'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectButtonToEdit(msg.triggeredButton!)}
                            className={`text-[10px] hover:underline flex items-center gap-1 cursor-pointer ${
                              isDark ? 'text-sky-400' : 'text-sky-600'
                            }`}
                          >
                            <Workflow className="w-2.5 h-2.5" />
                            <span>تعديل تدفق هذا الزر في المحرر</span>
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 mt-1">
                        {msg.reactionEmoji ? (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs border ${
                              isDark
                                ? 'bg-sky-500/20 border-sky-400/40'
                                : 'bg-sky-100 border-sky-300'
                            }`}
                          >
                            {msg.reactionEmoji}
                          </span>
                        ) : (
                          <span />
                        )}
                        <div className="flex items-center gap-1 text-[9px] opacity-60">
                          <span>{msg.timestamp}</span>
                          {!isBot && <CheckCheck className={`w-3 h-3 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline Keyboard */}
                  {isBot && inlineRows.length > 0 && (
                    <div className="w-[85%] mt-1.5 space-y-1.5">
                      {inlineRows.map((row: any[], rowIdx: number) => (
                        <div
                          key={rowIdx}
                          className={
                            isReorderMode
                              ? isDark
                                ? 'p-1.5 rounded-xl border border-sky-500/30 bg-sky-950/20 shadow-xs'
                                : 'p-1.5 rounded-xl border border-sky-300 bg-sky-50/80 shadow-xs'
                              : ''
                          }
                        >
                          {isReorderMode && (
                            <div
                              className={`flex items-center justify-between pb-1 mb-1 text-[10px] border-b ${
                                isDark
                                  ? 'text-sky-400 border-sky-500/20'
                                  : 'text-sky-700 border-sky-300/70'
                              }`}
                            >
                              <span className="font-semibold">الصف {rowIdx + 1}</span>
                              <div className="flex items-center gap-1">
                                {rowIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleMoveRow(rowIdx, 'up', 'inline')}
                                    className={`p-0.5 rounded hover:bg-sky-500/20 cursor-pointer ${
                                      isDark ? 'text-slate-300' : 'text-slate-700'
                                    }`}
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                )}
                                {rowIdx < inlineRows.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleMoveRow(rowIdx, 'down', 'inline')}
                                    className={`p-0.5 rounded hover:bg-sky-500/20 cursor-pointer ${
                                      isDark ? 'text-slate-300' : 'text-slate-700'
                                    }`}
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex gap-1.5 w-full">
                            {row.map((item: any, iIdx: number) => {
                              const isNav =
                                typeof item.callback_data === 'string' &&
                                (item.callback_data.startsWith('pg:') ||
                                  item.callback_data.startsWith('nav:'));
                              const isInfo = item.callback_data === 'pg:info';

                              let colorClass = '';
                              if (isInfo) {
                                colorClass = isDark
                                  ? 'bg-slate-800/40 text-slate-400 border-slate-700 font-normal cursor-default'
                                  : 'bg-white/75 text-slate-600 border-sky-200 font-normal cursor-default';
                              } else if (item.callback_data?.startsWith('pg:')) {
                                colorClass = isDark
                                  ? 'bg-slate-800/90 hover:bg-slate-700 text-sky-300 border-slate-700 font-medium'
                                  : 'bg-white/95 hover:bg-sky-50 text-sky-700 border-sky-200 font-medium';
                              } else if (item.callback_data?.startsWith('nav:')) {
                                colorClass = isDark
                                  ? 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border-amber-500/30 font-medium'
                                  : 'bg-white/95 hover:bg-amber-50 text-amber-700 border-amber-300 font-medium';
                              } else {
                                colorClass = getButtonColorClasses(item.style || item.color, true, theme);
                              }

                              const btnId = item.id || item.callback_data;
                              const isSelected = selectedButton?.id === btnId;
                              const isDragging = draggingBtnId === btnId;
                              const isOver = dragOverBtnId === btnId;

                              return (
                                <div key={iIdx} className="flex-1 relative group">
                                  <button
                                    type="button"
                                    draggable={isReorderMode && !isNav}
                                    onDragStart={(e) =>
                                      !isNav && handleButtonDragStart(e, btnId, 'inline')
                                    }
                                    onDragOver={(e) => !isNav && handleButtonDragOver(e, btnId)}
                                    onDrop={(e) => !isNav && handleButtonDrop(e, btnId, 'inline')}
                                    onDragEnd={() => {
                                      setDraggingBtnId(null);
                                      setDragOverBtnId(null);
                                    }}
                                    onClick={() => handleInlineItemClick(msg.id, item)}
                                    className={`w-full py-1.5 px-2 rounded-lg text-xs font-semibold text-center border cursor-pointer truncate shadow-xs flex items-center justify-center gap-1.5 transition-all ${colorClass} ${
                                      isSelected ? 'ring-2 ring-sky-400 scale-[1.02] shadow-lg' : ''
                                    } ${isOver ? 'ring-2 ring-amber-400 scale-[1.02]' : ''} ${
                                      isDragging ? 'opacity-40' : ''
                                    }`}
                                  >
                                    {isReorderMode && !isNav && (
                                      <GripVertical className="w-3 h-3 opacity-70 shrink-0" />
                                    )}
                                    <span className="truncate">{item.text}</span>
                                    {item.url && <LinkIcon className="w-3 h-3 opacity-70 shrink-0" />}
                                    {item.web_app && <Globe className="w-3 h-3 opacity-70 shrink-0" />}
                                    {item.copy_text && <CopyIcon className="w-3 h-3 opacity-70 shrink-0" />}
                                  </button>

                                  {isReorderMode && !isNav && (
                                    <div
                                      className={`hidden group-hover:flex items-center justify-center gap-0.5 absolute -top-2 left-1/2 -translate-x-1/2 border rounded px-1 py-0.5 z-20 shadow-md ${
                                        isDark
                                          ? 'bg-slate-900 border-slate-700'
                                          : 'bg-white border-sky-200'
                                      }`}
                                    >
                                      {iIdx > 0 && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMoveButtonHorizontal(btnId, 'right', 'inline');
                                          }}
                                          className={`p-0.5 cursor-pointer ${
                                            isDark
                                              ? 'hover:text-sky-300 text-slate-400'
                                              : 'hover:text-sky-700 text-slate-600'
                                          }`}
                                        >
                                          <ArrowRight className="w-2.5 h-2.5" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleMoveButtonVertical(btnId, 'up', 'inline');
                                        }}
                                        className={`p-0.5 cursor-pointer ${
                                          isDark
                                            ? 'hover:text-sky-300 text-slate-400'
                                            : 'hover:text-sky-700 text-slate-600'
                                        }`}
                                      >
                                        <ArrowUp className="w-2.5 h-2.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleMoveButtonVertical(btnId, 'down', 'inline');
                                        }}
                                        className={`p-0.5 cursor-pointer ${
                                          isDark
                                            ? 'hover:text-sky-300 text-slate-400'
                                            : 'hover:text-sky-700 text-slate-600'
                                        }`}
                                      >
                                        <ArrowDown className="w-2.5 h-2.5" />
                                      </button>
                                      {iIdx < row.length - 1 && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMoveButtonHorizontal(btnId, 'left', 'inline');
                                          }}
                                          className={`p-0.5 cursor-pointer ${
                                            isDark
                                              ? 'hover:text-sky-300 text-slate-400'
                                              : 'hover:text-sky-700 text-slate-600'
                                          }`}
                                        >
                                          <ArrowLeft className="w-2.5 h-2.5" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {isReorderMode && (
                        <div
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleDropToNewRow(e, 'inline')}
                          className={`border border-dashed border-sky-500/40 rounded-xl p-2 text-center text-[10px] transition-colors ${
                            isDark
                              ? 'text-sky-400 bg-sky-950/20 hover:bg-sky-950/40'
                              : 'text-sky-700 bg-sky-50 hover:bg-sky-100'
                          }`}
                        >
                          + أفلت الزر هنا لنقله إلى صف جديد
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Reply Keyboard Panel */}
        {showReplyKeyboard && replyKeyboardRows.length > 0 && (
          <div
            className={`border-t transition-all ${
              isDark ? 'bg-[#17212b] border-[#101921]' : 'bg-[#eef2f5] border-sky-200'
            } ${
              activeReplyView.replySettings.resizeKeyboard === false
                ? 'min-h-[210px] flex flex-col justify-around p-3'
                : 'shrink-0 p-2.5'
            }`}
          >
            <div
              className={`flex items-center justify-between pb-1.5 mb-1.5 border-b text-[10px] ${
                isDark ? 'border-slate-800/60' : 'border-sky-200/80'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {!activeReplyView.isMain ? (
                  <div className={`flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <Layers className={`w-3 h-3 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                    <span>قائمة فرعية</span>
                    {replyBreadcrumbs.length > 0 && (
                      <span className="text-slate-500 font-mono">
                        (عمق {replyBreadcrumbs.length + 1})
                      </span>
                    )}
                  </div>
                ) : (
                  <span className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    لوحة مفاتيح ReplyKeyboardMarkup
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleToggleResizeKeyboard}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer border ${
                  isDark
                    ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/50'
                    : 'bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 border-sky-200'
                }`}
              >
                {bot.settings?.resizeKeyboard !== false ? (
                  <>
                    <Minimize2 className={`w-2.5 h-2.5 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                    <span>resize_keyboard: مضغوط</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className={`w-2.5 h-2.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                    <span>resize_keyboard: كامل الارتفاع</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-1.5">
              {replyKeyboardRows.map((row: any[], rIdx: number) => (
                <div
                  key={rIdx}
                  className={
                    isReorderMode
                      ? isDark
                        ? 'p-1.5 rounded-xl border border-amber-500/30 bg-amber-950/20 shadow-xs'
                        : 'p-1.5 rounded-xl border border-amber-300 bg-amber-50/80 shadow-xs'
                      : ''
                  }
                >
                  {isReorderMode && (
                    <div
                      className={`flex items-center justify-between pb-1 mb-1 text-[10px] border-b ${
                        isDark
                          ? 'text-amber-400 border-amber-500/20'
                          : 'text-amber-700 border-amber-300/70'
                      }`}
                    >
                      <span className="font-semibold">الصف {rIdx + 1}</span>
                      <div className="flex items-center gap-1">
                        {rIdx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveRow(rIdx, 'up', 'reply')}
                            className={`p-0.5 rounded hover:bg-amber-500/20 cursor-pointer ${
                              isDark ? 'text-slate-300' : 'text-slate-700'
                            }`}
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                        )}
                        {rIdx < replyKeyboardRows.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveRow(rIdx, 'down', 'reply')}
                            className={`p-0.5 rounded hover:bg-amber-500/20 cursor-pointer ${
                              isDark ? 'text-slate-300' : 'text-slate-700'
                            }`}
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 w-full">
                    {row.map((item: any, iIdx: number) => {
                      const colorClass = getButtonColorClasses(item.style, true, theme);
                      const btnId = item.id || `reply_btn_${rIdx}_${iIdx}`;
                      const isNav = !item.id;
                      const isSelected = selectedButton?.id === btnId;
                      const isDragging = draggingBtnId === btnId;
                      const isOver = dragOverBtnId === btnId;

                      return (
                        <div key={iIdx} className="flex-1 relative group">
                          <button
                            type="button"
                            draggable={isReorderMode && !isNav}
                            onDragStart={(e) =>
                              !isNav && handleButtonDragStart(e, btnId, 'reply')
                            }
                            onDragOver={(e) => !isNav && handleButtonDragOver(e, btnId)}
                            onDrop={(e) => !isNav && handleButtonDrop(e, btnId, 'reply')}
                            onDragEnd={() => {
                              setDraggingBtnId(null);
                              setDragOverBtnId(null);
                            }}
                            onClick={() => handleReplyItemClick(item)}
                            className={`w-full py-2 px-2.5 rounded-lg text-xs font-semibold text-center border cursor-pointer truncate shadow-xs flex items-center justify-center gap-1.5 transition-all ${colorClass} ${
                              isSelected ? 'ring-2 ring-sky-400 scale-[1.02] shadow-lg' : ''
                            } ${isOver ? 'ring-2 ring-amber-400 scale-[1.02]' : ''} ${
                              isDragging ? 'opacity-40' : ''
                            }`}
                          >
                            {isReorderMode && !isNav && (
                              <GripVertical className="w-3 h-3 opacity-70 shrink-0" />
                            )}
                            {item.request_contact && <Phone className="w-3 h-3 opacity-70" />}
                            {item.request_location && <MapPin className="w-3 h-3 opacity-70" />}
                            <span>{item.text}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {isReorderMode && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDropToNewRow(e, 'reply')}
                  className={`border border-dashed border-amber-500/40 rounded-xl p-2 text-center text-[10px] transition-colors ${
                    isDark
                      ? 'text-amber-400 bg-amber-950/20 hover:bg-amber-950/40'
                      : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                  }`}
                >
                  + أفلت الزر هنا لإنشاء صف سفلي جديد
                </div>
              )}
            </div>
          </div>
        )}

        {/* Slash Command Menu Popup */}
        {showSlashMenu && (
          <div
            className={`mx-2 mb-1.5 rounded-xl border p-2 max-h-40 overflow-y-auto shadow-lg text-xs space-y-1 ${
              isDark ? 'bg-[#17212b] border-slate-700 text-slate-200' : 'bg-white border-sky-200 text-slate-800'
            }`}
          >
            <div className="text-[10px] font-semibold opacity-70 px-2 pb-1">
              قائمة أوامر البوت (Bot Commands):
            </div>
            <button
              type="button"
              onClick={() => executeSlashCommandText('/start')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                isDark ? 'hover:bg-slate-800' : 'hover:bg-sky-50'
              }`}
            >
              <span className="font-mono text-sky-500 font-bold">/start</span>
              <span className="text-[11px] opacity-80">بدء المحادثة والقائمة الرئيسية</span>
            </button>
            {(bot.commands || []).map((cmd, idx) => (
              <button
                key={`${cmd.command}_${idx}`}
                type="button"
                onClick={() => executeSlashCommandText(`/${cmd.command.replace(/^\//, '')}`)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                  isDark ? 'hover:bg-slate-800' : 'hover:bg-sky-50'
                }`}
              >
                <span className="font-mono text-sky-500 font-bold">
                  /{cmd.command.replace(/^\//, '')}
                </span>
                <span className="text-[11px] opacity-80 truncate max-w-[170px]">
                  {cmd.description || 'أمر مخصص'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Bottom Input Bar */}
        <div
          className={`flex items-center gap-1.5 p-2 border-t shrink-0 ${
            isDark ? 'bg-[#17212b] border-[#101921]' : 'bg-white border-sky-200'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              if (bot.profile?.menuButtonType === 'web_app' && bot.profile.menuButtonWebAppUrl) {
                notifyAction(`فتح تطبيق القائمة (Menu WebApp): ${bot.profile.menuButtonWebAppUrl}`);
              } else {
                setShowSlashMenu(!showSlashMenu);
              }
            }}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
              showSlashMenu
                ? 'bg-sky-600 text-white'
                : isDark
                ? 'bg-slate-800 text-sky-300 hover:bg-slate-700'
                : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200'
            }`}
            title="قائمة أوامر البوت / زر القائمة"
          >
            <Terminal className="w-3 h-3" />
            <span>
              {bot.profile?.menuButtonType === 'web_app'
                ? bot.profile.menuButtonText || 'التطبيق'
                : 'القائمة /'}
            </span>
          </button>

          {activeReplyView.replyButtons.length > 0 && (
            <button
              type="button"
              onClick={() => setShowReplyKeyboard(!showReplyKeyboard)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                showReplyKeyboard
                  ? isDark
                    ? 'text-sky-400 bg-sky-500/10'
                    : 'text-sky-600 bg-sky-50'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title={showReplyKeyboard ? 'إخفاء لوحة الأزرار' : 'إظهار لوحة الأزرار'}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          )}

          {isEditingPlaceholder ? (
            <div className="flex-1 flex items-center gap-1.5">
              <input
                type="text"
                value={customPlaceholder}
                onChange={(e) => setCustomPlaceholder(e.target.value)}
                placeholder="أدخل النص التلميحي (input_field_placeholder)..."
                className={`flex-1 rounded-xl px-3 py-1 text-xs outline-hidden border border-sky-500/60 ${
                  isDark
                    ? 'bg-[#0e1621] text-slate-100 placeholder-slate-500'
                    : 'bg-[#F5F9FD] text-slate-900 placeholder-slate-400'
                }`}
                autoFocus
              />
              <button
                type="button"
                onClick={handleSavePlaceholder}
                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                aria-label="حفظ النص التلميحي"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsEditingPlaceholder(false)}
                className={`p-1.5 rounded-lg cursor-pointer ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    : 'bg-sky-50 hover:bg-sky-100 text-slate-700 border border-sky-200'
                }`}
                aria-label="إلغاء"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSendSimulatedText} className="flex-1 flex items-center gap-1.5">
              <input
                type="text"
                value={simulatedInput}
                onChange={(e) => setSimulatedInput(e.target.value)}
                placeholder={
                  forceReplyPlaceholder ||
                  bot.settings?.inputFieldPlaceholder ||
                  'اكتب رسالة أو أمر /start...'
                }
                className={`flex-1 rounded-xl px-3 py-1.5 text-xs outline-hidden ${
                  isDark
                    ? 'bg-[#0e1621] text-slate-100 placeholder-slate-500'
                    : 'bg-[#F5F9FD] text-slate-900 placeholder-slate-400 border border-sky-100'
                }`}
              />

              <button
                type="button"
                onClick={() => {
                  setCustomPlaceholder(bot.settings?.inputFieldPlaceholder || '');
                  setIsEditingPlaceholder(true);
                }}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isDark
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    : 'text-slate-500 hover:text-sky-700 hover:bg-sky-50'
                }`}
                title="تخصيص النص التلميحي"
                aria-label="تخصيص النص التلميحي"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>

              <button
                type="submit"
                className="p-2 rounded-full bg-sky-500 hover:bg-sky-400 text-white transition-colors cursor-pointer"
                title="إرسال"
                aria-label="إرسال"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="mt-3 text-center">
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          {simulatorMode === 'design'
            ? isReorderMode
              ? 'وضع السحب والترتيب المتقدم: اسحب الزر لتغيير ترتيبه وصفوفه.'
              : 'وضع التحرير المباشر: اضغط على أي زر داخل المحاكي لتحريره فورياً.'
            : 'وضع المعاينة الحية: يعمل المحاكي بنفس المحرك المشترك مع البوت الفعلي في تيليجرام.'}
        </p>
      </div>

      {/* Modals */}
      <RowArrangerModal
        isOpen={isArrangerModalOpen}
        onClose={() => setIsArrangerModalOpen(false)}
        buttons={arrangerTarget === 'inline' ? bot.inlineButtons || [] : bot.replyButtons || []}
        title={arrangerTarget === 'inline' ? 'أزرار Inline Keyboard' : 'أزرار Reply Keyboard'}
        onSave={async (arranged) => {
          if (onUpdateBot) {
            if (arrangerTarget === 'inline') await onUpdateBot({ inlineButtons: arranged });
            else await onUpdateBot({ replyButtons: arranged });
          }
        }}
      />

      <TelegramApiInspectorModal
        isOpen={isApiInspectorOpen}
        onClose={() => setIsApiInspectorOpen(false)}
        bot={bot}
        activeInlinePage={messages.find((m) => m.id === 'msg_bot_start')?.page ?? 0}
        activeReplyPage={replyPage}
      />
    </div>
  );
};
