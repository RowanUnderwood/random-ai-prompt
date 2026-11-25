/**
 * @file
 * @brief Shuffled decks: draw options without replacement, so nothing repeats until every option has
 * come up once. Decks live as long as their owner (one engine), so they persist across prompts and
 * batches and start over when the app does. See notes/reference/rng-design.md.
 */

import { shuffle, randomInt } from "../helpers/random.js";

const sameItems = (a, b) =>
  a === b || (a.length === b.length && a.every((item, i) => item === b[i]));

/**
 * Create a set of independent decks, one per key.
 * @returns {{session: Function, reset: Function}} `session()` opens one prompt's draws; `reset()`
 *   discards every deck.
 */
export function createDecks() {
  const decks = new Map(); // key → { source, known, pile, last }

  /** Bring a deck in line with the current options, keeping what has already been dealt. */
  function sync(key, options) {
    let deck = decks.get(key);
    if (deck && sameItems(deck.source, options)) {
      deck.source = options;
      return deck;
    }
    const known = new Set(options);
    if (!deck) {
      deck = { pile: shuffle([...known]) };
      decks.set(key, deck);
    } else {
      // Content edits and NSFW/model switches add or remove options mid-cycle.
      deck.pile = deck.pile.filter((card) => known.has(card));
      for (const card of known)
        if (!deck.known.has(card)) deck.pile.splice(randomInt(0, deck.pile.length), 0, card);
    }
    deck.known = known;
    deck.source = options;
    return deck;
  }

  /** A fresh shuffle, with `late` cards at the bottom and never the card just dealt on top. */
  function reshuffle(deck, late) {
    const cards = shuffle([...deck.known]);
    deck.pile = [
      ...cards.filter((card) => late.has(card)),
      ...cards.filter((card) => !late.has(card)),
    ];
    const top = deck.pile.length - 1;
    if (top > 0 && deck.pile[top] === deck.last)
      [deck.pile[top], deck.pile[top - 1]] = [deck.pile[top - 1], deck.pile[top]];
  }

  function draw(key, options, dealt, exclude) {
    const deck = sync(key, options);
    if (!deck.pile.length) reshuffle(deck, dealt);
    let at = deck.pile.length - 1;
    while (at >= 0 && exclude?.has(deck.pile[at])) at--;
    if (at < 0) {
      // Every remaining card is excluded from this pick: start the next cycle, but keep those cards
      // on top so they still come up before anything else repeats.
      const held = deck.pile;
      reshuffle(deck, dealt);
      deck.pile = [...deck.pile.filter((card) => !held.includes(card)), ...held];
      at = deck.pile.length - 1;
      while (at > 0 && exclude.has(deck.pile[at])) at--;
    }
    const [card] = deck.pile.splice(at, 1);
    deck.last = card;
    return card;
  }

  return {
    /**
     * Open one prompt's view of the decks. Cards it has already used go to the bottom when a deck has
     * to be reshuffled part-way through the prompt.
     * @returns {{draw: (key: string, options: Array, exclude?: Set) => *}}
     */
    session() {
      const dealt = new Map();
      return {
        draw(key, options, exclude) {
          if (!dealt.has(key)) dealt.set(key, new Set());
          const card = draw(key, options, dealt.get(key), exclude);
          dealt.get(key).add(card);
          return card;
        },
      };
    },
    reset: () => decks.clear(),
  };
}

/**
 * Whether a generation should draw from decks. A pinned seed promises a reproducible roll, which a
 * draw that depends on history cannot keep, so decks pause while one is set.
 * @param {object} settings Generation settings.
 * @returns {boolean}
 */
export function usesDecks(settings) {
  const pinned = settings.randomSeed === false && String(settings.promptSeed ?? "").trim() !== "";
  return settings.shuffleDeck === true && !pinned;
}
