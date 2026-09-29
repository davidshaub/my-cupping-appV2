# Session Lexicons

## Required Modifier Review for New Words

Every new Osito or WCR descriptor must be classified in
`src/lib/tagModifiers.js` before it is added. Run
`node --test tests/*.test.js`; the coverage test fails if a catalog word lacks a
modifier decision. Review both **Slight/Slightly** and **Intense/Intensely**, as
well as Spanish agreement and any special wording. Do not infer grammar from
suffixes or canonical aliases: Nuts is a noun, but Nutty is an adjective.

Nouns use Slight/Intense; adjectives use Slightly/Intensely in English displays.
Storage and CSV keep the existing Slight/Intense prefixes for compatibility.
The wheel still omits modifiers. Spanish keeps its existing agreement rules.
Good Sweetness is locked: clicking cannot cycle it, and its displayed label is
unmodified even for legacy records. Existing saved records are not rewritten.

Editorial decisions still to discuss with the user (do not silently rename or lock):

- Nice Structure and Balanced: should these be unmodifiable evaluations too?
- Hard Cups, Harsh Finish, Unclean Finish: noun-phrase modifiers are grammatical
  structurally but awkward in context; consider a custom phrase or locking.
- Dusty/Concrete and Artificial/Process: mixed grammatical forms; retain existing
  labels pending a decision about splitting or rephrasing.
- Brown, Roast and Overall Sweet (WCR): unusual source labels; retain existing
  modifier wording pending review.
- Lacking and Flat/Lacking: Slightly works, but Intensely may not be the intended
  description; consider a custom strong form.

The setup screen and Lot Information screen offer Osito, WCR, and Both.
The setting changes suggestions only. Existing tags, scores, observations, and
their intensity modifiers remain untouched when changing lexicons.

Saved sessions and CSV exports store `lexiconMode` (`Lexicon` in CSV).
Older saved sessions and CSV files default to Osito. All names and Spanish
translations ship with the app; selecting or searching known terms works offline.

## Source and Categories

WCR attribute names and sections come from the
[WCR Sensory Lexicon 2.0 (2017)](https://worldcoffeeresearch.org/resources/sensory-lexicon).
The alphabetical index contains 109 distinct labels. Repeated entries across
sections, including Sweet, Sour, Bitter, and Salty, are offered once under Taste
Basics. WCR's definitions and reference preparations are not reproduced.

Osito names remain unchanged. Citrus is grouped into Fruity, Nutty and Cocoa are
separate, and green, cereal, roasted, acid, mouthfeel, and other notes use the WCR
section that best fits. Broad judgments such as Nice Structure and Unclean Finish,
and terms without a clear equivalent such as Quaker, remain Osito-specific.
Mappings are editorial approximations, not WCR endorsements.

## Positive and Negative

WCR itself is value-neutral. The app retains the cupping workflow's positive and
negative fields and applies editorial assignments to new WCR terms. All original
Osito positive/negative assignments are preserved.

Judgment calls to review:

- Winey, Whiskey, Alcohol, Fermented, and Overripe/Near Fermented are negative.
- Smoky, Acrid, Ashy, and Burnt are negative; Tobacco and Pipe Tobacco are positive.
- Fresh, Herb-like, and Olive Oil are positive; Hay-like and other green/raw notes are negative.
- Pungent and Pepper are negative; the remaining spice attributes are positive.
- Mouth Drying and Metallic are negative; Thickness, Oily, and amplitude attributes are positive.
- Nutty is positive in WCR. Osito keeps positive Nuts and negative Nutty, so Both
  offers a nut description in each field. This preserves the existing distinction.

## Shared Terms

Within each field, Both removes exact duplicates and explicit equivalents such
as Paper/Papery, Berries/Berry, and Wood/Woody. Both prefers the familiar Osito
label for equivalent terms. Search accepts either spelling. Selected equivalents
are excluded from suggestions even after switching modes.

Related but distinct terms remain separate: Apple and Pear are not replacements
for Orchard Fruit (Apple, Pear); Vanilla is not Vanillin; Earthy is not automatically
equated with Musty/Earthy. No historical session data is rewritten.

## Reports

The existing sensory balance charts now recognize the mapped WCR categories in
screen reports and PDF exports. The charts still summarize fragrance and in-cup
notes using the existing modifier weights. A nested flavor wheel is a separate
presentation feature and has not been added.

Run the catalog, translation, and CSV compatibility checks with:

```sh
node --test tests/lexicon.test.js
```
