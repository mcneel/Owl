'use strict';

/**
 * The site's visual vocabulary: kind badges, their colours and the per-assembly palette.
 *
 * Badges collapse to five letters (T/M/P/F/E) because a reader scanning a long member list needs a
 * shape to recognise, not a taxonomy. The model's finer-grained kinds each map back to one.
 */

/**
 * Badge colours, keyed by letter, named from the Open Color scales.
 *
 * The pairs carry the meaning: types and interfaces are one blue at two weights, fields and
 * constructors one grey, so each pair reads as a family before its letter is read.
 */
const KIND_COLORS = {
  T: 'var(--oc-blue-8)',
  M: 'var(--oc-cyan-6)',
  P: 'var(--oc-teal-6)',
  F: 'var(--oc-gray-6)',
  E: 'var(--oc-orange-5)',
  I: 'var(--oc-blue-4)',
  S: 'var(--oc-lime-6)',
};

// Constructors sit apart from the coloured kinds, on the field grey a step darker.
KIND_COLORS.C = 'var(--oc-gray-7)';

/** The one colour an enum and its values carry, which is no letter's own. */
const ENUM_COLOR = 'var(--oc-yellow-6)';

/**
 * Kinds whose badge takes a colour of its own rather than its letter's, named by the slot they are
 * painted from rather than by the paint itself, so both stay one colour when that slot is retuned.
 *
 * An enum keeps the T badge and an enum value keeps F, but both take the enum colour, so an enum
 * and the values inside it read as one family and neither is mistaken for a field.
 *
 * A finalizer wears F for the ~ it is written with, and takes the constructor's colour: the two
 * are the ends of an object's life and neither is a field.
 */
const KIND_COLOR_SLOTS = {
  enum: 'enum',
  enumvalue: 'enum',
  destructor: 'C',
};

/**
 * Every slot a badge can be painted from, as slot -> colour.
 *
 * The stylesheet writes one custom property per entry and everything that draws a badge references
 * the property, so the palette can be retuned in one place — a browser's element inspector
 * included, where editing `--kind-M` on :root repaints every method badge on the page at once.
 */
const KIND_PAINTS = Object.assign({}, KIND_COLORS, { enum: ENUM_COLOR });

/**
 * Badge colours that say something other than what kind a member is, tunable the same way.
 *
 * Readonly and SetOnly share `mod`: they are one fact about a property told from either end, only
 * ever one of them is on a member, and neither is a kind, so they read as one marker.
 *
 * `explicit` paints the badge and the card's border together, since the border is there to make the
 * badge's point at a glance. `obsolete` has a slot of its own only so that retuning either of them
 * cannot move the other: the two wear the same pill and would otherwise be impossible to separate.
 */
const BADGE_PAINTS = {
  mod: 'var(--oc-red-6)',
  explicit: 'var(--oc-blue-4)',
  obsolete: 'var(--oc-green-8)',
};

/** Model kind -> [badge letter, human label]. */
const KIND_MAP = {
  // Types render as T, except an interface and a struct: a contract and a value type each read
  // differently enough from a class to carry their own letter and colour.
  class: ['T', 'Class'],
  interface: ['I', 'Interface'],
  struct: ['S', 'Struct'],
  enum: ['T', 'Enum'],
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
  enumvalue: ['F', 'Enum value'],
  event: ['E', 'Event'],
};

/**
 * The filter buttons, in the order they appear in the bar. One per badge letter, so no kind is
 * left unreachable; a page renders only the ones its own contents use.
 */
const FILTER_KINDS = [
  { key: 'all', label: 'All' },
  { key: 'T', label: 'Types' },
  { key: 'I', label: 'Interfaces' },
  { key: 'S', label: 'Structs' },
  { key: 'C', label: 'Constructors' },
  { key: 'M', label: 'Methods' },
  { key: 'P', label: 'Properties' },
  { key: 'F', label: 'Fields' },
  { key: 'E', label: 'Events' },
];

/** Cycled to give each assembly a stable colour, dark enough to carry white text. */
const ASSEMBLY_PALETTE = [
  '#7c3aed',
  '#0369a1',
  '#065f46',
  '#92400e',
  '#9d174d',
  '#1e3a8a',
  '#166534',
  '#713f12',
  '#4c1d95',
  '#0c4a6e',
];

function badgeLetter(kind) {
  const entry = KIND_MAP[kind];
  return entry ? entry[0] : '?';
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

/** The custom property a slot is read from. */
function kindVar(slot) {
  return `var(--kind-${slot})`;
}

/** Which slot paints this kind's badge. Anything unrecognised falls in with the constructors. */
function kindSlot(kind) {
  // hasOwnProperty, not a plain lookup: one of the kinds is called 'constructor', and a plain
  // lookup on an object literal finds Object.prototype.constructor and takes it for an override.
  const slot = Object.prototype.hasOwnProperty.call(KIND_COLOR_SLOTS, kind)
    ? KIND_COLOR_SLOTS[kind]
    : badgeLetter(kind);

  return Object.prototype.hasOwnProperty.call(KIND_PAINTS, slot) ? slot : 'C';
}

/** What a badge of this kind is painted with — a reference to the palette, never a colour. */
function kindColor(kind) {
  return kindVar(kindSlot(kind));
}

/** Assigns each assembly a colour by position, so it stays the same across pages. */
function assemblyPalette(assemblyNames) {
  const map = new Map();
  assemblyNames.forEach((name, i) => map.set(name, ASSEMBLY_PALETTE[i % ASSEMBLY_PALETTE.length]));
  return map;
}

function assemblyColor(palette, assemblyName) {
  if (!palette || !assemblyName) return '#475569';
  return palette.get(assemblyName) || '#475569';
}

module.exports = {
  KIND_COLORS,
  KIND_COLOR_SLOTS,
  KIND_PAINTS,
  BADGE_PAINTS,
  KIND_MAP,
  FILTER_KINDS,
  ASSEMBLY_PALETTE,
  badgeLetter,
  kindLabel,
  kindPlural,
  kindVar,
  kindSlot,
  kindColor,
  assemblyPalette,
  assemblyColor,
};
