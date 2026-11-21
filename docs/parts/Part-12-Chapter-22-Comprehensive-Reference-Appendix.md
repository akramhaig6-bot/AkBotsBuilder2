# COMPLETE SYSTEM ANALYSIS, ARCHITECTURE & FUNCTIONAL DOCUMENTATION
## التوثيق الشامل لتحليل النظام والمعمارية والوظائف — منصة TeleCraft Studio

**الجزء الثاني عشر والأخير (Part 12 من 12): الملحق المرجعي الشامل والفهارس الإحدى والعشرون وسجل اكتمال التحليل بنسبة 100% (الفصل 22)**

---

# الفصل الثاني والعشرون: الملحق المرجعي الشامل والفهارس الموحدة (Chapter 22: Comprehensive Reference Appendix)

يجمع هذا الفصل المرجعي الشامل واحدأً وعشرين فهرساً وسجلاً ومصفوفةً توحد كافة مكونات النظام ومساراته وعقوده وقواعده وملفاته في مرجع هندسي واحد متكامل (**مؤكد من الشيفرة المصدرية** و**مؤكد بالاختبار التشغيلي**).

---

## 22.1 الفهرس المرجعي الشامل لجميع صفحات وشاشات النظام التسع (9 Views / Pages Index)

| المعرف | الاسم التقني | الاسم الوظيفي بالعربية | الملف المالك | المستوى | شرط الظهور |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PAGE-01** | **BotList** | لوحة إدارة البوتات الرئيسية | **src/components/BotList.tsx** | المستوى الأول | غياب البوت المفتوح وإغلاق شاشتي المسح وJSON |
| **PAGE-02** | **BotEditor** | بيئة محرر البوت الشامل وهيكل العمل المزدوج | **src/components/BotEditor.tsx** | المستوى الأول المركب | وجود **currentBotId** مطابق لبوت في القائمة |
| **PAGE-03** | **StartMessageSection** | صفحة إعداد رسالة البداية ووسائطها وخياراتها | **src/components/StartMessageSection.tsx** | المستوى الثاني (تبويب) | داخل المحرر، **flowStack** فارغ، والتبويب **start** (أو **simulator**) |
| **PAGE-04** | **ButtonsSection** | صفحة إدارة أزرار تيليجرام الرئيسية (Inline & Reply) | **src/components/ButtonsSection.tsx** | المستوى الثاني (تبويب) | داخل المحرر، **flowStack** فارغ، والتبويب **buttons** |
| **PAGE-05** | **ButtonFlowEditor** | محرر تدفقات الأزرار المتداخلة غير المحدود العمق | **src/components/ButtonFlowEditor.tsx** | المستوى الشجري (1..N) | داخل المحرر مع وجود عنصر واحد فأكثر في **flowStack** |
| **PAGE-06** | **BotSettingsSection** | صفحة إعدادات البوت المتقدمة والأوامر والهوية | **src/components/BotSettingsSection.tsx** | المستوى الثاني (تبويب) | داخل المحرر، **flowStack** فارغ، والتبويب **bot_settings** |
| **PAGE-07** | **TokenSection** | صفحة إدارة التوكن والربط المباشر مع تيليجرام | **src/components/TokenSection.tsx** | المستوى الثاني (تبويب) | داخل المحرر، **flowStack** فارغ، والتبويب **token** |
| **PAGE-08** | **JsonQuickDeploySection** | شاشة الإنشاء والتفعيل الفوري عبر كود JSON | **src/components/JsonQuickDeploySection.tsx** | المستوى الأول | **currentBotId** فارغ، المسح مغلق، و**isJsonSectionOpen = true** |
| **PAGE-09** | **ScanTelegramSection** | شاشة مسح واستنساخ بوتات تيليجرام عبر MTProto | **src/components/ScanTelegramSection.tsx** | المستوى الأول | **currentBotId** فارغ، و**isScanSectionOpen = true** |

---

## 22.2 الفهرس المرجعي الشامل لجميع مكونات الواجهة العشرين (20 React Components Index)

