import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTotalPages,
  clampPage,
  getButtonsForPage,
  formatPageIndicatorText,
  buildNavigationRow,
  buildMenuNavigationRows,
  formatPaginatedInlineKeyboard,
  formatPaginatedReplyKeyboard,
  getDefaultPaginationConfig,
  SessionManager,
} from './pagination';
import { BotButton, PaginationConfig } from '../types/bot';

test('computeTotalPages correctly calculates pages for auto, manual, and disabled modes', () => {
  const dummyButtons: BotButton[] = Array.from({ length: 15 }, (_, i) => ({
    id: `b${i}`,
    text: `Btn ${i}`,
    type: 'inline',
    actionType: 'flow',
    row: Math.floor(i / 2),
    order: i % 2,
  }));

  // Disabled mode
  const disabledConfig: PaginationConfig = getDefaultPaginationConfig({ enabled: false });
  assert.equal(computeTotalPages(dummyButtons, disabledConfig), 1);

  // Auto mode: 15 buttons with 6 per page => 3 pages
  const autoConfig: PaginationConfig = getDefaultPaginationConfig({
    enabled: true,
    mode: 'auto',
    itemsPerPage: 6,
  });
  assert.equal(computeTotalPages(dummyButtons, autoConfig), 3);

  // Auto mode: 12 buttons with 6 per page => 2 pages
  assert.equal(computeTotalPages(dummyButtons.slice(0, 12), autoConfig), 2);

  // Auto mode: 0 buttons => 1 page
  assert.equal(computeTotalPages([], autoConfig), 1);

  // Manual mode: 4 pages defined
  const manualConfig: PaginationConfig = getDefaultPaginationConfig({
    enabled: true,
    mode: 'manual',
    manualPages: [
      { id: 'p1', title: 'Page 1', buttonIds: ['b0', 'b1'] },
      { id: 'p2', title: 'Page 2', buttonIds: ['b2', 'b3'] },
      { id: 'p3', title: 'Page 3', buttonIds: ['b4'] },
    ],
  });
  assert.equal(computeTotalPages(dummyButtons, manualConfig), 3);
});

test('clampPage keeps page numbers within safe range', () => {
  assert.equal(clampPage(-5, 4), 0);
  assert.equal(clampPage(0, 4), 0);
  assert.equal(clampPage(2, 4), 2);
  assert.equal(clampPage(3, 4), 3);
  assert.equal(clampPage(10, 4), 3);
  assert.equal(clampPage(0, 1), 0);
  assert.equal(clampPage(5, 0), 0);
});

test('getButtonsForPage slices buttons accurately in auto mode', () => {
  const buttons: BotButton[] = Array.from({ length: 10 }, (_, i) => ({
    id: `btn_${i}`,
    text: `Button ${i}`,
    type: 'inline',
    actionType: 'flow',
    row: 0,
    order: i,
  }));

  const config: PaginationConfig = getDefaultPaginationConfig({
    enabled: true,
    mode: 'auto',
    itemsPerPage: 4,
  });

  // Page 0: items 0 to 3 (4 items)
  const page0 = getButtonsForPage(buttons, 0, config);
  assert.equal(page0.length, 4);
  assert.equal(page0[0].id, 'btn_0');
  assert.equal(page0[3].id, 'btn_3');

  // Page 1: items 4 to 7 (4 items)
  const page1 = getButtonsForPage(buttons, 1, config);
  assert.equal(page1.length, 4);
  assert.equal(page1[0].id, 'btn_4');
  assert.equal(page1[3].id, 'btn_7');

  // Page 2: items 8 to 9 (2 items)
  const page2 = getButtonsForPage(buttons, 2, config);
  assert.equal(page2.length, 2);
  assert.equal(page2[0].id, 'btn_8');
  assert.equal(page2[1].id, 'btn_9');
});

