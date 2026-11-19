import React, { useState, useMemo } from 'react';
import {
  Workflow,
  Sparkles,
  Check,
  Link as LinkIcon,
  Phone,
  MapPin,
  MessageSquare,
  Image,
  Layers,
  Plus,
  Trash2,
  Save,
  Zap,
  Navigation,
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Globe,
  Copy,
  Gamepad2,
  CreditCard,
  BarChart2,
  Users,
  MessagesSquare,
  Search,
  Ban,
  KeyRound,
} from 'lucide-react';
import {
  BotButton,
  BotConfig,
  ButtonActionType,
  ButtonColor,
  ButtonFlow,
  ButtonStyle,
  ButtonType,
  ChatActionKind,
  DiceEmojiKind,
  FlowAction,
  FlowActionType,
  FlowMode,
  LoginUrlConfig,
  MediaItem,
  MenuNavigationConfig,
  PageUpdateMode,
  PaginationConfig,
  ParseMode,
  RequestChatConfig,
  RequestUsersConfig,
  SwitchInlineChosenChatConfig,
  TelegramMessageOptions,
} from '../types/bot';
import { MediaUploader } from './MediaUploader';
import { MessageOptionsPanel } from './MessageOptionsPanel';
import {
  getButtonColorClasses,
  getUtf8ByteLength,
  validateInlineButton,
  validateReplyButton,
} from '../utils/telegramFormatters';
import { getDefaultPaginationConfig } from '../utils/pagination';

export interface UnifiedButtonSavePayload {
  button: BotButton;
  flow?: ButtonFlow;
  childButtonsToInitialize?: BotButton[];
  goToFlow: boolean;
}

interface UnifiedButtonFormProps {
  mode: 'top' | 'sub';
  buttonToEdit?: BotButton | null;
  existingFlow?: ButtonFlow | null;
  defaultButtonType: ButtonType;
  nextPosition: { row: number; order: number };
  parentId?: string | null;
  allFlows?: Record<string, ButtonFlow>;
  bot?: BotConfig;
  onCancel: () => void;
  onSave: (payload: UnifiedButtonSavePayload) => Promise<void>;
}

const INLINE_ACTIONS: { id: ButtonActionType; label: string; icon: React.ReactNode }[] = [
  { id: 'flow', label: 'تدفق تفاعلي', icon: <Workflow className="w-3.5 h-3.5" /> },
  { id: 'url', label: 'رابط (URL)', icon: <LinkIcon className="w-3.5 h-3.5" /> },
  { id: 'web_app', label: 'تطبيق ويب (Web App)', icon: <Globe className="w-3.5 h-3.5" /> },
  { id: 'login_url', label: 'تسجيل دخول (Login)', icon: <KeyRound className="w-3.5 h-3.5" /> },
  { id: 'copy_text', label: 'نسخ نص', icon: <Copy className="w-3.5 h-3.5" /> },
  { id: 'switch_inline_query', label: 'بحث Inline (محادثة أخرى)', icon: <Search className="w-3.5 h-3.5" /> },
  { id: 'switch_inline_query_current_chat', label: 'بحث Inline (نفس المحادثة)', icon: <Search className="w-3.5 h-3.5" /> },
  { id: 'switch_inline_query_chosen_chat', label: 'بحث Inline (محادثات محددة)', icon: <MessagesSquare className="w-3.5 h-3.5" /> },
  { id: 'callback_game', label: 'لعبة (Game)', icon: <Gamepad2 className="w-3.5 h-3.5" /> },
  { id: 'pay', label: 'دفع (Pay)', icon: <CreditCard className="w-3.5 h-3.5" /> },
  { id: 'none', label: 'بدون إجراء', icon: <Ban className="w-3.5 h-3.5" /> },
];

