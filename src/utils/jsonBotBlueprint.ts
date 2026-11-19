import {
  BotButton,
  BotCommandConfig,
  BotConfig,
  BotProfileConfig,
  ButtonActionType,
  ButtonColor,
  ButtonFlow,
  ButtonStyle,
  ButtonType,
  FlowAction,
  MediaItem,
  MediaType,
  ParseMode,
} from '../types/bot';

export type DetectedJsonFormat =
  | 'telecraft'
  | 'telegram_api'
  | 'custom_blueprint'
  | 'generic_json';

export interface JsonBlueprintSummary {
  format: DetectedJsonFormat;
  formatLabel: string;
  botName: string;
  hasStartMessage: boolean;
  startMessagePreview: string;
  inlineCount: number;
  replyCount: number;
  flowsCount: number;
  mediaCount: number;
}

export interface JsonBlueprintParseResult {
  valid: boolean;
  error?: string;
  blueprint?: Partial<BotConfig>;
  summary?: JsonBlueprintSummary;
  detectedToken?: string;
}

export interface JsonAutoFixResult {
  fixed: boolean;
  changed: boolean;
  fixedJson: string;
  appliedFixes: string[];
  error?: string;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function stripJsonCodeFences(raw: string): string {
  let trimmed = raw.trim();
  // Remove leading BOM if present
  if (trimmed.charCodeAt(0) === 0xfeff) {
    trimmed = trimmed.slice(1).trim();
  }
  const fenceMatch = trimmed.match(/^```(?:json|JSON)?\s*\r?\n([\s\S]*?)\r?\n?```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

interface JsonToken {
  kind:
    | 'lbrace'
    | 'rbrace'
    | 'lbracket'
    | 'rbracket'
    | 'colon'
    | 'comma'
    | 'string'
    | 'number'
    | 'literal';
  raw: string;
}

function normalizeArabicDigits(str: string): string {
  return str
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function unwrapProseAndFences(
  input: string,
  fixes: Set<string>
): string {
  let s = input;

  // Strip BOM and invisible RTL/zero-width marks that break JSON.parse
  const withoutInvisible = s.replace(
    /[\uFEFF\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g,
    ''
  );
  if (withoutInvisible !== s) {
    fixes.add('إزالة الرموز الخفية وعلامات الاتجاه غير المرئية');
    s = withoutInvisible;
  }

  s = s.trim();

  // Extract fenced block even if preceded/followed by explanatory prose
  const embeddedFence = s.match(/```(?:json|JSON)?\s*\r?\n([\s\S]*?)\r?\n?```/);
  if (embeddedFence) {
    fixes.add('استخراج الكود من علامات Markdown أو النص المحيط');
    s = embeddedFence[1].trim();
  } else {
    const strippedFence = stripJsonCodeFences(s);
    if (strippedFence !== s) {
      fixes.add('إزالة علامات Markdown المحيطة بالكود');
      s = strippedFence;
    }
  }

  // Strip leading prose before first '{' or '[' only if it isn't bare `"key":` / `key:` syntax
  const firstStructIdx = s.search(/[\{\[]/);
  if (firstStructIdx > 0) {
    const prefix = s.slice(0, firstStructIdx).trim();
    const looksLikeBareObjectBody =
      /^["'“”A-Za-z0-9_]+\s*[:=]/.test(prefix);
    if (!looksLikeBareObjectBody) {
      fixes.add('إزالة النص الزائد قبل بداية الكود');
      s = s.slice(firstStructIdx).trim();
    }
  }

  // Strip trailing `;` or trailing conversational text after last `}` / `]`
  const withoutTrailingSemi = s.replace(/;+\s*$/, '').trim();
  if (withoutTrailingSemi !== s) {
    fixes.add('إزالة الفاصلة المنقوطة الزائدة في نهاية الكود');
    s = withoutTrailingSemi;
  }

  // Replace smart double quotes around tokens/strings if input isn't valid JSON
  const normalizedQuotes = s
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  if (normalizedQuotes !== s) {
    fixes.add('تحويل علامات التنصيص الذكية إلى تنصيص قياسي');
    s = normalizedQuotes;
  }

  return s;
}

function escapeStringContentForJson(rawContent: string): string {
  let out = '';
  for (let i = 0; i < rawContent.length; i++) {
    const ch = rawContent[i];
    if (ch === '\\') {
      const next = rawContent[i + 1];
      if (next === undefined) {
        out += '\\\\';
      } else if (next === "'") {
        // Unescape \' when converting single-quoted string to double-quoted JSON
        out += "'";
        i++;
      } else if ('"\\/bfnrt'.includes(next)) {
        out += '\\' + next;
        i++;
      } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(rawContent.slice(i + 2, i + 6))) {
        out += rawContent.slice(i, i + 6);
        i += 5;
      } else {
        out += '\\\\';
      }
    } else if (ch === '"') {
      out += '\\"';
    } else if (ch === '\n') {
      out += '\\n';
    } else if (ch === '\r') {
      if (rawContent[i + 1] === '\n') i++;
      out += '\\n';
    } else if (ch === '\t') {
      out += '\\t';
    } else {
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += `\\u${code.toString(16).padStart(4, '0')}`;
      } else {
        out += ch;
      }
    }
  }
  return out;
}

function tokenizeLooseJson(input: string, fixes: Set<string>): JsonToken[] {
  const tokens: JsonToken[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Comments (only outside string literals!)
    if (ch === '/' && input[i + 1] === '/') {
      fixes.add('إزالة التعليقات البرمجية (//)');
      i += 2;
      while (i < len && input[i] !== '\n' && input[i] !== '\r') i++;
      continue;
    }
    if (ch === '/' && input[i + 1] === '*') {
      fixes.add('إزالة التعليقات البرمجية (/* */)');
      i += 2;
      while (i < len && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '#') {
      fixes.add('إزالة التعليقات (#)');
      i++;
      while (i < len && input[i] !== '\n' && input[i] !== '\r') i++;
      continue;
    }

    // Structural punctuation
    if (ch === '{') {
      tokens.push({ kind: 'lbrace', raw: '{' });
      i++;
      continue;
    }
    if (ch === '}') {
      tokens.push({ kind: 'rbrace', raw: '}' });
      i++;
      continue;
    }
    if (ch === '[') {
      tokens.push({ kind: 'lbracket', raw: '[' });
      i++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ kind: 'rbracket', raw: ']' });
      i++;
      continue;
    }
    if (ch === ':' || ch === '=') {
      if (ch === '=') fixes.add('تحويل علامة (=) إلى نقطتين (:)');
      tokens.push({ kind: 'colon', raw: ':' });
      i++;
      continue;
    }
    if (ch === ',' || ch === '،' || ch === ';' || ch === '؛') {
      if (ch !== ',') {
        fixes.add('تحويل الفواصل العربية أو المنقوطة إلى فاصلة JSON قياسية');
      }
      tokens.push({ kind: 'comma', raw: ',' });
      i++;
      continue;
    }

    // Quoted strings (double or single quotes)
    if (ch === '"' || ch === "'") {
      const quoteChar = ch;
      if (quoteChar === "'") {
        fixes.add("تحويل الاقتباس المفرد (') إلى اقتباس مزدوج (\")");
      }
      i++;
      let content = '';
      let hadRawBreak = false;
      let closed = false;

      while (i < len) {
        const c = input[i];
        if (c === '\\') {
          const next = input[i + 1];
          if (next !== undefined) {
            content += c + next;
            i += 2;
            continue;
          }
          content += '\\\\';
          i++;
          continue;
        }
        if (c === quoteChar) {
          closed = true;
          i++;
          break;
        }
        if (c === '\n' || c === '\r' || c === '\t') {
          hadRawBreak = true;
        }
        content += c;
        i++;
      }

      if (!closed) {
        fixes.add('إغلاق النص المفتوح بعلامة اقتباس');
      }
      if (hadRawBreak) {
        fixes.add('تهريب الأسطر الجديدة داخل النصوص (\\n)');
      }

      const escaped = escapeStringContentForJson(content);
      tokens.push({ kind: 'string', raw: `"${escaped}"` });
      continue;
    }

    // Unquoted URLs (preserve https:// or http:// instead of treating // as comment)
    const remaining = input.slice(i);
    const urlMatch = remaining.match(/^https?:\/\/[^\s,}\]"'،؛]+/);
    if (urlMatch) {
      fixes.add('إضافة علامات الاقتباس للروابط غير المقتبسة');
      tokens.push({
        kind: 'string',
        raw: `"${escapeStringContentForJson(urlMatch[0])}"`,
      });
      i += urlMatch[0].length;
      continue;
    }

    // Numbers (including Arabic digits outside strings)
    const numMatch = remaining.match(
      /^-?(?:[0-9\u0660-\u0669\u06F0-\u06F9]+)(?:\.[0-9\u0660-\u0669\u06F0-\u06F9]+)?(?:[eE][+-]?[0-9]+)?/
    );
    if (numMatch) {
      const asciiNum = normalizeArabicDigits(numMatch[0]);
      if (asciiNum !== numMatch[0]) {
        fixes.add('تحويل الأرقام العربية إلى أرقام قياسية');
      }
      tokens.push({ kind: 'number', raw: asciiNum });
      i += numMatch[0].length;
      continue;
    }

    // Identifiers / unquoted keys / Python literals
    const identMatch = remaining.match(/^[A-Za-z_$\u0600-\u06FF][A-Za-z0-9_$\-\u0600-\u06FF]*/);
    if (identMatch) {
      const word = identMatch[0];
      i += word.length;

      // Peek next non-whitespace char to distinguish key vs literal
      let j = i;
      while (j < len && /\s/.test(input[j])) j++;
      const nextChar = input[j];

      if (nextChar !== ':' && nextChar !== '=') {
        if (word === 'true' || word === 'false' || word === 'null') {
          tokens.push({ kind: 'literal', raw: word });
          continue;
        }
        if (word === 'True' || word === 'TRUE') {
          fixes.add('تحويل True إلى true');
          tokens.push({ kind: 'literal', raw: 'true' });
          continue;
        }
        if (word === 'False' || word === 'FALSE') {
          fixes.add('تحويل False إلى false');
          tokens.push({ kind: 'literal', raw: 'false' });
          continue;
        }
        if (word === 'None' || word === 'undefined' || word === 'NULL') {
          fixes.add(`تحويل ${word} إلى null`);
          tokens.push({ kind: 'literal', raw: 'null' });
          continue;
        }
      }

      fixes.add('إضافة علامات الاقتباس للمفاتيح أو القيم غير المقتبسة');
      tokens.push({
        kind: 'string',
        raw: `"${escapeStringContentForJson(word)}"`,
      });
      continue;
    }

    // Unknown stray character outside strings -> skip cleanly
    fixes.add('إزالة رموز غير صالحة خارج النصوص');
    i++;
  }

  return tokens;
}

type Frame =
  | { kind: 'object'; state: 'expect_key_or_end' | 'expect_colon' | 'expect_value' | 'expect_comma_or_end' }
  | { kind: 'array'; state: 'expect_value_or_end' | 'expect_comma_or_end' };

function repairTokenStream(rawTokens: JsonToken[], fixes: Set<string>): string {
  const tokens = [...rawTokens];
  if (tokens.length === 0) return '';

  // Wrap bare `"key": value, ...` body without outer `{ ... }`
  if (tokens[0].kind !== 'lbrace' && tokens[0].kind !== 'lbracket') {
    if (tokens.some((t) => t.kind === 'colon')) {
      fixes.add('إضافة أقواس الكائن الخارجية { ... }');
      tokens.unshift({ kind: 'lbrace', raw: '{' });
      tokens.push({ kind: 'rbrace', raw: '}' });
    } else {
      fixes.add('تغليف العناصر داخل مصفوفة [ ... ]');
      tokens.unshift({ kind: 'lbracket', raw: '[' });
      tokens.push({ kind: 'rbracket', raw: ']' });
    }
  }

  const out: JsonToken[] = [];
  const stack: Frame[] = [];

  const isValueStart = (t: JsonToken) =>
    t.kind === 'string' ||
    t.kind === 'number' ||
    t.kind === 'literal' ||
    t.kind === 'lbrace' ||
    t.kind === 'lbracket';

  const markParentValueReceived = () => {
    const parent = stack[stack.length - 1];
    if (!parent) return;
    if (parent.kind === 'object' && parent.state === 'expect_value') {
      parent.state = 'expect_comma_or_end';
    } else if (parent.kind === 'array' && parent.state === 'expect_value_or_end') {
      parent.state = 'expect_comma_or_end';
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const top = stack[stack.length - 1];

    // If we already closed root structure, discard stray trailing tokens
    if (stack.length === 0 && out.length > 0) {
      fixes.add('إزالة الأقواس أو النصوص الزائدة بعد نهاية الكود');
      break;
    }

    if (!top) {
      if (t.kind === 'lbrace') {
        out.push(t);
        stack.push({ kind: 'object', state: 'expect_key_or_end' });
      } else if (t.kind === 'lbracket') {
        out.push(t);
        stack.push({ kind: 'array', state: 'expect_value_or_end' });
      }
      continue;
    }

    if (top.kind === 'object') {
      if (top.state === 'expect_key_or_end') {
        if (t.kind === 'comma') {
          fixes.add('إزالة الفواصل الزائدة أو المتكررة');
          continue;
        }
        if (t.kind === 'rbrace') {
          if (out[out.length - 1]?.kind === 'comma') {
            out.pop();
            fixes.add('إزالة الفاصلة الزائدة قبل }');
          }
          out.push(t);
          stack.pop();
          markParentValueReceived();
          continue;
        }
        if (t.kind === 'rbracket') {
          // Stray `]` inside object: discard it
          fixes.add('إزالة القوس المغلق ] غير المطابق');
          continue;
        }
        if (t.kind === 'string' || t.kind === 'number' || t.kind === 'literal') {
          const keyToken =
            t.kind === 'string'
              ? t
              : { kind: 'string' as const, raw: `"${t.raw}"` };
          if (t.kind !== 'string') fixes.add('إضافة اقتباس لمفتاح الكائن');
          out.push(keyToken);
          top.state = 'expect_colon';
          continue;
        }
        // Unexpected `{` or `[` where a key was expected -> skip or wrap
        fixes.add('تنظيف بنية الكائن');
        continue;
      }

      if (top.state === 'expect_colon') {
        if (t.kind === 'colon') {
          out.push(t);
          top.state = 'expect_value';
          continue;
        }
        // Missing `:` between key and value
        if (isValueStart(t)) {
          fixes.add('إضافة النقطتين (:) المفقودتين بعد اسم الخاصية');
          out.push({ kind: 'colon', raw: ':' });
          top.state = 'expect_value';
          i--; // Reprocess current token as value
          continue;
        }
        if (t.kind === 'comma' || t.kind === 'rbrace' || t.kind === 'rbracket') {
          fixes.add('إكمال القيمة المفقودة لخاصية فارغة');
          out.push({ kind: 'colon', raw: ':' });
          out.push({ kind: 'literal', raw: 'null' });
          top.state = 'expect_comma_or_end';
          i--;
          continue;
        }
        continue;
      }

      if (top.state === 'expect_value') {
        if (t.kind === 'colon') {
          fixes.add('إزالة النقطتين (:) المكررتين');
          continue;
        }
        if (t.kind === 'comma' || t.kind === 'rbrace' || t.kind === 'rbracket') {
          fixes.add('إكمال قيمة مفقودة بـ null');
          out.push({ kind: 'literal', raw: 'null' });
          top.state = 'expect_comma_or_end';
          i--;
          continue;
        }
        if (t.kind === 'lbrace') {
          out.push(t);
          stack.push({ kind: 'object', state: 'expect_key_or_end' });
          continue;
        }
        if (t.kind === 'lbracket') {
          out.push(t);
          stack.push({ kind: 'array', state: 'expect_value_or_end' });
          continue;
        }
        if (isValueStart(t)) {
          out.push(t);
          top.state = 'expect_comma_or_end';
          continue;
        }
        continue;
      }

      if (top.state === 'expect_comma_or_end') {
        if (t.kind === 'comma') {
          out.push(t);
          top.state = 'expect_key_or_end';
          continue;
        }
        if (t.kind === 'rbrace') {
          out.push(t);
          stack.pop();
          markParentValueReceived();
          continue;
        }
        if (t.kind === 'rbracket') {
          // Probably missed closing `}` for this object before outer `]`
          const hasOuterArray = stack.some((f) => f.kind === 'array');
          if (hasOuterArray) {
            fixes.add('إغلاق القوس الناقص } قبل ]');
            out.push({ kind: 'rbrace', raw: '}' });
            stack.pop();
            markParentValueReceived();
            i--;
          } else {
            fixes.add('إزالة القوس المغلق ] الزائد');
          }
          continue;
        }
        // Missing comma before next property!
        if (t.kind === 'string' || t.kind === 'number' || t.kind === 'literal') {
          fixes.add('إضافة الفاصلة (,) المفقودة بين الخصائص');
          out.push({ kind: 'comma', raw: ',' });
          top.state = 'expect_key_or_end';
          i--;
          continue;
        }
        continue;
      }
    }

    if (top.kind === 'array') {
      if (top.state === 'expect_value_or_end') {
        if (t.kind === 'comma') {
          fixes.add('إزالة الفواصل الزائدة أو المتكررة');
          continue;
        }
        if (t.kind === 'rbracket') {
          if (out[out.length - 1]?.kind === 'comma') {
            out.pop();
            fixes.add('إزالة الفاصلة الزائدة قبل ]');
          }
          out.push(t);
          stack.pop();
          markParentValueReceived();
          continue;
        }
        if (t.kind === 'rbrace') {
          const hasOuterObject = stack.some((f) => f.kind === 'object');
          if (hasOuterObject) {
            if (out[out.length - 1]?.kind === 'comma') {
              out.pop();
              fixes.add('إزالة الفاصلة الزائدة قبل إغلاق المصفوفة');
            }
            fixes.add('إغلاق القوس الناقص ] قبل }');
            out.push({ kind: 'rbracket', raw: ']' });
            stack.pop();
            markParentValueReceived();
            i--;
          } else {
            fixes.add('إزالة القوس المغلق } الزائد');
          }
          continue;
        }
        if (t.kind === 'lbrace') {
          out.push(t);
          stack.push({ kind: 'object', state: 'expect_key_or_end' });
          continue;
        }
        if (t.kind === 'lbracket') {
          out.push(t);
          stack.push({ kind: 'array', state: 'expect_value_or_end' });
          continue;
        }
        if (isValueStart(t)) {
          out.push(t);
          top.state = 'expect_comma_or_end';
          continue;
        }
        continue;
      }

      if (top.state === 'expect_comma_or_end') {
        if (t.kind === 'comma') {
          out.push(t);
          top.state = 'expect_value_or_end';
          continue;
        }
        if (t.kind === 'rbracket') {
          out.push(t);
          stack.pop();
          markParentValueReceived();
          continue;
        }
        if (t.kind === 'rbrace') {
          const hasOuterObject = stack.some((f) => f.kind === 'object');
          if (hasOuterObject) {
            fixes.add('إغلاق القوس الناقص ] قبل }');
            out.push({ kind: 'rbracket', raw: ']' });
            stack.pop();
            markParentValueReceived();
            i--;
          } else {
            fixes.add('إزالة القوس المغلق } الزائد');
          }
          continue;
        }
        // Missing comma between array items!
        if (isValueStart(t)) {
          fixes.add('إضافة الفاصلة (,) المفقودة بين عناصر المصفوفة');
          out.push({ kind: 'comma', raw: ',' });
          top.state = 'expect_value_or_end';
          i--;
          continue;
        }
        continue;
      }
    }
  }

  // Close any unclosed frames cleanly at EOF
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.kind === 'object') {
      if (frame.state === 'expect_colon') {
        fixes.add('إكمال قيمة مفقودة قبل إغلاق الكائن');
        out.push({ kind: 'colon', raw: ':' });
        out.push({ kind: 'literal', raw: 'null' });
      } else if (frame.state === 'expect_value') {
        fixes.add('إكمال قيمة مفقودة قبل إغلاق الكائن');
        out.push({ kind: 'literal', raw: 'null' });
      }
      if (out[out.length - 1]?.kind === 'comma') {
        out.pop();
        fixes.add('إزالة الفاصلة الزائدة في نهاية الكائن');
      }
      fixes.add('إغلاق القوس الناقص }');
      out.push({ kind: 'rbrace', raw: '}' });
      markParentValueReceived();
    } else {
      if (out[out.length - 1]?.kind === 'comma') {
        out.pop();
        fixes.add('إزالة الفاصلة الزائدة في نهاية المصفوفة');
      }
      fixes.add('إغلاق القوس الناقص ]');
      out.push({ kind: 'rbracket', raw: ']' });
      markParentValueReceived();
    }
  }

  return out.map((t) => t.raw).join('');
}

/**
 * Automatically repairs common JSON syntax & formatting issues in pasted bot designs:
 * - Markdown fences and surrounding prose
 * - Zero-width / RTL invisible characters & smart quotes
 * - JavaScript comments (// and /* *\/) outside strings
 * - Single-quoted strings, unquoted keys, `=` instead of `:`, Python True/False/None
 * - Arabic commas (،), Arabic digits, trailing/duplicate/missing commas
 * - Unescaped newlines/tabs inside multi-line strings
 * - Missing outer `{ ... }`, unclosed brackets/braces, or top-level button arrays
 */
export function autoFixJsonCode(rawInput: string): JsonAutoFixResult {
  if (!rawInput || !rawInput.trim()) {
    return {
      fixed: false,
      changed: false,
      fixedJson: rawInput || '',
      appliedFixes: [],
      error: 'يرجى لصق كود JSON أولاً ليتم تصحيحه.',
    };
  }

  const fixes = new Set<string>();
  const strippedDirect = stripJsonCodeFences(rawInput);

  // Fast path: if JSON already parses cleanly
  try {
    const directParsed = JSON.parse(strippedDirect);
    if (directParsed !== undefined) {
      const formatted = JSON.stringify(directParsed, null, 2);
      const changed = formatted !== rawInput.trim();
      if (strippedDirect !== rawInput.trim()) {
        fixes.add('إزالة علامات Markdown المحيطة بالكود');
      }
      if (changed && fixes.size === 0) {
        fixes.add('تنسيق الكود وترتيب المسافات');
      }
      return {
        fixed: true,
        changed,
        fixedJson: formatted,
        appliedFixes: Array.from(fixes),
      };
    }
  } catch {
    // Proceed to structural auto-repair
  }

  const preprocessed = unwrapProseAndFences(rawInput, fixes);
  const tokens = tokenizeLooseJson(preprocessed, fixes);
  const repairedRaw = repairTokenStream(tokens, fixes);

  try {
    const parsed = JSON.parse(repairedRaw);
    if (parsed === undefined) {
      return {
        fixed: false,
        changed: false,
        fixedJson: rawInput,
        appliedFixes: [],
        error: 'تعذر إصلاح الكود تلقائياً: لم يتم العثور على قيمة JSON صالحة.',
      };
    }
    const formatted = JSON.stringify(parsed, null, 2);
    return {
      fixed: true,
      changed: formatted !== rawInput,
      fixedJson: formatted,
      appliedFixes: Array.from(fixes),
    };
  } catch (err: any) {
    return {
      fixed: false,
      changed: false,
      fixedJson: rawInput,
      appliedFixes: Array.from(fixes),
      error: `تعذر التصحيح التلقائي بالكامل: ${err?.message || 'صيغة غير معروفة'}`,
    };
  }
}

function normalizeParseMode(mode: unknown): ParseMode {
  if (typeof mode !== 'string') return 'none';
  const lower = mode.trim().toLowerCase();
  if (lower === 'html') return 'HTML';
  if (lower === 'markdownv2' || lower === 'markdown') return 'MarkdownV2';
  return 'none';
}

function normalizeButtonStyle(style: unknown): ButtonStyle | undefined {
  if (style === 'primary' || style === 'success' || style === 'danger') {
    return style;
  }
  return undefined;
}

function normalizeButtonColor(color: unknown, style?: ButtonStyle): ButtonColor {
  if (
    color === 'default' ||
    color === 'primary' ||
    color === 'success' ||
    color === 'danger' ||
    color === 'warning'
  ) {
    return color;
  }
  if (style === 'primary' || style === 'success' || style === 'danger') {
    return style;
  }
  return 'default';
}

function normalizeMediaList(rawMedia: unknown): MediaItem[] {
  if (!Array.isArray(rawMedia)) return [];
  const allowedTypes: MediaType[] = ['photo', 'video', 'voice', 'audio', 'document'];
  return rawMedia
    .filter((item): item is Record<string, any> =>
      Boolean(
        item &&
          typeof item === 'object' &&
          (item.url || item.media || item.src || item.file_id || item.file)
      )
    )
    .map((item, idx) => {
      const resolvedUrl = String(item.url ?? item.media ?? item.src ?? item.file_id ?? item.file);
      const rawType = item.type === 'animation' ? 'video' : item.type;
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : generateId(`media_${idx}`),
        type: allowedTypes.includes(rawType) ? rawType : 'photo',
        url: resolvedUrl,
        fileName: typeof item.fileName === 'string' ? item.fileName : undefined,
        caption: typeof item.caption === 'string' ? item.caption : undefined,
        order: typeof item.order === 'number' ? item.order : idx,
        skipCaption: Boolean(item.skipCaption),
        ...(item.hasSpoiler || item.has_spoiler ? { hasSpoiler: true } : {}),
        ...(item.showCaptionAboveMedia || item.show_caption_above_media
          ? { showCaptionAboveMedia: true }
          : {}),
      };
    });
}

function inferActionType(raw: Record<string, any>, type: ButtonType): ButtonActionType {
  if (typeof raw.actionType === 'string' && raw.actionType.trim()) {
    return raw.actionType as ButtonActionType;
  }
  if (raw.url) return 'url';
  if (raw.web_app?.url || raw.webAppUrl) return 'web_app';
  if (raw.login_url || raw.loginUrlConfig) return 'login_url';
  if (raw.copy_text?.text || raw.copyText) return 'copy_text';
  if (typeof raw.switch_inline_query === 'string' || typeof raw.switchInlineQuery === 'string') {
    return 'switch_inline_query';
  }
  if (typeof raw.switch_inline_query_current_chat === 'string') {
    return 'switch_inline_query_current_chat';
  }
  if (raw.switch_inline_query_chosen_chat || raw.switchInlineChosenChat) {
    return 'switch_inline_query_chosen_chat';
  }
  if (raw.callback_game) return 'callback_game';
  if (raw.pay) return 'pay';
  if (raw.request_contact) return 'request_contact';
  if (raw.request_location) return 'request_location';
  if (raw.request_poll || raw.requestPollType) return 'request_poll';
  if (raw.request_users || raw.requestUsersConfig) return 'request_users';
  if (raw.request_chat || raw.requestChatConfig) return 'request_chat';
  if (raw.skipFlow === true) return 'none';
  if (type === 'inline' || type === 'reply') return 'flow';
  return 'flow';
}

interface NormalizeButtonContext {
  flows: Record<string, ButtonFlow>;
}

function normalizeButton(
  raw: Record<string, any>,
  defaultType: ButtonType,
  row: number,
  order: number,
  parentId: string | null,
  ctx: NormalizeButtonContext
): BotButton {
  const type: ButtonType =
    raw.type === 'inline' || raw.type === 'reply' ? raw.type : defaultType;
  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : generateId('btn');
  const style = normalizeButtonStyle(raw.style);
  const color = normalizeButtonColor(raw.color, style);
  const actionType = inferActionType(raw, type);

  const btn: BotButton = {
    id,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    text: String(raw.text ?? raw.label ?? raw.title ?? `زر ${order + 1}`),
    type,
    ...(style ? { style } : {}),
    color,
    ...(typeof (raw.customEmojiId || raw.icon_custom_emoji_id) === 'string'
      ? { customEmojiId: raw.customEmojiId || raw.icon_custom_emoji_id }
      : {}),
    actionType,
    ...(typeof (raw.callbackData || raw.callback_data) === 'string'
      ? { callbackData: raw.callbackData || raw.callback_data }
      : {}),
    ...(typeof raw.url === 'string' ? { url: raw.url } : {}),
    ...(typeof (raw.webAppUrl || raw.web_app?.url) === 'string'
      ? { webAppUrl: raw.webAppUrl || raw.web_app?.url }
      : {}),
    ...(raw.loginUrlConfig || raw.login_url
      ? { loginUrlConfig: raw.loginUrlConfig || raw.login_url }
      : {}),
    ...(typeof (raw.switchInlineQuery ?? raw.switch_inline_query ?? raw.switch_inline_query_current_chat) === 'string'
      ? {
          switchInlineQuery:
            raw.switchInlineQuery ??
            raw.switch_inline_query ??
            raw.switch_inline_query_current_chat,
        }
      : {}),
    ...(raw.switchInlineChosenChat || raw.switch_inline_query_chosen_chat
      ? {
          switchInlineChosenChat:
            raw.switchInlineChosenChat || raw.switch_inline_query_chosen_chat,
        }
      : {}),
    ...(typeof (raw.copyText || raw.copy_text?.text) === 'string'
      ? { copyText: raw.copyText || raw.copy_text?.text }
      : {}),
    ...(raw.requestPollType || raw.request_poll?.type
      ? { requestPollType: raw.requestPollType || raw.request_poll?.type }
      : {}),
    ...(raw.requestUsersConfig || raw.request_users
      ? { requestUsersConfig: raw.requestUsersConfig || raw.request_users }
      : {}),
    ...(raw.requestChatConfig || raw.request_chat
      ? { requestChatConfig: raw.requestChatConfig || raw.request_chat }
      : {}),
    ...(typeof raw.skipFlow === 'boolean' ? { skipFlow: raw.skipFlow } : {}),
    parentId,
    row: typeof raw.row === 'number' ? raw.row : row,
    order: typeof raw.order === 'number' ? raw.order : order,
    ...(typeof raw.pageIndex === 'number' ? { pageIndex: raw.pageIndex } : {}),
  };

  // Handle inline nested flow object or subButtons on the button itself
  const embeddedFlow =
    raw.flow && typeof raw.flow === 'object'
      ? raw.flow
      : raw.message || raw.subButtons || raw.children || raw.buttons
      ? {
          message: raw.message,
          media: raw.media,
          subButtons: raw.subButtons || raw.children || raw.buttons,
          actions: raw.actions,
          pagination: raw.pagination,
          layoutSettings: raw.layoutSettings,
          replyKeyboardSettings: raw.replyKeyboardSettings,
          flowMode: raw.flowMode,
        }
      : null;

  if (embeddedFlow && !ctx.flows[id]) {
    ctx.flows[id] = normalizeFlowObject(embeddedFlow, id, id, parentId, ctx);
  }

  return btn;
}

function normalizeFlowObject(
  rawFlow: Record<string, any>,
  flowKey: string,
  buttonId: string,
  parentId: string | null,
  ctx: NormalizeButtonContext
): ButtonFlow {
  const rawMsg =
    rawFlow.message !== undefined
      ? rawFlow.message
      : typeof rawFlow.text === 'string'
      ? rawFlow.text
      : typeof rawFlow.caption === 'string'
      ? rawFlow.caption
      : typeof rawFlow.content === 'string'
      ? rawFlow.content
      : typeof rawFlow.body === 'string'
      ? rawFlow.body
      : typeof rawFlow.reply === 'string'
      ? rawFlow.reply
      : typeof rawFlow.description === 'string'
      ? rawFlow.description
      : null;

  let messageObj: ButtonFlow['message'] = null;
  if (typeof rawMsg === 'string') {
    messageObj = {
      text: rawMsg,
      isSaved: rawMsg.trim().length > 0,
      parseMode: normalizeParseMode(rawFlow.parseMode || rawFlow.parse_mode),
      updateMode: rawFlow.updateMode === 'new' ? 'new' : 'edit',
      skipMessage: false,
      placement: rawFlow.placement === 'before_media' ? 'before_media' : 'after_media',
      ...(rawFlow.messageOptions ? { messageOptions: rawFlow.messageOptions } : {}),
    };
  } else if (rawMsg && typeof rawMsg === 'object') {
    const msgText = typeof rawMsg.text === 'string' ? rawMsg.text : '';
    const rawOpts = rawMsg.messageOptions || (
      rawMsg.message_effect_id || rawMsg.protect_content || rawMsg.disable_notification || rawMsg.link_preview_options
        ? {
            ...(rawMsg.message_effect_id ? { messageEffectId: String(rawMsg.message_effect_id) } : {}),
            ...(rawMsg.protect_content ? { protectContent: true } : {}),
            ...(rawMsg.disable_notification ? { disableNotification: true } : {}),
            ...(rawMsg.link_preview_options ? { linkPreviewOptions: rawMsg.link_preview_options } : {}),
          }
        : undefined
    );
    messageObj = {
      text: msgText,
      isSaved: typeof rawMsg.isSaved === 'boolean' ? rawMsg.isSaved : msgText.trim().length > 0,
      parseMode: normalizeParseMode(rawMsg.parseMode || rawMsg.parse_mode),
      updateMode: rawMsg.updateMode === 'new' ? 'new' : 'edit',
      skipMessage: Boolean(rawMsg.skipMessage),
      placement: rawMsg.placement === 'before_media' ? 'before_media' : 'after_media',
      ...(rawOpts ? { messageOptions: rawOpts } : {}),
    };
  }

  const parsedFlowMarkup = parseJsonIfString(rawFlow.reply_markup);
  const flowMarkupObj =
    parsedFlowMarkup && typeof parsedFlowMarkup === 'object' ? parsedFlowMarkup : undefined;

  const rawSubs: any[] = Array.isArray(rawFlow.subButtons)
    ? rawFlow.subButtons
    : Array.isArray(rawFlow.buttons)
    ? rawFlow.buttons
    : Array.isArray(rawFlow.children)
    ? rawFlow.children
    : Array.isArray(rawFlow.items)
    ? rawFlow.items
    : Array.isArray(flowMarkupObj?.inline_keyboard)
    ? flowMarkupObj.inline_keyboard
    : Array.isArray(flowMarkupObj?.keyboard)
    ? flowMarkupObj.keyboard.map((row: any) =>
        Array.isArray(row)
          ? row.map((cell: any) =>
              typeof cell === 'string' ? { text: cell, type: 'reply' } : { ...cell, type: 'reply' }
            )
          : row
      )
    : [];
  const subButtons: BotButton[] = [];
  rawSubs.forEach((sub, idx) => {
    if (Array.isArray(sub)) {
      sub.forEach((nested, orderIdx) => {
        if (typeof nested === 'string') {
          subButtons.push(normalizeButton({ text: nested }, 'inline', idx, orderIdx, buttonId, ctx));
        } else if (nested && typeof nested === 'object') {
          subButtons.push(normalizeButton(nested, 'inline', idx, orderIdx, buttonId, ctx));
        }
      });
    } else if (typeof sub === 'string') {
      subButtons.push(normalizeButton({ text: sub }, 'inline', idx, 0, buttonId, ctx));
    } else if (sub && typeof sub === 'object') {
      subButtons.push(normalizeButton(sub, 'inline', typeof sub.row === 'number' ? sub.row : idx, typeof sub.order === 'number' ? sub.order : 0, buttonId, ctx));
    }
  });

  return {
    id: typeof rawFlow.id === 'string' && rawFlow.id.trim() ? rawFlow.id.trim() : flowKey,
    buttonId: typeof rawFlow.buttonId === 'string' && rawFlow.buttonId.trim() ? rawFlow.buttonId.trim() : buttonId,
    parentId: rawFlow.parentId !== undefined ? rawFlow.parentId : parentId,
    ...(rawFlow.flowMode ? { flowMode: rawFlow.flowMode } : {}),
    message: messageObj,
    media: normalizeMediaList(rawFlow.media),
    subButtons,
    ...(Array.isArray(rawFlow.actions) ? { actions: rawFlow.actions } : {}),
    ...(rawFlow.pagination ? { pagination: rawFlow.pagination } : {}),
    ...(rawFlow.layoutSettings ? { layoutSettings: rawFlow.layoutSettings } : {}),
    ...(rawFlow.replyKeyboardSettings ? { replyKeyboardSettings: rawFlow.replyKeyboardSettings } : {}),
  };
}

function normalizeKeyboardGrid(
  grid: unknown,
  type: ButtonType,
  ctx: NormalizeButtonContext
): BotButton[] {
  if (!Array.isArray(grid)) return [];
  const buttons: BotButton[] = [];

  grid.forEach((entry, rowIdx) => {
    if (Array.isArray(entry)) {
      entry.forEach((cell, colIdx) => {
        if (typeof cell === 'string') {
          buttons.push(normalizeButton({ text: cell }, type, rowIdx, colIdx, null, ctx));
        } else if (cell && typeof cell === 'object') {
          buttons.push(normalizeButton(cell, type, rowIdx, colIdx, null, ctx));
        }
      });
    } else if (entry && typeof entry === 'object') {
      buttons.push(
        normalizeButton(
          entry,
          type,
          typeof entry.row === 'number' ? entry.row : rowIdx,
          typeof entry.order === 'number' ? entry.order : 0,
          entry.parentId ?? null,
          ctx
        )
      );
    } else if (typeof entry === 'string') {
      buttons.push(normalizeButton({ text: entry }, type, rowIdx, 0, null, ctx));
    }
  });

  return buttons;
}

function extractSingleMediaField(
  value: unknown,
  type: MediaType,
  hasSpoiler: boolean,
  showCaptionAboveMedia: boolean
): MediaItem | null {
  if (!value) return null;
  let url = '';
  if (typeof value === 'string') {
    url = value.trim();
  } else if (Array.isArray(value) && value.length > 0) {
    const last = value[value.length - 1];
    if (typeof last === 'string') url = last.trim();
    else if (last && typeof last === 'object') {
      url = String(last.url ?? last.media ?? last.src ?? last.file_id ?? '').trim();
    }
  } else if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    url = String(obj.url ?? obj.media ?? obj.src ?? obj.file_id ?? '').trim();
  }
  if (!url) return null;
  return {
    id: generateId(`media_${type}`),
    type,
    url,
    order: 0,
    ...(hasSpoiler ? { hasSpoiler: true } : {}),
    ...(showCaptionAboveMedia ? { showCaptionAboveMedia: true } : {}),
  };
}

function normalizeCommandsField(rawCommands: unknown): BotCommandConfig[] {
  if (Array.isArray(rawCommands)) {
    return rawCommands
      .filter((c): c is Record<string, any> => Boolean(c && typeof c === 'object' && (c.command || c.cmd || c.name)))
      .map((c) => ({
        command: String(c.command ?? c.cmd ?? c.name).replace(/^\//, '').trim(),
        description: String(c.description ?? c.desc ?? c.text ?? '').trim() || 'أمر مخصص',
        ...(typeof c.targetFlowId === 'string' && c.targetFlowId.trim()
          ? { targetFlowId: c.targetFlowId.trim() }
          : {}),
      }))
      .filter((c) => c.command.length > 0);
  }
  if (rawCommands && typeof rawCommands === 'object') {
    return Object.entries(rawCommands as Record<string, any>)
      .map(([k, v]) => ({
        command: k.replace(/^\//, '').trim(),
        description:
          typeof v === 'string'
            ? v.trim()
            : v && typeof v === 'object' && typeof v.description === 'string'
            ? v.description.trim()
            : 'أمر مخصص',
        ...(v && typeof v === 'object' && typeof v.targetFlowId === 'string'
          ? { targetFlowId: v.targetFlowId.trim() }
          : {}),
      }))
      .filter((c) => c.command.length > 0);
  }
  return [];
}

function extractTextCandidate(root: Record<string, any>): string {
  const candidates = [
    root.text,
    typeof root.message === 'string'
      ? root.message
      : root.message && typeof root.message === 'object'
      ? root.message.text ?? root.message.caption ?? root.message.content
      : undefined,
    root.welcome,
    root.welcomeMessage,
    root.welcome_message,
    root.greeting,
    root.caption,
    root.content,
    root.body,
    root.description,
    root.short_description,
    root.intro,
    root.prompt,
    root.reply,
    root.answer,
    root.subtitle,
    root.notice,
  ];
  for (const val of candidates) {
    if (typeof val === 'string' && val.trim().length > 0) {
      return val;
    }
  }
  return '';
}

function formatGenericValuePreview(val: unknown): string {
  if (val === null) return 'فارغ (null)';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  return JSON.stringify(val, null, 2);
}

function buildGenericJsonContent(
  parsed: unknown,
  flows: Record<string, ButtonFlow>
): { startText: string; inlineButtons: BotButton[]; suggestedName?: string } {
  const inlineButtons: BotButton[] = [];

  if (parsed === null || typeof parsed !== 'object') {
    return {
      startText:
        parsed === null
          ? 'تم تفعيل البوت من JSON بنجاح — يمكنك تعديل النص والأزرار الآن.'
          : String(parsed),
      inlineButtons,
    };
  }

  if (Array.isArray(parsed)) {
    const lines: string[] = [];
    parsed.forEach((item, idx) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const obj = item as Record<string, any>;
        const label = String(
          obj.text ?? obj.label ?? obj.title ?? obj.name ?? obj.question ?? obj.command ?? `عنصر ${idx + 1}`
        );
        const body = Object.entries(obj)
          .map(([k, v]) => `• ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
          .join('\n');
        const btnId = generateId(`btn_item_${idx}`);
        const url = typeof obj.url === 'string' ? obj.url : typeof obj.link === 'string' ? obj.link : undefined;
        inlineButtons.push({
          id: btnId,
          text: label.slice(0, 60),
          type: 'inline',
          color: 'primary',
          style: 'primary',
          actionType: url ? 'url' : 'flow',
          ...(url ? { url } : {}),
          parentId: null,
          row: Math.floor(idx / 2),
          order: idx % 2,
        });
        if (!url) {
          flows[btnId] = {
            id: `flow_${btnId}`,
            buttonId: btnId,
            parentId: null,
            message: {
              text: body || label,
              isSaved: true,
              parseMode: 'none',
              updateMode: 'edit',
            },
            media: [],
            subButtons: [],
          };
        }
        lines.push(`${idx + 1}. ${label}`);
      } else {
        lines.push(`${idx + 1}. ${String(item)}`);
      }
    });

    return {
      startText:
        lines.length > 0
          ? `تم استيراد القائمة (${lines.length} عناصر):\n${lines.slice(0, 12).join('\n')}`
          : 'قائمة JSON فارغة — يمكنك إضافة رسالة وأزرار من المحرر.',
      inlineButtons: inlineButtons.slice(0, 24),
    };
  }

  const obj = parsed as Record<string, any>;
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return {
      startText: 'تم تفعيل البوت من كائن JSON — يمكنك تخصيص الرسالة والأزرار من المحرر.',
      inlineButtons,
    };
  }

  const scalarLines: string[] = [];
  let suggestedName: string | undefined;

  entries.forEach(([key, value], idx) => {
    if (
      !suggestedName &&
      typeof value === 'string' &&
      value.trim() &&
      /^(name|botName|title|app|service|store|project|brand)$/i.test(key)
    ) {
      suggestedName = value.trim();
    }

    if (value && typeof value === 'object') {
      const btnId = generateId(`btn_sec_${idx}`);
      const subObj = !Array.isArray(value) ? (value as Record<string, any>) : null;
      const label =
        (subObj && typeof (subObj.title ?? subObj.label ?? subObj.name) === 'string'
          ? String(subObj.title ?? subObj.label ?? subObj.name)
          : key
        ).slice(0, 60);

      inlineButtons.push({
        id: btnId,
        text: label,
        type: 'inline',
        color: 'default',
        actionType: 'flow',
        parentId: null,
        row: Math.floor(inlineButtons.length / 2),
        order: inlineButtons.length % 2,
      });

      const detailText = Array.isArray(value)
        ? value
            .map((v, i) => `${i + 1}. ${formatGenericValuePreview(v)}`)
            .join('\n')
        : Object.entries(value as Record<string, any>)
            .map(([sk, sv]) => `• ${sk}: ${formatGenericValuePreview(sv)}`)
            .join('\n');

      flows[btnId] = {
        id: `flow_${btnId}`,
        buttonId: btnId,
        parentId: null,
        message: {
          text: detailText || label,
          isSaved: true,
          parseMode: 'none',
          updateMode: 'edit',
        },
        media: [],
        subButtons: [],
      };
    } else {
      scalarLines.push(`• ${key}: ${formatGenericValuePreview(value)}`);
    }
  });

  const combinedText =
    scalarLines.length > 0
      ? scalarLines.join('\n')
      : inlineButtons.length > 0
      ? `اختر أحد الأقسام التالية (${inlineButtons.length}):`
      : '';

  return {
    startText: combinedText,
    inlineButtons: inlineButtons.slice(0, 24),
    suggestedName,
  };
}

function isCommandLikeArray(arr: any[]): boolean {
  return (
    arr.length > 0 &&
    arr.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof (item.command ?? item.cmd) === 'string'
    )
  );
}

function isMediaLikeArray(arr: any[]): boolean {
  return (
    arr.length > 0 &&
    arr.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof (item.url ?? item.media ?? item.src) === 'string' &&
        ('type' in item || 'caption' in item || 'media' in item) &&
        !('text' in item)
    )
  );
}

function isButtonLikeArray(arr: any[]): boolean {
  if (arr.length === 0) return false;
  return arr.every((entry) => {
    if (Array.isArray(entry)) return true;
    if (typeof entry === 'string') return true;
    if (!entry || typeof entry !== 'object') return false;
    return (
      typeof entry.text === 'string' ||
      typeof entry.label === 'string' ||
      typeof entry.callback_data === 'string' ||
      typeof entry.callbackData === 'string' ||
      typeof entry.url === 'string' ||
      Boolean(entry.web_app || entry.reply_markup || entry.inlineButtons || entry.flow)
    );
  });
}

function parseJsonIfString(val: unknown): any {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return val;
    }
  }
  return val;
}

function isTelegramApiPayloadObject(obj: unknown): obj is Record<string, any> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const rec = obj as Record<string, any>;
  return Boolean(
    typeof rec.method === 'string' ||
      rec.chat_id !== undefined ||
      rec.reply_markup !== undefined ||
      Array.isArray(rec.inline_keyboard) ||
      Array.isArray(rec.keyboard) ||
      Array.isArray(rec.commands) ||
      rec.update_id !== undefined ||
      (rec.message && typeof rec.message === 'object') ||
      (rec.callback_query && typeof rec.callback_query === 'object') ||
      (rec.parameters && typeof rec.parameters === 'object') ||
      (rec.params && typeof rec.params === 'object') ||
      (rec.sendMessage && typeof rec.sendMessage === 'object') ||
      (rec.setMyCommands && typeof rec.setMyCommands === 'object')
  );
}

function mergeTelegramPayloadArray(arr: any[]): Record<string, any> | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  if (!arr.some((item) => isTelegramApiPayloadObject(item))) return null;

  const merged: Record<string, any> = {};
  const collectedCommands: any[] = [];

  for (const rawItem of arr) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
    const item = unwrapTelegramRootObject(rawItem as Record<string, any>);
    if (Array.isArray(item.commands)) {
      collectedCommands.push(...item.commands);
    }
    for (const [k, v] of Object.entries(item)) {
      if (k === 'commands') continue;
      if (v !== undefined && v !== null) {
        merged[k] = v;
      }
    }
  }

  if (collectedCommands.length > 0) {
    merged.commands = collectedCommands;
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function unwrapTelegramRootObject(initial: Record<string, any>): Record<string, any> {
  let root: Record<string, any> = { ...initial };
  const wrapperKeys = [
    'bot',
    'design',
    'botConfig',
    'config',
    'payload',
    'data',
    'template',
    'schema',
    'parameters',
    'params',
    'body',
    'request',
    'response',
    'update',
    'setMyCommands',
    'setChatMenuButton',
    'sendMessage',
    'sendPhoto',
    'sendVideo',
    'sendAudio',
    'sendVoice',
    'sendDocument',
    'sendAnimation',
    'sendPoll',
    'sendChecklist',
    'sendDice',
    'start',
    'main',
    'welcome',
    'home',
  ];

  // Unwrap multiple layers safely without discarding sibling keys
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;

    if (root.ok !== undefined && root.result !== undefined) {
      if (Array.isArray(root.result)) {
        if (isCommandLikeArray(root.result)) {
          root = { ...root, commands: root.result };
          changed = true;
        } else if (isMediaLikeArray(root.result)) {
          root = { ...root, media: root.result };
          changed = true;
        } else {
          const mergedArr = mergeTelegramPayloadArray(root.result);
          if (mergedArr) {
            root = { ...root, ...mergedArr };
            changed = true;
          }
        }
      } else if (root.result && typeof root.result === 'object') {
        const resObj = root.result as Record<string, any>;
        root = { ...root, ...resObj };
        delete root.result;
        changed = true;
      }
    }

    if (root.callback_query && typeof root.callback_query === 'object') {
      const cq = root.callback_query as Record<string, any>;
      if (cq.message && typeof cq.message === 'object') {
        root = { ...root, ...cq.message };
        delete root.callback_query;
        changed = true;
      }
    }

    const msgObj =
      (root.message && typeof root.message === 'object' && !Array.isArray(root.message) && root.message) ||
      (root.edited_message && typeof root.edited_message === 'object' && !Array.isArray(root.edited_message) && root.edited_message) ||
      (root.channel_post && typeof root.channel_post === 'object' && !Array.isArray(root.channel_post) && root.channel_post) ||
      null;
    if (msgObj) {
      root = { ...root, ...msgObj };
      delete root.message;
      delete root.edited_message;
      delete root.channel_post;
      changed = true;
    }

    for (const wk of wrapperKeys) {
      const candidate = parseJsonIfString(root[wk]);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const sub = candidate as Record<string, any>;
        // Don't destructively flatten `start` if it has no bot/message keys and looks like a custom label map,
        // unless it actually contains message/text/buttons/reply_markup/commands/media
        const isGenericWrapper = [
          'bot',
          'design',
          'botConfig',
          'config',
          'payload',
          'data',
          'template',
          'schema',
          'parameters',
          'params',
          'body',
          'request',
          'response',
          'update',
          'setMyCommands',
          'setChatMenuButton',
          'sendMessage',
          'sendPhoto',
          'sendVideo',
          'sendAudio',
          'sendVoice',
          'sendDocument',
          'sendAnimation',
          'sendPoll',
          'sendChecklist',
          'sendDice',
        ].includes(wk);
        const hasBotKeys = Boolean(
          sub.text ||
            sub.caption ||
            sub.startMessage ||
            sub.reply_markup ||
            sub.inline_keyboard ||
            sub.keyboard ||
            sub.inlineButtons ||
            sub.replyButtons ||
            sub.commands ||
            sub.photo ||
            sub.video ||
            sub.media ||
            sub.question ||
            sub.checklist
        );
        if (isGenericWrapper || hasBotKeys) {
          root = { ...root, ...sub };
          delete root[wk];
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  return root;
}

function extractTokenFromObject(root: Record<string, any>): string | undefined {
  const candidates = [root.token, root.botToken, root.bot_token, root.apiToken, root.api_token];
  for (const c of candidates) {
    if (typeof c === 'string') {
      const trimmed = c.trim();
      if (/^\d{5,15}:[A-Za-z0-9_-]{25,65}$/.test(trimmed)) {
        return trimmed;
      }
    }
  }
  return undefined;
}

export function parseBotDesignJson(rawInput: string): JsonBlueprintParseResult {
  const cleaned = stripJsonCodeFences(rawInput || '');
  if (!cleaned) {
    return {
      valid: false,
      error: 'يرجى لصق كود JSON الخاص بتصميم البوت أولاً.',
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    return {
      valid: false,
      error: `صيغة كود JSON غير صالحة: ${err?.message || 'تحقق من الأقواس والفواصل والاقتباس المزدوج " "'}`,
    };
  }

  const flows: Record<string, ButtonFlow> = {};
  const ctx: NormalizeButtonContext = { flows };

  // Handle Top-Level Primitives (string, number, boolean, null)
  if (parsed === null || typeof parsed !== 'object') {
    const startText =
      parsed === null
        ? 'تم تفعيل البوت من JSON بنجاح — يمكنك تعديل الرسالة والأزرار الآن.'
        : String(parsed);
    const blueprint: Partial<BotConfig> = {
      name: 'بوت مستورد من JSON',
      startMessage: {
        text: startText,
        isSaved: true,
        parseMode: 'none',
        skipMessage: false,
        media: [],
      },
      inlineButtons: [],
      replyButtons: [],
      buttonFlows: {},
      settings: {
        resizeKeyboard: true,
        oneTimeKeyboard: false,
        simulatorTheme: 'dark',
      },
    };
    return {
      valid: true,
      blueprint,
      summary: {
        format: 'generic_json',
        formatLabel: 'قيمة JSON عامة',
        botName: blueprint.name!,
        hasStartMessage: true,
        startMessagePreview: startText,
        inlineCount: 0,
        replyCount: 0,
        flowsCount: 0,
        mediaCount: 0,
      },
    };
  }

  // Handle Top-Level Arrays (commands[], media[], buttons[], Telegram payload[], or generic items[])
  if (Array.isArray(parsed)) {
    const mergedTelegramArray = !isCommandLikeArray(parsed) && !isMediaLikeArray(parsed)
      ? mergeTelegramPayloadArray(parsed)
      : null;

    if (!mergedTelegramArray) {
      let inlineButtons: BotButton[] = [];
      let startMedia: MediaItem[] = [];
      let commands: BotCommandConfig[] = [];
      let startText = '';
      let format: DetectedJsonFormat = 'custom_blueprint';
      let formatLabel = 'مصفوفة JSON مخصصة';

      if (isCommandLikeArray(parsed)) {
        commands = normalizeCommandsField(parsed);
        format = 'telegram_api';
        formatLabel = 'قائمة أوامر Telegram Bot API';
        startText = `الأوامر المتاحة:\n${commands.map((c) => `/${c.command} — ${c.description}`).join('\n')}`;
        const cmdButtonsSrc = commands.filter((c) => c.command.toLowerCase() !== 'start');
        const targetCmds = cmdButtonsSrc.length > 0 ? cmdButtonsSrc : commands;
        targetCmds.forEach((c, idx) => {
          const btnId = generateId(`btn_cmd_${idx}`);
          inlineButtons.push({
            id: btnId,
            text: `/${c.command} — ${c.description}`.slice(0, 60),
            type: 'inline',
            color: 'primary',
            style: 'primary',
            actionType: 'flow',
            parentId: null,
            row: Math.floor(idx / 2),
            order: idx % 2,
          });
          flows[btnId] = {
            id: `flow_${btnId}`,
            buttonId: btnId,
            parentId: null,
            message: {
              text: `/${c.command}\n${c.description}`,
              isSaved: true,
              parseMode: 'none',
              updateMode: 'edit',
            },
            media: [],
            subButtons: [],
          };
          if (!c.targetFlowId && c.command.toLowerCase() !== 'start') {
            c.targetFlowId = btnId;
          }
        });
      } else if (isMediaLikeArray(parsed)) {
        startMedia = normalizeMediaList(parsed);
        format = 'telegram_api';
        formatLabel = 'مجموعة وسائط Telegram Bot API';
        startText = startMedia.find((m) => m.caption)?.caption || '';
      } else if (isButtonLikeArray(parsed)) {
        inlineButtons = normalizeKeyboardGrid(parsed, 'inline', ctx);
        formatLabel = 'مصفوفة أزرار JSON';
      } else {
        const generic = buildGenericJsonContent(parsed, flows);
        startText = generic.startText;
        inlineButtons = generic.inlineButtons;
        format = 'generic_json';
        formatLabel = 'مصفوفة بيانات JSON عامة';
      }

      const effectiveIsSaved = startText.trim().length > 0 || startMedia.length > 0;
      const blueprint: Partial<BotConfig> = {
        name: 'بوت مستورد من JSON',
        startMessage: {
          text: startText,
          isSaved: effectiveIsSaved,
          parseMode: 'none',
          skipMessage: false,
          media: startMedia,
        },
        inlineButtons,
        replyButtons: [],
        buttonFlows: flows,
        ...(commands.length > 0 ? { commands } : {}),
        settings: {
          resizeKeyboard: true,
          oneTimeKeyboard: false,
          simulatorTheme: 'dark',
        },
      };

      return {
        valid: true,
        blueprint,
        summary: {
          format,
          formatLabel,
          botName: blueprint.name!,
          hasStartMessage: effectiveIsSaved,
          startMessagePreview:
            startText.trim() || (startMedia.length > 0 ? '[وسائط فقط]' : `أزرار (${inlineButtons.length})`),
          inlineCount: inlineButtons.length,
          replyCount: 0,
          flowsCount: Object.keys(flows).length,
          mediaCount: startMedia.length,
        },
      };
    }

    // Fall through to object pipeline using merged Telegram API array
    parsed = mergedTelegramArray;
  }

  // Unwrap Telegram Bot API & custom wrapper envelopes cleanly
  const root: Record<string, any> = unwrapTelegramRootObject(parsed as Record<string, any>);
  const detectedToken = extractTokenFromObject(root);

  // Normalize stringified JSON fields if any (very common in Telegram Bot API HTTP payloads)
  const parsedReplyMarkup = parseJsonIfString(root.reply_markup);
  const replyMarkupObj =
    parsedReplyMarkup && typeof parsedReplyMarkup === 'object' && !Array.isArray(parsedReplyMarkup)
      ? (parsedReplyMarkup as Record<string, any>)
      : undefined;
  const parsedMenuButton = parseJsonIfString(root.menu_button);
  const menuButtonObj =
    parsedMenuButton && typeof parsedMenuButton === 'object' && !Array.isArray(parsedMenuButton)
      ? (parsedMenuButton as Record<string, any>)
      : undefined;

  // Detect format
  const hasTelegramMarkup = Boolean(replyMarkupObj);
  const hasTelegramApiFields =
    hasTelegramMarkup ||
    Array.isArray(parseJsonIfString(root.inline_keyboard)) ||
    Array.isArray(parseJsonIfString(root.keyboard)) ||
    Boolean(root.photo || root.video || root.audio || root.voice || root.document || root.animation) ||
    Boolean(root.question && Array.isArray(root.options)) ||
    Boolean(root.checklist && typeof root.checklist === 'object') ||
    Boolean(root.chat_id !== undefined) ||
    Boolean(typeof root.method === 'string') ||
    Boolean(root.message_effect_id || root.link_preview_options || menuButtonObj || root.short_description);
  const hasTelecraftShape =
    Array.isArray(root.inlineButtons) ||
    Array.isArray(root.replyButtons) ||
    (root.buttonFlows && typeof root.buttonFlows === 'object') ||
    (root.startMessage && typeof root.startMessage === 'object');

  // Extract startMessage
  let startText = '';
  let startParseMode: ParseMode = normalizeParseMode(root.parseMode ?? root.parse_mode);
  let startSkipMessage = false;
  let startMedia: MediaItem[] = normalizeMediaList(root.media);
  let startIsSaved: boolean | undefined;

  if (typeof root.startMessage === 'string') {
    startText = root.startMessage;
  } else if (root.startMessage && typeof root.startMessage === 'object') {
    if (typeof root.startMessage.text === 'string') {
      startText = root.startMessage.text;
    }
    if (root.startMessage.parseMode || root.startMessage.parse_mode) {
      startParseMode = normalizeParseMode(
        root.startMessage.parseMode || root.startMessage.parse_mode
      );
    }
    startSkipMessage = Boolean(root.startMessage.skipMessage);
    if (Array.isArray(root.startMessage.media)) {
      startMedia = normalizeMediaList(root.startMessage.media);
    }
    if (typeof root.startMessage.isSaved === 'boolean') {
      startIsSaved = root.startMessage.isSaved;
    }
  } else {
    startText = extractTextCandidate(root);
  }

  // Extract single Telegram API media fields (photo / video / audio / voice / document / animation)
  if (startMedia.length === 0) {
    const mediaFieldMap: Array<[string, MediaType]> = [
      ['photo', 'photo'],
      ['video', 'video'],
      ['animation', 'video'],
      ['audio', 'audio'],
      ['voice', 'voice'],
      ['document', 'document'],
    ];
    for (const [field, mType] of mediaFieldMap) {
      if (root[field]) {
        const extracted = extractSingleMediaField(
          root[field],
          mType,
          Boolean(root.has_spoiler || root.hasSpoiler),
          Boolean(root.show_caption_above_media || root.showCaptionAboveMedia)
        );
        if (extracted) {
          startMedia = [extracted];
          break;
        }
      }
    }
  }

  // Extract inline & reply buttons (supports both object & JSON-stringified reply_markup)
  const rawInlineSource =
    root.inlineButtons ??
    root.inline_buttons ??
    parseJsonIfString(replyMarkupObj?.inline_keyboard) ??
    parseJsonIfString(root.inline_keyboard) ??
    root.inlineKeyboard ??
    root.inline ??
    [];
  const rawReplySource =
    root.replyButtons ??
    root.reply_buttons ??
    parseJsonIfString(replyMarkupObj?.keyboard) ??
    parseJsonIfString(root.keyboard) ??
    root.replyKeyboard ??
    [];

  let inlineButtons = normalizeKeyboardGrid(rawInlineSource, 'inline', ctx);
  let replyButtons = normalizeKeyboardGrid(rawReplySource, 'reply', ctx);

  // Generic `buttons` / `menu` / `items` / `links` / `choices` array support
  const genericButtonsArray =
    root.buttons ?? root.menuButtons ?? root.menu ?? root.links ?? root.choices;
  if (Array.isArray(genericButtonsArray) && inlineButtons.length === 0 && replyButtons.length === 0) {
    genericButtonsArray.forEach((entry: any, idx: number) => {
      if (Array.isArray(entry)) {
        entry.forEach((cell, colIdx) => {
          if (typeof cell === 'string') {
            inlineButtons.push(normalizeButton({ text: cell }, 'inline', idx, colIdx, null, ctx));
          } else if (cell && typeof cell === 'object') {
            const bType: ButtonType = cell.type === 'reply' ? 'reply' : 'inline';
            const btn = normalizeButton(cell, bType, idx, colIdx, null, ctx);
            if (bType === 'reply') replyButtons.push(btn);
            else inlineButtons.push(btn);
          }
        });
      } else if (typeof entry === 'string') {
        inlineButtons.push(normalizeButton({ text: entry }, 'inline', idx, 0, null, ctx));
      } else if (entry && typeof entry === 'object') {
        const bType: ButtonType = entry.type === 'reply' ? 'reply' : 'inline';
        const btn = normalizeButton(
          entry,
          bType,
          typeof entry.row === 'number' ? entry.row : idx,
          typeof entry.order === 'number' ? entry.order : 0,
          entry.parentId ?? null,
          ctx
        );
        if (bType === 'reply') replyButtons.push(btn);
        else inlineButtons.push(btn);
      }
    });
  }

  // Normalize explicit buttonFlows / flows / screens / menus / pages / routes / states dictionary
  const rawFlowsMap =
    (root.buttonFlows && typeof root.buttonFlows === 'object' && root.buttonFlows) ||
    (root.flows && typeof root.flows === 'object' && root.flows) ||
    (root.screens && typeof root.screens === 'object' && root.screens) ||
    (root.menus && typeof root.menus === 'object' && root.menus) ||
    (root.pages && typeof root.pages === 'object' && root.pages) ||
    (root.routes && typeof root.routes === 'object' && root.routes) ||
    (root.states && typeof root.states === 'object' && root.states) ||
    null;

  if (rawFlowsMap && !Array.isArray(rawFlowsMap)) {
    const allTopButtons = [...inlineButtons, ...replyButtons];
    Object.entries(rawFlowsMap).forEach(([key, val], idx) => {
      if (!val || typeof val !== 'object') return;
      const flowObj = val as Record<string, any>;
      const matchedBtn = allTopButtons.find(
        (b) => b.id === key || b.callbackData === key || b.text === key || b.name === key
      );
      if (matchedBtn) {
        flows[matchedBtn.id] = normalizeFlowObject(
          flowObj,
          matchedBtn.id,
          matchedBtn.id,
          flowObj.parentId ?? null,
          ctx
        );
      } else {
        // If flows/screens exist without explicit root buttons, expose screens cleanly
        const targetKey = key;
        flows[targetKey] = normalizeFlowObject(
          flowObj,
          targetKey,
          flowObj.buttonId || targetKey,
          flowObj.parentId ?? null,
          ctx
        );
        if (allTopButtons.length === 0 && typeof flowObj.buttonText !== 'string') {
          inlineButtons.push({
            id: targetKey,
            text: String(flowObj.title ?? flowObj.label ?? key),
            type: 'inline',
            color: 'primary',
            style: 'primary',
            actionType: 'flow',
            parentId: null,
            row: Math.floor(idx / 2),
            order: idx % 2,
          });
        }
      }
    });
  }

  // Support Telegram Bot API commands & method payloads (setMyCommands, sendPoll, sendChecklist, sendDice, sendMessageDraft)
  const commands = normalizeCommandsField(
    parseJsonIfString(root.commands ?? root.my_commands ?? root.bot_commands ?? root.slashCommands)
  );

  const rootSpecialActions: FlowAction[] = [];
  if (typeof root.question === 'string' && Array.isArray(root.options) && root.options.length >= 2) {
    const pollOptions = root.options.map((opt: any) =>
      typeof opt === 'string' ? opt : String(opt?.text ?? opt?.label ?? opt)
    );
    rootSpecialActions.push({
      id: generateId('act_poll'),
      type: 'send_poll',
      order: rootSpecialActions.length,
      enabled: true,
      config: {
        pollQuestion: root.question,
        pollOptions,
        pollType: root.type === 'quiz' ? 'quiz' : 'regular',
        pollAllowsMultiple: Boolean(root.allows_multiple_answers),
        ...(typeof root.correct_option_id === 'number'
          ? { pollCorrectOptionId: root.correct_option_id }
          : {}),
        ...(typeof root.explanation === 'string' ? { pollExplanation: root.explanation } : {}),
      },
    });
    if (!startText) startText = root.question;
  }

  const checklistSrcRaw = parseJsonIfString(root.checklist);
  const checklistSrc =
    checklistSrcRaw && typeof checklistSrcRaw === 'object'
      ? checklistSrcRaw
      : Array.isArray(root.tasks)
      ? root
      : null;
  if (checklistSrc && Array.isArray(checklistSrc.tasks) && checklistSrc.tasks.length > 0) {
    const tasks = checklistSrc.tasks.map((t: any, idx: number) => ({
      id: typeof t?.id === 'number' ? t.id : idx + 1,
      text: typeof t === 'string' ? t : String(t?.text ?? t?.title ?? `مهمة ${idx + 1}`),
      done: Boolean(t?.done || t?.completed),
    }));
    const clTitle = String(checklistSrc.title ?? root.title ?? 'قائمة المهام');
    rootSpecialActions.push({
      id: generateId('act_checklist'),
      type: 'send_checklist',
      order: rootSpecialActions.length,
      enabled: true,
      config: {
        checklistTitle: clTitle,
        checklistTasks: tasks,
      },
    });
    if (!startText) startText = clTitle;
  }

  if (
    typeof root.emoji === 'string' &&
    ['🎲', '🎯', '🏀', '⚽', '🎳', '🎰'].includes(root.emoji)
  ) {
    rootSpecialActions.push({
      id: generateId('act_dice'),
      type: 'send_dice',
      order: rootSpecialActions.length,
      enabled: true,
      config: { diceEmoji: root.emoji as any },
    });
    if (!startText) startText = `تجربة رمي ${root.emoji}`;
  }

  if (root.draft_id !== undefined && typeof root.text === 'string' && root.text.trim()) {
    rootSpecialActions.push({
      id: generateId('act_draft'),
      type: 'send_draft_stream',
      order: rootSpecialActions.length,
      enabled: true,
      config: { text: root.text },
    });
  }

  if (rootSpecialActions.length > 0 && inlineButtons.length === 0) {
    const actBtnId = generateId('btn_api_action');
    const firstAct = rootSpecialActions[0];
    const btnLabel =
      firstAct.type === 'send_poll'
        ? '📊 عرض الاستطلاع'
        : firstAct.type === 'send_checklist'
        ? '✅ فتح قائمة المهام'
        : firstAct.type === 'send_dice'
        ? `${firstAct.config?.diceEmoji || '🎲'} ارمِ الآن`
        : '💬 عرض البث المتدرج';
    inlineButtons.push({
      id: actBtnId,
      text: btnLabel,
      type: 'inline',
      color: 'primary',
      style: 'primary',
      actionType: 'flow',
      parentId: null,
      row: 0,
      order: 0,
    });
    flows[actBtnId] = {
      id: `flow_${actBtnId}`,
      buttonId: actBtnId,
      parentId: null,
      message: {
        text: '',
        isSaved: false,
        skipMessage: true,
      },
      media: [],
      subButtons: [],
      actions: rootSpecialActions,
    };
  }

  // Extract optional Telegram profile fields from flat or nested JSON
  const extractedProfile: BotProfileConfig | undefined =
    root.profile && typeof root.profile === 'object'
      ? root.profile
      : root.short_description || menuButtonObj || root.displayName
      ? {
          ...(typeof root.displayName === 'string' ? { displayName: root.displayName } : {}),
          ...(typeof root.short_description === 'string'
            ? { shortDescription: root.short_description }
            : {}),
          ...(typeof root.description === 'string' && root.description !== startText
            ? { description: root.description }
            : {}),
          menuButtonType: menuButtonObj?.type || 'default',
          ...(menuButtonObj?.text ? { menuButtonText: menuButtonObj.text } : {}),
          ...(menuButtonObj?.web_app?.url
            ? { menuButtonWebAppUrl: menuButtonObj.web_app.url }
            : {}),
        }
      : undefined;

  // Ensure commands-only, flows-only, or profile-only Telegram API payloads produce a real /start response & buttons
  if (commands.length > 0 && inlineButtons.length === 0 && replyButtons.length === 0) {
    const nonStartCmds = commands.filter((c) => c.command.toLowerCase() !== 'start');
    const targetCmds = nonStartCmds.length > 0 ? nonStartCmds : commands;
    targetCmds.forEach((cmd, idx) => {
      const btnId = cmd.targetFlowId?.trim() || generateId(`btn_cmd_${idx}`);
      inlineButtons.push({
        id: btnId,
        text: `/${cmd.command} — ${cmd.description}`.slice(0, 60),
        type: 'inline',
        color: 'primary',
        style: 'primary',
        actionType: 'flow',
        parentId: null,
        row: Math.floor(idx / 2),
        order: idx % 2,
      });
      if (!flows[btnId]) {
        flows[btnId] = {
          id: `flow_${btnId}`,
          buttonId: btnId,
          parentId: null,
          message: {
            text: `/${cmd.command}\n${cmd.description}`,
            isSaved: true,
            parseMode: 'none',
            updateMode: 'edit',
          },
          media: [],
          subButtons: [],
        };
      }
      if (!cmd.targetFlowId && cmd.command.toLowerCase() !== 'start') {
        cmd.targetFlowId = btnId;
      }
    });
  }

  if (!startSkipMessage && !startText.trim() && startMedia.length === 0) {
    if (commands.length > 0) {
      startText = `الأوامر المتاحة:\n${commands.map((c) => `/${c.command} — ${c.description}`).join('\n')}`;
    } else if (Object.keys(flows).length > 0 && inlineButtons.length === 0 && replyButtons.length === 0) {
      Object.entries(flows).forEach(([flowKey, flowVal], idx) => {
        inlineButtons.push({
          id: flowVal.buttonId || flowKey,
          text: flowVal.message?.text?.slice(0, 40) || flowKey,
          type: 'inline',
          color: 'primary',
          style: 'primary',
          actionType: 'flow',
          parentId: null,
          row: Math.floor(idx / 2),
          order: idx % 2,
        });
      });
      startText = 'اختر من القائمة التالية:';
    } else if (extractedProfile) {
      startText =
        extractedProfile.description?.trim() ||
        extractedProfile.shortDescription?.trim() ||
        (extractedProfile.displayName?.trim()
          ? `مرحباً بك في ${extractedProfile.displayName.trim()}!`
          : '');
    }
  }

  // Universal fallback: if still no bot content was matched, convert arbitrary JSON object cleanly!
  let usedGenericFallback = false;
  let genericSuggestedName: string | undefined;

  const hasRenderableContent =
    startText.trim().length > 0 ||
    startMedia.length > 0 ||
    inlineButtons.length > 0 ||
    replyButtons.length > 0 ||
    Object.keys(flows).length > 0 ||
    startSkipMessage;

  if (!hasRenderableContent) {
    const generic = buildGenericJsonContent(root, flows);
    startText = generic.startText;
    inlineButtons = generic.inlineButtons;
    genericSuggestedName = generic.suggestedName;
    usedGenericFallback = true;
  }

  const resolvedBotName =
    typeof root.name === 'string' && root.name.trim()
      ? root.name.trim()
      : typeof root.botName === 'string' && root.botName.trim()
      ? root.botName.trim()
      : typeof root.title === 'string' && root.title.trim()
      ? root.title.trim()
      : typeof root.botFirstName === 'string' && root.botFirstName.trim()
      ? root.botFirstName.trim()
      : typeof extractedProfile?.displayName === 'string' && extractedProfile.displayName.trim()
      ? extractedProfile.displayName.trim()
      : genericSuggestedName || 'بوت مستورد من JSON';

  const format: DetectedJsonFormat = hasTelecraftShape
    ? 'telecraft'
    : hasTelegramApiFields || commands.length > 0
    ? 'telegram_api'
    : usedGenericFallback
    ? 'generic_json'
    : 'custom_blueprint';

  const formatLabel =
    format === 'telecraft'
      ? 'تصميم TeleCraft الكامل'
      : format === 'telegram_api'
      ? 'كود Telegram Bot API'
      : format === 'generic_json'
      ? 'بيانات JSON عامة (محوّلة لبوت)'
      : 'تصميم JSON مخصص';

  const effectiveIsSaved =
    startIsSaved !== undefined
      ? startIsSaved
      : startText.trim().length > 0 || startMedia.length > 0 || startSkipMessage;

  const settings = {
    resizeKeyboard:
      root.settings?.resizeKeyboard ??
      replyMarkupObj?.resize_keyboard ??
      true,
    oneTimeKeyboard:
      root.settings?.oneTimeKeyboard ??
      replyMarkupObj?.one_time_keyboard ??
      false,
    isPersistent:
      root.settings?.isPersistent ??
      replyMarkupObj?.is_persistent ??
      false,
    selective:
      root.settings?.selective ??
      replyMarkupObj?.selective ??
      false,
    inputFieldPlaceholder:
      root.settings?.inputFieldPlaceholder ??
      replyMarkupObj?.input_field_placeholder ??
      undefined,
    simulatorTheme:
      root.settings?.simulatorTheme === 'light' ? ('light' as const) : ('dark' as const),
  };

  const startMessageOptions =
    root.startMessage?.messageOptions ||
    (root.message_effect_id || root.protect_content || root.disable_notification || root.link_preview_options
      ? {
          ...(root.message_effect_id ? { messageEffectId: String(root.message_effect_id) } : {}),
          ...(root.protect_content ? { protectContent: true } : {}),
          ...(root.disable_notification ? { disableNotification: true } : {}),
          ...(root.link_preview_options ? { linkPreviewOptions: root.link_preview_options } : {}),
        }
      : undefined);

  const blueprint: Partial<BotConfig> = {
    name: resolvedBotName,
    startMessage: {
      text: startText,
      isSaved: effectiveIsSaved,
      parseMode: startParseMode,
      skipMessage: startSkipMessage,
      media: startMedia,
      ...(startMessageOptions ? { messageOptions: startMessageOptions } : {}),
    },
    inlineButtons,
    replyButtons,
    ...(root.inlinePagination ? { inlinePagination: root.inlinePagination } : {}),
    ...(root.replyPagination ? { replyPagination: root.replyPagination } : {}),
    ...(root.inlineLayoutSettings ? { inlineLayoutSettings: root.inlineLayoutSettings } : {}),
    ...(root.replyLayoutSettings ? { replyLayoutSettings: root.replyLayoutSettings } : {}),
    buttonFlows: flows,
    ...(commands.length > 0 ? { commands } : {}),
    ...(extractedProfile ? { profile: extractedProfile } : {}),
    ...(root.apiFeatures && typeof root.apiFeatures === 'object' ? { apiFeatures: root.apiFeatures } : {}),
    settings,
  };

  const summary: JsonBlueprintSummary = {
    format,
    formatLabel,
    botName: resolvedBotName,
    hasStartMessage: Boolean(startText.trim() || startMedia.length > 0),
    startMessagePreview:
      startText.trim() ||
      (startMedia.length > 0
        ? '[وسائط فقط]'
        : inlineButtons.length > 0 || replyButtons.length > 0
        ? `أزرار (${inlineButtons.length + replyButtons.length})`
        : 'جاهز للتخصيص'),
    inlineCount: inlineButtons.length,
    replyCount: replyButtons.length,
    flowsCount: Object.keys(flows).length,
    mediaCount: startMedia.length,
  };

  return {
    valid: true,
    blueprint,
    summary,
    ...(detectedToken ? { detectedToken } : {}),
  };
}

export function createPreviewBotFromBlueprint(blueprint?: Partial<BotConfig>): BotConfig {
  const now = new Date().toISOString();
  return {
    id: 'json_preview_bot',
    name: blueprint?.name || 'معاينة البوت من JSON',
    createdAt: now,
    updatedAt: now,
    isConnected: false,
    botUsername: 'preview_bot',
    startMessage: blueprint?.startMessage || {
      text: 'الصق كود JSON على اليمين لمعاينة تصميم البوت هنا مباشرة...',
      isSaved: true,
      parseMode: 'none',
      media: [],
    },
    inlineButtons: blueprint?.inlineButtons || [],
    replyButtons: blueprint?.replyButtons || [],
    inlinePagination: blueprint?.inlinePagination,
    replyPagination: blueprint?.replyPagination,
    inlineLayoutSettings: blueprint?.inlineLayoutSettings,
    replyLayoutSettings: blueprint?.replyLayoutSettings,
    buttonFlows: blueprint?.buttonFlows || {},
    commands: blueprint?.commands,
    profile: blueprint?.profile,
    apiFeatures: blueprint?.apiFeatures,
    settings: blueprint?.settings || {
      resizeKeyboard: true,
      oneTimeKeyboard: false,
      simulatorTheme: 'dark',
    },
  };
}

export function exportBotDesignJson(bot: BotConfig): string {
  const cleanBlueprint = {
    name: bot.name,
    startMessage: bot.startMessage,
    inlineButtons: bot.inlineButtons || [],
    replyButtons: bot.replyButtons || [],
    ...(bot.inlinePagination ? { inlinePagination: bot.inlinePagination } : {}),
    ...(bot.replyPagination ? { replyPagination: bot.replyPagination } : {}),
    ...(bot.inlineLayoutSettings ? { inlineLayoutSettings: bot.inlineLayoutSettings } : {}),
    ...(bot.replyLayoutSettings ? { replyLayoutSettings: bot.replyLayoutSettings } : {}),
    buttonFlows: bot.buttonFlows || {},
    ...(bot.commands && bot.commands.length > 0 ? { commands: bot.commands } : {}),
    ...(bot.profile ? { profile: bot.profile } : {}),
    ...(bot.apiFeatures ? { apiFeatures: bot.apiFeatures } : {}),
    ...(bot.settings ? { settings: bot.settings } : {}),
  };
  return JSON.stringify(cleanBlueprint, null, 2);
}

export function applyBlueprintUpdates(
  currentBot: BotConfig,
  updates: Partial<BotConfig>
): { updatedBot: BotConfig; exportedJson: string } {
  const updatedBot: BotConfig = {
    ...currentBot,
    ...updates,
    settings: updates.settings
      ? { ...(currentBot.settings || {}), ...updates.settings }
      : currentBot.settings,
    updatedAt: new Date().toISOString(),
  };

  return {
    updatedBot,
    exportedJson: exportBotDesignJson(updatedBot),
  };
}

export const SAMPLE_BOT_DESIGN_JSON = JSON.stringify(
  {
    name: 'بوت الخدمات السريع',
    startMessage: {
      text: '👋 <b>أهلاً بك في بوت الخدمات!</b>\nاختر القسم المناسب من الأزرار التالية:',
      parseMode: 'HTML',
      isSaved: true,
      media: [],
    },
    inlineButtons: [
      {
        id: 'btn_services',
        text: '🛍️ عرض الخدمات',
        type: 'inline',
        style: 'primary',
        color: 'primary',
        actionType: 'flow',
        row: 0,
        order: 0,
      },
      {
        id: 'btn_offer',
        text: '🎁 العروض اليومية',
        type: 'inline',
        style: 'success',
        color: 'success',
        actionType: 'flow',
        row: 0,
        order: 1,
      },
      {
        id: 'btn_support',
        text: '🌐 زيارة الموقع الرسمي',
        type: 'inline',
        color: 'default',
        actionType: 'url',
        url: 'https://telegram.org',
        row: 1,
        order: 0,
      },
    ],
    replyButtons: [
      {
        id: 'btn_menu_home',
        text: '🏠 القائمة الرئيسية',
        type: 'reply',
        color: 'default',
        actionType: 'flow',
        row: 0,
        order: 0,
      },
    ],
    buttonFlows: {
      btn_services: {
        id: 'btn_services',
        buttonId: 'btn_services',
        parentId: null,
        message: {
          text: '✨ إليك قائمة خدماتنا المتاحة حالياً:',
          isSaved: true,
          parseMode: 'none',
          updateMode: 'edit',
        },
        media: [],
        subButtons: [
          {
            id: 'btn_srv_1',
            text: '⚡ باقة البداية',
            type: 'inline',
            style: 'primary',
            color: 'primary',
            actionType: 'flow',
            parentId: 'btn_services',
            row: 0,
            order: 0,
          },
        ],
      },
      btn_offer: {
        id: 'btn_offer',
        buttonId: 'btn_offer',
        parentId: null,
        message: {
          text: '🔥 خصم 30% لفترة محدودة على كافة الباقات!',
          isSaved: true,
          parseMode: 'none',
          updateMode: 'edit',
        },
        media: [],
        subButtons: [],
      },
    },
  },
  null,
  2
);
