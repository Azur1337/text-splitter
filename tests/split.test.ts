// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { splitText } from '../src/index.js';

function el(html: string): HTMLElement {
	const host = document.createElement('div');
	host.innerHTML = html;
	return host.firstElementChild as HTMLElement;
}

describe('splitText', () => {
	it('wraps a single painted line in a data-line span', () => {
		const p = el('<p>hello world</p>');
		const split = splitText(p, { type: ['lines'] });

		expect(split.lines).toHaveLength(1);
		expect(split.lines[0].dataset.line).toBe('0');
		expect(split.lines[0].style.getPropertyValue('--line')).toBe('0');
		expect(split.lines[0].getAttribute('translate')).toBe('no');
	});

	it('splits words and indexes them with data-word / --word', () => {
		const p = el('<p>hello brave new world</p>');
		const split = splitText(p, { type: ['words'] });

		expect(split.words.map((w) => w.textContent)).toEqual(['hello', 'brave', 'new', 'world']);
		expect(split.words.map((w) => w.dataset.word)).toEqual(['0', '1', '2', '3']);
		expect(split.words[2].style.getPropertyValue('--word')).toBe('2');
	});

	it('splits characters (graphemes) and indexes them', () => {
		const p = el('<p>hi</p>');
		const split = splitText(p, { type: ['chars'] });

		expect(split.chars.map((c) => c.textContent)).toEqual(['h', 'i']);
		expect(split.chars.map((c) => c.dataset.char)).toEqual(['0', '1']);
		expect(split.chars[1].style.getPropertyValue('--char')).toBe('1');
	});

	it('keeps words and chars nested inside their line', () => {
		const p = el('<p>two words</p>');
		const split = splitText(p, { type: ['chars'] });

		expect(split.lines).toHaveLength(1);
		expect(split.lines[0].contains(split.words[0])).toBe(true);
		expect(split.lines[0].contains(split.chars[0])).toBe(true);
	});

	it('revert() restores the original markup exactly', () => {
		const p = el('<p>hello <em>world</em> and more</p>');
		const original = p.innerHTML;
		const split = splitText(p, { type: ['words'] });

		split.revert();
		expect(p.innerHTML).toBe(original);
	});

	it('leaves ignored elements whole', () => {
		const p = el('<p>hello <span data-keep>world</span></p>');
		const split = splitText(p, { type: ['lines'], ignore: '[data-keep]' });

		// the ignored span is not cut into a unit of its own
		expect(p.querySelector('[data-keep]')).not.toBeNull();
		expect(split.lines.some((l) => l.contains(p.querySelector('[data-keep]')))).toBe(false);
	});

	it('adds the requested class to units', () => {
		const p = el('<p>hello</p>');
		const split = splitText(p, { type: ['lines'], classes: { lines: 'reveal' } });

		expect(split.lines[0].classList.contains('reveal')).toBe(true);
	});
});
