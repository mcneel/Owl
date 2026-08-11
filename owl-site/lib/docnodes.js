'use strict';

const { escape, attr } = require('./html');
const { highlight } = require('./highlight');
const { isDiagram } = require('./diagrams');

/**
 * Renders the model's structured documentation nodes to HTML.
 *
 * This is the payoff for keeping doc comments structured through the whole pipeline: a cref arrives
 * with a resolved doc id, so it becomes an actual anchor to the target's page rather than styled
 * text.
 */

/**
 * What a code block with no language stated is taken to be.
 *
 * A <code> in a doc comment usually says nothing about its language, and this documents a C# API
 * being read by people writing C#. Decided here rather than in the model, so the model stays
 * honest about what the comment said and the guess can change without regenerating.
 *
 * Authored markdown is deliberately not covered by this: a fence there with no language is as
 * likely to be a shell transcript or a file listing as it is to be code.
 */
const DEFAULT_CODE_LANGUAGE = 'cs';

function codeLanguage(node) {
  return (node && node.lang) || DEFAULT_CODE_LANGUAGE;
}

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

      const lang = codeLanguage(node);

      // A <code lang="d2"> in a doc comment is a diagram, drawn the way a ```d2 fence in an
      // authored page is. One renderer, so a remark and an overview page draw alike.
      const drawn = isDiagram(lang) && context.diagrams ? context.diagrams.html(node.v || '') : '';
      if (drawn) return drawn;

      return `<pre><code class="language-${attr(lang)}">${highlight(node.v || '', lang)}</code></pre>`;
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

/**
 * A member's label with its declaring type taken off: 'KeyBinding.Register(string)' as
 * 'Register(string)'. The parameter list stays, since that is what tells overloads apart.
 */
function shortMemberLabel(label) {
  const paren = label.indexOf('(');
  const head = paren < 0 ? label : label.slice(0, paren);
  const dot = head.lastIndexOf('.');
  return dot < 0 ? label : head.slice(dot + 1) + (paren < 0 ? '' : label.slice(paren));
}

function renderCref(node, context) {
  let label = node.label || node.v || node.id || '';
  const url = crefUrl(node, context);

  // On a type's own page, its members are referred to by name alone. Repeating the type in front
  // of every one says nothing a reader on that page does not already know, and the prefix is
  // longer than the name it qualifies. A reference to the type itself keeps its name, since
  // containingTypeDocId returns nothing for one and there is nothing to strip.
  if (context.selfType && containingTypeDocId(node.id) === context.selfType) {
    label = shortMemberLabel(label);
  }

  // Nothing to point at - not documented here, and not a framework type Learn would have a page for
  // - so it is marked as the dead name it is. A span alone was not enough: it kept the link colour,
  // which promised a page to anyone reading an Implements row.
  if (!url) {
    return `<span class="see-ref see-ref-none">${escape(label)}</span>`;
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

/**
 * Resolves a cref to a url: internal pages first, then a sibling site, then Microsoft Learn.
 *
 * The sibling comes before Learn because the two never both apply - one answers for the assemblies
 * --link named and the other for the framework - and after the documented set because a set
 * documents its own types better than it knows anyone else's.
 */
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

  // A member on another site resolves to its type's page: see Links.typeUrl for why it stops
  // there rather than carrying an anchor.
  const links = context.links;
  if (links && !links.empty && node.asm) {
    const url = links.typeUrl(node.id.startsWith('T:') ? node.id : typeId, node.asm);
    if (url) return url;
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

module.exports = { render, toText, learnUrl, containingTypeDocId, codeLanguage };
