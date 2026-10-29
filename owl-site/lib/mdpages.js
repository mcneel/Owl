'use strict';

const docnodes = require('./docnodes');
const markdown = require('./markdown');
const theme = require('./theme');
const { memberFile, slugify } = require('./routes');
const { versionLabel } = require('./layout');
const {
  MEMBER_ORDER,
  CALLABLE_KINDS,
  memberDisplayName,
  operatorSymbol,
  lastSegment,
  hasExamplePage,
  exampleFileNodes,
  examplePageCode,
  languageLabel,
  languageRank,
} = require('./pages');

/**
 * The Markdown copy of every page, and llms.txt, for agents that read the site rather than look at it.
 *
 * A type's copy lists its members a line each; every overload of one member name gets a page of its
 * own, so an agent after Curve.Offset reads a few KB rather than all of Curve.
 *
 * Links lead to other Markdown copies, so an agent that starts on one stays on them.
 */
class MarkdownPages {
  /** @param {import('./pages').Renderer} renderer  the HTML renderer, whose helpers this shares */
  constructor(renderer) {
    this.renderer = renderer;
    this.model = renderer.model;
    this.routes = renderer.baseRoutes;
    this.origin = renderer.siteUrl ? renderer.siteUrl.replace(/\/$/, '') : '';
    this.context = { refUrl: (node) => this.refUrl(node) };
    this.line = { ...this.context, inline: true };
  }

  // ------------------------------------------------------------------
  // Urls
  // ------------------------------------------------------------------

  /** Absolute when the site knows its origin, since a copied Markdown file has no address of its own. */
  abs(url) {
    return this.origin && url.startsWith('/') ? this.origin + url : url;
  }

