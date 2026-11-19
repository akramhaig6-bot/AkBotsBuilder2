import React, { useState, useEffect } from 'react';
import { MessageSquare, Save, CheckCircle2, AlertCircle, Edit3, Trash2 } from 'lucide-react';
import { BotConfig, ParseMode, TelegramMessageOptions } from '../types/bot';
import { ConfirmModal } from './ConfirmModal';
import { MediaUploader } from './MediaUploader';
import { MessageOptionsPanel } from './MessageOptionsPanel';
import { TELEGRAM_MESSAGE_EFFECTS } from '../utils/telegramDelivery';

interface StartMessageSectionProps {
  bot: BotConfig;
  onUpdateBot: (updates: Partial<BotConfig>) => Promise<void>;
}

export const StartMessageSection: React.FC<StartMessageSectionProps> = ({
  bot,
  onUpdateBot,
}) => {
  const [text, setText] = useState(bot.startMessage?.text || '');
  const [skipMessage, setSkipMessage] = useState(Boolean(bot.startMessage?.skipMessage));
  const [parseMode, setParseMode] = useState<ParseMode>(
    bot.startMessage?.parseMode || 'none'
  );
  const [messageOptions, setMessageOptions] = useState<TelegramMessageOptions | undefined>(
    bot.startMessage?.messageOptions
  );
  const [isEditing, setIsEditing] = useState(
    !bot.startMessage?.isSaved && !bot.startMessage?.skipMessage
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    setText(bot.startMessage?.text || '');
    setSkipMessage(Boolean(bot.startMessage?.skipMessage));
    setParseMode(bot.startMessage?.parseMode || 'none');
    setMessageOptions(bot.startMessage?.messageOptions);
    setIsEditing(!bot.startMessage?.isSaved && !bot.startMessage?.skipMessage);
  }, [bot.id, bot.startMessage]);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!skipMessage && !trimmed && (bot.startMessage?.media || []).length === 0) {
      setErrorMessage('أدخل نص رسالة البداية أو فعّل خيار "تخطي الرسالة النصية" أو أضف وسائط.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);
      await onUpdateBot({
        startMessage: {
          ...bot.startMessage,
          text: skipMessage ? '' : trimmed,
          isSaved: Boolean(!skipMessage && trimmed),
          skipMessage,
          parseMode,
          messageOptions,
        },
      });
      setIsEditing(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل حفظ رسالة البداية، يرجى المحاولة مجدداً');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      setIsLoading(true);
      await onUpdateBot({
        startMessage: {
          text: '',
          isSaved: false,
          skipMessage: false,
          media: [],
        },
      });
      setText('');
      setSkipMessage(false);
      setIsEditing(true);
      setShowDeleteModal(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل حذف رسالة البداية');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-sky-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">رسالة البداية (/start)</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              الرسالة الترحيبية الأولى عند بدء المحادثة مع البوت (يمكن إرسالها أو تخطي النص والاكتفاء بالوسائط والأزرار)
            </p>
          </div>
        </div>

        {(bot.startMessage?.isSaved || bot.startMessage?.skipMessage) && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/20 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {bot.startMessage?.skipMessage ? 'نص متخطى' : 'تم إعداد الرسالة'}
          </span>
        )}
      </div>

      {/* Error Display */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Content Form */}
      {isEditing ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label
              htmlFor="start-message-input"
              className="block text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              رسالة البداية (اختيارية)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 cursor-pointer">
              <input
                type="checkbox"
                checked={skipMessage}
                onChange={(e) => {
                  setSkipMessage(e.target.checked);
                  if (errorMessage) setErrorMessage(null);
                }}
              />
              <span>تخطي الرسالة النصية عند /start</span>
            </label>
          </div>

          {!skipMessage && (
            <textarea
              id="start-message-input"
              rows={4}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="مثال: أهلاً وسهلاً بك في البوت! اضغط على الأزرار أدناه للبدء واستكشاف الخدمات."
              className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-700/80 rounded-xl p-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all resize-none"
            />
          )}

          <MessageOptionsPanel
            value={messageOptions}
            onChange={setMessageOptions}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-400">تنسيق النص:</span>
              <select
                value={parseMode}
                onChange={(e) => setParseMode(e.target.value as ParseMode)}
                className="bg-white dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200"
              >
                <option value="none">نص عادي</option>
                <option value="HTML">HTML</option>
                <option value="MarkdownV2">MarkdownV2</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              {(bot.startMessage?.isSaved || bot.startMessage?.skipMessage) && (
                <button
                  type="button"
                  onClick={() => {
                    setText(bot.startMessage.text);
                    setSkipMessage(Boolean(bot.startMessage.skipMessage));
                    setMessageOptions(bot.startMessage.messageOptions);
                    setIsEditing(false);
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-transparent rounded-lg transition-colors cursor-pointer"
                >
                  إلغاء التعديل
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg transition-all shadow-sm cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isLoading ? 'جاري الحفظ...' : 'حفظ ونشر لتيليجرام'}</span>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-sky-100 dark:border-slate-800/80">
            <MediaUploader
              mediaList={bot.startMessage?.media || []}
              onChange={(newMedia) => {
                onUpdateBot({
                  startMessage: {
                    ...bot.startMessage,
                    text: skipMessage ? '' : text.trim(),
                    media: newMedia,
                    skipMessage,
                    parseMode,
                    messageOptions,
                    isSaved: Boolean(!skipMessage && text.trim()),
                  },
                });
              }}
              title="وسائط رسالة البداية (اختياري)"
              description="إرفاق صورة ترحيبية أو مقطع فيديو أو صوت أو ملف مع /start"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-[#F5F9FD] dark:bg-slate-950/80 border border-sky-200/80 dark:border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-500 block mb-1.5 font-medium">
              حالة رسالة البداية:
            </span>
            {bot.startMessage?.skipMessage ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                تم تفعيل تخطي الرسالة النصية (تظهر الوسائط والأزرار مباشرة بدون نص إجباري).
              </p>
            ) : (
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {bot.startMessage.text}
              </p>
            )}
            {(bot.startMessage?.messageOptions?.messageEffectId ||
              bot.startMessage?.messageOptions?.protectContent ||
              bot.startMessage?.messageOptions?.disableNotification ||
              bot.startMessage?.messageOptions?.linkPreviewOptions) && (
              <div className="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-sky-200/60 dark:border-slate-800/60 text-[10px]">
                {bot.startMessage.messageOptions.messageEffectId && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                    تأثير: {TELEGRAM_MESSAGE_EFFECTS.find((e) => e.id === bot.startMessage.messageOptions?.messageEffectId)?.emoji || '✨'}
                  </span>
                )}
                {bot.startMessage.messageOptions.protectContent && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                    حماية المحتوى مفعلة
                  </span>
                )}
                {bot.startMessage.messageOptions.disableNotification && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    إرسال صامت
                  </span>
                )}
                {bot.startMessage.messageOptions.linkPreviewOptions?.is_disabled && (
                  <span className="px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30">
                    تعطيل معاينة الروابط
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
            <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              جاهزة وتظهر فوراً عند إرسال /start في تيليجرام
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف الرسالة</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-sky-700 dark:text-slate-200 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 hover:text-sky-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer border border-sky-200 dark:border-slate-700/60"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>تعديل رسالة البداية</span>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-sky-100 dark:border-slate-800/80">
            <MediaUploader
              mediaList={bot.startMessage?.media || []}
              onChange={(newMedia) => {
                onUpdateBot({
                  startMessage: {
                    ...bot.startMessage,
                    media: newMedia,
                  },
                });
              }}
              title="وسائط رسالة البداية (اختياري)"
              description="إرفاق صورة ترحيبية أو مقطع فيديو أو صوت أو ملف مع /start"
            />
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteModal}
        title="تأكيد حذف رسالة البداية"
        message="هل أنت متأكد من أنك تريد حذف رسالة البداية؟ ستصبح رسالة البداية غير معينة."
        confirmLabel="نعم، حذف الرسالة"
        cancelLabel="لا"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
};