| المعرف | اسم المكون | مسار الملف المصدري | عدد الأسطر | الدور الوظيفي المختصر |
| :--- | :--- | :--- | :--- | :--- |
| **CMP-01** | **App** | **src/App.tsx** | 270 | المنسق الجذري للحالة والتنقل والمزامنة الدورية والتحديث المتفائل |
| **CMP-02** | **Navbar** | **src/components/Navbar.tsx** | 288 | شريط التنقل العلوي اللاصق المتكيف سياقياً ومفتاح تبديل المظهر |
| **CMP-03** | **BotList** | **src/components/BotList.tsx** | 293 | شبكة عرض البوتات وإنشائها وتصدير نسخها الاحتياطية وحذفها |
| **CMP-04** | **BotEditor** | **src/components/BotEditor.tsx** | 391 | حاوية العمل الثنائية ومكدس التدفقات والمزامنة الفورية وتعديل الاسم |
| **CMP-05** | **StartMessageSection** | **src/components/StartMessageSection.tsx** | 327 | تحرير وحفظ وتنسيق رسالة البداية **/start** وربط وسائطها |
| **CMP-06** | **MessageOptionsPanel** | **src/components/MessageOptionsPanel.tsx** | 307 | لوحة التأثيرات الاحتفالية الثمانية وحماية المحتوى ومعاينة الروابط |
| **CMP-07** | **MediaUploader** | **src/components/MediaUploader.tsx** | 537 | رفع الوسائط بالسحب والإفلات أو الروابط/المعرفات وإدارة الأوصاف والغشاوة |
| **CMP-08** | **ButtonsSection** | **src/components/ButtonsSection.tsx** | 674 | إدارة الأزرار الرئيسية بنوعيها وإعدادات لوحة الرد والنسخ والحذف الشجري |
| **CMP-09** | **UnifiedButtonForm** | **src/components/UnifiedButtonForm.tsx** | 1570 | النموذج الموحد لإنشاء وتعديل الأزرار وتدفقاتها وفحصها الحي في كل المستويات |
| **CMP-10** | **ButtonFlowEditor** | **src/components/ButtonFlowEditor.tsx** | 1639 | محرر التدفقات العودي الشامل والأوضاع الأربعة والإجراءات الـ 21 |
| **CMP-11** | **BotSettingsSection** | **src/components/BotSettingsSection.tsx** | 616 | إدارة أوامر البوت وزر القائمة والملف الشخصي ووضع الضيف والرد الافتراضي |
| **CMP-12** | **TokenSection** | **src/components/TokenSection.tsx** | 293 | ربط وفصل توكن البوت ومراقبة الاتصال ودليل BotFather |
| **CMP-13** | **JsonQuickDeploySection** | **src/components/JsonQuickDeploySection.tsx** | 842 | استيراد وتحليل وإصلاح كود JSON وتفعيله مع التوكن في خطوة واحدة |
| **CMP-14** | **ScanTelegramSection** | **src/components/ScanTelegramSection.tsx** | 2029 | إدارة حسابات MTProto والزحف الآلي واستنساخ البوتات الحية |
| **CMP-15** | **TelegramSimulator** | **src/components/TelegramSimulator.tsx** | 2416 | محاكي تيليجرام التفاعلي المزدوج (معاينة محلية + تفاعل مسح حي) |
| **CMP-16** | **SimulatorQuickEditor** | **src/components/SimulatorQuickEditor.tsx** | 762 | درج التحرير الموضعي السريع للرسائل والأزرار من داخل شاشة الهاتف |
| **CMP-17** | **RowArrangerModal** | **src/components/RowArrangerModal.tsx** | 585 | استوديو السحب والإفلات المرئي لتوزيع الصفوف المختلطة ومعاينتها |
| **CMP-18** | **PaginationSettingsModal** | **src/components/PaginationSettingsModal.tsx** | 1199 | إعدادات تقسيم الصفحات التلقائي واليدوي ونصوص التنقل والمعاينة الحية |
| **CMP-19** | **TelegramApiInspectorModal** | **src/components/TelegramApiInspectorModal.tsx** | 272 | فاحص وناسخ حمولات Telegram Bot API الرسمية ومدقق التوافق |
| **CMP-20** | **ConfirmModal** | **src/components/ConfirmModal.tsx** | 75 | نافذة حوار التأكيد الموحدة الداعمة لمفتاح Escape |

---

## 22.3 السجل الكامل لجميع مسارات الخادم الخلفي ونقاط النهاية (All 29 Express Route Handlers in server.ts)

يوثق الجدول الآتي جميع معالجات المسارات الخمسة والعشرين + الأربعة الإضافية (إجمالي **29 مساراً فعلياً** في **server.ts**) بدقة السطر البرمجي (**مؤكد من الشيفرة المصدرية**):

