import React, { useState } from 'react';
import {
  Sparkles,
  Shield,
  BellOff,
  Link2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { LinkPreviewOptions, TelegramMessageOptions } from '../types/bot';
import { TELEGRAM_MESSAGE_EFFECTS } from '../utils/telegramDelivery';

interface MessageOptionsPanelProps {
  value?: TelegramMessageOptions;
  onChange: (next: TelegramMessageOptions | undefined) => void;
  title?: string;
}

export const MessageOptionsPanel: React.FC<MessageOptionsPanelProps> = ({
  value,
  onChange,
  title = 'خيارات الرسالة المتقدمة (التأثيرات، الحماية، معاينة الروابط)',
}) => {
  const [isOpen, setIsOpen] = useState(
    Boolean(
      value?.messageEffectId ||
        value?.protectContent ||
        value?.disableNotification ||
        value?.linkPreviewOptions?.is_disabled ||
        value?.linkPreviewOptions?.url ||
        value?.linkPreviewOptions?.prefer_small_media ||
        value?.linkPreviewOptions?.prefer_large_media ||
        value?.linkPreviewOptions?.show_above_text
    )
  );

  const opts: TelegramMessageOptions = value || {};
  const lp: LinkPreviewOptions = opts.linkPreviewOptions || {};

  const activeCount = [
    Boolean(opts.messageEffectId?.trim()),
    Boolean(opts.protectContent),
    Boolean(opts.disableNotification),
    Boolean(
      lp.is_disabled ||
        lp.url?.trim() ||
        lp.prefer_small_media ||
        lp.prefer_large_media ||
        lp.show_above_text
    ),
  ].filter(Boolean).length;

  const emitChange = (patch: Partial<TelegramMessageOptions>) => {
    const merged: TelegramMessageOptions = {
      ...opts,
      ...patch,
    };

    const cleanedLinkPreview: LinkPreviewOptions | undefined = merged.linkPreviewOptions
      ? {
          ...(merged.linkPreviewOptions.is_disabled ? { is_disabled: true } : {}),
          ...(merged.linkPreviewOptions.url?.trim()
            ? { url: merged.linkPreviewOptions.url.trim() }
            : {}),
          ...(merged.linkPreviewOptions.prefer_small_media
            ? { prefer_small_media: true }
            : {}),
          ...(merged.linkPreviewOptions.prefer_large_media
            ? { prefer_large_media: true }
            : {}),
          ...(merged.linkPreviewOptions.show_above_text
            ? { show_above_text: true }
            : {}),
        }
      : undefined;

    const finalOptions: TelegramMessageOptions = {
      ...(merged.messageEffectId?.trim()
        ? { messageEffectId: merged.messageEffectId.trim() }
        : {}),
      ...(merged.protectContent ? { protectContent: true } : {}),
      ...(merged.disableNotification ? { disableNotification: true } : {}),
      ...(cleanedLinkPreview && Object.keys(cleanedLinkPreview).length > 0
        ? { linkPreviewOptions: cleanedLinkPreview }
        : {}),
    };

    onChange(Object.keys(finalOptions).length > 0 ? finalOptions : undefined);
  };

  const updateLinkPreview = (patch: Partial<LinkPreviewOptions>) => {
    emitChange({
      linkPreviewOptions: {
        ...lp,
        ...patch,
      },
    });
  };

  const mediaSizeMode = lp.prefer_small_media
    ? 'small'
    : lp.prefer_large_media
    ? 'large'
    : 'default';

  return (
    <div
      className="rounded-xl border border-sky-200/80 dark:border-slate-800 bg-[#F5F9FD]/80 dark:bg-slate-950/60 overflow-hidden"
      dir="rtl"
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-sky-50/80 dark:hover:bg-slate-900/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
          <span>{title}</span>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30">
              {activeCount} مفعّل
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {isOpen && (
        <div className="p-3.5 pt-2.5 border-t border-sky-200/70 dark:border-slate-800 space-y-4 text-xs">
          {/* Message Effect ID */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>تأثير الرسالة الحركي (message_effect_id):</span>
              </label>
              {opts.messageEffectId && (
                <button
                  type="button"
                  onClick={() => emitChange({ messageEffectId: undefined })}
                  className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  إزالة التأثير
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => emitChange({ messageEffectId: undefined })}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-all ${
                  !opts.messageEffectId
                    ? 'bg-sky-600 text-white border-sky-500'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800 hover:border-sky-300'
                }`}
              >
                بدون تأثير
              </button>
              {TELEGRAM_MESSAGE_EFFECTS.map((ef) => {
                const isSelected = opts.messageEffectId === ef.id;
                return (
                  <button
                    key={ef.id}
                    type="button"
                    onClick={() => emitChange({ messageEffectId: ef.id })}
                    title={ef.label}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-sky-600 text-white border-sky-500 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-sky-200 dark:border-slate-800 hover:border-sky-300'
                    }`}
                  >
                    <span>{ef.emoji}</span>
                    <span>{ef.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={opts.messageEffectId || ''}
              onChange={(e) =>
                emitChange({ messageEffectId: e.target.value || undefined })
              }
              placeholder="أو أدخل معرف تأثير مخصص (مثل: 5104841245755180586)..."
              className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-slate-800 dark:text-slate-200 dir-ltr text-left placeholder-slate-400"
            />
          </div>

          {/* Protection & Silent Notification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="flex items-start gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(opts.protectContent)}
                onChange={(e) => emitChange({ protectContent: e.target.checked })}
              />
              <div>
                <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>حماية المحتوى (protect_content)</span>
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  منع إعادة التوجيه أو الحفظ من قبل المستخدم
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(opts.disableNotification)}
                onChange={(e) => emitChange({ disableNotification: e.target.checked })}
              />
              <div>
                <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <BellOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>إرسال صامت (disable_notification)</span>
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  تصل الرسالة بدون صوت أو إشعار مزعج
                </span>
              </div>
            </label>
          </div>

          {/* Link Preview Options */}
          <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span>خيارات معاينة الروابط (link_preview_options)</span>
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={Boolean(lp.is_disabled)}
                  onChange={(e) =>
                    updateLinkPreview({ is_disabled: e.target.checked })
                  }
                />
                <span>تعطيل معاينة الروابط (is_disabled)</span>
              </label>
            </div>

            {!lp.is_disabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                    حجم صورة المعاينة:
                  </label>
                  <select
                    value={mediaSizeMode}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateLinkPreview({
                        prefer_small_media: val === 'small',
                        prefer_large_media: val === 'large',
                      });
                    }}
                    className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-800 dark:text-slate-200"
                  >
                    <option value="default">تلقائي</option>
                    <option value="small">صورة صغيرة (prefer_small_media)</option>
                    <option value="large">صورة كبيرة (prefer_large_media)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                    رابط مخصص للمعاينة (اختياري):
                  </label>
                  <input
                    type="url"
                    value={lp.url || ''}
                    onChange={(e) => updateLinkPreview({ url: e.target.value })}
                    placeholder="https://example.com"
                    className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-800 dark:text-slate-200 dir-ltr text-left"
                  />
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-700 dark:text-slate-300 pt-4">
                  <input
                    type="checkbox"
                    checked={Boolean(lp.show_above_text)}
                    onChange={(e) =>
                      updateLinkPreview({ show_above_text: e.target.checked })
                    }
                  />
                  <span>إظهار المعاينة أعلى النص</span>
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
