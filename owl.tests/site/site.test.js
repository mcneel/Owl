'use strict';

// Renders the site for owl.tests.source and checks what readers see.
//
//   node --test owl.tests/site/                        generates the samples' model first
//   OWL_TEST_MODEL=<dir> node --test owl.tests/site/   reuses a model already generated

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
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

  test('tabs and sections follow the same order', () => {
    const page = html(type('Members.Gadget'));
    const tabs = [...page.matchAll(/class="filter-btn[^"]*"[^>]*data-kind="([^"]+)"/g)].map((m) => m[1]);
    const sections = [...page.matchAll(/class="ns-section type-section" id="([^"]+)"/g)].map((m) => m[1]);

    assert.deepEqual(tabs, ['all', 'constructor', 'field', 'property', 'indexer', 'method', 'event', 'operator', 'conversion']);
    assert.deepEqual(sections, ['constructor', 'destructor', 'field', 'property', 'indexer', 'method', 'event', 'operator', 'conversion']);
  });

  test('indexers have a tab of their own', () => {
    const page = html(type('Members.Gadget'));
    assert.match(page, /data-kind="indexer">Indexers<\/button>/);
    assert.match(page, /data-filter="indexer" data-kind="indexer"/);
  });

  test('member signatures are written out in full', () => {
    const page = text(type('Members.Gadget'));
    assert.match(page, /public const int MaxSize = 10/);
    assert.match(page, /public const Mode DefaultMode = Mode\.Disk/);
    assert.match(page, /public void Keep\(Mode mode = Mode\.Disk, Mode\? fallback = Mode\.Memory\)/);
    assert.match(page, /mode \(Mode = Mode\.Disk\)/);
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

  test('an extension method gets a page calling it both ways', () => {
    const { site, text: pageText, html: pageHtml, type: typeUrl } = make();
    const url = site.routes.example(slugify('Samples.Shapes.ShapeExtensions'), 'isover-samples.shapes.shape-system.double-system.double');
    const page = pageText(url);
    assert.match(page, /using Samples\.Shapes;/);
    assert.match(page, /bool result = shape\.IsOver\(maxArea, out double overArea\);/);
    assert.match(page, /result = ShapeExtensions\.IsOver\(shape, maxArea, out overArea\);/);
    assert.match(page, /clr\.ImportExtensions\(Samples\.Shapes\)/);
    assert.match(page, /result, over_area = shape\.IsOver\(max_area\)/);
    assert.match(page, /result, over_area = Samples\.Shapes\.ShapeExtensions\.IsOver\(shape, max_area\)/);
    assert.match(pageHtml(typeUrl('Shapes.ShapeExtensions')), new RegExp(`href="${url.replace(/[.?]/g, '\\$&')}"`));
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

  test('the namespace list shows namespace summaries', () => {
    assert.match(text(site.routes.home()), /Shapes and what can be done with them\./);
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

describe('xref links', () => {
  const { html, site, type } = make({ apiDir: docs });

  /** The see-ref an xref became, by the text it shows. */
  const ref = (label) => {
    const page = html(site.routes.category('Samples.CSharp', 'Storage'));
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const match = new RegExp(`<(a|span) class="see-ref[^"]*"(?: href="([^"]*)")?[^>]*>${escaped}</\\1>`).exec(page);
    assert.ok(match, `no see-ref reading ${label}`);
    return match[2] || '';
  };

  test('a type, labelled with its name', () => {
    assert.equal(ref('CachedStore'), type('CachedStore'));
  });

  test('a member keeps the label it was given', () => {
    assert.equal(ref('reading'), type('CachedStore') + '#read-system.string');
  });

  test('generics, constructors and doc ids', () => {
    assert.equal(ref('Owned<T>'), type('Owned`1'));
    assert.equal(ref('Gadget.Gadget(int)'), type('Members.Gadget') + '#ctor-system.int32');
    assert.equal(ref('Gadget.Pick'), type('Members.Gadget') + '#pick-1-0-0');
  });

  test('a namespace', () => {
    assert.equal(ref('Samples.Docs'), site.routes.namespace('Samples.Docs'));
  });

  test('keywords and framework names lead to Learn', () => {
    assert.equal(ref('string'), 'https://learn.microsoft.com/dotnet/api/system.string');
    assert.equal(ref('System.IO.Stream.Read'), 'https://learn.microsoft.com/dotnet/api/system.io.stream.read');
  });

  test('an ambiguous or unknown name is text, with a warning naming the file', () => {
    assert.equal(ref('Read'), '');
    assert.equal(ref('NoSuchThing'), '');

    const warnings = site.model.warnings.filter((w) => w.includes('xref:'));
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /Storage\.md: xref:Read could mean any of/);
    assert.match(warnings[1], /Storage\.md: xref:NoSuchThing names nothing documented/);
  });

  test('verify.js lists them and fails', () => {
    const verify = path.join(repo, 'owl-site', 'verify.js');
    const run = () => execFileSync('node', [verify, '--json', jsonDir, '--docs', docs], { stdio: 'pipe' });
    assert.throws(run, (err) => err.status === 1 && /2 broken xref link\(s\)/.test(String(err.stdout)));
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

describe('search scope', () => {
  test('narrows to the assembly the picker shows', () => {
    const { html, type } = make({ apiDir: docs });
    const page = html(type('MemoryStore'));
    assert.match(page, /id="asm-filter"/);
    assert.match(page, /data-scope="samples\.csharp"/);
  });

  test('searches the whole API where there is no picker', () => {
    const { html, type } = make();
    const page = html(type('MemoryStore'));
    assert.doesNotMatch(page, /id="asm-filter"/);
    assert.match(page, /data-scope=""/);
    assert.doesNotMatch(page, /name="a"/);
  });
});

describe("what's new", () => {
  const { site, get, html } = make({ apiDir: docs, apiVersions: '3,2.1,2' });

  test('needs --api-versions', () => {
    const { get: plain, html: plainHtml, site: plainSite } = make({ apiDir: docs });
    assert.equal(plain('/whatsnew/').status, 404);
    assert.equal(plain('/whatsnew/2.1/').status, 404);
    assert.equal(plainSite.asset('whatsnew.json').status, 404);
    assert.doesNotMatch(plainHtml(plainSite.routes.home()), /whatsnew-link/);
  });

  test('a single version gets no header link', () => {
    assert.doesNotMatch(make({ apiVersions: '3' }).html('/'), /whatsnew-link/);
  });

  test('the header links to the newest version', () => {
    assert.match(html(site.routes.home()), /<a id="whatsnew-link" href="\/whatsnew\/3\/" data-root="\/whatsnew\/">/);
  });

  test('a version, a pair or neither has a page', () => {
    for (const url of ['/whatsnew/', '/whatsnew/2.1/', '/whatsnew/9/', '/whatsnew/2...3/', '/whatsnew/6.0...9.0/']) {
      assert.equal(get(url).status, 200, url);
    }
    assert.equal(get('/whatsnew/latest/').status, 404);
    assert.equal(get('/whatsnew/1...2...3/').status, 404);
  });

  test('the page pins its heading, filter box and toggles', () => {
    const page = html('/whatsnew/2/');
    assert.match(page, /<div class="page-head sticky-head whatsnew-head">\s*<div class="page-head-brief">/);
    assert.match(page, /class="derived-filter-row whatsnew-filter"><input type="search" class="derived-filter" placeholder="Filter Changes"/);
    assert.match(page, /id="whatsnew-added" aria-pressed="true"[^>]*>Added<\/button>/);
    assert.match(page, /id="whatsnew-obsolete" aria-pressed="true"[^>]*>Obsolete<\/button>/);
  });

  test('the page shows how to compare two versions', () => {
    assert.match(html('/whatsnew/2/'), /<code>\/whatsnew\/X\.x\.\.\.X\.x\/<\/code>: it lists/);
    assert.doesNotMatch(make({ apiVersions: '3' }).html('/whatsnew/'), /whatsnew-note/);
  });

  test('the bare url is the newest version under another name', () => {
    assert.match(html('/whatsnew/'), /<link rel="canonical" href="\/whatsnew\/3\/">/);
  });

  test('each listed version is in the sitemap', () => {
    const urls = site.renderer.sitemapUrls();
    for (const version of ['3', '2.1', '2']) assert.ok(urls.includes(`/whatsnew/${version}/`), version);
    assert.ok(!urls.includes('/whatsnew/'));
  });

  test('the asset holds every tagged type and member, and nothing else', () => {
    const asset = JSON.parse(site.asset('whatsnew.json').body);
    const row = (name) => asset.types.find((t) => t[0] === name);

    assert.deepEqual(row('Samples.CachedStore').slice(3, 6), ['2.1', '', []]);
    assert.deepEqual(row('Samples.Docs.Tagged').slice(3, 5), ['2.0', '3.0']);
    assert.equal(row('Samples.OldStore'), undefined);

    const gadget = row('Samples.Members.Gadget');
    assert.deepEqual(gadget.slice(3, 5), ['', '']);
    const members = Object.fromEntries(gadget[5].map((m) => [`${m[0]}(${m[1]})`, m]));
    assert.deepEqual(members['Gadget(int)'].slice(4), ['2.1', '']);
    assert.deepEqual(members['Keep(Mode, Mode?)'].slice(4), ['', '2.1']);
    assert.equal(Object.keys(members).length, 2);
  });
});

describe('references', () => {
  const { site, html, type } = make();
  const asset = JSON.parse(site.asset('references.json').body);

  /** What uses a sample type, as 'how label' lines. */
  const uses = (name) => {
    const found = asset.refs[slugify('Samples.' + name)];
    if (!found) return [];
    return found[1]
      .map(([user, how]) => {
        const u = asset.users[user];
        const label = u[6] === 1 ? `${u[5]} ${u[0]}` : u[6] === 2 ? `${u[0]} ${u[5]}` : u[0];
        return `${asset.kinds[how]} ${label}`;
      })
      .sort();
  };

  test('one noindex page answers every type', () => {
    const page = html('/references/');
    assert.match(page, /<meta name="robots" content="noindex/);
    assert.match(page, /id="refs" data-src="\/assets\/references\.json"/);
    assert.match(page, /<div class="filter-bar refs-tabs" hidden><\/div>/);
    assert.ok(!site.renderer.sitemapUrls().some((url) => url.includes('/references/')));
  });

  test('lists every way a signature uses a type', () => {
    assert.deepEqual(uses('MemoryStore'), ['attribute FinalName', 'base CachedStore', 'base VbStore']);
    assert.deepEqual(uses('IStore'), ['interface MemoryStore', 'parameter StoreHelpers.ReadFrom']);
    assert.deepEqual(uses('StoredByAttribute'), ['attribute FinalName']);
    assert.ok(uses('Mode').includes('parameter ShapeExtensions.Keep'));
  });

  test('finds a type inside generics and arrays', () => {
    const point = uses('Point');
    assert.ok(point.includes('returns Route.Stops'));
    assert.ok(point.includes('returns Route.Named'));
    assert.ok(point.includes('returns Route.Corners'));
    assert.ok(uses('Name').includes('parameter Route.Corners'));
  });

  test('operators are one group of their own, written as declared', () => {
    // Point's own, and two of Route's: one that takes a point, one that returns one.
    assert.deepEqual(uses('Point').filter((line) => line.includes('operator')), [
      'operator Point operator +',
      'operator Point operator ~',
      'operator Route operator +',
    ]);
    assert.deepEqual(uses('Members.Gadget').filter((line) => line.startsWith('operator')), [
      'operator Gadget operator +',
      'operator explicit operator Gadget',
      'operator implicit operator int',
    ]);
  });

  test('a type written inside a base is not derived from', () => {
    assert.ok(uses('Point').includes('baseargument PointList'));
    assert.ok(!uses('Point').includes('base PointList'));
    assert.ok(uses('Name').includes('baseargument PointList'));
    assert.ok(!uses('Name').includes('interface PointList'));
  });

  test('a use carries its return type', () => {
    const user = (label) => asset.users.find((u) => u[0] === label);
    assert.equal(user('Route.Stops')[5], 'List<Point>');
    assert.equal(user('Route.Corners')[5], 'Point[]');
    assert.equal(user('Route.Corners')[1], 'Owned<Name>');
  });

  test('a member is listed where it is declared, not where it is inherited', () => {
    assert.ok(!uses('Shapes.Shape').some((line) => line.includes('Circle.')));
  });

  test('a type page links to its references only when something uses it', () => {
    assert.match(html(type('Point')), /<a class="chip chip-refs" href="\/references\/\?type=samples\.point">References<\/a>/);
    assert.doesNotMatch(html(type('OldStore')), /chip-refs/);
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

  test('search finds fully qualified names as name matches', () => {
    const names = (q) => site.renderer.searchIndexEntries(q, 10).rows.map((row) => row.name);
    assert.equal(names('Samples.MemoryStore')[0], 'MemoryStore');
    assert.equal(names('Samples.MemoryStore.Read')[0], 'MemoryStore.Read');
    assert.equal(names('samples.memorystore.re')[0], 'MemoryStore.Read');
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

describe('?plain, ?dark and ?version', () => {
  const vm = require('node:vm');
  const { html, type } = make();

  // The scripts in <head>, which run before the page paints.
  const scripts = [...html(type('MemoryStore')).split('</head>')[0].matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  /** Runs the head scripts at an address, with the system theme given, and returns what they did. */
  function load(search, { systemLight = false } = {}) {
    const attributes = new Map();
    const stored = [];
    let onClick = null;
    let onSubmit = null;
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
        addEventListener: (name, handler) => {
          if (name === 'click') onClick = handler;
          if (name === 'submit') onSubmit = handler;
        },
        createElement: () => ({}),
      },
    };
    for (const script of scripts) vm.runInNewContext(script, context);

    /** Clicks a link and returns where it now goes. */
    const click = (href, target = '') => {
      const a = { href: new URL(href, context.location.href).href, target };
      if (onClick) onClick({ target: { closest: () => a } });
      return a.href;
    };

    /** Submits a GET form holding the given fields and returns the names of what it now sends. */
    const submit = (fields = ['q']) => {
      const form = { method: 'get', elements: Object.fromEntries(fields.map((f) => [f, {}])), added: [] };
      form.appendChild = (input) => form.added.push(input);
      if (onSubmit) onSubmit({ target: form });
      return [...fields, ...form.added.map((input) => `${input.name}=${input.value}`)];
    };

    return { attributes, stored, click, submit };
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

  test('same-site links keep the version', () => {
    const { attributes, click } = load('?version=8');
    assert.equal(attributes.has('data-plain'), false);
    assert.equal(click('/type/samples.istore/'), 'https://example.com/type/samples.istore/?version=8');
    assert.equal(click('/type/samples.istore/?version=9'), 'https://example.com/type/samples.istore/?version=9');
  });

  test('all three travel together', () => {
    const { click } = load('?plain=true&dark=true&version=8');
    assert.equal(click('/type/samples.istore/#read'), 'https://example.com/type/samples.istore/?plain=true&dark=true&version=8#read');
  });

  test('navigations the page script makes keep the same parameters as links', () => {
    const js = make().site.asset('app.js').body;
    const head = scripts.find((script) => script.includes("'version'"));
    assert.match(head, /\['plain','dark','version'\]/);
    assert.match(js, /VERSION_PARAM = 'version'/);
    assert.match(js, /\['plain', 'dark', VERSION_PARAM\]/);
  });

  test('the picked version is not remembered between visits', () => {
    assert.doesNotMatch(make().site.asset('app.js').body, /docs-version/);
  });

  test('searches keep the version, but not over a field of the same name', () => {
    assert.deepEqual(load('?version=8').submit(), ['q', 'version=8']);
    assert.deepEqual(load('?version=8').submit(['q', 'version']), ['q', 'version']);
    assert.deepEqual(load('').submit(), ['q']);
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

  test('an old url keeps its version', () => {
    assert.equal(moved('/samples.memorystore/', new URLSearchParams('version=8')), '/type/samples.memorystore/?version=8');
  });

  test('a member goes to its card on the type page', () => {
    assert.equal(moved('/samples.memorystore/read'), '/type/samples.memorystore/?member=read-system.string&plain=true&dark=true#read-system.string');
    assert.equal(moved('/samples.shapes.circle.spot/distance'), '/type/samples.shapes.circle.spot/?member=distance&plain=true&dark=true#distance');
  });

  test('a constructor is named after its type', () => {
    assert.equal(moved('/samples.members.gadget/gadget'), '/type/samples.members.gadget/?member=ctor&plain=true&dark=true#ctor');
  });

  test('overloads share a name, answered by the first', () => {
    assert.match(moved('/samples.members.gadget/configure'), /#configure-/);
  });

  test('generic types and explicit interface members', () => {
    assert.equal(moved('/samples.owned`1/clear'), '/type/samples.owned-1/?member=clear&plain=true&dark=true#clear');
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
    assert.equal(urls.get('/samples.members.gadget/configure/'), '/type/samples.members.gadget/?member=configure-system.int32-system.int32-system.int32-system.int32-system.string#configure-system.int32-system.int32-system.int32-system.int32-system.string');
  });

  test('an exported stub carries the query it was asked with', () => {
    const page = stub('/type/samples.memorystore/?member=read-system.string#read-system.string');
    const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
    let replaced = null;
    const location = { href: 'https://example.com/samples.memorystore/read/?plain=true&dark=true', search: '?plain=true&dark=true', replace: (u) => { replaced = u; } };
    vm.runInNewContext(script, { URL, location });
    assert.equal(replaced, 'https://example.com/type/samples.memorystore/?member=read-system.string&plain=true&dark=true#read-system.string');
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

// A link previewer never sees the fragment, so a member's shared url names it in the query too.
describe('member previews', () => {
  const made = make();

  /** The head of a type page asked for with a query. */
  const head = (url, query) => {
    const result = made.site.resolve(url, new URLSearchParams(query), false);
    assert.equal(result.status, 200, `${url}?${query} returned ${result.status}`);
    return result.body.split('</head>')[0];
  };

  test('a member is shared by its type page, named in the query and the fragment', () => {
    assert.equal(made.site.routes.sharedMember('samples.memorystore', 'read-system.string'),
      '/type/samples.memorystore/?member=read-system.string#read-system.string');
  });

  test('a type page shared for a member previews as that member', () => {
    const page = head('/type/samples.memorystore/', 'member=read-system.string');
    assert.match(page, /<title>MemoryStore\.Read method \| /);
    assert.match(page, /<meta property="og:title" content="MemoryStore\.Read method">/);
    assert.match(page, /<meta property="og:description" content="Reads the value stored under key\.">/);
    assert.match(page, /<link rel="canonical" href="\/type\/samples\.memorystore\/">/);
    assert.match(page, /<meta property="og:url" content="\/type\/samples\.memorystore\/\?member=read-system\.string">/);
    assert.match(page, /<meta property="og:ignore_canonical" content="true">/);
  });

  test('overloads preview with their parameters', () => {
    assert.match(head('/type/samples.members.gadget/', 'member=ctor-system.int32'), /<title>Gadget constructor \(int\) \| /);
  });

  test('a member the type does not declare previews as the type', () => {
    assert.equal(head('/type/samples.memorystore/', 'member=nothing'), made.html('/type/samples.memorystore/').split('</head>')[0]);
  });
});

// The exported server answers what a plain file host cannot: old urls and member previews.
describe('exported server', () => {
  let server;
  let root;

  before(async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'owl-site-server-'));
    execFileSync('node', [path.join(site, 'build.js'), '--json', jsonDir, '--out', out, '--base', '/api/samples',
      '--docify', '--api-versions', '3,2', '--server', '--quiet'], { stdio: 'pipe' });

    server = spawn('node', [path.join(out, 'server.js')], { env: { ...process.env, PORT: '0' } });
    const port = await new Promise((resolve) => {
      server.stdout.on('data', (chunk) => {
        const found = /listening on (\d+)/.exec(String(chunk));
        if (found) resolve(found[1]);
      });
    });
    root = `http://localhost:${port}`;
  });

  after(() => server.kill());

  /** The head of the page the server answers url with. */
  const head = async (url) => (await (await fetch(root + url)).text()).split('</head>')[0];

  test("answers any What's New comparison with the one page", async () => {
    const shell = await (await fetch(`${root}/api/samples/whatsnew/`)).text();
    assert.equal((await fetch(`${root}/api/samples/whatsnew/2/`)).status, 200);
    const pair = await fetch(`${root}/api/samples/whatsnew/6.0...9.0/`);
    assert.equal(pair.status, 200);
    assert.equal(await pair.text(), shell);
    assert.equal((await fetch(`${root}/api/samples/assets/whatsnew.json`)).status, 200);
    assert.equal((await fetch(`${root}/api/samples/references/?type=samples.point`)).status, 200);
    assert.equal((await fetch(`${root}/api/samples/assets/references.json`)).status, 200);
  });

  test('sits beside the pages rather than among them', async () => {
    assert.equal((await fetch(`${root}/api/samples/server.js`)).status, 404);
    assert.equal((await fetch(`${root}/api/samples/type/samples.memorystore/`)).status, 200);
  });

  test('previews a shared member card as that member', async () => {
    const page = await head('/api/samples/type/samples.memorystore/?member=read-system.string');
    assert.match(page, /<title>MemoryStore\.Read method \| /);
    assert.match(page, /<meta property="og:title" content="MemoryStore\.Read method">/);
    assert.match(page, /<meta name="description" content="Reads the value stored under key\.">/);
    assert.match(page, /<meta property="og:description" content="Reads the value stored under key\.">/);
    assert.match(page, /<meta property="og:url" content="\/api\/samples\/type\/samples\.memorystore\/\?member=read-system\.string">/);
    assert.match(page, /<link rel="canonical" href="\/api\/samples\/type\/samples\.memorystore\/">/);
    assert.match(page, /<meta property="og:ignore_canonical" content="true">/);
  });

  test('previews enum values and operators from their rows', async () => {
    assert.match(await head('/api/samples/type/samples.mode/?member=memory'), /<title>Mode\.Memory value \| /);
    assert.match(await head('/api/samples/type/samples.point/?member=op-addition-samples.point-samples.point'),
      /<meta property="og:description" content="Adds two points\.">/);
  });

  test('previews a member the type does not declare as the type', async () => {
    assert.equal(await head('/api/samples/type/samples.memorystore/?member=nothing'),
      await head('/api/samples/type/samples.memorystore/'));
  });

  test('redirects old urls with their query', async () => {
    const res = await fetch(`${root}/api/samples/samples.memorystore?plain=true`, { redirect: 'manual' });
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), '/api/samples/type/samples.memorystore/?plain=true');
  });

  test('redirects old member urls with their query beside the member', async () => {
    const res = await fetch(`${root}/api/samples/samples.memorystore/read?plain=true&dark=true`, { redirect: 'manual' });
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'),
      '/api/samples/type/samples.memorystore/?member=read-system.string&plain=true&dark=true#read-system.string');
  });

});

describe('slugs', () => {
  test('are lower case and keep dots', () => {
    assert.equal(slugify('Samples.MemoryStore'), 'samples.memorystore');
  });
});