test('getButtonsForPage matches buttonIds in manual mode', () => {
  const buttons: BotButton[] = [
    { id: 'a', text: 'A', type: 'inline', actionType: 'flow', row: 0, order: 0 },
    { id: 'b', text: 'B', type: 'inline', actionType: 'flow', row: 0, order: 1 },
    { id: 'c', text: 'C', type: 'inline', actionType: 'flow', row: 1, order: 0 },
    { id: 'd', text: 'D', type: 'inline', actionType: 'flow', row: 1, order: 1 },
  ];

  const config: PaginationConfig = getDefaultPaginationConfig({
    enabled: true,
    mode: 'manual',
    manualPages: [
      { id: 'p1', buttonIds: ['a', 'c'] },
      { id: 'p2', buttonIds: ['b', 'd'] },
    ],
  });

  const page0 = getButtonsForPage(buttons, 0, config);
  assert.deepEqual(page0.map((b) => b.id), ['a', 'c']);

  const page1 = getButtonsForPage(buttons, 1, config);
  assert.deepEqual(page1.map((b) => b.id), ['b', 'd']);
});

test('formatPageIndicatorText formats template placeholders correctly', () => {
  assert.equal(
    formatPageIndicatorText(0, 5, 'صفحة {current} من {total}'),
    'صفحة 1 من 5'
  );
  assert.equal(
    formatPageIndicatorText(4, 5, 'صفحة {current} من {total}'),
    'صفحة 5 من 5'
  );
});

test('buildNavigationRow creates correct navigation buttons for inline keyboard', () => {
  const config = getDefaultPaginationConfig({
    enabled: true,
    navigation: {
      showPrevNext: true,
      prevText: 'السابق',
      nextText: 'التالي',
      showFirstLast: true,
      firstText: 'الأولى',
      lastText: 'الأخيرة',
      position: 'bottom',
    },
    indicator: {
      enabled: true,
      template: '{current}/{total}',
      showInNavigationBar: true,
    },
  });

  // Page 0 of 3 (no previous, only next)
  const navRow0 = buildNavigationRow(0, 3, config, 'inline');
  assert.equal(navRow0.length, 3); // indicator, next, last
  assert.equal(navRow0[0].text, '1/3');
  assert.equal(navRow0[0].callback_data, 'pg:info');
  assert.equal(navRow0[1].text, 'التالي');
  assert.equal(navRow0[1].callback_data, 'pg:1');
  assert.equal(navRow0[2].text, 'الأخيرة');
  assert.equal(navRow0[2].callback_data, 'pg:2');

  // Page 1 of 3 (middle page: has both prev and next)
  const navRow1 = buildNavigationRow(1, 3, config, 'inline');
  assert.equal(navRow1.length, 5); // first, prev, indicator, next, last
  assert.equal(navRow1[0].text, 'الأولى');
  assert.equal(navRow1[0].callback_data, 'pg:0');
  assert.equal(navRow1[1].text, 'السابق');
  assert.equal(navRow1[1].callback_data, 'pg:0');
  assert.equal(navRow1[2].text, '2/3');
  assert.equal(navRow1[3].text, 'التالي');
  assert.equal(navRow1[3].callback_data, 'pg:2');
  assert.equal(navRow1[4].text, 'الأخيرة');
  assert.equal(navRow1[4].callback_data, 'pg:2');

  // Page 2 of 3 (last page: has prev, no next)
  const navRow2 = buildNavigationRow(2, 3, config, 'inline');
  assert.equal(navRow2.length, 3); // first, prev, indicator
  assert.equal(navRow2[0].text, 'الأولى');
  assert.equal(navRow2[1].text, 'السابق');
  assert.equal(navRow2[2].text, '3/3');
});

test('buildMenuNavigationRows creates back and main menu buttons', () => {
  const menuNav = {
    showBackButton: true,
    backButtonText: 'رجوع',
    showMainMenuButton: true,
    mainMenuButtonText: 'الرئيسية',
  };

  const inlineRows = buildMenuNavigationRows(menuNav, true, 'inline');
  assert.equal(inlineRows.length, 1);
  assert.equal(inlineRows[0][0].text, 'رجوع');
  assert.equal(inlineRows[0][0].callback_data, 'nav:back');
  assert.equal(inlineRows[0][1].text, 'الرئيسية');
  assert.equal(inlineRows[0][1].callback_data, 'nav:main');

  const replyRows = buildMenuNavigationRows(menuNav, true, 'reply');
  assert.equal(replyRows.length, 1);
  assert.equal(replyRows[0][0].text, 'رجوع');
  assert.equal(replyRows[0][1].text, 'الرئيسية');
});

