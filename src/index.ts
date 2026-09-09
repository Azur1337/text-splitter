// Split an element's text into the lines, words and chars the browser actually
// rendered, and wrap each one in a span you can animate.
//
// It reads the line breaks off the layout with Range.getClientRects() instead
// of guessing them, then cuts the DOM at those points with
// Range.extractContents(). One read, one write, no reflow in between. So
// whatever wrapped the text (a <br>, text-wrap: balance, hyphenation, a float,
// a scaled ancestor) comes out the way it was painted.

export type SplitLevel = 'lines' | 'words' | 'chars';

export interface SplitOptions {
	// which units to make. words and chars always live inside lines
	type?: SplitLevel[];
	// wrap these levels in a clip-path mask so they can slide out from under it
	mask?: SplitLevel | SplitLevel[];
	// selector for elements to leave alone, never cut or wrapped
	ignore?: string;
	// extra class names to add to the units and masks
	classes?: { lines?: string; words?: string; chars?: string; mask?: string };
}

export interface TextSplit {
	lines: HTMLElement[];
	words: HTMLElement[];
	chars: HTMLElement[];
	masks: HTMLElement[];
	// put the original markup back
	revert(): void;
}

// Intl.Segmenter where we can get it, so grapheme clusters (emoji, combining
// marks) and scripts without spaces come out right. Falls back to plain
// splitting otherwise.
const wordSeg =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? new Intl.Segmenter(undefined, { granularity: 'word' })
		: null;
const charSeg =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
		: null;

// a run of text we're splitting, with its length
interface Piece {
	node: Text;
	length: number;
}

// walk the target and collect the text nodes we'll split, in document order
function collectPieces(root: Element, ignore?: string): Piece[] {
	const pieces: Piece[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let n = walker.nextNode();
	while (n) {
		const text = n as Text;
		if (text.data.length && !(ignore && text.parentElement?.closest(ignore))) {
			pieces.push({ node: text, length: text.data.length });
		}
		n = walker.nextNode();
	}
	return pieces;
}

// find the node + offset for a global character index
function locate(pieces: Piece[], index: number): { node: Text; offset: number } {
	let remaining = index;
	for (const p of pieces) {
		if (remaining < p.length) return { node: p.node, offset: remaining };
		remaining -= p.length;
	}
	const last = pieces[pieces.length - 1];
	return { node: last.node, offset: last.length };
}

function rangeFor(pieces: Piece[], from: number, to: number): Range {
	const r = document.createRange();
	const a = locate(pieces, from);
	const b = locate(pieces, to);
	r.setStart(a.node, a.offset);
	r.setEnd(b.node, b.offset);
	return r;
}

// where the browser wrapped the text, as global character offsets
function lineBreaks(pieces: Piece[], total: number): number[] {
	const breaks = [0];
	let top = Number.NaN;
	for (let i = 1; i < total; i++) {
		const rects = rangeFor(pieces, 0, i).getClientRects();
		const last = rects[rects.length - 1];
		if (!last) continue;
		if (!Number.isNaN(top) && Math.abs(last.top - top) > 0.5) breaks.push(i);
		top = last.top;
	}
	breaks.push(total);
	return breaks;
}

// data-line / --line, data-word / --word, etc. (singular)
const SINGULAR: Record<SplitLevel, string> = { lines: 'line', words: 'word', chars: 'char' };

// make a unit span and tag it with its index
function makeUnit(level: SplitLevel, index: number, className?: string): HTMLElement {
	const el = document.createElement('span');
	const key = SINGULAR[level];
	el.dataset[key] = String(index);
	el.style.setProperty(`--${key}`, String(index));
	el.setAttribute('translate', 'no');
	if (className) el.classList.add(className);
	return el;
}

export function splitText(target: Element, options: SplitOptions = {}): TextSplit {
	const { type = ['lines'], mask, ignore, classes } = options;
	const wantWords = type.includes('words') || type.includes('chars');
	const wantChars = type.includes('chars');
	const maskLines = mask === 'lines' || (Array.isArray(mask) && mask.includes('lines'));

	const originalHTML = target.innerHTML;
	const pieces = collectPieces(target, ignore);
	const total = pieces.reduce((s, p) => s + p.length, 0);
	const breaks = total ? lineBreaks(pieces, total) : [0, 0];

	const lines: HTMLElement[] = [];
	const words: HTMLElement[] = [];
	const chars: HTMLElement[] = [];
	const masks: HTMLElement[] = [];

	for (let l = 0; l < breaks.length - 1; l++) {
		const from = breaks[l];
		const to = breaks[l + 1];
		if (to <= from) continue;

		const line = makeUnit('lines', l, classes?.lines);
		line.style.display = 'block';

		const fragment = rangeFor(pieces, from, to).extractContents();
		if (!wantWords) {
			line.appendChild(fragment);
		} else {
			line.appendChild(buildWords(fragment.textContent ?? '', wantChars, classes, words, chars));
		}

		if (maskLines) {
			const m = document.createElement('span');
			m.style.display = 'block';
			m.style.overflow = 'hidden';
			m.dataset.mask = String(masks.length);
			if (classes?.mask) m.classList.add(classes.mask);
			m.appendChild(line);
			target.appendChild(m);
			masks.push(m);
		} else {
			target.appendChild(line);
		}
		lines.push(line);
	}

	return {
		lines,
		words,
		chars,
		masks,
		revert() {
			target.innerHTML = originalHTML;
		}
	};
}

// turn a line's text into word (and char) spans
function buildWords(
	text: string,
	wantChars: boolean,
	classes: SplitOptions['classes'],
	words: HTMLElement[],
	chars: HTMLElement[]
): HTMLElement {
	const wrap = document.createElement('span');
	wrap.style.whiteSpace = 'nowrap';

	let wordIndex = 0;
	let charIndex = 0;

	const segments = wordSeg
		? Array.from(wordSeg.segment(text))
		: text
				.split(/(\s+)/)
				.filter(Boolean)
				.map((s) => ({ segment: s }));

	for (const seg of segments as Array<{ segment: string }>) {
		if (/^\s+$/.test(seg.segment)) {
			wrap.appendChild(document.createTextNode(seg.segment));
			continue;
		}
		const word = makeUnit('words', wordIndex, classes?.words);
		if (wantChars) {
			const charSegs = charSeg
				? Array.from(charSeg.segment(seg.segment))
				: Array.from(seg.segment).map((c) => ({ segment: c }));
			for (const cs of charSegs as Array<{ segment: string }>) {
				const ch = makeUnit('chars', charIndex, classes?.chars);
				ch.textContent = cs.segment;
				word.appendChild(ch);
				chars.push(ch);
				charIndex++;
			}
		} else {
			word.textContent = seg.segment;
		}
		wrap.appendChild(word);
		words.push(word);
		wordIndex++;
	}

	return wrap;
}
