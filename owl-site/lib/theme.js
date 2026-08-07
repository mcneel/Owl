'use strict';

/**
 * The site's visual vocabulary: kind badges, their colours and the per-assembly palette.
 *
 * Badges collapse to five letters (T/M/P/F/E) because a reader scanning a long member list needs a
 * shape to recognise, not a taxonomy. The model's finer-grained kinds each map back to one.
 */

/**
 * Badge colours, keyed by letter. F is Open Color pink 6, I grape 6, S lime 8.
 *
 * S is a lime rather than the teal it wants to be: teal lands within a few units of the property
 * green, which reads as the same colour beside it in a tree.
 */
const KIND_COLORS = {
  T: '#6366f1',
  M: '#0ea5e9',
  P: '#10b981',
  F: '#e64980',
  E: '#ef4444',
  I: '#be4bdb',
  S: '#66a80f',
};

// Constructors sit apart from the coloured kinds, in grey.
KIND_COLORS.C = '#6b7280';

/** The amber an enum and its values carry, which is no letter's colour since F went pink. */
const ENUM_COLOR = '#f59e0b';

/**
 * Kinds whose badge takes a colour of its own rather than its letter's.
 *
 * An enum keeps the T badge and an enum value keeps F, but both are amber, so an enum and the
 * values inside it read as one family and neither is mistaken for a field.
 */
const KIND_COLOR_OVERRIDES = {
  enum: ENUM_COLOR,
  enumvalue: ENUM_COLOR,
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
  destructor: ['M', 'Finalizer'],
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

function kindColor(kind) {
  // hasOwnProperty, not a plain lookup: one of the kinds is called 'constructor', and a plain
  // lookup on an object literal finds Object.prototype.constructor and takes it for an override.
  const override = Object.prototype.hasOwnProperty.call(KIND_COLOR_OVERRIDES, kind)
    ? KIND_COLOR_OVERRIDES[kind]
    : null;

  return override || KIND_COLORS[badgeLetter(kind)] || '#6b7280';
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
  KIND_COLOR_OVERRIDES,
  KIND_MAP,
  FILTER_KINDS,
  ASSEMBLY_PALETTE,
  badgeLetter,
  kindLabel,
  kindPlural,
  kindColor,
  assemblyPalette,
  assemblyColor,
};