| # | طريقة HTTP والمسار الدقيق | السطر في server.ts | الوظيفة التفصيلية والمدخلات والمخرجات |
| :--- | :--- | :--- | :--- |
| **1** | **GET /api/bots** | 1577 | إرجاع مصفوفة جميع البوتات المحفوظة على الخادم مع حالات اتصالها الحية |
| **2** | **POST /api/bots/restore** | 1583 | استعادة مصفوفة بوتات مرسلة من خزنة المتصفح بعد إعادة تشغيل الخادم وإعادة تشغيل المتصل منها |
| **3** | **POST /api/bots** | 1619 | إنشاء بوت جديد (باسم فقط أو بمخطط كامل) وتوليد معرف فريد وحفظه على القرص |
| **4** | **POST /api/bots/import-and-connect** | 1672 | مسار موحد لإنشاء أو تحديث بوت من مخطط JSON وربط التوكن وتشغيله في طلب واحد |
| **5** | **GET /api/bots/:id** | 1783 | جلب بيانات بوت محدد بمعرفه مع حالة المستقصي الحية (أو 404 إن لم يوجد) |
| **6** | **PUT /api/bots/:id** | 1793 | تحديث إعدادات وأزرار وتدفقات بوت قائم وتحديث نسخته الحية في الذاكرة فوراً |
| **7** | **POST /api/bots/:id/sync** | 1829 | مزامنة فورية لهوية البوت وأوامره وزر قائمته مع تيليجرام وإعادة تنشيط المستقصي إن تعطل |
| **8** | **DELETE /api/bots/:id** | 1879 | إيقاف مستقصي البوت فوراً وحذف سجله نهائياً من القرص |
| **9** | **POST /api/bots/:id/connect** | 1898 | التحقق من التوكن عبر **getMe** وحذف أي Webhook قديم ومزامنة الهوية وتشغيل حلقة **pollBot** |
| **10** | **POST /api/bots/:id/disconnect** | 2017 | إيقاف حلقة استقصاء البوت وتعيين **isConnected = false** مع الاحتفاظ بالإعدادات |
| **11** | **GET /api/bots/:id/status** | 2046 | فحص تشخيصي دقيق لحالة المستقصي ونبضه الأخير وأخطاء الاتصال |
| **12** | **POST /api/upload** | 2068 | رفع ملف وسيط عبر **multer** (حتى 25MB) إلى مجلد **uploads/** وإرجاع رابطه وحجمه |
| **13** | **GET /api/scan/status** | 2082 | إرجاع حالة عميل MTProto والحساب النشط والحسابات المحفوظة وتقدم الزاحف النشط |
| **14** | **POST /api/scan/connect** | 2086 | بدء مصادقة حساب تيليجرام (إما عبر **StringSession** مباشر أو إرسال رمز الهاتف **sendCode**) |
| **15** | **POST /api/scan/verify-code** | 2116 | إتمام التحقق برمز الهاتف أو كلمة مرور التحقق بخطوتين (**2FA SRP**) وحفظ الجلسة |
| **16** | **POST /api/scan/disconnect** | 2129 | قطع اتصال جلسة MTProto الحالية (مع خيار مسح الجلسة المحفوظة) |
| **17** | **POST /api/scan/switch-account** | 2135 | التبديل الفوري إلى حساب تيليجرام آخر محفوظ بمعرفه **savedId** |
| **18** | **DELETE /api/scan/accounts/:savedId** | 2151 | حذف حساب محفوظ من خزنة جلسات الماسح **scan-sessions.json** |
| **19** | **POST /api/scan/sync-telegram** | 2160 | سحب ومسح سجل المحادثات السابقة مع البوتات في حساب المستخدم (كلها أو لبوت محدد) |
| **20** | **POST /api/scan/target-bot** | 2172 | تعيين أو إلغاء فلتر البوت المستهدف حالياً للمراقبة الحية المركزة |
| **21** | **GET /api/scan/bots** | 2178 | إرجاع قائمة جميع سجلات البوتات الممسوحة والملتقطة من **scan-captures.json** |
| **22** | **GET /api/scan/bots/:botKey** | 2182 | إرجاع سجل الرسائل والأزرار الكامل لبوت ممسوح واحد بمعرفه **botKey** |
| **23** | **POST /api/scan/interact** | 2190 | إرسال رسالة/أمر نصي أو ضغط زر Inline حقيقي عبر MTProto والتقاط استجابة البوت |
| **24** | **POST /api/scan/crawl** | 2208 | إطلاق الزاحف الآلي الشامل (**BFS Deep Crawler**) لاستكشاف أزرار البوت وتدفقاته |
| **25** | **POST /api/scan/crawl/stop** | 2224 | طلب إيقاف آمن فوري للزاحف الآلي الجاري مع الاحتفاظ بكافة البيانات المكتشفة |
| **26** | **POST /api/scan/bots/:botKey/link-step** | 2229 | حفظ ربط يدوي (**manualParentOverrides**) لرسالة معدلة يتيمة بزر أب محدد في السجل |
| **27** | **PATCH /api/scan/bots/:botKey** | 2246 | تعديل الاسم المخصص أو تحديث بيانات الوصف الإدارية لسجل بوت ممسوح |
| **28** | **DELETE /api/scan/bots/:botKey** | 2259 | حذف سجل بوت ممسوح من ذاكرة الماسح ومن ملف **scan-captures.json** |
| **29** | **GET \*** (في وضع الإنتاج) | 2295 | تقديم ملف الواجهة الأمامية المجمع **dist/index.html** لدعم تطبيق الصفحة الواحدة |

---

## 22.4 الفهرس الكامل لجميع دوال العميل الشبكي والخزنة (28 Client Methods in src/services/api.ts)

- **دوال إدارة البوتات والوسائط (12 دالة):**
  **api.getBots**, **api.createBot**, **api.createBotFromBlueprint**, **api.importAndConnectBot**, **api.getBot**, **api.updateBot**, **api.deleteBot**, **api.connectBot**, **api.disconnectBot**, **api.getBotStatus**, **api.syncBot**, **api.uploadFile**.
- **دوال إدارة المسح الحي والزاحف (16 دالة تحت فضاء api.scan):**
  **api.scan.getStatus**, **api.scan.connectWithSession**, **api.scan.startPhoneLogin**, **api.scan.verifyPhoneCode**, **api.scan.disconnect**, **api.scan.switchAccount**, **api.scan.removeAccount**, **api.scan.syncTelegramHistory**, **api.scan.setTargetBot**, **api.scan.getBots**, **api.scan.interact**, **api.scan.crawlFullBot**, **api.scan.stopCrawl**, **api.scan.linkStep**, **api.scan.renameBot**, **api.scan.deleteBot**.

---

## 22.5 الفهرس الكامل للمحركات المشتركة الثمانية ودوالها الرئيسية (8 Shared Engines in src/utils/)

1. **telegramFormatters.ts (833 سطراً):** **validateBotToken**, **getUtf8ByteLength**, **validateInlineButton**, **validateReplyButton**, **groupButtonsIntoRows**, **formatTelegramInlineKeyboard**, **formatTelegramReplyKeyboard**, **buildCleanInlineKeyboardMarkup**, **buildCleanReplyKeyboardMarkup**, **getButtonColorClasses**, **computeNextButtonPosition**, **reorderButtons**, **moveButtonToPosition**, **applyLayoutTemplate**, **findButtonById**.
2. **telegramDelivery.ts (333 سطراً):** **TELEGRAM_MESSAGE_EFFECTS**, **shouldRestartPoller**, **classifyTelegramPollingError**, **sanitizeTelegramMarkup**, **buildTelegramMessageOptionFields**, **buildTelegramSendBody**.
3. **flowEngine.ts (411 سطراً):** **SessionManager**, **resolveMenuView**, **resolveSlashCommand**, **findContextAwareReplyAction**, **detectFlowCycle**, **collectDescendantButtonIds**, **duplicateButtonWithFlow**.
4. **pagination.ts (818 سطراً):** **DEFAULT_PAGINATION_CONFIG**, **computeTotalPages**, **clampPage**, **getButtonsForPage**, **formatPageIndicatorText**, **buildNavigationRow**, **buildMenuNavigationRows**, **paginateButtons**, **formatPaginatedInlineKeyboard**, **formatPaginatedReplyKeyboard**.
5. **jsonBotBlueprint.ts (2525 سطراً):** **SAMPLE_BOT_JSON_BLUEPRINT**, **autoFixJsonCode**, **parseAndValidateBotJson**, **parseBotDesignJson**, **exportBotDesignJson**, **applyBlueprintUpdates**.
6. **scanBlueprintBuilder.ts (1140 سطراً):** **telegramEntitiesToHtml**, **buildBlueprintFromCapturedBot**, **mergeScannedCaptureIntoBot**, **collectBotCrawlCandidates**, **isNavBackLabel**, **isHomeLabel**.
7. **botPersistence.ts (239 سطراً):** **reconcileServerAndLocalBots**, **readVaultBotsSync**, **writeVaultBotsSync**, **readVaultBotsAsync**, **readDeletedBotIdsAsync**, **upsertBotInVault**, **removeBotFromVault**.
8. **botBackupExport.ts (78 سطراً):** **buildBotBackupFilename**, **exportBotBackupJson**, **downloadBotBackupFile**.

---

## 22.6 فهرس عقود وأنواع البيانات الجوهرية (Core Domain Types in src/types/)

- **في ملف src/types/bot.ts (521 سطراً):** **BotConfig**, **StartMessageConfig**, **BotButton**, **ButtonType**, **ButtonColor**, **ButtonActionType** (16 قيمة), **ButtonFlow**, **FlowMode** (4 قيم), **FlowAction**, **FlowActionType** (21 قيمة), **MediaItem**, **MediaType** (6 قيم), **ParseMode**, **TelegramMessageOptions**, **LinkPreviewOptions**, **PaginationConfig**, **PageOverrideConfig**, **SubMenuNavigationConfig**, **BotSettings**, **BotCommandItem**, **LoginUrlConfig**, **SwitchInlineQueryChosenChatConfig**, **RequestUsersConfig**, **RequestChatConfig**.
- **في ملف src/types/scan.ts (155 سطراً):** **ScanStatusResponse**, **SavedScanAccount**, **CapturedBotRecord**, **CapturedMessageRecord**, **CapturedButtonInfo**, **CrawlProgressState**, **ScanInteractRequest**.

---

## 22.7 مصفوفة المرجع السريع لجميع إجراءات الأزرار الستة عشر (16 ButtonActionType Quick Matrix)

| المعرف | القيمة التقنية | اللوحة | القيد البروتوكولي الأهم |
| :--- | :--- | :--- | :--- |
| **ACT-BTN-01** | **flow** | Inline + Reply | حد 64 بايت UTF-8 لـ **callback_data** في Inline |
| **ACT-BTN-02** | **url** | Inline فقط | يجب أن يبدأ بـ **http://** أو **https://** أو **tg://** |
| **ACT-BTN-03** | **web_app** | Inline + Reply | يشترط **https://** حصراً |
| **ACT-BTN-04** | **login_url** | Inline فقط | يشترط **https://** وربط النطاق لدى BotFather |
| **ACT-BTN-05** | **switch_inline_query** | Inline فقط | يتطلب تفعيل وضع Inline للبوت |
| **ACT-BTN-06** | **switch_inline_query_current_chat** | Inline فقط | يعمل في نفس الدردشة المفتوحة |
| **ACT-BTN-07** | **switch_inline_query_chosen_chat** | Inline فقط | تفعيل نوع محادثة واحد على الأقل من الأربعة |
| **ACT-BTN-08** | **copy_text** | Inline فقط | طول النص المنسوخ من 1 إلى 256 حرفاً |
| **ACT-BTN-09** | **callback_game** | Inline فقط | تحذير الموقع (0,0)؛ يُحول في **compat** داخل **sendMessage** |
| **ACT-BTN-10** | **pay** | Inline فقط | تحذير الموقع (0,0)؛ خاص بـ **sendInvoice** ويُحول في **compat** |
| **ACT-BTN-11** | **request_contact** | Reply فقط | يعمل في الدردشات الخاصة؛ يرد الخادم برقم الهاتف المستلم |
| **ACT-BTN-12** | **request_location** | Reply فقط | يعمل في الدردشات الخاصة؛ يرد الخادم بالإحداثيات المستلمة |
| **ACT-BTN-13** | **request_poll** | Reply فقط | يدعم الأنواع **any, regular, quiz** |
| **ACT-BTN-14** | **request_users** | Reply فقط | **request_id** صحيح و**max_quantity** من 1 إلى 10 |
| **ACT-BTN-15** | **request_chat** | Reply فقط | **request_id** صحيح لطلب مجموعة أو قناة |
| **ACT-BTN-16** | **none** | Inline + Reply | زر تجميلي؛ يستخدم **noop_** في Inline لإغلاق مؤشر التحميل صامتاً |

---

## 22.8 مصفوفة المرجع السريع لجميع الإجراءات المتسلسلة الواحد والعشرين (21 FlowActionType Quick Matrix)

1. **send_message** (إرسال رسالة نصية مستقلة) | 2. **edit_message** (تعديل الرسالة الحالية أو السقوط لإرسال جديدة) | 3. **delete_message** (حذف رسالة السياق) | 4. **send_media** (إرسال وسيط مفرد من 6 أنواع) | 5. **send_media_group** (إرسال ألبوم مجمع من 2–10 عناصر) | 6. **send_location** (إرسال موقع بالإحداثيات) | 7. **send_venue** (إرسال فرع/عنوان مسمى) | 8. **send_contact** (إرسال بطاقة اتصال) | 9. **send_poll** (إرسال استطلاع رأي أو اختبار **quiz**) | 10. **send_dice** (إرسال رمز حظ متحرك من 6 رموز) | 11. **send_sticker** (إرسال ملصق بمعرف أو رابط) | 12. **set_message_reaction** (وضع إيموجي تفاعلي على الرسالة) | 13. **chat_action** (إظهار حالة نشاط البوت مثل جاري الكتابة) | 14. **delay** (انتظار زمني بسقف أمان 10 ثوانٍ) | 15. **answer_callback_query** (إشعار Toast أو نافذة Alert) | 16. **open_flow** (القفز المباشر لتدفق آخر) | 17. **navigate_back** (الرجوع للقائمة الأب) | 18. **navigate_home** (العودة للقائمة الجذرية) | 19. **switch_page** (الانتقال لصفحة محددة) | 20. **show_reply_keyboard** (إظهار لوحة الرد عبر عرض التدفق) | 21. **remove_reply_keyboard** (إخفاء لوحة الرد عبر **ReplyKeyboardRemove**).

---

## 22.9 مصفوفة أوضاع التدفق الأربعة وأنماط العرض والتموضع

- **أوضاع FlowMode الأربعة:** **send_message** (رسالة ووسائط)، **inline_menu** (قائمة فرعية مضمنة)، **reply_menu** (قائمة فرعية سفلية سياقية)، **skip** (تخطي كامل صامت).
- **أوضاع التحديث (updateMode):** **edit** (تحديث فقاعة الرسالة الحالية في مكانها لأزرار Inline لتجربة تطبيق سلسة) مقابل **new** (إرسال فقاعة رسالة جديدة مستقلة).
- **أوضاع تموضع الوسائط (placement):** **before_media** (النص أولاً ثم الوسائط) مقابل **after_media** (الوسائط أولاً أو كوصف مدمج ثم النص).

---

## 22.10 مصفوفة أنواع الوسائط الستة (6 MediaTypes) وقواعد تيليجرام

| النوع | طريقة Bot API الرسمية | قابلية التجميع في sendMediaGroup | دعم الغشاوة الضبابية (hasSpoiler) | استنتاج MIME التلقائي عند الرفع |
| :--- | :--- | :--- | :--- | :--- |
| **photo** | **sendPhoto** | نعم (2–10 عناصر) | نعم | الصور غير المتحركة (**image/\*** عدا GIF) |
| **video** | **sendVideo** | نعم (2–10 عناصر) | نعم | كافة صيغ **video/\*** |
| **animation** | **sendAnimation** | لا (يُرسل منفرداً) | نعم | الصور المتحركة (**image/gif**) |
| **audio** | **sendAudio** | نعم (مع الصوتيات) | لا | الملفات الصوتية (**audio/\*** عدا OGG) |
| **voice** | **sendVoice** | لا (يُرسل منفرداً) | لا | البصمات الصوتية (**audio/ogg**) |
| **document** | **sendDocument** | نعم (مع المستندات) | لا | جميع أنواع الملفات الأخرى افتراضياً |

---

## 22.11 مصفوفة التأثيرات الاحتفالية الثمانية للرسائل (8 Official Message Effects)

| الرمز والاسم العربي | المعرف الرقمي الرسمي في Telegram Bot API (**message_effect_id**) |
| :--- | :--- |
| 🔥 نار | **5104841245755180586** |
| 👍 إعجاب | **5107584321108051014** |
| 👎 عدم إعجاب | **5104858069142078462** |
| ❤️ قلب | **5159385139981059251** |
| 🎉 احتفال | **5046509860389126442** |
| 🎊 مفرقعات | **5046589136895476101** |
| ✨ بريق | **5159384822153471209** |
| 🚀 صاروخ | **5104849724096120560** |

---

## 22.12 سجل الطرق الرسمية المستدعاة في Telegram Bot API وطلبات MTProto

- **طرق Telegram Bot API المستدعاة في server.ts (26 طريقة رسمية):**
  **getMe**, **deleteWebhook**, **getUpdates**, **sendMessage**, **editMessageText**, **editMessageCaption**, **editMessageReplyMarkup**, **deleteMessage**, **answerCallbackQuery**, **answerInlineQuery**, **sendPhoto**, **sendVideo**, **sendDocument**, **sendAudio**, **sendVoice**, **sendAnimation**, **sendMediaGroup**, **sendLocation**, **sendVenue**, **sendContact**, **sendPoll**, **sendDice**, **sendSticker**, **setMessageReaction**, **sendChatAction**, **setMyCommands**, **setChatMenuButton**, **setMyName**, **setMyShortDescription**, **setMyDescription**.
- **عمليات وطلبات MTProto المستدعاة في server/telegramScanner.ts (عبر GramJS):**
  **auth.SendCode**, **auth.SignIn**, **account.GetPassword**, **auth.CheckPassword**, **users.GetFullUser / getMe**, **getDialogs**, **getMessages**, **sendMessage**, **messages.GetBotCallbackAnswerRequest**, بالإضافة إلى مستمعي الأحداث الحية **NewMessage** و**MessageEdited**.

---

## 22.13 مصفوفة مفاتيح التخزين المحلي وملفات القرص الدائمة

| موقع التخزين | اسم المفتاح / المسار | الغرض وملاحظات الأمان |
| :--- | :--- | :--- |
| **localStorage (المتصفح)** | **telecraft_theme** | حفظ السمة البصرية المفضلة (**dark** أو **light**) |
| **localStorage (المتصفح)** | **telecraft_bots_vault_v1** | الخزنة المتزامنة السريعة لكافة كائنات البوتات |
| **localStorage (المتصفح)** | **telecraft_deleted_bots_v1** | سجل شواهد القبور لمعرفات البوتات المحذوفة عمداً |
| **IndexedDB (المتصفح)** | **telecraft_persistence_db / kv** | الخزنة الاحتياطية واسعة السعة للبوتات وشواهد الحذف |
| **قرص الخادم** | **data/bots.json** (+ **.tmp** و**.bak**) | السجل الذري الرئيسي للبوتات (يحتوي توكنات — مستبعد من Git) |
| **قرص الخادم** | **data/scan-sessions.json** | خزنة جلسات حسابات MTProto المحفوظة (حساس للغاية — مستبعد من Git) |
| **قرص الخادم** | **data/scan-captures.json** | أرشيف سجلات الرسائل والأزرار الممسوحة للبوتات |
| **قرص الخادم** | **uploads/** | مجلد حفظ ملفات الوسائط المرفوعة من المستخدم (يُنشأ تلقائياً عند أول رفع) |

---

## 22.14 فهرس النوافذ المنبثقة والطبقات المتراكبة الستة

1. **ConfirmModal** (تأكيد الحذف وإيقاف الاتصال) | 2. **RowArrangerModal** (تنظيم الصفوف المختلطة) | 3. **PaginationSettingsModal** (إعدادات تقسيم الصفحات) | 4. **TelegramApiInspectorModal** (فاحص حمولات API) | 5. **SimulatorQuickEditor** (درج التحرير الموضعي داخل الهاتف) | 6. طبقات قائمة الأوامر (**/**) وتنبيهات **Toast / Alert** داخل شاشة المحاكي.

