'use strict';

const { escape } = require('./html');
const { highlight } = require('./highlight');
const { isDiagram } = require('./diagrams');
const math = require('./math');

/**
 * Markdown renderer for the authored pages.
 *
 * Deliberately dependency-free and deliberately small: it covers what an API overview page needs -
 * headings with anchors, emphasis, fenced code, links, images, nested and ordered lists,
 * blockquotes, tables and rules - and nothing else.
 */

/**
 * Inline math: $...$, with no space just inside either delimiter.
 *
 * That rule is what keeps prose which merely contains dollars out of it. 'costs $5 and $10' has a
 * space before the closing dollar and a digit after it; 'set $PATH and $HOME' has a space before
 * its closing one too. Neither is math, and neither matches.
 */
const INLINE_MATH = /\$(?!\s)((?:[^$\n\\]|\\.)+?)(?<!\s)\$(?!\d)/g;

/**
 * $$...$$ written inside a line rather than on one of its own.
 *
 * Matched before the single-dollar rule, which would otherwise take the inner pair and leave the
 * outer two as stray dollars. Typeset in display style, as the doubled delimiter asks for: the
 * limits of a sum go above and below it rather than beside it, which is the reason to write it
 * this way in the middle of a sentence.
 */
const INLINE_DISPLAY_MATH = /\$\$([^\n]+?)\$\$/g;

/**
 * A link to the API: [label](xref:FileStore.Read(string)), the label optional. The target may hold
 * one level of parentheses, and spaces inside them, since that is how a parameter list is written.
 */
const XREF = /\[([^\]]*)\]\(xref:((?:[^()\s]|\([^()]*\))+)\)/g;

