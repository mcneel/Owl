'use strict';

const { escape } = require('./html');
const { highlight } = require('./highlight');

/**
 * Markdown renderer for the authored pages.
 *
 * Deliberately dependency-free and deliberately small: it covers what an API overview page needs -
 * headings with anchors, emphasis, fenced code, links, images, nested and ordered lists,
 * blockquotes, tables and rules - and nothing else.
 */

/** Inline formatting. Escaping happens first so authored HTML is shown, not executed. */
function inline(text) {
  let out = escape(text);

  // Code spans first: their contents must not be touched by the emphasis rules below.
  const codeSpans = [];
  out = out.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });

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

  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codeSpans[Number(i)]}</code>`);
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

function render(markdown) {
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

      const code = highlight(body.join('\n'), language);
      const cls = language ? ` class="language-${escape(language)}"` : '';
      out.push(`<pre><code${cls}>${code}</code></pre>`);
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
      headers.forEach((h, i) => { table += `<th${alignments[i] || ''}>${inline(h)}</th>`; });
      table += '</tr></thead><tbody>';
      for (const row of rows) {
        table += '<tr>';
        headers.forEach((_, i) => { table += `<td${alignments[i] || ''}>${inline(row[i] || '')}</td>`; });
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
      out.push(`<h${level} id="${escape(headingId(text))}">${inline(text)}</h${level}>`);
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
      out.push(`<blockquote>${render(body.join('\n'))}</blockquote>`);
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

      out.push(inline(item[3]));
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
      out.push(' ' + inline(line.trim()));
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
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
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
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

module.exports = { render, firstParagraph, inline };