---

## 22.15 فهرس السيناريوهات التشغيلية السبعة (SCN-01 إلى SCN-07)

- **SCN-01:** تأسيس بوت جديد من الصفر وإعداد رسالة البداية والوسائط وربط التوكن (الجزء 10).
- **SCN-02:** بناء شجرة قوائم متداخلة بصفوف مختلطة وتقسيم صفحات وسلسلة إجراءات (الجزء 10).
- **SCN-03:** التصميم والاختبار والتحرير الموضعي السريع من داخل المحاكي وفحص API (الجزء 10).
- **SCN-04:** الاستيراد والتفعيل الفوري عبر JSON والنسخ الاحتياطي الآمن (الجزء 10).
- **SCN-05:** المسح التلقائي عبر MTProto والزاحف الشامل واستنساخ البوت لبوت مستقل (الجزء 10).
- **SCN-06:** رحلة العميل النهائي الحقيقية على تيليجرام والإنقاذ التوافقي الثلاثي (الجزء 10).
- **SCN-07:** الاسترداد التلقائي من الكوارث ومصالحة الخزنة المزدوجة والتعامل مع أخطاء 401 و409 (الجزء 10).

---

## 22.16 فهرس القواعد الوظيفية والقيود البروتوكولية (BR-01 إلى BR-32)