/** Inline formatting. Escaping happens first so authored HTML is shown, not executed. */
function inline(text, context = {}) {
  // Code spans come out before anything else and go back in last, so what is written inside one is
  // shown rather than read: a dollar in a code span is a dollar, not the start of an equation.
  const codeSpans = [];
  const codeSpan = (_, code) => {
    codeSpans.push(code);
    return `\u0000${codeSpans.length - 1}\u0000`;
  };

  // Xref links come out in the same pass, because a doc id's backticks are not code spans. The
  // target is a name rather than markup, so it is kept from the escaping; the label stays in the
  // text between two markers and is formatted with everything else.
  const xrefs = [];
  let source = String(text).replace(new RegExp('`([^`]+)`|' + XREF.source, 'g'), (whole, code, label, target) => {
    if (code !== undefined) return codeSpan(whole, code);
    xrefs.push(target);
    return `\u0002${xrefs.length - 1}\u0002${label.replace(/`([^`]+)`/g, codeSpan)}\u0003`;
  });

  // Math next, and ahead of the escaping: TeX is not HTML, and the '<' in an inequality has to
  // reach the converter as the author wrote it. What comes back is markup, so it goes back in at
  // the very end, past the rules that would read its brackets and underscores as emphasis.
  const equations = [];

  const typeset = (whole, tex, display) => {
    const rendered = math.render(tex, display);
    if (!rendered) {
      if (context.warn) context.warn('could not typeset ' + tex);
      return whole;
    }

    equations.push(rendered);
    return `\u0001${equations.length - 1}\u0001`;
  };

  source = source.replace(INLINE_DISPLAY_MATH, (whole, tex) => typeset(whole, tex, true));
  source = source.replace(INLINE_MATH, (whole, tex) => typeset(whole, tex, false));

  let out = escape(source);

  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) =>
    `<img src="${src}" alt="${alt}" loading="lazy">`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const external = /^https?:/i.test(href);
    const rel = external ? ' rel="noopener" target="_blank"' : '';
    return `<a href="${href}"${rel}>${label}</a>`;
  });

  out = out.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Without a resolver - a page rendered outside any site - the link is its text and nothing more.
  out = out.replace(/\u0002(\d+)\u0002([^\u0003]*)\u0003/g, (_, i, label) => {
    const target = xrefs[Number(i)];
    return context.xref ? context.xref(target, label) : label || escape(target);
  });

  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escape(codeSpans[Number(i)])}</code>`);
  out = out.replace(/\u0001(\d+)\u0001/g, (_, i) => equations[Number(i)]);
  return out;
}

/** Slugifies a heading so it can be linked to. */
function headingId(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * @param {string} markdown
 * @param {object} context  { diagrams, warn } - the renderer a d2 fence is drawn by, and where a
 *   diagram or an equation that would not render says so. Both optional; without them a fence is
 *   printed as code and an equation as the text it was written as.
 */
function render(markdown, context = {}) {
  const lines = String(markdown || '')
    .replace(/\r\n/g, '\n')
    // Drop HTML comments before anything else. Everything downstream is escaped, so an
    // authoring note left in a MAIN.md would otherwise render as visible text.
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n');
  const out = [];

  // Stack of open list contexts, so nesting by indentation works.
  const listStack = [];

  let index = 0;

  const closeListsTo = (indent) => {
    while (listStack.length > 0 && listStack[listStack.length - 1].indent >= indent) {
      out.push(`</li></${listStack.pop().tag}>`);
    }
  };

  const closeAllLists = () => closeListsTo(-1);

  while (index < lines.length) {
    const line = lines[index];

    // Fenced code block
    const fence = line.match(/^\s*```+\s*([\w#+-]*)\s*$/);
    if (fence) {
      closeAllLists();
      const language = fence[1] || '';
      const body = [];
      index++;

      while (index < lines.length && !/^\s*```+\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index++;
      }
      index++; // closing fence

      // A diagram fence is drawn rather than printed. With nothing to draw it with, it falls
      // through to the code block below: the source is what the author wrote, and showing it says
      // more than an empty frame would.
      const drawn =
        isDiagram(language) && context.diagrams ? context.diagrams.html(body.join('\n')) : '';

      if (drawn) {
        out.push(drawn);
        continue;
      }

      const code = highlight(body.join('\n'), language);
      const cls = language ? ` class="language-${escape(language)}"` : '';
      out.push(`<pre><code${cls}>${code}</code></pre>`);
      continue;
    }

    // Display math: $$ alone on a line opens a block that runs to the next one, and $$...$$ on a
    // single line is the same thing written short. Ahead of everything below, so a formula holding
    // a pipe or a hash is not read as a table or a heading.
    const openMath = /^\s*\$\$\s*(.*)$/.exec(line);
    if (openMath) {
      closeAllLists();

      const oneLine = /^(.*?)\$\$\s*$/.exec(openMath[1]);
      let tex;

      if (oneLine) {
        tex = oneLine[1];
        index++;
      } else {
        const body = [];
        index++;
        while (index < lines.length && !/^\s*\$\$\s*$/.test(lines[index])) {
          body.push(lines[index]);
          index++;
        }
        index++; // closing $$
        tex = body.join('\n');
      }

      const rendered = math.render(tex, true);
      if (rendered) {
        out.push(`<div class="math-display">${rendered}</div>`);
      } else {
        if (context.warn) context.warn('could not typeset ' + tex.replace(/\s+/g, ' ').trim());
        out.push(`<pre><code class="language-tex">${escape(tex)}</code></pre>`);
      }

      continue;
    }

    // Table: a header row followed by a delimiter row
    if (/\|/.test(line) && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1])) {
      closeAllLists();
      const splitRow = (row) =>
        row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

      const headers = splitRow(line);
      const alignments = splitRow(lines[index + 1]).map((spec) => {
        if (/^:-+:$/.test(spec)) return ' style="text-align:center"';
        if (/^-+:$/.test(spec)) return ' style="text-align:right"';
        return '';
      });

      index += 2;
      const rows = [];
      while (index < lines.length && /\|/.test(lines[index]) && lines[index].trim()) {
        rows.push(splitRow(lines[index]));
        index++;
      }

      let table = '<div class="table-scroll"><table><thead><tr>';
      headers.forEach((h, i) => { table += `<th${alignments[i] || ''}>${inline(h, context)}</th>`; });
      table += '</tr></thead><tbody>';
      for (const row of rows) {
        table += '<tr>';
        headers.forEach((_, i) => { table += `<td${alignments[i] || ''}>${inline(row[i] || '', context)}</td>`; });
        table += '</tr>';
      }
      table += '</tbody></table></div>';
      out.push(table);
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeAllLists();
      const level = heading[1].length;
      const text = heading[2].trim();
      out.push(`<h${level} id="${escape(headingId(text))}">${inline(text, context)}</h${level}>`);
      index++;
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      closeAllLists();
      out.push('<hr>');
      index++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      closeAllLists();
      const body = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        body.push(lines[index].replace(/^\s*>\s?/, ''));
        index++;
      }
      out.push(`<blockquote>${render(body.join('\n'), context)}</blockquote>`);
      continue;
    }

    // List item, ordered or unordered
    const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      const indent = item[1].replace(/\t/g, '    ').length;
      const ordered = /\d/.test(item[2]);
      const tag = ordered ? 'ol' : 'ul';

      const top = listStack[listStack.length - 1];

      if (!top || indent > top.indent) {
        listStack.push({ indent, tag });
        out.push(`<${tag}><li>`);
      } else {
        closeListsTo(indent + 1);
        const current = listStack[listStack.length - 1];
        if (!current) {
          listStack.push({ indent, tag });
          out.push(`<${tag}><li>`);
        } else if (current.tag !== tag) {
          out.push(`</li></${listStack.pop().tag}>`);
          listStack.push({ indent, tag });
          out.push(`<${tag}><li>`);
        } else {
          out.push('</li><li>');
        }
      }

      out.push(inline(item[3], context));
      index++;
      continue;
    }

    // Blank line
    if (!line.trim()) {
      closeAllLists();
      index++;
      continue;
    }

    // Paragraph: gather until a blank line or a construct starts
    if (listStack.length > 0) {
      // Lazy continuation of the current list item.
      out.push(' ' + inline(line.trim(), context));
      index++;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s/.test(lines[index]) &&
      !/^\s*```/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index++;
    }

    if (paragraph.length > 0) {
      out.push(`<p>${inline(paragraph.join(' '), context)}</p>`);
    } else {
      index++;
    }
  }

  closeAllLists();
  return out.join('\n');
}

/** Extracts the first paragraph as plain text, for meta descriptions. */
function firstParagraph(markdown) {
  const lines = String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n');
  const collected = [];

  for (const line of lines) {
    if (/^\s*(#|```|>|\||[-*+]\s|\d+[.)]\s)/.test(line)) {
      if (collected.length > 0) break;
      continue;
    }
    if (!line.trim()) {
      if (collected.length > 0) break;
      continue;
    }
    collected.push(line.trim());
  }

  return collected
    .join(' ')
    .replace(XREF, (_, label, target) => label || target)
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

module.exports = { render, firstParagraph, inline, XREF };
