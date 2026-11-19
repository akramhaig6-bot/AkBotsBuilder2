import React, { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  Workflow,
  Plus,
  Check,
  Copy,
} from 'lucide-react';
import {
  BotButton,
  BotConfig,
  ButtonActionType,
  ButtonFlow,
  ButtonColor,
  ButtonStyle,
  ButtonType,
  MediaItem,
} from '../types/bot';
import { MediaUploader } from './MediaUploader';
import {
  collectDescendantButtonIds,
  computeNextButtonPosition,
  duplicateButtonWithFlow,
  getButtonColorClasses,
} from '../utils/telegramFormatters';

interface SimulatorQuickEditorProps {
  button: BotButton;
  bot: BotConfig;
  onClose: () => void;
  onUpdateBot: (updates: Partial<BotConfig>) => Promise<void>;
  onOpenFullFlow?: (button: BotButton) => void;
  onSelectSubButton?: (subBtn: BotButton) => void;
  flowBreadcrumbs?: BotButton[];
  onNavigateBreadcrumb?: (index: number) => void;
}

export const SimulatorQuickEditor: React.FC<SimulatorQuickEditorProps> = ({
  button,
  bot,
  onClose,
  onUpdateBot,
  onOpenFullFlow,
  onSelectSubButton,
  flowBreadcrumbs = [],
  onNavigateBreadcrumb,
}) => {
  const currentFlow: ButtonFlow = bot.buttonFlows?.[button.id] || {
    id: `flow_${button.id}`,
    buttonId: button.id,
    message: null,
    media: [],
    subButtons: [],
  };

  const [activeTab, setActiveTab] = useState<'info' | 'message' | 'media' | 'subbuttons'>('info');

  // Button basic attributes state
  const [btnText, setBtnText] = useState(button.text);
  const [btnType, setBtnType] = useState<ButtonType>(button.type);
  const [btnColor, setBtnColor] = useState<ButtonColor>(
    (button.style as ButtonColor) || button.color || 'default'
  );
  const [btnActionType, setBtnActionType] = useState<ButtonActionType>(button.actionType || 'flow');
  const [btnUrl, setBtnUrl] = useState(button.url || '');
  const [btnWebAppUrl, setBtnWebAppUrl] = useState(button.webAppUrl || '');
  const [btnCopyText, setBtnCopyText] = useState(button.copyText || '');
  const [isSavingBtn, setIsSavingBtn] = useState(false);

  // Message state
  const [msgText, setMsgText] = useState(currentFlow.message?.text || '');
  const [skipMessage, setSkipMessage] = useState(Boolean(currentFlow.message?.skipMessage));
  const [isSavingMsg, setIsSavingMsg] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<'btn' | 'msg' | null>(null);

  const flashSavedFeedback = (kind: 'btn' | 'msg') => {
    setSavedFeedback(kind);
    setTimeout(() => {
      setSavedFeedback((prev) => (prev === kind ? null : prev));
    }, 2500);
  };

  // Sub-button quick add state
  const [isAddingSub, setIsAddingSub] = useState(false);
  const [subText, setSubText] = useState('');
  const [subMsg, setSubMsg] = useState('');
  const [subColor, setSubColor] = useState<ButtonColor>('default');
  const [subType, setSubType] = useState<ButtonType>(button.type);

  useEffect(() => {
    const f = bot.buttonFlows?.[button.id];
    setBtnText(button.text);
    setBtnType(button.type);
    setBtnColor((button.style as ButtonColor) || button.color || 'default');
    setBtnActionType(button.actionType || 'flow');
    setBtnUrl(button.url || '');
    setBtnWebAppUrl(button.webAppUrl || '');
    setBtnCopyText(button.copyText || '');
    setMsgText(f?.message?.text || '');
    setSkipMessage(Boolean(f?.message?.skipMessage));
    setSubType(button.type);
    setIsAddingSub(false);
  }, [button.id]);

  // Save changes to the button itself (handles top-level inline/reply or nested sub-buttons)
  const handleSaveButtonInfo = async () => {
    const trimmed = btnText.trim();
    if (!trimmed) return;

    setIsSavingBtn(true);
    try {
      const updatedStyle = btnColor !== 'default' ? (btnColor as ButtonStyle) : undefined;
      const updatedBtn: BotButton = {
        ...button,
        text: trimmed,
        type: btnType,
        style: updatedStyle,
        color: btnColor,
        actionType: btnActionType,
        url: btnActionType === 'url' ? btnUrl.trim() || undefined : undefined,
        webAppUrl: btnActionType === 'web_app' ? btnWebAppUrl.trim() || undefined : undefined,
        copyText: btnActionType === 'copy_text' ? btnCopyText || undefined : undefined,
      };

      const inInline = bot.inlineButtons?.some((b) => b.id === button.id);
      const inReply = bot.replyButtons?.some((b) => b.id === button.id);

      if (inInline || inReply) {
        let nextInline = (bot.inlineButtons || []).filter((b) => b.id !== button.id);
        let nextReply = (bot.replyButtons || []).filter((b) => b.id !== button.id);
        if (btnType === 'inline') {
          if (inInline) {
            nextInline = (bot.inlineButtons || []).map((b) =>
              b.id === button.id ? updatedBtn : b
            );
          } else {
            nextInline.push(updatedBtn);
          }
        } else {
          if (inReply) {
            nextReply = (bot.replyButtons || []).map((b) =>
              b.id === button.id ? updatedBtn : b
            );
          } else {
            nextReply.push(updatedBtn);
          }
        }
        await onUpdateBot({ inlineButtons: nextInline, replyButtons: nextReply });
        flashSavedFeedback('btn');
        return;
      }

      if (bot.buttonFlows) {
        const updatedFlows = { ...bot.buttonFlows };
        let found = false;
        for (const [flowId, f] of Object.entries(updatedFlows)) {
          if (f.subButtons?.some((b) => b.id === button.id)) {
            updatedFlows[flowId] = {
              ...f,
              subButtons: f.subButtons.map((b) => (b.id === button.id ? updatedBtn : b)),
            };
            found = true;
            break;
          }
        }
        if (found) {
          await onUpdateBot({ buttonFlows: updatedFlows });
          flashSavedFeedback('btn');
        }
      }
    } finally {
      setIsSavingBtn(false);
    }
  };

  // Save flow message (optional / skippable, NO forced default)
  const handleSaveFlowMessage = async () => {
    setIsSavingMsg(true);
    try {
      const trimmed = msgText.trim();
      const updatedFlow: ButtonFlow = {
        ...currentFlow,
        message: skipMessage
          ? { ...(currentFlow.message || { text: '' }), text: '', isSaved: false, skipMessage: true }
          : trimmed
          ? { ...(currentFlow.message || {}), text: trimmed, isSaved: true, skipMessage: false }
          : null,
      };
      await onUpdateBot({
        buttonFlows: {
          ...(bot.buttonFlows || {}),
          [button.id]: updatedFlow,
        },
      });
      flashSavedFeedback('msg');
    } finally {
      setIsSavingMsg(false);
    }
  };

  // Update media list
  const handleMediaChange = async (newMedia: MediaItem[]) => {
    const updatedFlow: ButtonFlow = {
      ...currentFlow,
      media: newMedia,
    };
    await onUpdateBot({
      buttonFlows: {
        ...(bot.buttonFlows || {}),
        [button.id]: updatedFlow,
      },
    });
  };

  // Add new sub-button with optional companion message (no forced Arabic default)
  const handleAddSubButton = async () => {
    const trimmed = subText.trim();
    if (!trimmed) return;

    const existingSubs = currentFlow.subButtons || [];
    const nextPos = computeNextButtonPosition(existingSubs, currentFlow.layoutSettings);

    const newSubBtn: BotButton = {
      id: `subbtn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      text: trimmed,
      type: subType,
      actionType: 'flow',
      style: subColor !== 'default' ? (subColor as ButtonStyle) : undefined,
      color: subColor,
      parentId: button.id,
      row: nextPos.row,
      order: nextPos.order,
    };

    const updatedFlow: ButtonFlow = {
      ...currentFlow,
      subButtons: [...existingSubs, newSubBtn],
    };

    const trimmedSubMsg = subMsg.trim();
    const newSubFlow: ButtonFlow = {
      id: `flow_${newSubBtn.id}`,
      buttonId: newSubBtn.id,
      parentId: button.id,
      message: trimmedSubMsg ? { text: trimmedSubMsg, isSaved: true } : null,
      media: [],
      subButtons: [],
    };

    await onUpdateBot({
      buttonFlows: {
        ...(bot.buttonFlows || {}),
        [button.id]: updatedFlow,
        [newSubBtn.id]: newSubFlow,
      },
    });

    setSubText('');
    setSubMsg('');
    setIsAddingSub(false);
  };

  const handleDuplicateSubButton = async (subBtn: BotButton) => {
    const { clonedButton, newFlows } = duplicateButtonWithFlow(bot, subBtn, 'subbtn');
    const existingSubs = currentFlow.subButtons || [];
    const nextPos = computeNextButtonPosition(existingSubs, currentFlow.layoutSettings);
    const positionedClone = {
      ...clonedButton,
      parentId: button.id,
      row: nextPos.row,
      order: nextPos.order,
    };
    await onUpdateBot({
      buttonFlows: {
        ...(bot.buttonFlows || {}),
        ...newFlows,
        [button.id]: {
          ...currentFlow,
          subButtons: [...existingSubs, positionedClone],
        },
      },
    });
  };

  const handleDeleteSubButton = async (subBtnId: string) => {
    const updatedFlows = { ...(bot.buttonFlows || {}) };
    const idsToRemove = collectDescendantButtonIds(updatedFlows, subBtnId);
    idsToRemove.forEach((id) => delete updatedFlows[id]);

    updatedFlows[button.id] = {
      ...currentFlow,
      subButtons: (currentFlow.subButtons || []).filter((b) => b.id !== subBtnId),
    };

    await onUpdateBot({ buttonFlows: updatedFlows });
  };

  return (
    <div className="bg-white dark:bg-slate-950/95 border border-sky-300 dark:border-sky-500/40 rounded-xl p-3.5 mb-3 shadow-xl animate-in fade-in zoom-in-95 duration-150 text-slate-900 dark:text-slate-100 text-xs">
      {/* Breadcrumb Navigation */}
      {flowBreadcrumbs.length > 0 && (
        <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-sky-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 overflow-x-auto">
          <button
            type="button"
            onClick={() => onNavigateBreadcrumb && onNavigateBreadcrumb(-1)}
            className="hover:text-sky-700 dark:hover:text-white cursor-pointer"
          >
            القائمة الرئيسية
          </button>
          {flowBreadcrumbs.map((crumb, idx) => (
            <React.Fragment key={`${crumb.id}_${idx}`}>
              <span>/</span>
              <button
                type="button"
                onClick={() => onNavigateBreadcrumb && onNavigateBreadcrumb(idx)}
                className={`truncate max-w-[100px] cursor-pointer ${
                  idx === flowBreadcrumbs.length - 1 ? 'text-sky-600 dark:text-sky-400 font-bold' : 'hover:text-sky-700 dark:hover:text-white'
                }`}
              >
                {crumb.text}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Editor Header */}
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-sky-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
            <Workflow className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-slate-100">{button.text}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-sky-200 dark:border-slate-700">
                {button.type === 'inline' ? 'زر Inline' : 'زر Reply'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              لوحة التحرير السريع وتدفق الزر من داخل المحاكي
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onOpenFullFlow && (
            <button
              type="button"
              onClick={() => onOpenFullFlow(button)}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-sm cursor-pointer"
            >
              <Workflow className="w-3 h-3" />
              <span>فتح في المحرر</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            aria-label="إغلاق لوحة التحرير السريع"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 bg-sky-50/90 dark:bg-slate-900 p-1 rounded-lg border border-sky-200/80 dark:border-slate-800 mb-3">
        <button
          type="button"
          onClick={() => setActiveTab('info')}
          className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer text-center ${
            activeTab === 'info' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          بيانات الزر
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('message')}
          className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer text-center ${
            activeTab === 'message' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          الرسالة ({currentFlow.message?.text ? '1' : '0'})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('media')}
          className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer text-center ${
            activeTab === 'media' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          الوسائط ({currentFlow.media?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('subbuttons')}
          className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer text-center ${
            activeTab === 'subbuttons' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          أزرار فرعية ({currentFlow.subButtons?.length || 0})
        </button>
      </div>

      {/* Tab Content: Basic Button Info */}
      {activeTab === 'info' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">اسم الزر:</label>
              <input
                type="text"
                value={btnText}
                onChange={(e) => setBtnText(e.target.value)}
                className="w-full bg-[#F5F9FD] dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">النوع:</label>
              <select
                value={btnType}
                onChange={(e) => setBtnType(e.target.value as ButtonType)}
                className="w-full bg-[#F5F9FD] dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white"
              >
                <option value="inline">Inline</option>
                <option value="reply">Reply</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">لون الزر (رسمي):</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['default', 'primary', 'success', 'danger'] as ButtonColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBtnColor(c)}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold border cursor-pointer text-center transition-all ${
                    btnColor === c ? 'ring-2 ring-sky-500 dark:ring-sky-400 scale-[1.02]' : 'opacity-75'
                  } ${getButtonColorClasses(c, false)}`}
                >
                  {c === 'default'
                    ? 'رمادي'
                    : c === 'primary'
                    ? 'أزرق'
                    : c === 'success'
                    ? 'أخضر'
                    : 'أحمر'}
                </button>
              ))}
            </div>
          </div>

          {btnActionType === 'url' && (
            <div>
              <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">رابط الموقع (URL):</label>
              <input
                type="url"
                value={btnUrl}
                onChange={(e) => setBtnUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full bg-[#F5F9FD] dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white dir-ltr text-left"
              />
            </div>
          )}

          {btnActionType === 'web_app' && (
            <div>
              <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">رابط Web App HTTPS:</label>
              <input
                type="url"
                value={btnWebAppUrl}
                onChange={(e) => setBtnWebAppUrl(e.target.value)}
                placeholder="https://example.com/app"
                className="w-full bg-[#F5F9FD] dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white dir-ltr text-left"
              />
            </div>
          )}

          {btnActionType === 'copy_text' && (
            <div>
              <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">نص النسخ:</label>
              <input
                type="text"
                value={btnCopyText}
                onChange={(e) => setBtnCopyText(e.target.value)}
                className="w-full bg-[#F5F9FD] dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {savedFeedback === 'btn' && (
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                تم حفظ التعديلات ✓
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveButtonInfo}
              disabled={isSavingBtn}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer flex items-center gap-1 shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSavingBtn ? 'جاري الحفظ...' : 'حفظ التعديلات'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab Content: Flow Message */}
      {activeTab === 'message' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-slate-700 dark:text-slate-300">
              نص الرسالة (اختياري):
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300 cursor-pointer">
              <input
                type="checkbox"
                checked={skipMessage}
                onChange={(e) => setSkipMessage(e.target.checked)}
              />
              <span>تخطي الرسالة</span>
            </label>
          </div>

          {!skipMessage && (
            <textarea
              rows={3}
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              placeholder="اتركه فارغاً أو اكتب الرسالة المخصصة..."
              className="w-full bg-[#F5F9FD] dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg p-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-sky-500 resize-none"
            />
          )}

          <div className="flex items-center justify-between pt-1">
            {currentFlow.message?.text && (
              <button
                type="button"
                onClick={async () => {
                  setMsgText('');
                  setSkipMessage(false);
                  await onUpdateBot({
                    buttonFlows: {
                      ...(bot.buttonFlows || {}),
                      [button.id]: { ...currentFlow, message: null },
                    },
                  });
                }}
                className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>حذف الرسالة</span>
              </button>
            )}
            <div className="flex items-center gap-2 mr-auto">
              {savedFeedback === 'msg' && (
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  تم الحفظ ✓
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveFlowMessage}
                disabled={isSavingMsg}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSavingMsg ? 'جاري الحفظ...' : 'حفظ الرسالة'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Media */}
      {activeTab === 'media' && (
        <MediaUploader
          mediaList={currentFlow.media || []}
          onChange={handleMediaChange}
          title="وسائط هذا التدفق"
          description="إرفاق صورة أو فيديو أو صوت أو ملف/مستند"
        />
      )}

      {/* Tab Content: Sub-Buttons */}
      {activeTab === 'subbuttons' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              قائمة الأزرار الفرعية ({currentFlow.subButtons?.length || 0}):
            </span>
            {!isAddingSub && (
              <button
                type="button"
                onClick={() => setIsAddingSub(true)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-md cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>إضافة زر فرعي</span>
              </button>
            )}
          </div>

          {isAddingSub && (
            <div className="p-3 rounded-lg bg-[#F5F9FD] dark:bg-slate-900 border border-sky-300 dark:border-sky-500/30 space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={subText}
                  onChange={(e) => setSubText(e.target.value)}
                  placeholder="اسم الزر الفرعي..."
                  className="col-span-2 bg-white dark:bg-slate-950 border border-sky-200 dark:border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400"
                />
                <select
                  value={subType}
                  onChange={(e) => setSubType(e.target.value as ButtonType)}
                  className="bg-white dark:bg-slate-950 border border-sky-200 dark:border-slate-700 rounded-md px-1.5 py-1 text-xs text-slate-900 dark:text-white"
                >
                  <option value="inline">Inline</option>
                  <option value="reply">Reply</option>
                </select>
              </div>

              <textarea
                rows={2}
                value={subMsg}
                onChange={(e) => setSubMsg(e.target.value)}
                placeholder="رسالة الرد (اختيارية - اتركها فارغة للتخطي)..."
                className="w-full bg-white dark:bg-slate-950 border border-sky-200 dark:border-slate-700 rounded-md p-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 resize-none"
              />

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-sky-200/70 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">اللون:</span>
                  {(['default', 'primary', 'success', 'danger'] as ButtonColor[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSubColor(c)}
                      className={`w-4 h-4 rounded-full border cursor-pointer ${
                        subColor === c ? 'ring-2 ring-sky-500 dark:ring-white scale-110' : 'opacity-65'
                      } ${
                        c === 'default'
                          ? 'bg-slate-400 dark:bg-slate-700 border-slate-500 dark:border-slate-600'
                          : c === 'primary'
                          ? 'bg-sky-500 border-sky-400'
                          : c === 'success'
                          ? 'bg-emerald-500 border-emerald-400'
                          : 'bg-rose-500 border-rose-400'
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingSub(false);
                      setSubText('');
                      setSubMsg('');
                    }}
                    className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white px-2 py-1 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleAddSubButton}
                    className="px-3 py-1 text-[10px] font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-md cursor-pointer"
                  >
                    حفظ الزر وتدفقه
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {(!currentFlow.subButtons || currentFlow.subButtons.length === 0) ? (
              <p className="text-[11px] text-slate-500 text-center py-2">
                لا توجد أزرار فرعية لهذا الزر بعد.
              </p>
            ) : (
              currentFlow.subButtons.map((sub, idx) => {
                const subFlow = bot.buttonFlows?.[sub.id];
                const hasMsg = Boolean(subFlow?.message?.text?.trim());
                const mediaCount = subFlow?.media?.length || 0;
                const nestedCount = subFlow?.subButtons?.length || 0;

                return (
                  <div
                    key={sub.id}
                    className="p-2 rounded-lg bg-[#F5F9FD] dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-[10px] text-slate-500">#{idx + 1}</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{sub.text}</span>
                      <span className="text-[9px] text-slate-500">({sub.type})</span>
                      {hasMsg && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                          💬 رسالة
                        </span>
                      )}
                      {mediaCount > 0 && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
                          🖼️ {mediaCount}
                        </span>
                      )}
                      {nestedCount > 0 && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
                          🔲 {nestedCount}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onSelectSubButton && (
                        <button
                          type="button"
                          onClick={() => onSelectSubButton(sub)}
                          className="px-2 py-0.5 text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-white bg-sky-50 dark:bg-transparent hover:bg-sky-100 dark:hover:bg-sky-500/20 border border-sky-200 dark:border-sky-500/20 rounded cursor-pointer text-[10px] flex items-center gap-1"
                        >
                          <Workflow className="w-3 h-3" />
                          <span>تحرير التدفق</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDuplicateSubButton(sub)}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 cursor-pointer"
                        title="تكرار"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubButton(sub.id)}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                        title="حذف الزر الفرعي"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
