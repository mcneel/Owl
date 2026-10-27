'use strict';

/**
 * Finds what an xref link in an authored page names.
 *
 * A target is written the way a &lt;see cref&gt; is - 'FileStore', 'FileStore.Read(string)',
 * 'Box&lt;T&gt;.Open' - or as a doc id, 'M:MyLib.FileStore.Read(System.String)'. Doc comments have the
 * compiler to bind their crefs; authored pages are read while the site serves them, so the name is
 * matched against the model's doc ids instead, as the compiler would have matched it.
 */

const DOC_ID = /^[NTFPEM]:/;

/** C# keywords a parameter list may use for a framework type, as the doc id spells them. */
const KEYWORDS = {
  bool: 'Boolean',
  byte: 'Byte',
  sbyte: 'SByte',
  char: 'Char',
  decimal: 'Decimal',
  double: 'Double',
  float: 'Single',
  int: 'Int32',
  uint: 'UInt32',
  nint: 'IntPtr',
  nuint: 'UIntPtr',
  long: 'Int64',
  ulong: 'UInt64',
  short: 'Int16',
  ushort: 'UInt16',
  object: 'Object',
  string: 'String',
  void: 'Void',
};

/** Splits on a separator outside any bracket, so 'Dictionary<K, V>' stays one piece. */
function splitTop(text, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '<' || c === '{' || c === '(' || c === '[') depth++;
    else if (c === '>' || c === '}' || c === ')' || c === ']') depth--;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(text.slice(start));
  return parts;
}

/** A written segment, 'Box<T>' or 'Box{T}' or 'Box`1', as its name and how many type arguments it wrote. */
function writtenSegment(text) {
  const generic = /^([^<{`]+)(?:[<{](.*)[>}]|``?(\d+))$/.exec(text.trim());
  if (!generic) return { name: text.trim(), arity: null };

  const arity = generic[3] !== undefined ? Number(generic[3]) : splitTop(generic[2], ',').length;
  return { name: generic[1], arity };
}

/** A doc id's segment, 'Owned`1' or 'Find``1', as its name and arity. */
function idSegment(text) {
  const generic = /^(.*?)``?(\d+)$/.exec(text);
  return generic ? { name: generic[1], arity: Number(generic[2]) } : { name: text, arity: 0 };
}

/** One parameter reduced to what both spellings agree on: 'System.Collections.Generic.List{System.Int32}[]' as 'List[]'. */
function paramKey(text) {
  let type = text
    .trim()
    .replace(/^(?:(?:ref|out|in|params|this|scoped)\s+)+/, '')
    .replace(/@$/, '')
    .replace(/\?$/, '');

  // A type parameter is ``0 or `0 in a doc id and its own name when written; either matches anything.
  if (/^`/.test(type)) return '*';

  let suffix = '';
  const array = /((?:\[[,\s]*\])+)$/.exec(type);
  if (array) {
    suffix = array[1].replace(/\s/g, '');
    type = type.slice(0, -array[1].length);
  }

  type = type.replace(/[<{].*[>}]/, '');
  const name = KEYWORDS[type] || type.slice(type.lastIndexOf('.') + 1);
  return name + suffix;
}

/** Parses a written target into the segments and parameter list it names. */
function parseTarget(target) {
  const text = target.trim();

  let open = -1;
  for (let i = 0, depth = 0; i < text.length && open < 0; i++) {
    if (text[i] === '<' || text[i] === '{') depth++;
    else if (text[i] === '>' || text[i] === '}') depth--;
    else if (text[i] === '(' && depth === 0) open = i;
  }

  const head = open < 0 ? text : text.slice(0, open);
  let params = null;

  if (open >= 0) {
    const inside = text.slice(open + 1).replace(/\)\s*$/, '').trim();
    params = inside ? splitTop(inside, ',').map(paramKey) : [];
  }

  return { segments: splitTop(head, '.').map(writtenSegment), params };
}

/** Parses a doc id the same way, keeping the id. */
function parseId(docId) {
  let body = docId.slice(2).replace(/~.*$/, '');
  let params = [];

  const open = body.indexOf('(');
  if (open >= 0) {
    const inside = body.slice(open + 1, body.lastIndexOf(')'));
    params = splitTop(inside, ',').map(paramKey);
    body = body.slice(0, open);
  }

  const segments = splitTop(body, '.').map(idSegment);

  // A constructor answers to its type's name, as it does in a cref.
  const last = segments[segments.length - 1];
  if (last.name === '#ctor' && segments.length > 1) {
    segments[segments.length - 1] = { name: segments[segments.length - 2].name, arity: 0, ctor: true };
  }

  return { docId, member: docId[0] !== 'T', group: docId.replace(/\(.*$/, ''), segments, params };
}

class Xrefs {
  /** @param {object} entries  the model's doc id index */
  constructor(entries) {
    this.ids = Object.keys(entries).map(parseId);
  }

  /**
   * What a written name means in the documented set.
   *
   * @returns {{ docId?: string, ambiguous?: string[] }} the one doc id it names, the several it
   *   could equally mean, or neither when nothing documented answers to it
   */
  find(target) {
    const want = parseTarget(target);
    const n = want.segments.length;

    let found = this.ids.filter((id) => {
      if (id.segments.length < n) return false;

      const offset = id.segments.length - n;
      for (let i = 0; i < n; i++) {
        const have = id.segments[offset + i];
        const wanted = want.segments[i];
        if (have.name !== wanted.name) return false;
        if (wanted.arity !== null && have.arity !== wanted.arity) return false;
      }

      if (!want.params) return true;
      if (id.params.length !== want.params.length) return false;
      return id.params.every((p, i) => p === '*' || want.params[i] === '*' || p === want.params[i]);
    });

    // A type is meant over a member of the same name: 'Color' over a property called Color, and
    // 'ListAspect' over the constructors that answer to it too.
    if (found.length > 1 && found.some((id) => !id.member)) found = found.filter((id) => !id.member);

    // Writing no type arguments asks for the plain type first, as it does in C#.
    if (want.segments[n - 1].arity === null && found.length > 1) {
      const plain = found.filter((id) => id.segments[id.segments.length - 1].arity === 0);
      if (plain.length > 0) found = plain;
    }

    // Overloads named without a parameter list are one name, and the first of them answers for it.
    if (found.length > 1 && found.every((id) => id.member && id.group === found[0].group)) {
      found = [found[0]];
    }

    if (found.length === 1) return { docId: found[0].docId };
    if (found.length > 1) return { ambiguous: found.map((id) => id.docId) };
    return {};
  }
}

module.exports = { Xrefs, DOC_ID, parseTarget };
