'use strict';

/**
 * The site's visual vocabulary: what each kind is drawn as, in what colour, and the per-assembly
 * palette.
 *
 * A kind is said three ways here, because a row, a card and a tab each need a different length of
 * answer. The drawing is what a reader scanning a list sees. The label - Class, Method - is the word
 * a card has room for. The letter is neither: it is the group the kind is filtered under, so the
 * model's finer-grained kinds collapse to a handful of tabs, and it is what the tab and the marks it
 * filters read their shared colour from.
 */

/**
 * No kind colours here, and that is the point: every kind is drawn in one ink, `--kind`.
 *
 * The drawing is what tells a method from a property, so a colour doing the same job again would only
 * be a second thing to learn - and a list whose every row was a different colour was a list that
 * shouted. With one ink there is nothing to key by letter and nothing for a renderer to look up: the
 * stylesheet paints every drawing, badge and tab marker from the one property, and lib/assets.js
 * chooses its value per theme, beside --flash and the rest of the colours a theme decides.
 *
 * It stays out of the way of the two marks that are allowed a colour, both of which say something is
 * unusual about the API rather than what kind it is: Explicit and the obsolete note.
 */

/**
 * Badge colours that say something other than what kind a member is.
 *
 * `explicit` paints the badge and the card's border together, since the border is there to make the
 * badge's point at a glance. One colour under either theme, which is why it is stated here.
 */
const BADGE_PAINTS = {
  explicit: 'var(--oc-blue-4)',
};

/**
 * The one note that is a warning rather than an aside: the message saying why an API is obsolete.
 *
 * It is a warning rather than a fact about how the member works, which is why it is not grey;
 * orange is what a reader already reads as a warning - the one voice left at full volume on a
 * card the stylesheet otherwise greys out. One colour under both themes, like the badges above.
 */
const NOTE_PAINTS = {
  obsolete: 'var(--oc-orange-5)',
};

/**
 * Model kind -> [letter, human label].
 *
 * The letter is a filter group and a colour slot, not something a row shows; FILTER_LETTERS overrides
 * it where the two answers differ.
 */
const KIND_MAP = {
  // Types group under T, except an interface: a contract reads differently enough from the rest to
  // carry its own tab. A struct keeps a badge and a colour of its own, being a value type, but
  // filters in with the rest of the types - see FILTER_LETTERS.
  class: ['T', 'Class'],
  interface: ['I', 'Interface'],
  struct: ['S', 'Struct'],
  // E for what it is: an enum is worth a colour of its own, and its values are grouped with it.
  enum: ['E', 'Enum'],
  delegate: ['T', 'Delegate'],
  record: ['T', 'Record'],
  'record struct': ['S', 'Record struct'],
  // Visual Basic's Module: a class that is all shared members and cannot be instantiated. Named as
  // the language names it, because that is what its page is titled and what a reader went looking
  // for - but it groups and draws with the classes, being one in everything but the keyword.
  module: ['T', 'Module'],

  // Members
  method: ['M', 'Method'],
  constructor: ['C', 'Constructor'],
  destructor: ['F', 'Finalizer'],
  operator: ['M', 'Operator'],
  conversion: ['M', 'Convertor'],
  property: ['P', 'Property'],
  indexer: ['P', 'Indexer'],
  field: ['F', 'Field'],
  // V rather than the F it was: an enum value is not a field to anyone reading one, whatever the two
  // have in common underneath. The badge is the whole of what V is for now - the tab it used to have
  // is gone, and an enum value filters with the enum it belongs to. See FILTER_LETTERS.
  enumvalue: ['V', 'Enum value'],
  event: ['E', 'Event'],
};

/**
 * Model kind -> the icon drawn for it, named after its file in owl-site/icons.
 *
 * Fewer drawings than kinds, and deliberately: an operator and a conversion are methods written
 * differently, an indexer is a property reached differently, and a record is a class with a
 * constructor written into its declaration. Each is worth its own word in a heading and not its own
 * drawing in a list, where a shape that means almost the same as its neighbour is a shape to read
 * twice. A finalizer takes the constructor's drawing, the two being the ends of one object's life,
 * and an enum value takes the constant's, which is what one is.
 *
 * A delegate is the exception worth naming: it is a type, but the thing it describes is a call, so
 * it takes the method drawing rather than the class one.
 */
