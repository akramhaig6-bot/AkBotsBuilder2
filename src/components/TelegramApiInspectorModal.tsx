import React, { useState } from 'react';
import {
  Code,
  Copy,
  Check,
  X,
  BookOpen,
  Sparkles,
  Info,
  Layers,
  Smartphone,
} from 'lucide-react';
import { BotConfig } from '../types/bot';
import { findButtonById } from '../utils/telegramFormatters';
import { resolveMenuView } from '../utils/flowEngine';
import { buildTelegramMessageOptionFields } from '../utils/telegramDelivery';

interface TelegramApiInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  bot: BotConfig;
  activeInlinePage?: number;
  activeReplyPage?: number;
  initialMenuId?: string;
}

export const TelegramApiInspectorModal: React.FC<TelegramApiInspectorModalProps> = ({
  isOpen,
  onClose,
  bot,
  activeInlinePage = 0,
  activeReplyPage = 0,
  initialMenuId = 'main',
}) => {
  const [activeTab, setActiveTab] = useState<'inline' | 'reply' | 'docs'>('inline');
  const [selectedMenuId, setSelectedMenuId] = useState<string>(initialMenuId);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const flowIds = Object.keys(bot.buttonFlows || {});
  const page = activeTab === 'inline' ? activeInlinePage : activeReplyPage;
  const view = resolveMenuView(bot, selectedMenuId, page);

  const optionFields = buildTelegramMessageOptionFields(view.messageOptions);

  const inlinePayload = {
    chat_id: 123456789,
    text: view.hasExplicitText ? view.text : view.inlineRows.length > 0 ? '⬇️' : '',
    ...(view.parseMode && view.parseMode !== 'none' ? { parse_mode: view.parseMode } : {}),
    ...optionFields,
    reply_markup: {
      inline_keyboard: view.inlineRows,
    },
  };

  const replyPayload = {
    chat_id: 123456789,
    text: view.hasExplicitText ? view.text : 'يرجى الاختيار من القائمة:',
    ...(view.parseMode && view.parseMode !== 'none' ? { parse_mode: view.parseMode } : {}),
    ...optionFields,
    reply_markup: view.replyMarkup || { keyboard: [] },
  };

  const activeJsonString = JSON.stringify(
    activeTab === 'inline' ? inlinePayload : replyPayload,
    null,
    2
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(activeJsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 dark:bg-black/75 backdrop-blur-sm"
      dir="rtl"
    >
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sky-100 dark:border-slate-800 bg-white dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 text-sky-600 dark:text-sky-400">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>معاينة كود تيليجرام الرسمي (Telegram Bot API)</span>
                <span className="text-[10px] bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20 px-2 py-0.5 rounded-full font-mono">
                  JSON Payload
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                الكود الفعلي المعتمد للقائمة الرئيسية أو لأي تدفق متداخل في البوت
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-sky-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher + Flow Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 bg-[#F5F9FD] dark:bg-slate-950/60 border-b border-sky-100 dark:border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('inline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'inline'
                  ? 'bg-sky-600 dark:bg-sky-500 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-sky-100/70 dark:hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>InlineKeyboardMarkup</span>
              <span className="text-[10px] opacity-80 font-mono">
                ({view.inlineButtons.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('reply')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'reply'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-sky-100/70 dark:hover:bg-slate-800/60'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>ReplyKeyboardMarkup</span>
              <span className="text-[10px] opacity-80 font-mono">
                ({view.replyButtons.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('docs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'docs'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-sky-100/70 dark:hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>قواعد تيليجرام</span>
            </button>
          </div>

          {activeTab !== 'docs' && (
            <div className="flex items-center gap-2">
              <select
                value={selectedMenuId}
                onChange={(e) => setSelectedMenuId(e.target.value)}
                aria-label="اختيار القائمة أو التدفق"
                className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 max-w-[180px]"
              >
                <option value="main">القائمة الرئيسية (/start)</option>
                {flowIds.map((id) => {
                  const btn = findButtonById(bot, id)?.button;
                  return (
                    <option key={id} value={id}>
                      {btn ? `تدفق: ${btn.text}` : id}
                    </option>
                  );
                })}
              </select>

              <button
                type="button"
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                  copied
                    ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40'
                    : 'bg-sky-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-sky-800 dark:hover:text-white border-sky-200 dark:border-slate-700/80 hover:bg-sky-100 dark:hover:bg-slate-700'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>تم النسخ!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ JSON</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'docs' ? (
            <div className="space-y-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40 space-y-2">
                <h4 className="font-bold text-sm text-sky-800 dark:text-sky-300 flex items-center gap-2">
                  <Info className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>كيف يرتب بروتوكول تيليجرام الأزرار؟ (2D Matrix Array)</span>
                </h4>
                <p>
                  يعتمد Telegram Bot API في تمثيل الأزرار على <strong>مصفوفة ثنائية الأبعاد</strong>، حيث يمثل كل صف مصفوفة مستقلة، ويحتوي على أزرار Inline أو Reply بما فيها أنواع <code>web_app</code>، <code>copy_text</code>، <code>login_url</code>، <code>request_users</code>، <code>request_chat</code>، و<code>remove_keyboard</code>.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/30 text-purple-900 dark:text-purple-200 space-y-1.5">
                <span className="font-semibold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>أحدث ميزات Telegram Bot API المدعومة (حتى 10.4):</span>
                </span>
                <ul className="list-disc list-inside text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                  <li><code>message_effect_id</code> و<code>protect_content</code> و<code>link_preview_options</code> (حجم الصورة وإظهارها أعلى النص).</li>
                  <li><code>has_spoiler</code> للتمويه الضبابي للوسائط و<code>show_caption_above_media</code> (API 7.4+) لإظهار الوصف أعلى الصور والفيديو.</li>
                  <li><code>sendChecklist</code> (API 9.2+) لقوائم المهام التفاعلية مع Fallback HTML تلقائي.</li>
                  <li><code>sendMessageDraft</code> (API 9.5+) للبث النصي المتدرج مع التعديل الحي.</li>
                  <li>مزامنة <code>setMyCommands</code>، <code>setMyName</code>، <code>setMyDescription</code>، و<code>setChatMenuButton</code> والرد على <code>inline_query</code> (نمط الضيوف 10.0+) و<code>message_reaction</code>.</li>
                  <li>حد <code>callback_data</code> الأقصى هو 64 بايت UTF-8، وعند تخطي النص مع وسائط يتم ربط الأزرار بآخر وسيط.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="relative">
              <pre
                dir="ltr"
                className="bg-[#F5F9FD] dark:bg-slate-950 p-4 rounded-xl border border-sky-200 dark:border-slate-800 font-mono text-xs text-sky-800 dark:text-sky-300 overflow-x-auto leading-relaxed text-left selection:bg-sky-500/20 dark:selection:bg-sky-500/30 [tab-size:2]"
              >
                <code>{activeJsonString}</code>
              </pre>

              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                  <span>Payload فعلي مطابق لتوثيق Telegram Bot API</span>
                </div>
                <span>
                  <code className="text-slate-700 dark:text-slate-300 font-mono">
                    POST https://api.telegram.org/bot&lt;TOKEN&gt;/sendMessage
                  </code>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#F5F9FD] dark:bg-slate-950/80 border-t border-sky-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-500">
            يدعم فحص القائمة الرئيسية أو أي مستوى تدفق متداخل عبر المحرك الموحد.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-sky-100 dark:bg-slate-800 hover:bg-sky-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
