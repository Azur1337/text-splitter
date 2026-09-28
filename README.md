# azur-text-splitter

Splits an element's text into the lines, words and characters the browser
already painted, and wraps each one in a span you can animate.

It doesn't guess where a line breaks. It reads the line boxes off the layout
with `Range.getClientRects()` and cuts the DOM at those points with
`Range.extractContents()`. One read, one write, no forced reflow. So whatever
wrapped your text comes out the way it was painted: a `<br>`, `text-wrap:
balance`, hyphenation, `overflow-wrap`, a floated element, a scaled ancestor.

## install

```
npm install azur-text-splitter
```

## usage

```js
import { splitText } from 'azur-text-splitter';

const target = document.querySelector('h1');
const split = splitText(target, { type: ['lines'] });

// stagger each line as it scrolls into view
split.lines.forEach((line, i) =>
	line.animate(
		[
			{ transform: 'translateY(100%)', opacity: 0 },
			{ transform: 'none', opacity: 1 }
		],
		{ duration: 900, delay: i * 90, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' }
	)
);

// put the original markup back when you need to
split.revert();
```

Every unit is an element, so you can run the whole reveal from CSS. The split
writes each unit's index out as a custom property:

```js
splitText(target, { type: ['words'] });
target.dataset.revealed = '';
```

```css
[data-word] {
	opacity: 0;
	transform: translateY(0.6em);
}
[data-revealed] [data-word] {
	animation: rise 0.8s cubic-bezier(0.23, 1, 0.32, 1) forwards;
	animation-delay: calc(var(--word) * 30ms);
}
@keyframes rise {
	to {
		opacity: 1;
		transform: none;
	}
}
```

## api

### `splitText(target, options?)`

Returns a `TextSplit`.

| option    | type                                | default     | notes                                    |
| --------- | ----------------------------------- | ----------- | ---------------------------------------- |
| `type`    | `('lines' \| 'words' \| 'chars')[]` | `['lines']` | words and chars always sit inside lines  |
| `mask`    | `SplitLevel \| SplitLevel[]`        | -           | wrap these levels in a clip-path mask    |
| `ignore`  | `string`                            | -           | selector for elements to leave whole     |
| `classes` | `{ lines?, words?, chars?, mask? }` | -           | extra class names on the units and masks |

### `TextSplit`

| field    | type            |
| -------- | --------------- |
| `lines`  | `HTMLElement[]` |
| `words`  | `HTMLElement[]` |
| `chars`  | `HTMLElement[]` |
| `masks`  | `HTMLElement[]` |
| `revert` | `() => void`    |

### hooks written on the DOM

| where | attribute                             | custom property              |
| ----- | ------------------------------------- | ---------------------------- |
| unit  | `data-line`, `data-word`, `data-char` | `--line`, `--word`, `--char` |
| mask  | `data-mask`                           | -                            |
| line  | `translate="no"`                      | -                            |

The index counts in document order, so `calc(var(--word) * 30ms)` is a stagger
and `calc((var(--words) - var(--word)) * 30ms)` is a reversed one.

## a split is a snapshot

A split is the layout the text had at the moment it ran. It doesn't watch the
viewport, the fonts or the container, and it never re-splits on its own. When
the box the text wraps in changes width, the lines it was cut into are no
longer the lines the browser would paint. That's on you to `revert()` and split
again.

```js
let split = splitText(target, { type: ['lines'] });
let width = target.clientWidth;
let frame = 0;

new ResizeObserver(() => {
	if (target.clientWidth === width) return;
	width = target.clientWidth;
	cancelAnimationFrame(frame);
	frame = requestAnimationFrame(() => {
		split.revert();
		split = splitText(target, { type: ['lines'] });
	});
}).observe(target);
```

Split after the fonts the text is set in have loaded (`await document.fonts.ready`),
and split again after the text or its styles change.

## notes

- A character split loses the kerning between letters. Every splitter does, it's
  inherent to wrapping each glyph in its own box.
- Words and graphemes are segmented with `Intl.Segmenter` where available, so
  scripts without spaces and emoji sequences come out right. Without it, words
  fall back to whitespace and graphemes to code points.
- Screen readers may read a character split letter by letter. If you split a
  heading into characters, give the target an `aria-label` with its text and
  `aria-hidden` on the units.

## license

MIT, see [LICENSE](./LICENSE).
