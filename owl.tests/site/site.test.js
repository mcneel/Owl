'use strict';

// Renders the site for owl.tests.source and checks what readers see.
//
//   node --test owl.tests/site/                        generates the samples' model first
//   OWL_TEST_MODEL=<dir> node --test owl.tests/site/   reuses a model already generated

const { test, before, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const site = path.join(repo, 'owl-site');
const docs = path.join(repo, 'owl.tests.source', 'docs', 'api');

const { Site } = require(path.join(site, 'lib', 'site'));
const { slugify } = require(path.join(site, 'lib', 'routes'));

let jsonDir = process.env.OWL_TEST_MODEL || '';

before(() => {
  if (jsonDir) return;
  jsonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'owl-site-test-'));
  execFileSync(
    'dotnet',
    [
      'run', '--project', path.join(repo, 'owl'), '--', 'gen',
      path.join(repo, 'owl.tests.source/CSharp/Samples.CSharp.csproj'),
      path.join(repo, 'owl.tests.source/VisualBasic/Samples.VisualBasic.vbproj'),
      '--out', jsonDir,
    ],
    { stdio: 'ignore' }
  );
});

/** A site over the samples' model; options as the Site constructor takes them. */
function make(options = {}) {
  const made = new Site({ jsonDir, ...options });

  const get = (url) => made.resolve(url, null, false);

  /** The page's html, failing when it is not a 200. */
  const html = (url) => {
    const result = get(url);
    assert.equal(result.status, 200, `${url} returned ${result.status}`);
    return result.body;
  };

  /** The page's visible text, so assertions do not depend on highlighting markup. */
  const text = (url) =>
    html(url)
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');

  const type = (name) => made.routes.type(slugify('Samples.' + name));

  return { site: made, get, html, text, type };
}

function check(...args) {
  execFileSync('node', [path.join(site, 'check.js'), '--json', jsonDir, ...args], { stdio: 'pipe' });
}

describe('site check', () => {
  test('passes without hand-written pages', () => check());
  test('passes with hand-written pages', () => check('--docs', docs));
  test('passes leaving out undocumented API', () => check('--docs', docs, '--skip-undocumented'));
});

