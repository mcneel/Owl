'use strict';

const { escape } = require('./html');

/**
 * A small syntax highlighter that runs when the page is rendered, not in the browser.
 *
 * Highlighting here rather than shipping a client library keeps the export genuinely offline, puts
 * the markup where crawlers can see it, and costs no client JavaScript.
 *
 * Beyond strings, comments and numbers, identifiers are classified by shape rather than by meaning,
 * because there is no symbol table here: a name followed by '(' is being called, a name that starts
 * with a capital is a type, anything else is a value. That is wrong for a PascalCase member name,
 * which reads as a type - the same trade every highlighter without a parser makes, and worth it for
 * signatures where the alternative is a wall of one colour.
 */

const KEYWORDS = {
  csharp: new Set(`abstract as async await base bool break byte case catch char checked class const
    continue decimal default delegate do double dynamic else enum event explicit extern false
    finally fixed float for foreach get goto if implicit in init int interface internal is lock
    long namespace new null object operator out override params private protected public readonly
    record ref return sbyte sealed set short sizeof stackalloc static string struct switch this
    throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile when
    where while with yield`.split(/\s+/)),

  python: new Set(`and as assert async await break class continue def del elif else except False
    finally for from global if import in is lambda None nonlocal not or pass raise return True try
    while with yield self`.split(/\s+/)),

  javascript: new Set(`async await break case catch class const continue default delete do else
    export extends false finally for from function if import in instanceof let new null of return
    static super switch this throw true try typeof undefined var void while yield`.split(/\s+/)),
};

const ALIASES = {
  cs: 'csharp',
  'c#': 'csharp',
  csharp: 'csharp',
  py: 'python',
  python: 'python',
  py3: 'python',
  js: 'javascript',
  javascript: 'javascript',
  json: 'javascript',
  ts: 'javascript',
};

/**
 * One pass, one regex. Alternation order matters: comments and strings must win over
 * identifiers, or a keyword inside a string would be highlighted.
 */
const TOKENS = {
  csharp: [
    ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//],
    ['string', /@?"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|\$"(?:[^"\\]|\\[\s\S])*"/],
    ['number', /\b0[xX][0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[fFdDmMuUlL]*\b/],
    ['meta', /^\s*#\s*\w+[^\n]*/m],
    ['ident', /[A-Za-z_]\w*/],
    ['punct', /[{}()[\]<>;,.:?!=+\-*/%&|^~]+/],
  ],
  python: [
    ['comment', /#[^\n]*/],
    ['string', /[rbfu]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')/],
    ['number', /\b0[xXbBoO][0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[jJ]?\b/],
    ['decorator', /@[A-Za-z_][\w.]*/],
    ['ident', /[A-Za-z_]\w*/],
    ['punct', /[{}()[\]<>;,.:?!=+\-*/%&|^~]+/],
  ],
  javascript: [
    ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//],
    ['string', /`(?:[^`\\]|\\[\s\S])*`|"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'/],
    ['number', /\b0[xXbBoO][0-9a-fA-F_]+n?\b|\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?n?\b/],
    ['ident', /[A-Za-z_$][\w$]*/],
    ['punct', /[{}()[\]<>;,.:?!=+\-*/%&|^~]+/],
  ],
};

/**
 * Which class an identifier earns. Returns null for a plain name, which is left unwrapped.
 *
 * @param {string} text      the identifier
 * @param {string} rest      the code following it, for the one bit of lookahead this needs
 * @param {Set}    keywords  the language's reserved words
 */
function classifyIdent(text, rest, keywords) {
  if (keywords.has(text)) return 'keyword';

  // Called or being declared: the only case a single token can settle on its own.
  if (/^\s*\(/.test(rest)) return 'func';

  // Every language here capitalises type names and lowercases values.
  if (/^[A-Z]/.test(text)) return 'type';

  return null;
}

const compiled = new Map();

function patternFor(language) {
  if (compiled.has(language)) return compiled.get(language);

  const rules = TOKENS[language];
  const source = rules.map(([, re]) => `(${re.source})`).join('|');
  const regex = new RegExp(source, 'gm');

  const entry = { regex, kinds: rules.map(([kind]) => kind) };
  compiled.set(language, entry);
  return entry;
}

/**
 * Highlights code, returning HTML. Unknown languages are escaped and returned unstyled, which is
 * the right outcome for a shell transcript or plain text.
 */
function highlight(code, languageHint) {
  const language = ALIASES[String(languageHint || '').toLowerCase().trim()];
  if (!language || !TOKENS[language]) return escape(code);

  const { regex, kinds } = patternFor(language);
  const keywords = KEYWORDS[language];

  let out = '';
  let last = 0;
  regex.lastIndex = 0;

  let match;
  while ((match = regex.exec(code)) !== null) {
    // Zero-length matches would spin forever.
    if (match[0].length === 0) {
      regex.lastIndex++;
      continue;
    }

    out += escape(code.slice(last, match.index));

    // Group 1..n line up with the rule order, so the first non-undefined group is the kind.
    let kind = null;
    for (let i = 0; i < kinds.length; i++) {
      if (match[i + 1] !== undefined) {
        kind = kinds[i];
        break;
      }
    }

    const text = match[0];

    if (kind === 'ident') {
      kind = classifyIdent(text, code.slice(match.index + text.length), keywords);
    }

    out += kind ? `<span class="tok-${kind}">${escape(text)}</span>` : escape(text);

    last = match.index + text.length;
  }

  out += escape(code.slice(last));
  return out;
}

module.exports = { highlight };
