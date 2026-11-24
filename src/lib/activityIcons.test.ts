import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICON_SUGGESTIONS, guessIcon, isSymbolName } from './activityIcons';

test('activity icons: a guess from the name, any well-formed SF Symbol name accepted', () => {
  assert.equal(guessIcon('Reading'), 'book');
  assert.equal(guessIcon('Morning run'), 'figure.run');
  assert.equal(guessIcon('French'), 'globe');
  assert.equal(guessIcon('Guitar'), 'guitars');
  assert.equal(guessIcon('Volunteering'), 'star');
  assert.ok(isSymbolName('figure.strengthtraining.traditional'));
  assert.ok(isSymbolName('1.circle'));
  assert.ok(!isSymbolName('Figure Run'));
  assert.ok(!isSymbolName(''));
  assert.ok(!isSymbolName(3));
  assert.equal(new Set(ICON_SUGGESTIONS).size, ICON_SUGGESTIONS.length);
});