test('formatPaginatedInlineKeyboard combines content, navigation, and menu nav', () => {
  const buttons: BotButton[] = [
    { id: 'b1', text: 'Btn 1', type: 'inline', actionType: 'flow', style: 'primary', row: 0, order: 0 },
    { id: 'b2', text: 'Btn 2', type: 'inline', actionType: 'flow', row: 0, order: 1 },
    { id: 'b3', text: 'Btn 3', type: 'inline', actionType: 'flow', style: 'success', row: 1, order: 0 },
    { id: 'b4', text: 'Btn 4', type: 'inline', actionType: 'flow', row: 1, order: 1 },
  ];

  const config = getDefaultPaginationConfig({
    enabled: true,
    mode: 'auto',
    itemsPerPage: 2,
    navigation: {
      showPrevNext: true,
      prevText: 'السابق',
      nextText: 'التالي',
      showFirstLast: false,
      firstText: 'الأولى',
      lastText: 'الأخيرة',
      position: 'bottom',
    },
  });

  const keyboard = formatPaginatedInlineKeyboard(buttons, 0, config);
  // Row 0 has content buttons, Row 1 has navigation row
  assert.equal(keyboard.length, 2);
  assert.equal(keyboard[0][0].text, 'Btn 1');
  assert.equal(keyboard[0][0].style, 'primary');
  assert.equal(keyboard[0][1].text, 'Btn 2');
  // Navigation row
  assert.equal(keyboard[1][1].text, 'التالي');
  assert.equal(keyboard[1][1].callback_data, 'pg:1');
});

test('SessionManager preserves breadcrumb history and restores exact previous page on back', () => {
  const sm = new SessionManager();
  const botId = 'bot_test';
  const chatId = 987654;

  // Initial session starts at main menu page 0
  const session = sm.getOrCreateSession(botId, chatId);
  assert.equal(session.currentMenuId, 'main');
  assert.equal(session.currentPage, 0);
  assert.equal(session.history.length, 0);

  // User flips to page 2 of the main menu
  sm.navigatePage(botId, chatId, 2, 5);
  assert.equal(session.currentPage, 2);

  // User clicks a button to enter sub-menu 'services'
  sm.pushMenu(botId, chatId, 'services', 'btn_services_id');
  assert.equal(session.currentMenuId, 'services');
  assert.equal(session.currentPage, 0);
  assert.equal(session.history.length, 1);
  assert.equal(session.history[0].menuId, 'main');
  assert.equal(session.history[0].page, 2); // Recorded that user was on page 2!

  // Inside 'services', user advances to page 3
  sm.navigatePage(botId, chatId, 3, 4);
  assert.equal(session.currentPage, 3);

  // User enters sub-sub-menu 'service_details'
  sm.pushMenu(botId, chatId, 'service_details', 'btn_detail_1');
  assert.equal(session.currentMenuId, 'service_details');
  assert.equal(session.currentPage, 0);
  assert.equal(session.history.length, 2);
  assert.equal(session.history[1].menuId, 'services');
  assert.equal(session.history[1].page, 3); // Recorded that user was on page 3 of services!

  // User clicks Back: must return to services AT PAGE 3!
  const back1 = sm.popMenu(botId, chatId);
  assert.equal(back1.session.currentMenuId, 'services');
  assert.equal(back1.session.currentPage, 3);
  assert.equal(back1.session.history.length, 1);

  // User clicks Back again: must return to main menu AT PAGE 2!
  const back2 = sm.popMenu(botId, chatId);
  assert.equal(back2.session.currentMenuId, 'main');
  assert.equal(back2.session.currentPage, 2);
  assert.equal(back2.session.history.length, 0);

  // If user clicks reset to main: resets to main menu page 0
  sm.pushMenu(botId, chatId, 'about');
  sm.resetToMain(botId, chatId);
  assert.equal(session.currentMenuId, 'main');
  assert.equal(session.currentPage, 0);
  assert.equal(session.history.length, 0);
});