const KIND_ICONS = {
  class: 'class',
  interface: 'interface',
  struct: 'struct',
  enum: 'enum',
  delegate: 'method',
  record: 'class',
  'record struct': 'struct',
  module: 'class',

  method: 'method',
  operator: 'method',
  conversion: 'method',
  constructor: 'constructor',
  destructor: 'constructor',
  property: 'property',
  indexer: 'property',
  field: 'field',
  enumvalue: 'constant',
  event: 'event',
};

/**
 * Kinds filtered under a letter other than the one on their badge.
 *
 * Two things put a kind here. E is worn by an enum and by an event, which are not one kind and must
 * not be one tab: a search lists both, so the letter alone cannot say which tab a row belongs under.
 * The rest are here because their badge is worth keeping and their tab was not - T has become the
 * tab for what a reader does not go looking for by kind. A struct is a type like any other in a list
 * of them, an enum value is read with the enum that declares it, and a constructor or a finalizer is
 * not something anyone scans a list of types for the way they scan it for a class.
 *
 * The badge answers what the reader is looking at; this answers which button shows it.
 *
 * Members are only ever incidental here - a search lists them, a list of types does not. Where the
 * page is one type and its members are the whole of what is listed, MEMBER_FILTERS is the rule
 * instead.
 */
const FILTER_LETTERS = {
  enum: 'T',
  struct: 'T',
  'record struct': 'T',
  enumvalue: 'T',
  constructor: 'T',
  destructor: 'T',
};

/**
 * The filter buttons over a list of types - a namespace, an assembly, a page of search results - in
 * the order they appear in the bar. One per filter letter rather than per badge letter -
 * FILTER_LETTERS folds some kinds in with others - so nothing a row can carry is left unreachable;
 * a page renders only the ones its own contents use.
 *
 * Interfaces leads Types because it is the narrower of the two: Types is what is left once the
 * contracts are taken out, so it reads as the wider bucket sitting after the one it excludes.
 *
 * A search's results are a list of types with members mixed in, which is why the member letters are
 * here too. A type page's bar is MEMBER_FILTER_KINDS and shares none of this.
 */
const FILTER_KINDS = [
  { key: 'all', label: 'All' },
  { key: 'I', label: 'Interfaces' },
  { key: 'T', label: 'Types' },
  { key: 'M', label: 'Methods' },
  { key: 'P', label: 'Properties' },
  { key: 'F', label: 'Fields' },
  { key: 'E', label: 'Events' },
];

/**
 * Which tab a kind filters under on a type page, where what is listed is one type's members.
 *
 * A vocabulary of its own rather than a second reading of the letters above, because the two bars
 * are asked different questions. A list of types is sorted by what each thing is, and a constructor
 * appearing in one is a stray detail of some type - which is what lands it in T with the rest of
 * what nobody browses by kind. A type page is already about one type, so the only question left is
 * which of its members you came for, and the tabs answer it in the words the sections below use.
 *
 * Indexers, operators and conversions carry tabs of their own rather than filing under Properties
 * or Methods: each is a section of its own on the page, and the tab is worded from the section it
 * narrows to. A finalizer files with the constructors, which is why that tab names both: a type declares at
 * most one, and a tab that narrows a list to a single row is a tab nobody needs - the two together
 * are the one thing they state, which is how the type begins and ends. An enum value is the field
 * it is underneath: an enum page lists nothing else, so a Values tab would be a button that never
 * narrows anything.
 *
 * Type kinds are not here because no type page lists one: a nested type is a type in its own right
 * in this model, with its own page, reached from the tree and from the namespace it lives in.
 */
const MEMBER_FILTERS = {
  constructor: 'constructor',
  destructor: 'constructor',
  method: 'method',
  operator: 'operator',
  conversion: 'conversion',
  property: 'property',
  indexer: 'indexer',
  field: 'field',
  enumvalue: 'field',
  event: 'event',
};

/**
 * The type page's tabs, in the order they appear in the bar.
 *
 * The same order the page lists its sections in (MEMBER_ORDER in pages.js), so a tab and the
 * section it narrows to sit in the same place.
 *
 * A page renders only the ones its own members use, inherited members included, and memberFilterTabs
 * is what settles both that and the wording of the first tab.
 */