  /** The Markdown copy of a site url, or the url itself when it has none. */
  toMarkdownUrl(url) {
    if (!url || !url.startsWith('/')) {
      return url || '';
    }

    const hash = url.indexOf('#');
    const anchor = hash === -1 ? '' : url.slice(hash + 1);
    const path = url.replace(/[?#].*$/, '');
    const route = this.routes.match(path);

    if (!route || route.mode) {
      return this.abs(url);
    }

    if (route.kind === 'type' && anchor) {
      const found = this.model.typeBySlug(route.slug);
      const member = found && found.type.members.find((m) => m.anchor === anchor);
      if (member && this.hasMemberPage(found.type, member)) {
        return this.abs(this.routes.memberMarkdown(route.slug, memberFile(member)));
      }
    }

    if (['home', 'assembly', 'namespace', 'category', 'type', 'example'].includes(route.kind)) {
      return this.abs(this.routes.markdown(path));
    }
    return this.abs(url);
  }

  refUrl(node) {
    return this.toMarkdownUrl(docnodes.crefUrl(node, this.renderer.docContext) || '');
  }

  typeLink(ref) {
    if (!ref) {
      return '';
    }
    return docnodes.toMarkdown([{ t: 'cref', id: ref.id, label: ref.display, asm: ref.asm }], this.line);
  }

  /** An enum's values are listed on its own page, and have no page of their own. */
  hasMemberPage(type, member) {
    return type.kind !== 'enum' && member.kind !== 'enumvalue';
  }

  // ------------------------------------------------------------------
  // Pages
  // ------------------------------------------------------------------

  /** Every Markdown url the site answers, for the export to write. */
  urls() {
    const urls = [this.routes.markdown(this.routes.home())];
    for (const url of this.renderer.sitemapUrls()) {
      const route = this.routes.match(url);
      if (route && route.kind !== 'home' && route.kind !== 'whatsnew') {
        urls.push(this.routes.markdown(url));
      }
    }

    for (const { type } of this.model.allTypes()) {
      const files = new Set();
      for (const member of type.members || []) {
        if (this.hasMemberPage(type, member)) {
          files.add(memberFile(member));
        }
      }
      for (const file of files) {
        urls.push(this.routes.memberMarkdown(type.slug, file));
      }
    }
    return urls;
  }

  home() {
    const r = this.renderer;
    if (r.rootRedirects) {
      return this.assembly(r.assemblyNames[0]);
    }

    const main = this.model.siteMain;
    const out = [main ? this.authored(main) : `# ${r.siteName}`];

    if (r.namespaceMode) {
      out.push(this.namespaceList(this.model.sortedNamespaces().map((ns) => ns.name)));
    } else {
      const rows = r.assemblyNames.map((name) => {
        const doc = this.model.assemblyMain(name);
        const intro = doc ? markdown.firstParagraph(doc.markdown) : '';
        return this.row(name, this.routes.markdown(this.routes.assembly(name)), intro);
      });
      out.push(`## Assemblies\n\n${rows.join('\n')}`);
    }
    return this.join(out);
  }

  assembly(name) {
    const main = this.model.assemblyMain(name);
    const out = [main ? this.authored(main) : `# ${name} assembly`];

    if (!this.renderer.namespaceMode) {
      const rows = this.model.categoriesOfAssembly(name).map((b) => this.categoryRow(b));
      if (rows.length > 0) {
        out.push(`## Categories\n\n${rows.join('\n')}`);
      }
    }

    out.push(this.namespaceList(this.model.namespacesOfAssembly(name).map((ns) => ns.name)));
    return this.join(out);
  }

  namespace(name) {
    const bucket = this.model.namespaces.get(name);
    if (!bucket) {
      return null;
    }

    const docs = this.renderer.namespaceDocs(name);
    const assemblies = [...bucket.assemblies].sort().map((a) => this.assemblyLink(a));
    return this.join([
      `# ${name || '(global)'} namespace`,
      `${assemblies.length === 1 ? 'Assembly' : 'Assemblies'}: ${assemblies.join(', ')}`,
      docs ? docnodes.toMarkdown(docs.summary, this.context) : '',
      docs && docs.remarks ? `## Remarks\n\n${docnodes.toMarkdown(docs.remarks, this.context)}` : '',
      this.typeList(bucket.types),
    ]);
  }

  category(bucket) {
    return this.join([
      bucket.doc ? this.authored(bucket.doc) : `# ${bucket.category}`,
      `Assembly: ${this.assemblyLink(bucket.assembly)}`,
      this.typeList(bucket.types),
    ]);
  }

  type(slug) {
    const found = this.model.typeBySlug(slug);
    if (!found) {
      return null;
    }

    const { type, assembly } = found;
    return this.asType(type, () => {
      const docs = type.docs || {};
      const members = this.renderer.sortedMembers(type, { pageOrder: true });

      const out = [
        `# ${type.name} ${type.kind}`,
        this.where(type, assembly) + this.since(docs),
        this.declaration(type.attributes, this.renderer.declarationOf(type)),
        this.obsolete(type.obsolete),
        docnodes.toMarkdown(docs.summary, this.context),
        docs.remarks ? `**Remarks:** ${docnodes.toMarkdown(docs.remarks, this.context)}` : '',
        this.typeParameters(type),
        type.kind === 'delegate' && type.signature
          ? `**Signature:**\n\n${this.code(type.signature)}\n\n${this.parameters(type.parameters)}`
          : '',
        docs.example ? `**Example:**\n\n${docnodes.toMarkdown(docs.example, this.context)}` : '',
        this.derived(type),
        type.kind === 'enum' ? this.enumValues(members) : this.memberIndex(type, members),
        this.inherited(type),
        this.seeAlso(docs),
      ];
      return this.join(out);
    });
  }

  member(slug, file) {
    const found = this.model.typeBySlug(slug);
    if (!found) {
      return null;
    }

    const { type, assembly } = found;
    const members = this.renderer
      .sortedMembers(type, { pageOrder: true })
      .filter((m) => this.hasMemberPage(type, m) && memberFile(m) === file);
    if (members.length === 0) {
      return null;
    }

    return this.asType(type, () => {
      const first = members[0];
      const title =
        first.kind === 'constructor'
          ? `${type.name} constructor`
          : `${type.name}.${this.memberName(first)} ${theme.kindLabel(first.kind).toLowerCase()}`;
      const typeUrl = this.abs(this.routes.markdown(this.routes.type(type.slug)));

      const out = [
        `# ${title}`,
        `Member of [${type.name}](${typeUrl}) ${type.kind}. ${this.where(type, assembly)}`,
      ];
      for (const member of members) {
        out.push(this.memberBody(type, member, members.length > 1));
      }
      return this.join(out);
    });
  }

  example(slug, anchor) {
    const found = this.model.typeBySlug(slug);
    const member = found && (found.type.members || []).find((m) => m.anchor === anchor);
    if (!member || !hasExamplePage(member)) {
      return null;
    }

    const { type, assembly } = found;
    return this.asType(type, () => {
      const code = examplePageCode(type, member, assembly)
        .map((node, i) => ({ node, i }))
        .sort((a, b) => {
          const rank = (n) => languageRank(docnodes.codeLanguage(n));
          return rank(a.node) - rank(b.node) || a.i - b.i;
        })
        .map((e) => e.node);

      const prose =
        exampleFileNodes(member.docs).length > 0 ? (member.docs.example || []).filter((n) => n.t !== 'code') : [];

      const name = memberDisplayName(member);
      const back = this.toMarkdownUrl(this.routes.member(type.slug, member.anchor));
      const out = [
        `# ${type.name}.${name} examples`,
        `Examples for [${name}](${back}) in ${type.fullName}.`,
        docnodes.toMarkdown(prose, this.context),
      ];
      for (const node of code) {
        const lang = docnodes.codeLanguage(node);
        const body =
          typeof node.v === 'string' && node.v.length > 0
            ? docnodes.codeBlock(node.v, lang).trim()
            : `This example could not be read from ${node.src || 'its source file'}.`;
        out.push(`## ${languageLabel(lang)}\n\n${body}`);
      }
      return this.join(out);
    });
  }

  /** The index agents look for at the site root: what the site documents and where each part's Markdown is. */
  llms() {
    const r = this.renderer;
    const main = this.model.siteMain;
    const intro = main ? markdown.firstParagraph(main.markdown) : `API reference for ${r.assemblyNames.join(', ')}.`;
    const example = this.model.allTypes()[0];
    const sample = example
      ? ` For example, ${this.abs(this.routes.type(example.type.slug))} is also at ` +
        `${this.abs(this.routes.markdown(this.routes.type(example.type.slug)))}.`
      : '';

    const out = [
      `# ${r.siteName}`,
      `> ${intro.replace(/\s+/g, ' ').trim()}`,
      'Every page of this reference is also available as Markdown: replace the trailing slash of its ' +
        `address with \`.md\`, or ask for \`text/markdown\` in the Accept header.${sample} ` +
        "A type's page lists its members; each member name has its own page holding all its overloads, " +
        'at `/type/<type>/<member>.md`.',
    ];

    for (const name of r.assemblyNames) {
      const doc = this.model.assemblyMain(name);
      const rows = [
        this.row(
          `${name} assembly`,
          this.routes.markdown(this.routes.assembly(name)),
          doc ? markdown.firstParagraph(doc.markdown) : ''
        ),
      ];

      if (!r.namespaceMode) {
        for (const bucket of this.model.categoriesOfAssembly(name)) {
          rows.push(this.categoryRow(bucket));
        }
      }

      for (const ns of this.model.namespacesOfAssembly(name)) {
        const docs = r.namespaceDocs(ns.name);
        const text = docs ? docnodes.toMarkdown(docs.summary, this.line) : '';
        const url = this.routes.markdown(this.routes.namespace(ns.name));
        rows.push(this.row(`${ns.name || '(global)'} namespace`, url, text));
      }
      out.push(`## ${name}\n\n${rows.join('\n')}`);
    }
    return this.join(out);
  }

  // ------------------------------------------------------------------
  // Parts
  // ------------------------------------------------------------------

  /** Renders with crefs to the type's own members written short, as its HTML page does. */
  asType(type, render) {
    const ctx = this.renderer.docContext;
    ctx.selfType = type.docId;
    try {
      return render();
    } finally {
      ctx.selfType = null;
    }
  }

  join(parts) {
    return parts.filter((p) => p && String(p).trim()).join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }

  /** One entry of a link list: '- [label](url): text'. */
  row(label, url, text = '') {
    const tail = String(text || '').replace(/\s+/g, ' ').trim();
    return `- [${label}](${this.abs(url)})${tail ? `: ${tail}` : ''}`;
  }

  code(text) {
    return docnodes.codeBlock(text, 'cs').trim();
  }

  assemblyLink(name) {
    return `[${name}](${this.abs(this.routes.markdown(this.routes.assembly(name)))})`;
  }

  /** 'Namespace: [Rhino.Geometry](…) · Assembly: [RhinoCommon](…)', what a type page's breadcrumbs say. */
  where(type, assembly) {
    const parts = [];
    if (type.namespace) {
      const url = this.abs(this.routes.markdown(this.routes.namespace(type.namespace)));
      parts.push(`Namespace: [${type.namespace}](${url})`);
    }
    parts.push(`Assembly: ${this.assemblyLink(assembly)}`);
    return parts.join(' · ');
  }

  since(docs) {
    const parts = [];
    if (docs && docs.since) {
      parts.push(`Since ${versionLabel(docs.since)}`);
    }
    if (docs && docs.deprecated) {
      parts.push(`Obsolete ${versionLabel(docs.deprecated)}`);
    }
    return parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
  }

  /** Authored Markdown, with its xref links pointed at the Markdown copies of what they name. */
  authored(doc) {
    const xref = new RegExp('(`[^`]+`)|' + markdown.XREF.source, 'g');
    return String(doc.markdown).replace(xref, (whole, code, label, target) => {
      if (code) {
        return code;
      }
      const found = this.renderer.resolveXref(target.trim());
      const text = label || found.label;
      return found.url ? `[${text}](${this.toMarkdownUrl(found.url)})` : docnodes.codeSpan(text);
    });
  }

  declaration(attributes, code) {
    const lines = (attributes || []).map(
      (a) => `[${a.display}${a.arguments ? `(${a.arguments.join(', ')})` : ''}]`
    );
    lines.push(code);
    return this.code(lines.join('\n'));
  }

  obsolete(obsolete) {
    if (!obsolete) {
      return '';
    }
    const message = String(obsolete.message || '').trim();
    return `> **${obsolete.isError ? 'Removed' : 'Obsolete'}:** ${message || 'Do not use in new code.'}`;
  }

  categoryRow(bucket) {
    const url = this.routes.markdown(this.routes.category(bucket.assembly, bucket.category));
    return this.row(bucket.category, url, bucket.doc ? markdown.firstParagraph(bucket.doc.markdown) : '');
  }

  namespaceList(names) {
    const rows = names.map((name) => {
      const docs = this.renderer.namespaceDocs(name);
      const text = docs ? docnodes.toMarkdown(docs.summary, this.line) : '';
      return this.row(name || '(global)', this.routes.markdown(this.routes.namespace(name)), text);
    });
    return rows.length > 0 ? `## Namespaces\n\n${rows.join('\n')}` : '';
  }

  /** Types grouped under a heading per kind, a line each. */
  typeList(entries) {
    const groups = new Map();
    for (const entry of entries) {
      const kind = entry.type.kind;
      if (!groups.has(kind)) {
        groups.set(kind, []);
      }
      groups.get(kind).push(entry);
    }

    const out = [];
    for (const [kind, list] of groups) {
      const rows = list.map(({ type }) =>
        this.row(
          type.name,
          this.routes.markdown(this.routes.type(type.slug)),
          docnodes.toMarkdown(type.docs && type.docs.summary, this.line)
        )
      );
      out.push(`## ${theme.kindPlural(kind)}\n\n${rows.join('\n')}`);
    }
    return out.join('\n\n');
  }

  typeParameters(owner) {
    const list = owner.typeParameters || [];
    if (list.length === 0) {
      return '';
    }
    const rows = list.map((tp) => {
      const doc = tp.doc ? docnodes.toMarkdown(tp.doc, this.line) : '';
      const where = tp.constraints ? ` (where ${tp.constraints.join(', ')})` : '';
      const name = docnodes.codeSpan(`${tp.variance ? tp.variance + ' ' : ''}${tp.name}`);
      return `- ${name}${where}${doc ? `: ${doc}` : ''}`;
    });
    return `**Type parameters:**\n\n${rows.join('\n')}`;
  }

  parameters(parameters) {
    if (!parameters || parameters.length === 0) {
      return '';
    }
    const rows = parameters.map((p) => {
      const mods = [p.refKind, p.isParams ? 'params' : null].filter(Boolean).join(' ');
      const dflt = p.isOptional ? ` = ${p.defaultValue}` : '';
      const doc = p.doc ? docnodes.toMarkdown(p.doc, this.line) : '';
      const type = `${mods ? mods + ' ' : ''}${this.typeLink(p.type)}${dflt}`;
      return `- ${docnodes.codeSpan(p.name)} (${type})${doc ? `: ${doc}` : ''}`;
    });
    return `**Parameters:**\n\n${rows.join('\n')}`;
  }

  derived(type) {
    const kids = (type.derivedTypes || [])
      .map((id) => this.model.typeByDocId(id))
      .filter(Boolean)
      .map((f) => f.type)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (kids.length === 0) {
      return '';
    }
    const links = kids.map((k) => `[${k.name}](${this.abs(this.routes.markdown(this.routes.type(k.slug)))})`);
    return `**Derived types:** ${links.join(', ')}`;
  }

  enumValues(members) {
    const cell = (text) => String(text || '').replace(/\|/g, '\\|');
    const rows = members.map((m) => {
      const text = docnodes.toMarkdown(m.docs && m.docs.summary, this.line);
      return `| ${cell(m.name)} | ${cell(m.constantValue)} | ${cell(text)} |`;
    });
    return `## Values\n\n| Name | Value | Description |\n| --- | --- | --- |\n${rows.join('\n')}`;
  }

  memberName(member) {
    if (member.kind === 'operator' || member.kind === 'conversion') {
      return `operator ${operatorSymbol(member)}`;
    }
    return memberDisplayName(member);
  }

  /** The type's members a line per name, grouped by kind, each leading to the page with its overloads. */
  memberIndex(type, members) {
    const sections = new Map();
    const seen = new Set();

    for (const member of members) {
      const file = memberFile(member);
      if (seen.has(file)) {
        continue;
      }
      seen.add(file);

      const all = members.filter((m) => memberFile(m) === file);
      const notes = [];
      if (all.length > 1) {
        notes.push(`${all.length} overloads`);
      }
      if (all.every((m) => m.isStatic) && member.kind !== 'constructor') {
        notes.push('static');
      }
      if (all.every((m) => m.obsolete)) {
        notes.push('obsolete');
      }

      const summary = docnodes.toMarkdown(member.docs && member.docs.summary, this.line);
      const text = (notes.length > 0 ? `(${notes.join(', ')}) ` : '') + summary;
      const label = member.kind === 'constructor' ? type.name : this.memberName(member);

      if (!sections.has(member.kind)) {
        sections.set(member.kind, []);
      }
      sections.get(member.kind).push(this.row(label, this.routes.memberMarkdown(type.slug, file), text));
    }

    return [...sections]
      .sort((a, b) => MEMBER_ORDER.indexOf(a[0]) - MEMBER_ORDER.indexOf(b[0]))
      .map(([kind, rows]) => `## ${theme.kindPlural(kind)}\n\n${rows.join('\n')}`)
      .join('\n\n');
  }

  /** What the type inherits, a line per base type, each name leading to where it is documented. */
  inherited(type) {
    const groups = new Map();
    for (const { member, from } of this.renderer.inheritedMembers(type)) {
      if (!groups.has(from)) {
        groups.set(from, []);
      }
      groups.get(from).push(member);
    }
    if (groups.size === 0) {
      return '';
    }

    const rows = [...groups].map(([from, list]) => {
      const names = new Map();
      for (const m of list) {
        const url = this.abs(this.routes.memberMarkdown(from.slug, memberFile(m)));
        names.set(memberFile(m), `[${memberDisplayName(m)}](${url})`);
      }
      const owner = `[${from.name}](${this.abs(this.routes.markdown(this.routes.type(from.slug)))})`;
      return `- From ${owner}: ${[...names.values()].join(', ')}`;
    });
    return `## Inherited Members\n\n${rows.join('\n')}`;
  }

  seeAlso(docs) {
    if (!docs || !docs.seeAlso || docs.seeAlso.length === 0) {
      return '';
    }
    const links = docs.seeAlso.map((ref) => {
      if (ref.href) {
        return `[${ref.label || ref.href}](${ref.href})`;
      }
      return this.typeLink({ id: ref.id, display: ref.label, asm: ref.asm });
    });
    return `## See Also\n\n${links.map((l) => `- ${l}`).join('\n')}`;
  }

  /** One member in full: what its card on the type page says, as Markdown. */
  memberBody(type, member, overloaded) {
    const docs = member.docs || {};
    const out = [];

    if (overloaded) {
      const params = CALLABLE_KINDS.has(member.kind)
        ? `(${(member.parameters || []).map((p) => p.type.display).join(', ')})`
        : '';
      const name = member.kind === 'constructor' ? type.name : this.memberName(member);
      out.push(`## ${name}${params}`);
    }

    const since = this.since(docs).replace(/^ · /, '');
    if (since) {
      out.push(since);
    }
    out.push(this.declaration(member.attributes, this.renderer.memberDeclaration(member, type.kind)));
    out.push(this.obsolete(member.obsolete));
    out.push(docnodes.toMarkdown(docs.summary, this.context));

    if (docs.remarks) {
      out.push(`**Remarks:** ${docnodes.toMarkdown(docs.remarks, this.context)}`);
    }
    if (docs.value) {
      out.push(`**Value:** ${docnodes.toMarkdown(docs.value, this.context)}`);
    }
    out.push(this.typeParameters(member));
    out.push(this.parameters(member.parameters));
    if (docs.returns) {
      out.push(`**Returns:** ${docnodes.toMarkdown(docs.returns, this.context)}`);
    }

    if (docs.exceptions && docs.exceptions.length > 0) {
      const rows = docs.exceptions.map((ex) => {
        const doc = ex.doc ? docnodes.toMarkdown(ex.doc, this.line) : '';
        return `- ${this.typeLink({ id: ex.id, display: ex.label })}${doc ? `: ${doc}` : ''}`;
      });
      out.push(`**Exceptions:**\n\n${rows.join('\n')}`);
    }

    if (member.overrides) {
      const label = this.renderer.overrideLabel(member.overrides);
      out.push(`**Overrides:** ${this.typeLink({ id: member.overrides, display: label })}`);
    }

    const implemented = (member.implements || [])
      .map((id) => {
        const entry = this.model.entry(id);
        return entry ? this.typeLink({ id, display: entry.name }) : '';
      })
      .filter(Boolean);
    if (implemented.length > 0) {
      out.push(`**Implements:** ${implemented.join(', ')}`);
    }

    if (hasExamplePage(member)) {
      const url = this.abs(this.routes.markdown(this.routes.example(type.slug, member.anchor)));
      out.push(`**Example:** [${lastSegment(member.name)} examples](${url})`);
    } else if (docs.example) {
      out.push(`**Example:**\n\n${docnodes.toMarkdown(docs.example, this.context)}`);
    }

    if (member.source && this.renderer.sourceRefs) {
      const root = this.renderer.sourceRefs.replace(/\/$/, '');
      out.push(`Source: ${root}/${member.source.file}:${member.source.line}`);
    }

    return this.join(out).trim();
  }
}

/**
 * Whether an Accept header asks for Markdown over HTML: text/markdown listed, and weighted at least
 * as high as text/html. Browsers never list it, so they keep getting pages.
 */
function prefersMarkdown(accept) {
  let md = 0;
  let html = 0;
  for (const part of String(accept || '').split(',')) {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map((p) => /^\s*q=([\d.]+)/.exec(p)).find(Boolean);
    const weight = q ? Number(q[1]) : 1;
    if (type.trim() === 'text/markdown') {
      md = weight;
    } else if (type.trim() === 'text/html') {
      html = weight;
    }
  }
  return md > 0 && md >= html;
}

module.exports = { MarkdownPages, prefersMarkdown };
