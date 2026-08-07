'use strict';

const { escape, attr } = require('./html');
const { highlight } = require('./highlight');

/**
 * Renders the model's structured documentation nodes to HTML.
 *
 * This is the payoff for keeping doc comments structured through the whole pipeline: a cref arrives
 * with a resolved doc id, so it becomes an actual anchor to the target's page rather than styled
 * text.
 */

/** External types get a link to Microsoft Learn when they look like BCL types. */
function learnUrl(docId) {
  if (!docId) return null;

  const body = docId.slice(2);
  if (!/^(System|Microsoft)\./.test(body)) return null;

  // Learn urls drop method arity and render generic arity as -N.
  const normalized = body
    .replace(/\(.*\)$/, '')
    .replace(/``\d+/g, '')
    .replace(/`(\d+)/g, '-$1')
    .toLowerCase();

  return `https://learn.microsoft.com/dotnet/api/${normalized}`;
}

/**
 * @param {object[]|null|undefined} nodes
 * @param {object} context  { model, routes, inline } - inline suppresses block-level markup
 */
function render(nodes, context) {
  if (!nodes || nodes.length === 0) return '';

  let out = '';
  for (const node of nodes) out += renderNode(node, context);
  return out;
}

function renderNode(node, context) {
  switch (node.t) {
    case 'text':
      return escape(node.v || '');

    case 'cref':
      return renderCref(node, context);

    case 'paramref':
    case 'typeparamref':
      // .param-ref is the class the Python server used for these.
      return `<code class="param-ref">${escape(node.name || '')}</code>`;

    case 'langword':
      return `<code class="langword-ref">${escape(node.v || '')}</code>`;

    case 'c':
      return `<code>${escape(node.v || '')}</code>`;

    case 'code': {
      if (context.inline) {
        return `<code>${escape((node.v || '').replace(/\s+/g, ' ').trim())}</code>`;
      }
      const lang = node.lang ? ` class="language-${attr(node.lang)}"` : '';
      return `<pre><code${lang}>${highlight(node.v || '', node.lang)}</code></pre>`;
    }

    case 'para':
      return context.inline
        ? ' ' + render(node.children, context)
        : `<p>${render(node.children, context)}</p>`;

    case 'br':
      return context.inline ? ' ' : '<br>';

    case 'note': {
      if (context.inline) return render(node.children, context);
      const kind = (node.kind || 'note').toLowerCase();
      return (
        `<div class="note note-${attr(kind)}">` +
        `<span class="note-label">${escape(kind)}</span>` +
        render(node.children, context) +
        '</div>'
      );
    }

    case 'link': {
      const href = node.href || '';
      const label = node.v || href;
      if (!/^https?:/i.test(href)) return escape(label);
      return `<a class="see-ref see-ref-external" href="${attr(href)}" rel="noopener" target="_blank">${escape(label)}</a>`;
    }

    case 'list':
      return renderList(node, context);

    default:
      // Unknown node kind: render whatever content it carries rather than dropping it.
      return escape(node.v || '') + render(node.children, context);
  }
}

function renderCref(node, context) {
  const label = node.label || node.v || node.id || '';
  const url = crefUrl(node, context);

  // Nothing to point at, so show the label without pretending it is a link.
  if (!url) {
    return `<span class="see-ref">${escape(label)}</span>`;
  }

  // A reference that leaves for Microsoft Learn is marked by colour rather than by an arrow: these
  // are dense - every 'string' and 'int' in a parameter table is one - and at that size the arrow
  // read as noise. Muted, because a framework type is rarely what the reader came for. The arrow
  // stays on prose links, which are rare and where it earns its place.
  const external = /^https?:/i.test(url);
  const rel = external ? ' rel="noopener"' : '';
  const cls = external ? 'see-ref see-ref-out' : 'see-ref';

  return `<a class="${cls}" href="${attr(url)}"${rel}>${escape(label)}</a>`;
}

/** Resolves a cref to a url: internal pages first, Microsoft Learn as a fallback. */
function crefUrl(node, context) {
  if (!node.id) return null;

  const entry = context.model.entry(node.id);
  if (entry) return context.routes.forEntry(entry);

  // The doc id might point at a member of a documented type whose own id was not indexed;
  // fall back to the containing type.
  const typeId = containingTypeDocId(node.id);
  if (typeId) {
    const typeEntry = context.model.entry(typeId);
    if (typeEntry) return context.routes.forEntry(typeEntry);
  }

  return learnUrl(node.id);
}

/** Derives 'T:Ns.Type' from a member doc id such as 'M:Ns.Type.Method(...)'. */
function containingTypeDocId(docId) {
  if (!docId || docId.length < 3) return null;
  if (docId[0] === 'T') return null;

  let body = docId.slice(2);
  const paren = body.indexOf('(');
  if (paren >= 0) body = body.slice(0, paren);

  const dot = body.lastIndexOf('.');
  if (dot <= 0) return null;

  return 'T:' + body.slice(0, dot);
}

/** Flattens doc nodes to plain text, for meta descriptions and search haystacks. */
function toText(nodes) {
  if (!nodes || nodes.length === 0) return '';

  let out = '';
  for (const node of nodes) {
    switch (node.t) {
      case 'text':
      case 'c':
      case 'code':
      case 'langword':
        out += node.v || '';
        break;
      case 'cref':
      case 'link':
        out += node.label || node.v || '';
        break;
      case 'paramref':
      case 'typeparamref':
        out += node.name || '';
        break;
      case 'br':
        out += ' ';
        break;
      default:
        break;
    }

    if (node.children) out += toText(node.children);

    if (node.items) {
      for (const item of node.items) {
        out += toText(item.term);
        out += ' ';
        out += toText(item.description);
        out += ' ';
      }
    }
  }

  return out;
}

function renderList(node, context) {
  const items = node.items || [];
  if (items.length === 0) return '';

  const style = (node.style || 'bullet').toLowerCase();

  if (context.inline) {
    return items.map((i) => toText(i.term) + ' ' + toText(i.description)).join('; ');
  }

  if (style === 'table') {
    let out = '<div class="table-scroll"><table><tbody>';
    for (const item of items) {
      out +=
        '<tr><th>' + render(item.term, context) + '</th>' +
        '<td>' + render(item.description, context) + '</td></tr>';
    }
    return out + '</tbody></table></div>';
  }

  // A list whose items have terms is a definition list regardless of the declared style.
  if (items.some((i) => i.term && i.term.length > 0)) {
    let out = '<dl>';
    for (const item of items) {
      out += '<dt>' + render(item.term, context) + '</dt>';
      out += '<dd>' + render(item.description, context) + '</dd>';
    }
    return out + '</dl>';
  }

  const tag = style === 'number' ? 'ol' : 'ul';
  let out = `<${tag}>`;
  for (const item of items) out += '<li>' + render(item.description, context) + '</li>';
  return out + `</${tag}>`;
}

module.exports = { render, toText, learnUrl, containingTypeDocId };