describe('type pages', () => {
  const { text, html, type, get } = make();

  test('declarations name the right kind and modifiers', () => {
    assert.match(text(type('Pair')), /public record struct Pair/);
    assert.match(text(type('FinalName')), /public sealed record FinalName/);
    assert.match(text(type('CachedStore')), /public sealed class CachedStore : MemoryStore/);
    assert.match(text(type('Point')), /public struct Point/);
    assert.match(text(type('Shapes.Shape')), /public abstract class Shape/);
    assert.match(text(type('Shapes.ShapeExtensions')), /public static class ShapeExtensions/);
    assert.match(text(type('IStore')), /public interface IStore/);
    assert.match(text(type('VB.StoreHelpers')), /public module StoreHelpers/);
  });

  test('base types and interfaces follow the declaration', () => {
    assert.match(text(type('Members.Gadget')), /public class Gadget : IConverter<string, int>, IDisposable/);
    assert.match(text(type('VB.VbStore')), /public class VbStore : MemoryStore, IDisposable/);
  });

  test('structs and enums show no base type', () => {
    assert.doesNotMatch(text(type('Point')), /public struct Point :/);
    assert.doesNotMatch(text(type('Mode')), /public enum Mode :/);
    // A record struct implements IEquatable of itself, which is an interface, not a base type.
    assert.doesNotMatch(text(type('Pair')), /ValueType/);
  });

  test('internal types have no page', () => {
    assert.equal(get(type('InternalThing')).status, 404);
  });

  test('every member kind gets its section', () => {
    const page = text(type('Members.Gadget'));
    for (const section of ['Fields', 'Properties', 'Indexers', 'Events', 'Constructors', 'Finalizer', 'Methods', 'Convertors']) {
      assert.match(page, new RegExp(section), `no ${section} section`);
    }
  });

  test('member signatures are written out in full', () => {
    const page = text(type('Members.Gadget'));
    assert.match(page, /public const int MaxSize = 10/);
    assert.match(page, /public const Mode DefaultMode = Mode\.Disk/);
    assert.match(page, /public void Keep\(Mode mode = Mode\.Disk, Mode\? fallback = Mode\.Memory\)/);
    assert.match(page, /mode\s*Mode = Mode\.Disk/);
    assert.match(page, /public readonly int Id/);
    assert.match(page, /public string Label \{ get; \}/);
    assert.match(page, /public void Configure\(ref int a, out int b, in int c, int d = 5, params string\[\] rest\)/);
    assert.match(page, /IDisposable\.Dispose/);
    // Conversions are a table of kind, from and to.
    assert.match(page, /explicitintGadget/);
    assert.match(page, /implicitGadgetint/);
  });

  test('derived types are listed across projects', () => {
    const page = text(type('MemoryStore'));
    assert.match(page, /CachedStore/);
    assert.match(page, /VbStore/);
  });

  test('attributes sit above the declaration and link by doc id', () => {
    assert.match(text(type('Point')), /\[Serializable\]\s*public struct Point/);
    assert.match(html(type('Point')), /href="https:\/\/learn\.microsoft\.com\/dotnet\/api\/system\.serializableattribute"/);
    // A type argument links as any type does; a named argument's name is a property, not the Name type.
    const final = html(type('FinalName'));
    assert.match(final, /<a href="[^"]*">StoredBy<\/a>/);
    assert.match(final, /<a href="[^"]*">MemoryStore<\/a>/);
    assert.match(final, /<span class="tok-type">Name<\/span> <span class="tok-punct">=<\/span>/);

    // A framework enum only an attribute names still reaches Learn.
    assert.match(
      html(type('StoredByAttribute')),
      /<a href="https:\/\/learn\.microsoft\.com\/dotnet\/api\/system\.attributetargets"[^>]*>AttributeTargets<\/a>/
    );

    // Obsolete is the note's to say, not a line's, on a type as on a member.
    const old = text(type('OldStore'));
    assert.match(old, /Use MemoryStore instead/);
    assert.doesNotMatch(old, /\[Obsolete/);
    assert.doesNotMatch(text(type('Owned`1').replace('`', '-')), /\[Obsolete/);
  });

  test('obsolete members are marked', () => {
    assert.match(text(type('Owned`1').replace('`', '-')), /Obsolete/);
  });

  test('nested types have their own page', () => {
    assert.match(text(type('Shapes.Circle.Spot')), /Distance/);
  });
});

describe('doc comments', () => {
  const { html, text, type } = make();
  const tagged = () => html(type('Docs.Tagged'));

  test('crefs link to the type page', () => {
    assert.match(html(type('MemoryStore')), /href="\/type\/samples\.istore\/"/);
  });

  test('framework types link to Microsoft Learn', () => {
    assert.match(html(type('Members.Gadget')), /href="https:\/\/learn\.microsoft\.com\/dotnet\/api\/system\.idisposable"/);
  });

  test('web links, inline code and language words', () => {
    const page = tagged();
    assert.match(page, /href="https:\/\/example\.com"/);
    assert.match(page, /<code>inline code<\/code>/);
    assert.match(page, /langword-ref">null</);
  });

  test('paragraphs, lists, tables and notes', () => {
    const page = tagged();
    assert.match(page, /<ul/);
    assert.match(page, /<table/);
    assert.match(page, /class="note note-warning"/);
    assert.match(text(type('Docs.Tagged')), /Be careful\./);
  });

  test('parameters, returns, value and exceptions', () => {
    const page = text(type('Docs.Tagged'));
    assert.match(page, /What to find\./);
    assert.match(page, /True when found\./);
    assert.match(page, /Never negative\./);
    assert.match(page, /ArgumentNullException/);
  });

  test('inheritdoc shows the base member\'s docs', () => {
    assert.match(text(type('Shapes.Circle')), /The shape's area\./);
  });

  test('examples get a page, with the source file region', () => {
    const { site, text: pageText } = make();
    const url = site.routes.example(slugify('Samples.Docs.Tagged'), 'find-1-system.string');
    const page = pageText(url);
    assert.match(page, /var found = tagged\.Find<List<int>>\("a"\);/);
    assert.match(page, /bool found = tagged\.Find<string>\("key"\);/);
    assert.doesNotMatch(page, /outside the region/);
  });

  test('a missing example file is named on its page', () => {
    const { site, text: pageText } = make();
    const url = site.routes.example(slugify('Samples.Docs.Tagged'), 'noexample');
    assert.match(pageText(url), /could not be read from Examples\/Nowhere\.cs/);
  });

  test('a since tag shows as a chip', () => {
    assert.match(text(type('CachedStore')), /Since v2\.1/);
  });

  test('a deprecated tag adds Obsolete to the chip', () => {
    assert.match(html(type('Docs.Tagged')), /Since v2\.0 <span class="chip-deprecated">Obsolete v3\.0<\/span>/);
  });
});

describe('without hand-written pages', () => {
  const { get, text, site } = make();

  test('there are no category pages', () => {
    assert.equal(get(site.routes.category('Samples.CSharp', 'Storage')).status, 404);
  });

  test('the home page lists the namespaces', () => {
    const page = text(site.routes.home());
    assert.match(page, /Namespaces/);
    assert.match(page, /Samples\.Shapes/);
    assert.match(page, /Samples\.VB/);
  });

  test('namespaces have pages listing their types', () => {
    const page = text(site.routes.namespace('Samples.Shapes'));
    assert.match(page, /Circle/);
    assert.match(page, /ShapeExtensions/);
  });
});

describe('with hand-written pages', () => {
  const { html, text, site } = make({ apiDir: docs });

  test('the home page is MAIN.md, with its table and code', () => {
    const page = html(site.routes.home());
    assert.match(page, /The home page of the sample site\./);
    assert.match(page, /<table/);
    assert.match(page, /<pre><code/);
  });

  test('the header uses logo.svg', () => {
    assert.match(html(site.routes.home()), /6A3DE8/);
  });

  test('an assembly page is its MAIN.md', () => {
    assert.match(text(site.routes.assembly('Samples.CSharp')), /The C# half of the samples/);
  });

  test('an unwritten assembly page says where to add it', () => {
    assert.match(text(site.routes.assembly('Samples.VisualBasic')), /Samples\.VisualBasic\/MAIN\.md to author this page/);
  });

  test('a category page is its Markdown file, with math', () => {
    const page = html(site.routes.category('Samples.CSharp', 'Storage'));
    assert.match(page, /Everything that keeps values\./);
    assert.match(page, /<math/);
  });

  test('a category page lists its types, from both projects', () => {
    assert.match(text(site.routes.category('Samples.CSharp', 'Storage')), /MemoryStore.*CachedStore|CachedStore.*MemoryStore/);
    assert.match(text(site.routes.category('Samples.VisualBasic', 'Storage')), /VbStore/);
  });

  test('a category without a Markdown file still lists its types', () => {
    const page = text(site.routes.category('Samples.CSharp', 'Shapes'));
    assert.match(page, /Circle/);
    assert.match(page, /Shape/);
  });

  test('the sidebar lists the assembly\'s categories', () => {
    const page = text(site.routes.assembly('Samples.CSharp'));
    assert.match(page, /Shapes/);
    assert.match(page, /Storage/);
  });

  test('SORT.txt puts the sidebar\'s categories in its order', () => {
    const page = html(site.routes.assembly('Samples.VisualBasic'));
    assert.ok(page.indexOf('ns_cat_Storage') < page.indexOf('ns_cat_Helpers'), 'Storage should come before Helpers');
  });

  test('without SORT.txt the categories are alphabetical', () => {
    const page = html(site.routes.assembly('Samples.CSharp'));
    assert.ok(page.indexOf('ns_cat_Shapes') < page.indexOf('ns_cat_Storage'), 'Shapes should come before Storage');
  });
});

describe('category order', () => {
  /** A copy of the samples' pages with this SORT.txt in Samples.CSharp. */
  function withSort(sort) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owl-sort-test-'));
    fs.cpSync(docs, dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Samples.CSharp', 'SORT.txt'), sort);
    return make({ apiDir: dir });
  }

  test('unlisted categories follow the listed ones alphabetically, and Uncategorized stays last', () => {
    const { site } = withSort('# first\n\nstorage\n');
    const names = site.model.categoryTreeOfAssembly('Samples.CSharp').map((g) => g.category);
    assert.equal(names[0], 'Storage');
    assert.equal(names[1], 'Shapes');
    assert.equal(names.at(-1), '(Uncategorized)');
  });

  test('a name that is not a category is reported', () => {
    const { site } = withSort('Storage\nNowhere\n');
    assert.ok(site.model.warnings.some((w) => /no category named 'Nowhere'/.test(w)));
  });
});

describe('options', () => {
  test('--base prefixes every link', () => {
    const { html, site } = make({ base: '/api/samples' });
    const page = html(site.routes.home());
    assert.match(page, /href="\/api\/samples\/assets\/app\.css"/);
    assert.doesNotMatch(page, /href="\/type\//);
  });

  test('--site-url makes canonical links absolute', () => {
    const { html, type } = make({ siteUrl: 'https://example.com' });
    assert.match(html(type('MemoryStore')), /rel="canonical" href="https:\/\/example\.com\/type\/samples\.memorystore\/"/);
  });

  test('--source-refs links each member to its line', () => {
    const { html, type } = make({ sourceRefs: 'https://github.com/me/samples/blob/main' });
    assert.match(html(type('CachedStore')), /https:\/\/github\.com\/me\/samples\/blob\/main\/owl\.tests\.source\/CSharp\/Types\.cs#L\d+/);
  });

  test('no --source-refs, no source links', () => {
    const { html, type } = make();
    assert.doesNotMatch(html(type('CachedStore')), /Types\.cs/);
  });

  test('--api-versions adds the picker and tags what each version added', () => {
    const { html, text, type } = make({ apiVersions: '2,1' });
    assert.match(text(type('CachedStore')), /API versionv2v1/);
    assert.match(html(type('CachedStore')), /data-since="2\.1"/);
  });

  test('--api-versions needs numbers', () => {
    assert.throws(() => make({ apiVersions: 'latest' }), /needs a number/);
  });

  test('--skip-undocumented leaves out undocumented members', () => {
    assert.match(make().text(make().type('Docs.Tagged')), /Undocumented/);
    const { text, type } = make({ skipUndocumented: true });
    assert.doesNotMatch(text(type('Docs.Tagged')), /Undocumented \(/);
  });

  test('--link sends an assembly\'s types to another site', () => {
    const { html, type } = make({ links: ['System.Runtime=/api/dotnet'] });
    assert.match(html(type('Members.Gadget')), /href="\/api\/dotnet\/type\/system\.idisposable\/"/);
  });

  test('--link must be <assembly>=<url>', () => {
    assert.throws(() => make({ links: ['nonsense'] }), /expected <assembly>=<url>/);
  });

  test('--sandcastle redirects old page addresses', () => {
    const { get } = make({ sandcastle: true });
    assert.equal(get('/html/T_Samples_MemoryStore.htm').status, 301);
    assert.equal(get('/html/T_Samples_MemoryStore.htm').body !== undefined, true);
    assert.equal(get('/html/AllMembers_T_Samples_MemoryStore.htm').status, 301);
    assert.equal(get('/html/N_Samples_Shapes.htm').status, 301);
    assert.equal(get('/html/M_Samples_Members_Gadget__ctor_1.htm').status, 301);
    assert.equal(get('/html/Nothing_Here.htm').status, 404);
  });

  test('without --sandcastle, old addresses are not found', () => {
    assert.equal(make().get('/html/T_Samples_MemoryStore.htm').status, 404);
  });
});

describe('assets', () => {
  const { site } = make({ apiDir: docs });

  test('search covers types and members', () => {
    const search = JSON.stringify(JSON.parse(site.asset('search.json').body));
    assert.match(search, /MemoryStore/);
    assert.match(search, /Configure/);
    assert.doesNotMatch(search, /InternalThing/);
  });

  test('the stylesheet and script are served', () => {
    assert.equal(site.asset('app.css').status, 200);
    assert.equal(site.asset('app.js').status, 200);
  });

  test('sitemap and robots name the site', () => {
    const { site: withUrl } = make({ siteUrl: 'https://example.com' });
    assert.match(withUrl.renderer.sitemap('2026-01-01'), /<loc>https:\/\/example\.com\/type\/samples\.memorystore\/<\/loc>/);
    assert.match(withUrl.renderer.robots(), /Sitemap: https:\/\/example\.com\/sitemap\.xml/);
  });
});

describe('?plain and ?dark', () => {
  const vm = require('node:vm');
  const { html, type } = make();

  // The scripts in <head>, which run before the page paints.
  const scripts = [...html(type('MemoryStore')).split('</head>')[0].matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  /** Runs the head scripts at an address, with the system theme given, and returns what they did. */
  function load(search, { systemLight = false } = {}) {
    const attributes = new Map();
    const stored = [];
    let onClick = null;
    const origin = 'https://example.com';
    const context = {
      URL,
      URLSearchParams,
      location: { search, href: `${origin}/type/samples.memorystore/${search}`, origin },
      sessionStorage: { getItem: () => null, setItem: (k, v) => stored.push([k, v]) },
      matchMedia: () => ({ matches: systemLight }),
      document: {
        documentElement: {
          setAttribute: (k, v) => attributes.set(k, v),
          getAttribute: (k) => attributes.get(k),
        },
        addEventListener: (name, handler) => { if (name === 'click') onClick = handler; },
      },
    };
    for (const script of scripts) vm.runInNewContext(script, context);

    /** Clicks a link and returns where it now goes. */
    const click = (href, target = '') => {
      const a = { href: new URL(href, context.location.href).href, target };
      if (onClick) onClick({ target: { closest: () => a } });
      return a.href;
    };

    return { attributes, stored, click };
  }

  test('a normal visit is unchanged', () => {
    const { attributes, click } = load('', { systemLight: true });
    assert.equal(attributes.has('data-plain'), false);
    assert.equal(attributes.get('data-theme'), 'light');
    assert.equal(click('/type/samples.istore/'), 'https://example.com/type/samples.istore/');
  });

  test('plain hides the chrome and is light, whatever the system says', () => {
    const { attributes } = load('?plain=true');
    assert.equal(attributes.has('data-plain'), true);
    assert.equal(attributes.get('data-theme'), 'light');
  });

  test('plain and dark is dark', () => {
    const { attributes } = load('?plain=true&dark=true', { systemLight: true });
    assert.equal(attributes.has('data-plain'), true);
    assert.equal(attributes.get('data-theme'), 'dark');
    assert.equal(attributes.get('data-theme-pref'), 'dark');
  });

  test('dark alone only sets the theme', () => {
    const { attributes } = load('?dark=true', { systemLight: true });
    assert.equal(attributes.has('data-plain'), false);
    assert.equal(attributes.get('data-theme'), 'dark');
  });

  test('false turns either off', () => {
    const { attributes } = load('?plain=false', { systemLight: true });
    assert.equal(attributes.has('data-plain'), false);
    assert.equal(attributes.get('data-theme'), 'light');
    assert.equal(load('?plain=true&dark=false').attributes.get('data-theme'), 'light');
  });

  test('nothing is remembered for the next visit', () => {
    assert.deepEqual(load('?plain=true&dark=true').stored, []);
  });

  test('same-site links keep plain and dark', () => {
    const { click } = load('?plain=true&dark=true');
    assert.equal(click('/type/samples.istore/'), 'https://example.com/type/samples.istore/?plain=true&dark=true');
    assert.equal(click('/type/samples.istore/#read'), 'https://example.com/type/samples.istore/?plain=true&dark=true#read');
    assert.equal(click('/search/?q=store'), 'https://example.com/search/?q=store&plain=true&dark=true');
  });

  test('other sites and new tabs are left alone', () => {
    const { click } = load('?plain=true');
    assert.equal(click('https://learn.microsoft.com/dotnet/api/system.idisposable'), 'https://learn.microsoft.com/dotnet/api/system.idisposable');
    assert.equal(click('/type/samples.istore/', '_blank'), 'https://example.com/type/samples.istore/');
  });

  test('the stylesheet hides the header, sidebar and breadcrumbs', () => {
    const css = make().site.asset('app.css').body;
    for (const part of ['header', '.sidebar', '.resize-handle', '.breadcrumbs']) {
      assert.match(css, new RegExp(`:root\\[data-plain\\] ${part.replace('.', '\\.')}[,\\s{]`), `${part} is not hidden`);
    }
  });
});

describe('--docify', () => {
  const vm = require('node:vm');
  const { stub } = require(path.join(site, 'lib', 'docify'));
  const { get } = make({ docify: true });
  const plain = new URLSearchParams('plain=true&dark=true');

  /** Where a docify path is sent, asked the way the script editor asks. */
  const moved = (url, query = plain) => {
    const result = make({ docify: true }).site.resolve(url, query, false);
    assert.equal(result.status, 301, `${url} returned ${result.status}`);
    return result.location;
  };

  test('a type goes to its page, keeping the query', () => {
    assert.equal(moved('/samples.memorystore/'), '/type/samples.memorystore/?plain=true&dark=true');
  });

  test('a member goes to its card on the type page', () => {
    assert.equal(moved('/samples.memorystore/read'), '/type/samples.memorystore/?plain=true&dark=true#read-system.string');
    assert.equal(moved('/samples.shapes.circle.spot/distance'), '/type/samples.shapes.circle.spot/?plain=true&dark=true#distance');
  });

  test('a constructor is named after its type', () => {
    assert.equal(moved('/samples.members.gadget/gadget'), '/type/samples.members.gadget/?plain=true&dark=true#ctor');
  });

  test('overloads share a name, answered by the first', () => {
    assert.match(moved('/samples.members.gadget/configure'), /#configure-/);
  });

  test('generic types and explicit interface members', () => {
    assert.equal(moved('/samples.owned`1/clear'), '/type/samples.owned-1/?plain=true&dark=true#clear');
    assert.match(moved('/samples.members.gadget/system.idisposable.dispose'), /#system-idisposable-dispose$/);
  });

  test('case does not matter', () => {
    assert.equal(moved('/Samples.MemoryStore/Read'), moved('/samples.memorystore/read'));
  });

  test('without a query, none is added', () => {
    assert.equal(moved('/samples.memorystore/', null), '/type/samples.memorystore/');
  });

  test('under --base', () => {
    const result = make({ docify: true, base: '/api/samples' }).site.resolve('/api/samples/samples.memorystore/', plain, false);
    assert.equal(result.location, '/api/samples/type/samples.memorystore/?plain=true&dark=true');
  });

  test('unknown names and owl\'s own pages', () => {
    assert.equal(get('/samples.nothing/').status, 404);
    assert.equal(get('/samples.memorystore/nothing').status, 404);
    assert.equal(get('/type/samples.memorystore/').status, 200);
  });

  test('without --docify, docify paths are not found', () => {
    assert.equal(make().get('/samples.memorystore/').status, 404);
  });

  test('every documented type and member has a path to export', () => {
    const urls = new Map([...make({ docify: true }).site.docify.stubs()]);
    assert.equal(urls.get('/samples.memorystore/'), '/type/samples.memorystore/');
    assert.equal(urls.get('/samples.members.gadget/configure/'), '/type/samples.members.gadget/#configure-system.int32-system.int32-system.int32-system.int32-system.string');
  });

  test('an exported stub carries the query it was asked with', () => {
    const page = stub('/type/samples.memorystore/#read-system.string');
    const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
    let replaced = null;
    const location = { href: 'https://example.com/samples.memorystore/read/?plain=true&dark=true', search: '?plain=true&dark=true', replace: (u) => { replaced = u; } };
    vm.runInNewContext(script, { URL, location });
    assert.equal(replaced, 'https://example.com/type/samples.memorystore/?plain=true&dark=true#read-system.string');
  });

  // Rhino's script editor styles document.body as each page loads, and leaving from the head can
  // report a page loaded before it has one.
  test('redirect pages leave from the body, not the head', () => {
    const { stub: sandcastleStub } = require(path.join(site, 'lib', 'sandcastle'));
    for (const page of [stub('/type/samples.memorystore/'), sandcastleStub('/type/samples.memorystore/')]) {
      const [head, body] = page.split('<body>');
      assert.doesNotMatch(head, /<script/);
      assert.match(body, /<script>[\s\S]*location\.replace[\s\S]*<\/script>\s*<\/body>/);
    }
  });

  // A server that redirects from this list never hands the script editor a stub to load.
  test('the export lists every redirect for a server to answer', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'owl-site-redirects-'));
    execFileSync('node', [path.join(site, 'build.js'), '--json', jsonDir, '--out', out, '--base', '/api/samples',
      '--docify', '--sandcastle', '--quiet'], { stdio: 'pipe' });
    const moved = JSON.parse(fs.readFileSync(path.join(out, 'redirects.json'), 'utf8'));
    assert.equal(moved['/api/samples/samples.memorystore'], '/api/samples/type/samples.memorystore/');
    assert.equal(moved['/api/samples/html/t_samples_memorystore.htm'], '/api/samples/type/samples.memorystore/');
  });
});

describe('slugs', () => {
  test('are lower case and keep dots', () => {
    assert.equal(slugify('Samples.MemoryStore'), 'samples.memorystore');
  });
});
