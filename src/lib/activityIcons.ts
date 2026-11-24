// SF Symbols for activities: suggestions, a guess from the name, and what counts as a name.

/** Offered as a grid in the add / edit sheet; any other SF Symbol name can be typed. */
export const ICON_SUGGESTIONS = [
  'figure.run',
  'figure.walk',
  'bicycle',
  'figure.pool.swim',
  'figure.hiking',
  'figure.yoga',
  'dumbbell',
  'figure.strengthtraining.traditional',
  'sportscourt',
  'tennis.racket',
  'figure.climbing',
  'figure.dance',
  'book',
  'books.vertical',
  'text.book.closed',
  'pencil',
  'paintbrush',
  'camera',
  'guitars',
  'pianokeys',
  'music.note',
  'mic',
  'globe',
  'character.book.closed',
  'brain.head.profile',
  'leaf',
  'fork.knife',
  'cup.and.saucer',
  'bed.double',
  'heart',
  'house',
  'star',
] as const;

const GUESSES: [RegExp, string][] = [
  [/read|book|novel/i, 'book'],
  [/write|journal|blog/i, 'pencil'],
  [/run|jog/i, 'figure.run'],
  [/walk|steps/i, 'figure.walk'],
  [/bike|cycl|ride/i, 'bicycle'],
  [/swim/i, 'figure.pool.swim'],
  [/hike/i, 'figure.hiking'],
  [/yoga|stretch/i, 'figure.yoga'],
  [/lift|gym|weight|strength/i, 'dumbbell'],
  [/climb|boulder/i, 'figure.climbing'],
  [/danc/i, 'figure.dance'],
  [/tennis|padel/i, 'tennis.racket'],
  [/guitar/i, 'guitars'],
  [/piano|keys/i, 'pianokeys'],
  [/sing|music|practi[cs]e/i, 'music.note'],
  [/paint|draw|sketch|art/i, 'paintbrush'],
  [/photo/i, 'camera'],
  [/french|spanish|german|italian|japanese|language|duolingo/i, 'globe'],
  [/meditat|breath/i, 'brain.head.profile'],
  [/cook|bake|meal/i, 'fork.knife'],
  [/garden|plant/i, 'leaf'],
  [/nap|sleep/i, 'bed.double'],
  [/clean|tidy/i, 'house'],
];

/** A sensible icon for an activity's name ("Reading" gets a book), else a star. */
export function guessIcon(name: string): string {
  return GUESSES.find(([re]) => re.test(name))?.[1] ?? 'star';
}

/** SF Symbol names are lowercase words joined by dots ("figure.run", "1.circle"). */
export const isSymbolName = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z0-9]+(\.[a-z0-9]+)*$/.test(v.trim());
