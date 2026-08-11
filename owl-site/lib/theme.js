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
 * It stays out of the way of the three marks that are allowed a colour, all of which say something is
 * unusual about the API rather than what kind it is: Readonly, Explicit and Obsolete.
 */

/**
 * Badge colours that say something other than what kind a member is.
 *
 * Readonly and SetOnly share `mod`: they are one fact about a property told from either end, only
 * ever one of them is on a member, and neither is a kind, so they read as one marker. It is the
 * darkest ink on the page, which is what makes it the one pill that reads as inverted against the
 * kind marks around it whichever theme is on.
 *
 * `explicit` paints the badge and the card's border together, since the border is there to make the
 * badge's point at a glance.
 */
const BADGE_PAINTS = {
  mod: 'var(--oc-gray-9)',
  explicit: 'var(--oc-blue-4)',
};

/**
 * Modifier chips that are filled rather than left plain, tunable the same way.
 *
 * These say what a member is bound to and whether it is yours to override, which is what a reader
 * scanning a card wants answered before the prose. What sets them apart from the rest - extension,
 * init, an accessibility - is that they are filled at all: a page where every chip is filled tells
 * nothing apart. Const is the darkest of them because a constant is the strongest form of the fact
 * static states - not merely reached through the type but fixed at the point of use.
 *
 * `obsolete` is the one chip here that is a warning rather than a fact about how the member works,
 * which is why it is the one that is not grey; orange is what a reader already reads as a warning.
 * The note spelling out why the API is obsolete takes the same paint, so the chip on the card and
 * the note on the page are recognisably the same thing said twice rather than two unrelated marks.
 *
 * Filled in one colour under both themes, as every other badge is, so each has to carry white text
 * on either ground.
 */
const CHIP_PAINTS = {
  static: 'var(--oc-gray-6)',
  const: 'var(--oc-gray-9)',
  abstract: 'var(--oc-gray-6)',
  virtual: 'var(--oc-gray-6)',
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

  // Members
  method: ['M', 'Method'],
  constructor: ['C', 'Constructor'],
  destructor: ['F', 'Finalizer'],
  operator: ['M', 'Operator'],
  conversion: ['M', 'Conversion'],
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
 * not something anyone scans a type for the way they scan it for a method or a property: it is how
 * the type itself begins and ends.
 *
 * The badge answers what the reader is looking at; this answers which button shows it.
 */
const FILTER_LETTERS = {
  enum: 'T',
  struct: 'T',
  enumvalue: 'T',
  constructor: 'T',
  destructor: 'T',
};

/**
 * The filter buttons, in the order they appear in the bar. One per filter letter rather than per
 * badge letter - FILTER_LETTERS folds some kinds in with others - so nothing a row can carry is
 * left unreachable; a page renders only the ones its own contents use.
 *
 * Interfaces leads Types because it is the narrower of the two: Types is what is left once the
 * contracts are taken out, so it reads as the wider bucket sitting after the one it excludes.
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
 * Everything that carries a data-badge for the kind tabs to match on asks this; everything that
 * draws a badge asks kindLetter. The two are the same answer for every kind but the ones
 * FILTER_LETTERS names.
 */
function filterLetter(kind) {
  return Object.prototype.hasOwnProperty.call(FILTER_LETTERS, kind)
    ? FILTER_LETTERS[kind]
    : kindLetter(kind);
}

function kindLabel(kind) {
  const entry = KIND_MAP[kind];
  return entry ? entry[1] : kind;
}

/**
 * The label a group of this kind is headed with. Spelled out rather than label + 's', because
 * 'Property' pluralises to 'Properties' and the section headings are uppercased, which turns a
 * wrong plural into a shout.
 */
function kindPlural(kind) {
  const label = kindLabel(kind);
  if (/[^aeiou]y$/.test(label)) return label.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(label)) return label + 'es';
  return label + 's';
}

module.exports = {
  BADGE_PAINTS,
  CHIP_PAINTS,
  KIND_MAP,
  KIND_ICONS,
  FILTER_LETTERS,
  FILTER_KINDS,
  kindLetter,
  kindIcon,
  filterLetter,
  kindLabel,
  kindPlural,
};