const MEMBER_FILTER_KINDS = [
  { key: 'all', label: 'All' },
  { key: 'constructor', label: 'Constructors' },
  { key: 'field', label: 'Fields' },
  { key: 'property', label: 'Properties' },
  { key: 'indexer', label: 'Indexers' },
  { key: 'method', label: 'Methods' },
  { key: 'event', label: 'Events' },
  { key: 'operator', label: 'Operators' },
  { key: 'conversion', label: 'Convertors' },
];

function kindLetter(kind) {
  const entry = KIND_MAP[kind];
  return entry ? entry[0] : '?';
}

/**
 * Which drawing this kind wears. Anything unrecognised falls in with the classes, the way an
 * unrecognised colour falls in with the constructors: a type is what a kind the model grew is
 * likeliest to be.
 */
function kindIcon(kind) {
  return Object.prototype.hasOwnProperty.call(KIND_ICONS, kind) ? KIND_ICONS[kind] : 'class';
}

/**
 * The letter this kind is filtered under, which is its badge's unless FILTER_LETTERS says otherwise.
 *
 * A row in a list of types carries the answer as its data-filter, for the kind tabs to match on;
 * everything that draws a badge asks kindLetter instead. The two are the same answer for every kind
 * but the ones FILTER_LETTERS names. A type page's members answer to memberFilterKey.
 */
function filterLetter(kind) {
  return Object.prototype.hasOwnProperty.call(FILTER_LETTERS, kind)
    ? FILTER_LETTERS[kind]
    : kindLetter(kind);
}

/**
 * The tab this kind filters under on a type page.
 *
 * Anything unrecognised falls in with the methods, the way an unrecognised kind falls in with the
 * classes when a drawing is asked for: whatever the model grows, a thing listed under a type is
 * likelier to be called than not - and a key no tab offers is a member only All can reach.
 */
function memberFilterKey(kind) {
  return Object.prototype.hasOwnProperty.call(MEMBER_FILTERS, kind) ? MEMBER_FILTERS[kind] : 'method';
}

/**
 * The tabs a type page offers, given the kinds of member it lists - declared and inherited both.
 *
 * Only the tabs its own members answer to, so no button on the row does nothing when pressed. The
 * first is worded from what the page holds rather than from what the tab could hold: a type with no
 * finalizer says Constructors, and one that declares a finalizer and no constructor worth listing
 * says Finalizer. Naming both on every page would have most of them promising a member that is not
 * there - and the pages that do declare one are exactly where the word earns its space.
 *
 * @param {Set<string>} kinds  member kinds, not filter keys: which tab the finalizer is named in
 *   cannot be read back out of the key it shares with the constructors.
 */
function memberFilterTabs(kinds) {
  const keys = new Set([...kinds].map(memberFilterKey));

  return MEMBER_FILTER_KINDS.filter((tab) => tab.key === 'all' || keys.has(tab.key)).map((tab) => {
    if (tab.key !== 'constructor') return tab;

    const named = [kinds.has('constructor') ? 'Constructors' : '', kinds.has('destructor') ? 'Finalizer' : ''];
    return { key: tab.key, label: named.filter(Boolean).join(' & ') };
  });
}

function kindLabel(kind) {
  const entry = KIND_MAP[kind];
  return entry ? entry[1] : kind;
}

/**
 * The label a group of this kind is headed with. Spelled out rather than label + 's', because
 * 'Property' pluralises to 'Properties' and the section headings are uppercased, which turns a
 * wrong plural into a shout.
 *
 * A finalizer is the one kind headed in the singular: a type declares at most one, so a heading
 * promising several stands over a section that can never hold them.
 */
function kindPlural(kind) {
  if (kind === 'destructor') return kindLabel(kind);

  const label = kindLabel(kind);
  if (/[^aeiou]y$/.test(label)) return label.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(label)) return label + 'es';
  return label + 's';
}

module.exports = {
  BADGE_PAINTS,
  NOTE_PAINTS,
  KIND_MAP,
  KIND_ICONS,
  FILTER_LETTERS,
  FILTER_KINDS,
  MEMBER_FILTERS,
  MEMBER_FILTER_KINDS,
  kindLetter,
  kindIcon,
  filterLetter,
  memberFilterKey,
  memberFilterTabs,
  kindLabel,
  kindPlural,
};