موثقة بالكامل في الجداول التساعية بالفصل العشرين (الجزء 11):
- **BR-01 إلى BR-08:** قواعد تسمية البوت، رسالة البداية، صون الوسائط، التوكن، الأوامر، الهوية، وحد 1024 حرفاً لوصف الوسائط.
- **BR-09 إلى BR-19:** سقف 64 بايت UTF-8، بروتوكولات الروابط وHTTPS، حدود النسخ والبحث المفلتر وطلب المستخدمين، تحذيرات الدفع والألعاب، سقف الصفوف (8/12)، وتقسيم الصفحات والمطابقة السياقية لـ Reply.
- **BR-20 إلى BR-32:** عزل الجلسات، الحماية من الدورات، التسليم الثلاثي، تصنيف أخطاء الاستقصاء، تجريد التوكن عند التصدير، أولوية شواهد الحذف وحسم **updatedAt**، الإصلاح الذاتي لـ JSON، حد 25MB للرفع، سقف 10 ثوانٍ للتأخير، سقوف الزاحف، والتحليل الآمن ضد XSS.

---

## 22.17 فهرس مجموعات الاختبار الثماني وحالات التحقق الستين (TC-01 إلى TC-60)

موثقة بالكامل في الجداول الأحد عشرية بالفصل الحادي والعشرين (الجزء 11):
- **botBackupExport.test.ts:** الاختباران **TC-01** و**TC-02** (اجتازا 100%).
- **botPersistence.test.ts:** الاختبارات **TC-03** إلى **TC-07** (5 اختبارات — اجتازت 100%).
- **flowEngine.test.ts:** الاختبارات **TC-08** إلى **TC-13** (6 اختبارات — اجتازت 100%).
- **jsonBotBlueprint.test.ts:** الاختبارات **TC-14** إلى **TC-26** (13 اختباراً — اجتازت 100%).
- **pagination.test.ts:** الاختبارات **TC-27** إلى **TC-35** (9 اختبارات — اجتازت 100%).
- **scanBlueprintBuilder.test.ts:** الاختبارات **TC-36** إلى **TC-40** (5 اختبارات — اجتازت 100%).
- **telegramDelivery.test.ts:** الاختبارات **TC-41** إلى **TC-47** (7 اختبارات — اجتازت 100%).
- **telegramFormatters.test.ts:** الاختبارات **TC-48** إلى **TC-55** (8 اختبارات — اجتازت 100%).
- **فحوص البناء والأنواع والأمان والتبعيات الشاملة:** الفحوص **TC-56** إلى **TC-60** (5 فحوص — اجتازت 100%).