const REPLY_ACTIONS: { id: ButtonActionType; label: string; icon: React.ReactNode }[] = [
  { id: 'flow', label: 'تدفق تفاعلي', icon: <Workflow className="w-3.5 h-3.5" /> },
  { id: 'request_contact', label: 'مشاركة الهاتف', icon: <Phone className="w-3.5 h-3.5" /> },
  { id: 'request_location', label: 'مشاركة الموقع', icon: <MapPin className="w-3.5 h-3.5" /> },
  { id: 'request_poll', label: 'استطلاع (Poll)', icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { id: 'request_users', label: 'طلب مستخدمين', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'request_chat', label: 'طلب محادثة/قناة', icon: <MessagesSquare className="w-3.5 h-3.5" /> },
  { id: 'web_app', label: 'تطبيق ويب (Web App)', icon: <Globe className="w-3.5 h-3.5" /> },
  { id: 'none', label: 'بدون إجراء', icon: <Ban className="w-3.5 h-3.5" /> },
];

const FLOW_ACTION_TYPES: { id: FlowActionType; label: string }[] = [
  { id: 'send_message', label: 'إرسال رسالة' },
  { id: 'edit_message', label: 'تعديل الرسالة الحالية' },
  { id: 'delete_message', label: 'حذف الرسالة السابقة' },
  { id: 'send_media', label: 'إرسال الوسائط' },
  { id: 'open_flow', label: 'فتح تدفق هذا الزر' },
  { id: 'jump_to_flow', label: 'الانتقال إلى تدفق زر آخر' },
  { id: 'jump_to_page', label: 'الانتقال إلى صفحة محددة' },
  { id: 'go_back', label: 'رجوع خطوة للخلف' },
  { id: 'go_parent', label: 'رجوع للقائمة الأب' },
  { id: 'go_home', label: 'العودة للقائمة الرئيسية' },
  { id: 'close_flow', label: 'إغلاق / إنهاء التدفق' },
  { id: 'show_reply_keyboard', label: 'إظهار لوحة Reply' },
  { id: 'remove_reply_keyboard', label: 'إزالة لوحة Reply (remove_keyboard)' },
  { id: 'force_reply', label: 'فرض الرد (force_reply)' },
  { id: 'callback_alert', label: 'تنبيه / إشعار منبثق (Alert)' },
  { id: 'send_chat_action', label: 'مؤشر حالة (يكتب الآن...)' },
  { id: 'set_reaction', label: 'إضافة تفاعل إيموجي (Reaction)' },
  { id: 'send_dice', label: 'رمي نرد / عجلة تفاعلية (Dice)' },
  { id: 'send_poll', label: 'إرسال استطلاع / اختبار (Poll)' },
  { id: 'send_checklist', label: 'قائمة مهام تفاعلية (Checklist 9.2+)' },
  { id: 'send_draft_stream', label: 'بث نصي متدرج (Draft Stream 9.5+)' },
];

export const UnifiedButtonForm: React.FC<UnifiedButtonFormProps> = ({
  mode,
  buttonToEdit,
  existingFlow,
  defaultButtonType,
  nextPosition,
  parentId = null,
  allFlows,
  onCancel,
  onSave,
}) => {
  const [buttonText, setButtonText] = useState(buttonToEdit?.text || '');
  const [buttonName, setButtonName] = useState(buttonToEdit?.name || '');
  const [buttonType, setButtonType] = useState<ButtonType>(
    buttonToEdit?.type || defaultButtonType
  );
  const [selectedColor, setSelectedColor] = useState<ButtonColor>(
    (buttonToEdit?.style as ButtonColor) || buttonToEdit?.color || 'default'
  );
  const [customEmojiId, setCustomEmojiId] = useState(buttonToEdit?.customEmojiId || '');
  const [actionType, setActionType] = useState<ButtonActionType>(
    buttonToEdit?.actionType || 'flow'
  );
  const [callbackData, setCallbackData] = useState(buttonToEdit?.callbackData || '');

  // Action-specific fields
  const [urlValue, setUrlValue] = useState(buttonToEdit?.url || '');
  const [webAppUrl, setWebAppUrl] = useState(buttonToEdit?.webAppUrl || '');
  const [loginUrlConfig, setLoginUrlConfig] = useState<LoginUrlConfig>(
    buttonToEdit?.loginUrlConfig || { url: '' }
  );
  const [switchInlineQuery, setSwitchInlineQuery] = useState(
    buttonToEdit?.switchInlineQuery || ''
  );
  const [switchChosenChat, setSwitchChosenChat] = useState<SwitchInlineChosenChatConfig>(
    buttonToEdit?.switchInlineChosenChat || {
      query: '',
      allow_user_chats: true,
      allow_bot_chats: false,
      allow_group_chats: true,
      allow_channel_chats: true,
    }
  );
  const [copyText, setCopyText] = useState(buttonToEdit?.copyText || '');
  const [requestPollType, setRequestPollType] = useState<'any' | 'quiz' | 'regular'>(
    buttonToEdit?.requestPollType || 'any'
  );
  const [requestUsersConfig, setRequestUsersConfig] = useState<RequestUsersConfig>(
    buttonToEdit?.requestUsersConfig || { request_id: 1, max_quantity: 1 }
  );
  const [requestChatConfig, setRequestChatConfig] = useState<RequestChatConfig>(
    buttonToEdit?.requestChatConfig || { request_id: 2, chat_is_channel: false }
  );

  // Companion Flow State
  const [skipFlow, setSkipFlow] = useState(
    Boolean(buttonToEdit?.skipFlow || existingFlow?.flowMode === 'skip')
  );
  const [flowMode, setFlowMode] = useState<FlowMode>(existingFlow?.flowMode || 'normal');
  const [flowMessageText, setFlowMessageText] = useState(existingFlow?.message?.text || '');
  const [skipMessage, setSkipMessage] = useState(
    Boolean(existingFlow?.message?.skipMessage)
  );
  const [parseMode, setParseMode] = useState<ParseMode>(
    existingFlow?.message?.parseMode || 'none'
  );
  const [updateMode, setUpdateMode] = useState<PageUpdateMode>(
    existingFlow?.message?.updateMode || existingFlow?.pagination?.updateMode || 'edit'
  );
  const [placement, setPlacement] = useState<'before_media' | 'after_media'>(
    existingFlow?.message?.placement || 'after_media'
  );
  const [messageOptions, setMessageOptions] = useState<TelegramMessageOptions | undefined>(
    existingFlow?.message?.messageOptions
  );

  const [flowMediaList, setFlowMediaList] = useState<MediaItem[]>(existingFlow?.media || []);
  const [flowActions, setFlowActions] = useState<FlowAction[]>(existingFlow?.actions || []);
  const [newActionType, setNewActionType] = useState<FlowActionType>('send_message');
  const [newActionText, setNewActionText] = useState('');
  const [newActionShowAlert, setNewActionShowAlert] = useState(true);
  const [newActionChatAction, setNewActionChatAction] = useState<ChatActionKind>('typing');
  const [newActionReactionEmoji, setNewActionReactionEmoji] = useState('👍');
  const [newActionDiceEmoji, setNewActionDiceEmoji] = useState<DiceEmojiKind>('🎲');
  const [newActionPollQuestion, setNewActionPollQuestion] = useState('');
  const [newActionPollOptions, setNewActionPollOptions] = useState('نعم\nلا');
  const [newActionChecklistTitle, setNewActionChecklistTitle] = useState('');
  const [newActionChecklistTasks, setNewActionChecklistTasks] = useState('مهمة 1\nمهمة 2');

  // Child buttons state
  const [childButtons, setChildButtons] = useState<BotButton[]>(
    existingFlow?.subButtons || []
  );
  const [newChildText, setNewChildText] = useState('');
  const [newChildType, setNewChildType] = useState<ButtonType>(buttonType);
  const [newChildColor, setNewChildColor] = useState<ButtonColor>('default');
  const [newChildAction, setNewChildAction] = useState<ButtonActionType>('flow');

  // Menu navigation & pagination quick config
  const [menuNavigation, setMenuNavigation] = useState<MenuNavigationConfig>(
    existingFlow?.pagination?.menuNavigation || {
      showBackButton: true,
      backButtonText: '🔙 العودة للقائمة السابقة',
      showMainMenuButton: true,
      mainMenuButtonText: '🏠 القائمة الرئيسية',
      backTarget: 'previous',
    }
  );
  const [paginationEnabled, setPaginationEnabled] = useState(
    Boolean(existingFlow?.pagination?.enabled)
  );
  const [itemsPerPage, setItemsPerPage] = useState(
    existingFlow?.pagination?.itemsPerPage || 6
  );

  const [activeTab, setActiveTab] = useState<
    'message' | 'media' | 'actions' | 'subbuttons' | 'navigation'
  >('message');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleTypeSwitch = (nextType: ButtonType) => {
    setButtonType(nextType);
    const validList = nextType === 'inline' ? INLINE_ACTIONS : REPLY_ACTIONS;
    if (!validList.some((a) => a.id === actionType)) {
      setActionType('flow');
    }
  };

  // Build candidate button for live Telegram API validation
  const candidateButton: BotButton = useMemo(() => {
    const selectedStyle: ButtonStyle | undefined =
      selectedColor === 'default' ? undefined : (selectedColor as ButtonStyle);

    return {
      id: buttonToEdit?.id || 'btn_preview',
      name: buttonName.trim() || undefined,
      text: buttonText.trim() || ' ',
      type: buttonType,
      color: selectedColor,
      style: selectedStyle,
      customEmojiId: customEmojiId.trim() || undefined,
      actionType,
      callbackData: callbackData.trim() || undefined,
      url: actionType === 'url' ? urlValue.trim() : undefined,
      webAppUrl: actionType === 'web_app' ? webAppUrl.trim() : undefined,
      loginUrlConfig: actionType === 'login_url' ? loginUrlConfig : undefined,
      switchInlineQuery:
        actionType === 'switch_inline_query' ||
        actionType === 'switch_inline_query_current_chat'
          ? switchInlineQuery
          : undefined,
      switchInlineChosenChat:
        actionType === 'switch_inline_query_chosen_chat' ? switchChosenChat : undefined,
      copyText: actionType === 'copy_text' ? copyText : undefined,
      requestPollType: actionType === 'request_poll' ? requestPollType : undefined,
      requestUsersConfig: actionType === 'request_users' ? requestUsersConfig : undefined,
      requestChatConfig: actionType === 'request_chat' ? requestChatConfig : undefined,
      skipFlow: actionType === 'flow' ? skipFlow : undefined,
      parentId: buttonToEdit?.parentId ?? parentId,
      row: buttonToEdit?.row ?? nextPosition.row,
      order: buttonToEdit?.order ?? nextPosition.order,
      pageIndex: buttonToEdit?.pageIndex,
    };
  }, [
    buttonToEdit,
    buttonName,
    buttonText,
    buttonType,
    selectedColor,
    customEmojiId,
    actionType,
    callbackData,
    urlValue,
    webAppUrl,
    loginUrlConfig,
    switchInlineQuery,
    switchChosenChat,
    copyText,
    requestPollType,
    requestUsersConfig,
    requestChatConfig,
    skipFlow,
    parentId,
    nextPosition,
  ]);

  const liveValidation = useMemo(() => {
    if (!buttonText.trim()) return { valid: true, errors: [], warnings: [] };
    return buttonType === 'inline'
      ? validateInlineButton(candidateButton, candidateButton.row, candidateButton.order)
      : validateReplyButton(candidateButton);
  }, [buttonText, buttonType, candidateButton]);

  const callbackBytes = getUtf8ByteLength(callbackData.trim() || buttonToEdit?.id || '');

  const handleAddAction = () => {
    const parsedPollOptions = newActionPollOptions
      .split(/\n|[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedChecklistTasks = newActionChecklistTasks
      .split(/\n|[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const config: FlowAction['config'] = {
      ...(newActionText.trim() ? { text: newActionText.trim() } : {}),
      ...(newActionType === 'callback_alert' ? { showAlert: newActionShowAlert } : {}),
      ...(newActionType === 'send_chat_action' ? { chatAction: newActionChatAction } : {}),
      ...(newActionType === 'set_reaction'
        ? { reactionEmoji: newActionReactionEmoji.trim() || '👍' }
        : {}),
      ...(newActionType === 'send_dice' ? { diceEmoji: newActionDiceEmoji } : {}),
      ...(newActionType === 'send_poll'
        ? {
            pollQuestion: newActionPollQuestion.trim() || 'ما رأيك؟',
            pollOptions: parsedPollOptions.length >= 2 ? parsedPollOptions : ['نعم', 'لا'],
            pollType: 'regular',
          }
        : {}),
      ...(newActionType === 'send_checklist'
        ? {
            checklistTitle: newActionChecklistTitle.trim() || 'قائمة المهام',
            checklistTasks:
              parsedChecklistTasks.length > 0 ? parsedChecklistTasks : ['مهمة 1', 'مهمة 2'],
            checklistOthersCanAdd: true,
            checklistOthersCanMark: true,
          }
        : {}),
    };

    const newAct: FlowAction = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: newActionType,
      enabled: true,
      order: flowActions.length,
      config: Object.keys(config).length > 0 ? config : undefined,
    };
    setFlowActions([...flowActions, newAct]);
    setNewActionText('');
    setNewActionPollQuestion('');
    setNewActionChecklistTitle('');
  };

  const handleMoveAction = (idx: number, dir: 'up' | 'down') => {
    const copy = [...flowActions];
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= copy.length) return;
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setFlowActions(copy.map((a, i) => ({ ...a, order: i })));
  };

  const handleAddChildButton = () => {
    const trimmed = newChildText.trim();
    if (!trimmed) return;
    const style: ButtonStyle | undefined =
      newChildColor !== 'default' ? (newChildColor as ButtonStyle) : undefined;
    const newChild: BotButton = {
      id: `btn_sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: trimmed,
      type: newChildType,
      color: newChildColor,
      style,
      actionType: newChildAction,
      parentId: buttonToEdit?.id || null,
      row: Math.floor(childButtons.length / 2),
      order: childButtons.length % 2,
    };
    setChildButtons([...childButtons, newChild]);
    setNewChildText('');
    setNewChildColor('default');
  };

  const handleSubmit = async (goToFlow: boolean) => {
    const trimmedText = buttonText.trim();
    if (!trimmedText) {
      setFormError('يرجى إدخال نص الزر الظاهر في تيليجرام.');
      return;
    }

    const validation =
      buttonType === 'inline'
        ? validateInlineButton(candidateButton, candidateButton.row, candidateButton.order)
        : validateReplyButton(candidateButton);

    if (!validation.valid) {
      setFormError(validation.errors[0]);
      return;
    }

    setFormError(null);
    setIsSaving(true);
    try {
      const freshId =
        buttonToEdit?.id ||
        `${mode === 'top' ? 'btn' : 'btn_sub'}_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 6)}`;

      const finalButton: BotButton = {
        ...candidateButton,
        id: freshId,
        text: trimmedText,
        parentId: buttonToEdit?.parentId ?? parentId,
      };

      let builtFlow: ButtonFlow | undefined = undefined;
      if (actionType === 'flow') {
        const trimmedMsg = flowMessageText.trim();
        const existingPagination = existingFlow?.pagination;
        const resolvedPagination: PaginationConfig | undefined =
          paginationEnabled || existingPagination
            ? {
                ...(existingPagination || getDefaultPaginationConfig()),
                enabled: paginationEnabled,
                itemsPerPage: Math.max(1, Number(itemsPerPage) || 6),
                updateMode,
                menuNavigation,
              }
            : {
                ...getDefaultPaginationConfig(),
                enabled: false,
                updateMode,
                menuNavigation,
              };

        builtFlow = {
          id: existingFlow?.id || `flow_${freshId}`,
          buttonId: freshId,
          parentId: existingFlow?.parentId ?? parentId,
          flowMode: skipFlow ? 'skip' : paginationEnabled ? 'paginated' : flowMode,
          message: skipMessage
            ? {
                text: '',
                isSaved: false,
                skipMessage: true,
                parseMode,
                updateMode,
                placement,
                messageOptions,
              }
            : trimmedMsg
            ? {
                text: trimmedMsg,
                isSaved: true,
                skipMessage: false,
                parseMode,
                updateMode,
                placement,
                messageOptions,
              }
            : messageOptions
            ? {
                text: '',
                isSaved: true,
                skipMessage: false,
                parseMode,
                updateMode,
                placement,
                messageOptions,
              }
            : null,
          media: flowMediaList,
          subButtons: childButtons.map((c) => ({ ...c, parentId: freshId })),
          actions: flowActions.map((a, idx) => ({ ...a, order: idx })),
          pagination: resolvedPagination,
          layoutSettings: existingFlow?.layoutSettings,
          replyKeyboardSettings: existingFlow?.replyKeyboardSettings,
        };
      }

      await onSave({
        button: finalButton,
        flow: builtFlow,
        childButtonsToInitialize: childButtons.map((c) => ({ ...c, parentId: freshId })),
        goToFlow,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const colorOptions: { id: ButtonColor; name: string; styleName: string; dot: string }[] = [
    { id: 'default', name: 'افتراضي', styleName: 'بدون نمط', dot: 'bg-slate-400' },
    { id: 'primary', name: 'أزرق', styleName: 'primary', dot: 'bg-[#2481cc]' },
    { id: 'success', name: 'أخضر', styleName: 'success', dot: 'bg-[#31b545]' },
    { id: 'danger', name: 'أحمر', styleName: 'danger', dot: 'bg-[#e53935]' },
  ];

  const availableActions = buttonType === 'inline' ? INLINE_ACTIONS : REPLY_ACTIONS;
  const availableFlowIds = allFlows ? Object.keys(allFlows) : [];

  return (
    <div
      className="mb-6 p-4 md:p-5 bg-[#F5F9FD] dark:bg-slate-950/90 border border-sky-200 dark:border-sky-500/30 rounded-2xl space-y-4 animate-in fade-in duration-150 shadow-lg ring-1 ring-sky-500/10"
      dir="rtl"
    >
      {/* Form Header */}
      <div className="flex items-center justify-between border-b border-sky-200/80 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-100/80 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
            <Workflow className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              {buttonToEdit
                ? `تعديل الزر وتدفقه: ${buttonToEdit.text}`
                : mode === 'top'
                ? 'إضافة زر رئيسي جديد مع محرر تدفقه'
                : 'إنشاء زر فرعي جديد مع كامل إعدادات التدفق'}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              نموذج موحد يدعم التداخل غير المحدود وجميع أنواع أزرار Telegram Bot API وترك الحقول اختيارية
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer px-2.5 py-1 rounded-lg hover:bg-sky-100 dark:hover:bg-slate-800"
        >
          إلغاء
        </button>
      </div>

      {/* Validation Error / Warning */}
      {formError && (
        <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-2.5 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {liveValidation.warnings.length > 0 && (
        <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-2.5 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{liveValidation.warnings[0]}</span>
        </div>
      )}

      {/* Row 1: Display Text + Internal Name + Button Type */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label
            htmlFor="unified-btn-text"
            className="block text-xs font-medium text-slate-800 dark:text-slate-200 mb-1"
          >
            عنوان الزر الظاهر في تيليجرام <span className="text-rose-500 dark:text-rose-400">*</span>
          </label>
          <input
            id="unified-btn-text"
            type="text"
            value={buttonText}
            onChange={(e) => {
              setButtonText(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="مثال: الخدمات، أو فتح المتجر"
            className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-sky-500"
          />
        </div>

        <div>
          <label
            htmlFor="unified-btn-name"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            الاسم البرمجي / الداخلي (اختياري)
          </label>
          <input
            id="unified-btn-name"
            type="text"
            value={buttonName}
            onChange={(e) => setButtonName(e.target.value)}
            placeholder="مثال: services_menu"
            className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-sky-500 font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            نوع الزر (متاح التغيير بأي مستوى):
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => handleTypeSwitch('inline')}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                buttonType === 'inline'
                  ? 'bg-sky-600 text-white border-sky-500 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Inline
            </button>
            <button
              type="button"
              onClick={() => handleTypeSwitch('reply')}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                buttonType === 'reply'
                  ? 'bg-amber-600 text-white border-amber-500 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Reply Keyboard
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Telegram Official Color Style & Custom Emoji ID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
        <div className="lg:col-span-12">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              لون ونمط الزر الرسمي (style):
            </label>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {colorOptions.map((opt) => {
              const isSelected = selectedColor === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedColor(opt.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border text-right transition-all cursor-pointer min-w-0 ${
                    isSelected
                      ? 'border-sky-500 bg-sky-50 dark:bg-slate-900 text-sky-950 dark:text-white ring-1 ring-sky-500 shadow-xs'
                      : 'border-sky-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${opt.dot} shrink-0 ring-1 ring-slate-300 dark:ring-white/20`} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate font-semibold">{opt.name}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">{opt.styleName}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 mr-auto text-sky-600 dark:text-sky-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-12">
          <label
            htmlFor="unified-custom-emoji"
            className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            معرف إيموجي مخصص (custom_emoji_id):
          </label>
          <input
            id="unified-custom-emoji"
            type="text"
            value={customEmojiId}
            onChange={(e) => setCustomEmojiId(e.target.value)}
            placeholder="اختياري: 5368324170671..."
            className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-mono focus:outline-hidden focus:border-sky-500"
          />
        </div>
      </div>

      {/* Row 3: Full Telegram Action Types */}
      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          نوع إجراء الزر في Telegram Bot API:
        </label>
        <div className="flex flex-wrap gap-1.5">
          {availableActions.map((act) => (
            <button
              key={act.id}
              type="button"
              onClick={() => setActionType(act.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border cursor-pointer transition-all ${
                actionType === act.id
                  ? 'bg-sky-600 text-white border-sky-500 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {act.icon}
              <span>{act.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Conditional Action Inputs */}
      {actionType === 'url' && (
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            الرابط الخارجي (URL):
          </label>
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://example.com أو https://t.me/channel"
            className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-mono dir-ltr text-left focus:outline-hidden focus:border-sky-500"
          />
        </div>
      )}

      {actionType === 'web_app' && (
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            رابط تطبيق الويب (Web App HTTPS URL):
          </label>
          <input
            type="url"
            value={webAppUrl}
            onChange={(e) => setWebAppUrl(e.target.value)}
            placeholder="https://your-mini-app.example.com"
            className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-mono dir-ltr text-left focus:outline-hidden focus:border-sky-500"
          />
        </div>
      )}

      {actionType === 'login_url' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800">
          <div>
            <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">رابط المصادقة HTTPS:</label>
            <input
              type="url"
              value={loginUrlConfig.url}
              onChange={(e) => setLoginUrlConfig({ ...loginUrlConfig, url: e.target.value })}
              placeholder="https://example.com/auth"
              className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">معرف البوت (اختياري):</label>
            <input
              type="text"
              value={loginUrlConfig.bot_username || ''}
              onChange={(e) =>
                setLoginUrlConfig({ ...loginUrlConfig, bot_username: e.target.value })
              }
              placeholder="my_bot"
              className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">نص الزر المُمرر (اختياري):</label>
            <input
              type="text"
              value={loginUrlConfig.forward_text || ''}
              onChange={(e) =>
                setLoginUrlConfig({ ...loginUrlConfig, forward_text: e.target.value })
              }
              placeholder="تسجيل الدخول"
              className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      )}

      {(actionType === 'switch_inline_query' ||
        actionType === 'switch_inline_query_current_chat') && (
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            نص البحث المسبق (Inline Query - اختياري):
          </label>
          <input
            type="text"
            value={switchInlineQuery}
            onChange={(e) => setSwitchInlineQuery(e.target.value)}
            placeholder="مثال: search "
            className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400"
          />
        </div>
      )}

      {actionType === 'switch_inline_query_chosen_chat' && (
        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 space-y-2">
          <input
            type="text"
            value={switchChosenChat.query || ''}
            onChange={(e) =>
              setSwitchChosenChat({ ...switchChosenChat, query: e.target.value })
            }
            placeholder="استعلام البحث..."
            className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400"
          />
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-700 dark:text-slate-300">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={switchChosenChat.allow_user_chats ?? true}
                onChange={(e) =>
                  setSwitchChosenChat({ ...switchChosenChat, allow_user_chats: e.target.checked })
                }
              />
              <span>محادثات المستخدمين</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={switchChosenChat.allow_group_chats ?? true}
                onChange={(e) =>
                  setSwitchChosenChat({ ...switchChosenChat, allow_group_chats: e.target.checked })
                }
              />
              <span>المجموعات</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={switchChosenChat.allow_channel_chats ?? true}
                onChange={(e) =>
                  setSwitchChosenChat({
                    ...switchChosenChat,
                    allow_channel_chats: e.target.checked,
                  })
                }
              />
              <span>القنوات</span>
            </label>
          </div>
        </div>
      )}

      {actionType === 'copy_text' && (
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            النص المراد نسخه عند الضغط (حتى 256 حرف):
          </label>
          <input
            type="text"
            maxLength={256}
            value={copyText}
            onChange={(e) => setCopyText(e.target.value)}
            placeholder="مثال: SAVE2025 أو رقم الحساب"
            className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 font-mono"
          />
        </div>
      )}

      {actionType === 'request_poll' && (
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            نوع الاستطلاع المطلوب (request_poll):
          </label>
          <select
            value={requestPollType}
            onChange={(e) => setRequestPollType(e.target.value as any)}
            className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
          >
            <option value="any">أي نوع (استطلاع أو اختبار)</option>
            <option value="regular">استطلاع عادي (regular)</option>
            <option value="quiz">اختبار بإجابة صحيحة (quiz)</option>
          </select>
        </div>
      )}

      {actionType === 'request_users' && (
        <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800">
          <div>
            <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">معرف الطلب (request_id):</label>
            <input
              type="number"
              value={requestUsersConfig.request_id}
              onChange={(e) =>
                setRequestUsersConfig({
                  ...requestUsersConfig,
                  request_id: Number(e.target.value) || 1,
                })
              }
              className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">أقصى عدد (1-10):</label>
            <input
              type="number"
              min={1}
              max={10}
              value={requestUsersConfig.max_quantity ?? 1}
              onChange={(e) =>
                setRequestUsersConfig({
                  ...requestUsersConfig,
                  max_quantity: Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                })
              }
              className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>
        </div>
      )}

      {actionType === 'request_chat' && (
        <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 items-center">
          <div>
            <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">معرف الطلب (request_id):</label>
            <input
              type="number"
              value={requestChatConfig.request_id}
              onChange={(e) =>
                setRequestChatConfig({
                  ...requestChatConfig,
                  request_id: Number(e.target.value) || 2,
                })
              }
              className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-4">
            <input
              type="checkbox"
              checked={requestChatConfig.chat_is_channel}
              onChange={(e) =>
                setRequestChatConfig({
                  ...requestChatConfig,
                  chat_is_channel: e.target.checked,
                })
              }
            />
            <span>طلب قناة بدلاً من مجموعة</span>
          </label>
        </div>
      )}

      {/* Optional custom callback_data for inline callback buttons */}
      {buttonType === 'inline' && (actionType === 'flow' || actionType === 'none') && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-[11px] bg-white dark:bg-slate-900/50 border border-sky-200/80 dark:border-slate-800/80 rounded-lg p-2.5">
          <label className="text-slate-600 dark:text-slate-400 shrink-0">
            معرف Callback مخصص (اختياري):
          </label>
          <input
            type="text"
            value={callbackData}
            onChange={(e) => setCallbackData(e.target.value)}
            placeholder="يترك فارغاً لاستخدام المعرف التلقائي الآمن"
            className="flex-1 bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 dir-ltr text-left"
          />
          <span
            className={`font-mono text-[10px] px-2 py-0.5 rounded border shrink-0 ${
              callbackBytes > 64
                ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
                : 'bg-[#F5F9FD] dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800'
            }`}
          >
            {callbackBytes} / 64 bytes
          </span>
        </div>
      )}

      {/* Companion Flow Editor */}
      {actionType === 'flow' && (
        <div className="bg-white dark:bg-slate-900/90 border border-sky-200 dark:border-slate-800 rounded-xl p-4 space-y-3.5 shadow-[0_2px_10px_-3px_rgba(14,116,144,0.06)] dark:shadow-none">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2.5 border-b border-sky-200/80 dark:border-slate-800/80">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-200">
                  محرر التدفق المرافق للزر
                </span>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-500/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipFlow}
                  onChange={(e) => setSkipFlow(e.target.checked)}
                />
                <span>تخطي التدفق لهذا الزر</span>
              </label>
            </div>

            {!skipFlow && (
              <div className="flex items-center gap-1 bg-[#F5F9FD] dark:bg-slate-950 p-1 rounded-lg border border-sky-200 dark:border-slate-800 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('message')}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer shrink-0 ${
                    activeTab === 'message'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>الرسالة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('media')}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer shrink-0 ${
                    activeTab === 'media'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Image className="w-3 h-3" />
                  <span>الوسائط ({flowMediaList.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('actions')}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer shrink-0 ${
                    activeTab === 'actions'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  <span>الإجراءات ({flowActions.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('subbuttons')}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer shrink-0 ${
                    activeTab === 'subbuttons'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>أزرار فرعية ({childButtons.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('navigation')}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer shrink-0 ${
                    activeTab === 'navigation'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Navigation className="w-3 h-3" />
                  <span>التنقل والصفحات</span>
                </button>
              </div>
            )}
          </div>

          {!skipFlow && (
            <>
              {/* Tab 1: Optional Message + Formatting */}
              {activeTab === 'message' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      نص الرسالة عند الضغط (اختياري بالكامل):
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipMessage}
                        onChange={(e) => setSkipMessage(e.target.checked)}
                      />
                      <span>تخطي الرسالة (عدم فرض نص افتراضي)</span>
                    </label>
                  </div>

                  {!skipMessage && (
                    <textarea
                      rows={3}
                      value={flowMessageText}
                      onChange={(e) => setFlowMessageText(e.target.value)}
                      placeholder="اتركه فارغاً أو اكتب نص الرسالة المخصصة..."
                      className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-sky-500 resize-none"
                    />
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-600 dark:text-slate-400 block mb-1">تنسيق النص (Parse Mode):</span>
                      <select
                        value={parseMode}
                        onChange={(e) => setParseMode(e.target.value as ParseMode)}
                        className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-200"
                      >
                        <option value="none">نص عادي (بدون تنسيق)</option>
                        <option value="HTML">HTML</option>
                        <option value="MarkdownV2">MarkdownV2</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400 block mb-1">سلوك العرض:</span>
                      <select
                        value={updateMode}
                        onChange={(e) => setUpdateMode(e.target.value as PageUpdateMode)}
                        className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-200"
                      >
                        <option value="edit">تحديث الرسالة الحالية (Edit)</option>
                        <option value="new">إرسال رسالة جديدة (New)</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400 block mb-1">ترتيب الرسالة والوسائط:</span>
                      <select
                        value={placement}
                        onChange={(e) => setPlacement(e.target.value as any)}
                        className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-200"
                      >
                        <option value="after_media">الوسائط أولاً ثم الرسالة</option>
                        <option value="before_media">الرسالة أولاً ثم الوسائط</option>
                      </select>
                    </div>
                  </div>

                  <MessageOptionsPanel value={messageOptions} onChange={setMessageOptions} />
                </div>
              )}

              {/* Tab 2: Media */}
              {activeTab === 'media' && (
                <MediaUploader
                  mediaList={flowMediaList}
                  onChange={setFlowMediaList}
                  title="وسائط هذا التدفق (اختياري)"
                  description="إرفاق صور أو فيديو أو صوت أو مستندات/ملفات"
                />
              )}

              {/* Tab 3: Ordered Multi-Actions */}
              {activeTab === 'actions' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                    <select
                      value={newActionType}
                      onChange={(e) => setNewActionType(e.target.value as FlowActionType)}
                      className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                    >
                      {FLOW_ACTION_TYPES.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    {newActionType === 'send_chat_action' && (
                      <select
                        value={newActionChatAction}
                        onChange={(e) => setNewActionChatAction(e.target.value as ChatActionKind)}
                        className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                      >
                        <option value="typing">يكتب الآن (typing)</option>
                        <option value="upload_photo">يرسل صورة (upload_photo)</option>
                        <option value="record_voice">يسجل صوتاً (record_voice)</option>
                        <option value="upload_document">يرسل ملفاً (upload_document)</option>
                      </select>
                    )}
                    {newActionType === 'send_dice' && (
                      <select
                        value={newActionDiceEmoji}
                        onChange={(e) => setNewActionDiceEmoji(e.target.value as DiceEmojiKind)}
                        className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                      >
                        <option value="🎲">🎲 نرد</option>
                        <option value="🎯">🎯 هدف</option>
                        <option value="🏀">🏀 سلة</option>
                        <option value="⚽">⚽ قدم</option>
                        <option value="🎳">🎳 بولينج</option>
                        <option value="🎰">🎰 عجلة الحظ</option>
                      </select>
                    )}
                    {newActionType === 'set_reaction' && (
                      <input
                        type="text"
                        value={newActionReactionEmoji}
                        onChange={(e) => setNewActionReactionEmoji(e.target.value)}
                        placeholder="👍"
                        className="w-16 text-center bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-sm"
                      />
                    )}
                    {newActionType !== 'send_poll' &&
                      newActionType !== 'send_checklist' &&
                      newActionType !== 'send_dice' &&
                      newActionType !== 'send_chat_action' && (
                        <input
                          type="text"
                          value={newActionText}
                          onChange={(e) => setNewActionText(e.target.value)}
                          placeholder={
                            newActionType === 'send_draft_stream'
                              ? 'نص البث المتدرج...'
                              : 'نص / معامل اختياري للإجراء...'
                          }
                          className="flex-1 bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                        />
                      )}
                    <button
                      type="button"
                      onClick={handleAddAction}
                      className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة إجراء</span>
                    </button>
                  </div>

                  {newActionType === 'callback_alert' && (
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newActionShowAlert}
                        onChange={(e) => setNewActionShowAlert(e.target.checked)}
                      />
                      <span>إظهار كنافذة منبثقة (show_alert)</span>
                    </label>
                  )}

                  {newActionType === 'send_poll' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-lg bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 text-xs">
                      <input
                        type="text"
                        value={newActionPollQuestion}
                        onChange={(e) => setNewActionPollQuestion(e.target.value)}
                        placeholder="سؤال الاستطلاع..."
                        className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        value={newActionPollOptions.replace(/\n/g, '، ')}
                        onChange={(e) => setNewActionPollOptions(e.target.value)}
                        placeholder="الخيارات مفصولة بفاصلة: نعم، لا"
                        className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  )}

                  {newActionType === 'send_checklist' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-lg bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 text-xs">
                      <input
                        type="text"
                        value={newActionChecklistTitle}
                        onChange={(e) => setNewActionChecklistTitle(e.target.value)}
                        placeholder="عنوان قائمة المهام..."
                        className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        value={newActionChecklistTasks.replace(/\n/g, '، ')}
                        onChange={(e) => setNewActionChecklistTasks(e.target.value)}
                        placeholder="المهام مفصولة بفاصلة: مهمة 1، مهمة 2"
                        className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  )}

                  {flowActions.length === 0 ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center py-2.5 bg-[#F5F9FD] dark:bg-slate-950/40 rounded-lg border border-sky-200/70 dark:border-slate-800/60">
                      بدون إجراءات مخصصة: سيتم عرض رسالة/وسائط/أزرار التدفق تلقائياً. أضف إجراءات للتحكم بتسلسل التنفيذ.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {flowActions.map((act, idx) => (
                        <div
                          key={act.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-slate-500 font-mono">#{idx + 1}</span>
                            <span className="font-semibold text-sky-700 dark:text-sky-300 truncate">
                              {FLOW_ACTION_TYPES.find((t) => t.id === act.type)?.label || act.type}
                            </span>
                            {act.config?.text && (
                              <span className="text-[10px] text-slate-600 dark:text-slate-400 truncate max-w-[140px]">
                                ({act.config.text})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveAction(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                              aria-label="تحريك الإجراء لأعلى"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveAction(idx, 'down')}
                              disabled={idx === flowActions.length - 1}
                              className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                              aria-label="تحريك الإجراء لأسفل"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setFlowActions(flowActions.filter((a) => a.id !== act.id))
                              }
                              className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                              aria-label="حذف الإجراء"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {newActionType === 'jump_to_flow' && availableFlowIds.length > 0 && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      ملاحظة: يمكنك ضبط معرّف التدفق المستهدف لاحقاً من لوحة الإجراءات الكاملة داخل محرر التدفق.
                    </p>
                  )}
                </div>
              )}

              {/* Tab 4: Child Buttons (Any Type & Color) */}
              {activeTab === 'subbuttons' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={newChildText}
                      onChange={(e) => setNewChildText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddChildButton();
                        }
                      }}
                      placeholder="اسم الزر المتفرع..."
                      className="sm:col-span-5 bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-sky-500"
                    />
                    <select
                      value={newChildType}
                      onChange={(e) => setNewChildType(e.target.value as ButtonType)}
                      className="sm:col-span-2 bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                    >
                      <option value="inline">Inline</option>
                      <option value="reply">Reply</option>
                    </select>
                    <select
                      value={newChildColor}
                      onChange={(e) => setNewChildColor(e.target.value as ButtonColor)}
                      className="sm:col-span-2 bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                    >
                      <option value="default">افتراضي</option>
                      <option value="primary">أزرق</option>
                      <option value="success">أخضر</option>
                      <option value="danger">أحمر</option>
                    </select>
                    <select
                      value={newChildAction}
                      onChange={(e) => setNewChildAction(e.target.value as ButtonActionType)}
                      className="sm:col-span-2 bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                    >
                      <option value="flow">تدفق</option>
                      <option value="none">تجميلي</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddChildButton}
                      className="sm:col-span-1 flex items-center justify-center px-2 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer"
                      aria-label="إضافة زر فرعي"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {childButtons.length === 0 ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center py-2 bg-[#F5F9FD] dark:bg-slate-950/40 rounded-lg border border-sky-200/70 dark:border-slate-800/60">
                      لا توجد أزرار فرعية مضافة بعد. يمكنك التعمق لاحقاً لتحرير كل زر فرعي بمفرده بلا حد.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                      {childButtons.map((btn) => {
                        const cClass = getButtonColorClasses(btn.style || btn.color, false);
                        return (
                          <div
                            key={btn.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 text-xs"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`px-2 py-0.5 rounded text-[11px] border truncate ${cClass}`}>
                                {btn.text}
                              </span>
                              <span className="text-[10px] text-slate-500 shrink-0">
                                ({btn.type})
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setChildButtons(childButtons.filter((b) => b.id !== btn.id))
                              }
                              className="text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer p-0.5 shrink-0"
                              aria-label={`حذف ${btn.text}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 5: Navigation & Pagination Overrides */}
              {activeTab === 'navigation' && (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800">
                    <div className="space-y-1.5">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-slate-700 dark:text-slate-300">إظهار زر الرجوع للقائمة السابقة:</span>
                        <input
                          type="checkbox"
                          checked={menuNavigation.showBackButton}
                          onChange={(e) =>
                            setMenuNavigation({
                              ...menuNavigation,
                              showBackButton: e.target.checked,
                            })
                          }
                        />
                      </label>
                      {menuNavigation.showBackButton && (
                        <input
                          type="text"
                          value={menuNavigation.backButtonText}
                          onChange={(e) =>
                            setMenuNavigation({
                              ...menuNavigation,
                              backButtonText: e.target.value,
                            })
                          }
                          className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded px-2 py-1 text-[11px] text-slate-800 dark:text-slate-200"
                        />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-slate-700 dark:text-slate-300">إظهار زر القائمة الرئيسية:</span>
                        <input
                          type="checkbox"
                          checked={menuNavigation.showMainMenuButton}
                          onChange={(e) =>
                            setMenuNavigation({
                              ...menuNavigation,
                              showMainMenuButton: e.target.checked,
                            })
                          }
                        />
                      </label>
                      {menuNavigation.showMainMenuButton && (
                        <input
                          type="text"
                          value={menuNavigation.mainMenuButtonText}
                          onChange={(e) =>
                            setMenuNavigation({
                              ...menuNavigation,
                              mainMenuButtonText: e.target.value,
                            })
                          }
                          className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded px-2 py-1 text-[11px] text-slate-800 dark:text-slate-200"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={paginationEnabled}
                        onChange={(e) => setPaginationEnabled(e.target.checked)}
                      />
                      <span>تفعيل تعدد الصفحات (Pagination) لهذا التدفق</span>
                    </label>
                    {paginationEnabled && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-600 dark:text-slate-400">أزرار/صفحة:</span>
                        <input
                          type="number"
                          min={1}
                          value={itemsPerPage}
                          onChange={(e) =>
                            setItemsPerPage(Math.max(1, Number(e.target.value) || 1))
                          }
                          className="w-16 bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Form Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-sky-200/80 dark:border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-sky-50 dark:bg-slate-800/80 hover:bg-sky-100 dark:hover:bg-slate-800 border border-sky-200 dark:border-transparent rounded-lg cursor-pointer"
        >
          إلغاء
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSubmit(false)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg shadow-sm cursor-pointer transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'جاري الحفظ...' : 'حفظ الزر والتدفق'}</span>
          </button>

          {actionType === 'flow' && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSubmit(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg shadow-sm cursor-pointer transition-all"
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>
                {mode === 'top'
                  ? 'حفظ والذهاب لمحرر التدفقات ➔'
                  : 'حفظ والتعمق في تدفق هذا الزر ➔'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