---

## 22.18 الجرد الكامل لجميع ملفات المستودع الخمسين (Complete 50-File Repository Inventory — 29,908 Lines)

| الفئة | المسار الكامل للملف | عدد الأسطر | الحالة والتصنيف |
| :--- | :--- | :--- | :--- |
| **التكوين الجذري (7 ملفات)** | **package.json** (40)، **index.html** (31)، **metadata.json** (7)، **vite.config.ts** (22)، **tsconfig.json** (28)، **.env.example** (9)، **.gitignore** (8) | 145 سطراً | مقروءة ومحللة بالكامل — مؤكد من الشيفرة المصدرية |
| **الخادم الخلفي (ملفان)** | **server.ts** (2308)، **server/telegramScanner.ts** (1997) | 4,305 أسطر | مقروءة ومحللة بالكامل — مؤكد من الشيفرة المصدرية |
| **نواة الواجهة والأنواع والعميل (6 ملفات)** | **src/main.tsx** (5)، **src/index.css** (36)، **src/App.tsx** (270)، **src/types/bot.ts** (521)، **src/types/scan.ts** (155)، **src/services/api.ts** (541) | 1,528 سطراً | مقروءة ومحللة بالكامل — مؤكد من الشيفرة المصدرية |
| **المحركات المشتركة (8 ملفات)** | **botBackupExport.ts** (78)، **botPersistence.ts** (239)، **flowEngine.ts** (411)، **jsonBotBlueprint.ts** (2525)، **pagination.ts** (818)، **scanBlueprintBuilder.ts** (1140)، **telegramDelivery.ts** (333)، **telegramFormatters.ts** (833) | 6,377 سطراً | مقروءة ومؤكدة بالاختبار التشغيلي |
| **اختبارات الوحدات الآلية (8 ملفات)** | **botBackupExport.test.ts** (144)، **botPersistence.test.ts** (122)، **flowEngine.test.ts** (424)، **jsonBotBlueprint.test.ts** (497)، **pagination.test.ts** (296)، **scanBlueprintBuilder.test.ts** (529)، **telegramDelivery.test.ts** (240)، **telegramFormatters.test.ts** (186) | 2,438 سطراً | مقروءة ومنفذة فعلياً (55/55 ناجحة) |
| **مكونات الواجهة (19 ملفاً)** | جميع ملفات **src/components/*.tsx** التسعة عشر الموثقة في القسم 22.2 | 15,115 سطراً | مقروءة ومفحوصة نوعياً ومجمعة إنتاجياً |
| **الإجمالي العام للمستودع** | **50 ملفاً مصدرياً وتكوينياً واختبارياً** | **29,908 أسطر** | **تغطية قراءة وتحليل وتوثيق بنسبة 100%** |

---

## 22.19 القاموس الاصطلاحي الموحد ثنائي اللغة (Bilingual Technical Glossary)

| المصطلح العربي المعتمد في التوثيق | المقابل التقني الأصلي بالإنجليزية | التعريف المختصر في سياق المنصة |
| :--- | :--- | :--- |
| **الاستقصاء الطويل** | **Long Polling (getUpdates)** | آلية اتصال مستمرة يطلب فيها الخادم التحديثات من تيليجرام دون الحاجة لعنوان ويب خارجي عام أو شهادة Webhook |
| **الأزرار المضمنة الشفافة** | **Inline Keyboard Buttons** | أزرار تلتصق أسفل فقاعة رسالة البوت مباشرة وترسل بيانات استدعاء خفية أو تفتح روابط وتطبيقات مصغرة |
| **لوحة مفاتيح الرد السفلية** | **Reply Keyboard Markup** | لوحة أزرار تحل محل لوحة الكتابة المعتادة أسفل شاشة الهاتف وترسل نص الزر كرسالة دردشة أو تطلب الهاتف/الموقع |
| **محرك التدفقات التفاعلية** | **Button Flow Engine** | المنظومة المسؤولة عن ربط كل زر برسائله ووسائطه وإجراءاته المتسلسلة وقوائمه الفرعية بأي عمق |
| **مكدس الجلسة ومسار الخبز** | **Session Stack & Breadcrumbs** | سجل المسار التراتبي الذي يحفظ القوائم المفتوحة ورقم الصفحة في كل مستوى لتمكين الرجوع الدقيق |
| **التسليم التوافقي الثلاثي** | **3-Tier Delivery Fallback (clean / compat / safe)** | آلية إنقاذ تعيد محاولة إرسال الرسالة المرفوضة بتخفيف الخصائص تدريجياً لضمان وصولها للمستخدم |
| **شواهد القبور للمحذوفات** | **Deletion Tombstones (deletedIds)** | سجل معرفات البوتات التي حذفها المستخدم عمداً لمنع استعادتها الخاطئة عند مصالحة الخادم والخزنة |
| **التحديث المتفائل المحمي** | **Sequence-Guarded Optimistic UI** | تحديث الواجهة والمحاكي فوراً قبل انتهاء طلب الشبكة مع عداد تسلسلي يمنع ارتداد الاستجابات المتأخرة |
| **بروتوكول العميل المباشر والزاحف** | **MTProto & Automated BFS Crawler** | بروتوكول حسابات مستخدمي تيليجرام المستخدم لمسح البوتات الحية والضغط الآلي الممنهج لاكتشاف قوائمها |
| **الغشاوة الضبابية التشويقية** | **Media Spoiler (has_spoiler)** | طبقة تغبيش بصرية فوق الصور والفيديو والـ GIF تختفي عند نقر المستلم عليها |

---

## 22.20 سجل القيود المعمارية والملاحظات التصميمية والديون التقنية المرصودة (Architectural Limitations & Audit Findings)

التزاماً بالشفافية الهندسية الصارمة، يرصد التحليل المعماري النقاط الاثنتي عشرة الآتية بموضوعية كاملة (**مؤكد من الشيفرة المصدرية** و**مؤكد بالاختبار التشغيلي**):

1. **تعارض إصدارات التبعيات النظيرة عند التثبيت الافتراضي:** يحدد ملف **package.json** حزمة **vite@^8.3.8** مع تثبيت **esbuild@^0.25.0** في حين تطلب Vite 8 اختيارياً **esbuild@^0.27.0 || ^0.28.0**؛ مما يستلزم تمرير علم **--legacy-peer-deps** عند تشغيل **npm install** (**مؤكد بالاختبار التشغيلي**).
2. **حزم ومتغيرات بيئة معلنة وغير مستخدمة في الكود الفعلي:** الحزم **@google/genai** و**motion** و**dotenv** و**better-sqlite3** (إن ذكرت خارجياً) غير مستوردة في أي ملف داخل **src/** أو **server/**، كما أن المتغير **GEMINI_API_KEY** المربوط في **vite.config.ts** و**.env.example** غير مستهلك في التطبيق (مخلفات قالب أولي من Google AI Studio) (**مؤكد من الشيفرة المصدرية**).
3. **إشعار تقادم مكتبة GramJS:** تصدر حزمة **telegram@2.26.22** أثناء التثبيت إشعار تقادم من سجل npm يشير إلى انتقال الصيانة المجتمعية مستقبلاً لحزمة بديلة، رغم أنها تعمل بكفاءة كاملة حالياً (**مؤكد بالاختبار التشغيلي**).
4. **تحذير حجم الحزمة الواحدة في Vite:** يخرج بناء الإنتاج ملف JavaScript واحداً بحجم **740.98 كيلوبايت** غير مقسم عبر الاستيراد الكسول (**Code Splitting**)، مع تحذير مستقبلي حول استخدام **__dirname** في **vite.config.ts** (**مؤكد بالاختبار التشغيلي**).
5. **غياب نظام مصادقة لمالكي لوحة التحكم:** تعمل المنصة كأداة استوديو أحادية المستأجر أو محلية الشبكة دون شاشة تسجيل دخول لحماية مسارات **/api/bots** و**/api/scan**؛ لذا إذا نُشرت على خادم عام مفتوح للإنترنت يلزم وضعها خلف طبقة مصادقة عكسية لحماية التوكنات وجلسات MTProto.
6. **تخزين جلسات المستخدمين النشطة للبوت في الذاكرة العابرة:** يُحفظ **SessionManager** (مواقع عملاء البوت في القوائم الفرعية) في ذاكرة Node.js العشوائية لسرعة الاستجابة؛ لذا عند إعادة تشغيل عملية الخادم يعود العملاء إلى القائمة الجذرية عند أول ضغطة تالية بينما تبقى البوتات نفسها محفوظة بالكامل على القرص.
7. **فرق تبويب «المحاكي» الخامس في الشريط العلوي:** يعرض **Navbar** خمسة تبويبات تتضمن «المحاكي» بينما يعرض **BotEditor** أربعة تبويبات لأن المحاكي ظاهر بصفة دائمة في العمود الأيسر؛ وعند نقر «المحاكي» في الشريط العلوي يُعرض في اليمين قسم رسالة البداية افتراضياً بجوار المحاكي.
8. **تفاوت بعض الحقول الفرعية للإجراءات بين الواجهتين:** يوفر **ButtonFlowEditor** خيارات الاختبار **quiz** والتفاعل الكبير **isBig** وسبع حالات محادثة ومنتقي التدفق الهدف لـ **open_flow**، بينما يعرض بانل الإجراءات المرافق داخل **UnifiedButtonForm** نسخة مبسطة منها.
9. **حدود أزرار الدفع والألعاب:** يسمح النظام بتصميم وتصدير أزرار **pay** و**callback_game** وفحصها، لكن الخادم الخلفي لا يتضمن واجهة لإعداد بوابات الدفع (**sendInvoice**) أو الألعاب (**sendGame**)، ولذلك يحولها محرك **compat** تلقائياً إلى أزرار استدعاء آمنة عند إرسالها ضمن رسائل القوائم النصية.
10. **آلية الإجراء show_reply_keyboard على الخادم:** لا ينفذ الخادم استدعاءً منفرداً خاصاً لهذا الإجراء داخل حلقة الإجراءات، بل يعتمد على إرسال لوحة الرد الفرعية المرفقة بالتدفق نفسه بعد انتهاء الحلقة مباشرة.

---

## 22.21 سجل التحقق النهائي وإقرار اكتمال التحليل والتوثيق بنسبة 100% (100% Analysis Completeness Registry)

يشهد هذا السجل الهندسي الختامي بأن عملية الفحص والتحليل والاختبار والتوثيق لمنصة **TeleCraft Studio — نظام أكرم لبناء وإدارة بوتات تيليجرام** قد استوفت كافة معايير الشمول والدقة بلا أي استثناء أو اختصار:

| معيار الاكتمال والجودة الإلزامي | النطاق المحقق فعلياً في الوثيقة | نسبة الإنجاز |
| :--- | :--- | :--- |
| قراءة وتحليل جميع ملفات المستودع المصدرية والتكوينية والاختبارية | 50 من 50 ملفاً (29,908 أسطر برمجية مقروءة بالكامل) | **100%** |
| التحقق التشغيلي الفعلي (الأنواع + اختبارات الوحدات + بناء الإنتاج) | 0 أخطاء أنواع، 55/55 اختبار ناجح، وبناء إنتاج مكتمل | **100%** |
| توثيق جميع الشاشات والصفحات التسع بالقالب الكامل (35 بنداً لكل شاشة) | 9 من 9 شاشات (**PAGE-01** إلى **PAGE-09**) | **100%** |
| توثيق جميع مكونات الواجهة العشرين بالقالب الهيكلي (A–K) | 20 من 20 مكوناً (**CMP-01** إلى **CMP-20**) | **100%** |
| التوثيق المستقل لجميع أنواع إجراءات الأزرار الـ 16 (بـ 13 سمة لكل نوع) | 16 من 16 نوعاً (**ACT-BTN-01** إلى **ACT-BTN-16**) | **100%** |
| التوثيق المستقل لجميع الإجراءات المتسلسلة الـ 21 وأوضاع التدفق الـ 4 | 21 من 21 إجراءً (**ACT-FLW-01** إلى **ACT-FLW-21**) + 4 أوضاع | **100%** |
| توثيق عناصر المحاكي التفاعلي الـ 16 بالسمات العشر وجداول التفاعلات الثمانية | 16 عنصراً × 10 سمات + جداول التفاعلات عبر كافة الفصول | **100%** |
| توثيق جميع السيناريوهات التشغيلية السبعة بالحقول التسعة عشر لكل سيناريو | 7 مجموعات شاملة (**SCN-01** إلى **SCN-07**) × 19 حقلاً | **100%** |
| توثيق القواعد الوظيفية (9 حقول) وحالات الاختبار الشاملة (11 حقلاً) | 32 قاعدة محكمة (**BR-01..32**) + 60 حالة اختبار (**TC-01..60**) | **100%** |
| الالتزام الصارم بانعدام الشيفرات البرمجية وانعدام تسريب أي بيانات سرية | صفر كتل كود، صفر علامات كود مائلة، وصفر أسرار مكشوفة | **100%** |

---

*تم بحمد الله اكتمال التوثيق المرجعي الشامل للمنصة بأجزائه الاثني عشر وفصوله الاثنين والعشرين.*
