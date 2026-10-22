import { describe, expect, it } from 'vitest';
import { blockToHtml, docToHtml, escapeHtml } from '../../scripts/core/rich-text.mjs';

/** Shorthand for a paragraph of plain text. */
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...content) => ({ type: 'doc', content });

describe('docToHtml: basics', () => {
    it('returns an empty string for an empty document', () => {
        expect(docToHtml({ type: 'doc', content: [] })).toBe('');
        expect(docToHtml(doc({ type: 'paragraph' }))).toBe('');
        expect(docToHtml(null)).toBe('');
        expect(docToHtml(undefined)).toBe('');
        expect(docToHtml('not json')).toBe('');
    });

    it('renders paragraphs', () => {
        expect(docToHtml(doc(p('Первая'), p('Вторая')))).toBe('<p>Первая</p>\n<p>Вторая</p>');
    });

    it('accepts a JSON string and the text.<key>.value wrapper', () => {
        const wrapped = { data: doc(p('Текст')) };

        expect(docToHtml(JSON.stringify(doc(p('Текст'))))).toBe('<p>Текст</p>');
        expect(docToHtml(wrapped)).toBe('<p>Текст</p>');
    });

    it('renders one block with blockToHtml', () => {
        expect(blockToHtml(p('Блок'))).toBe('<p>Блок</p>');
        expect(blockToHtml(null)).toBe('');
    });

    it('renders hard breaks and dividers', () => {
        const html = docToHtml(doc({
            type: 'paragraph',
            content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }],
        }, { type: 'divider' }));

        expect(html).toBe('<p>a<br>b</p>\n<hr>');
    });

    it('renders headings with their level', () => {
        expect(docToHtml(doc({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Раздел' }] })))
            .toBe('<h2>Раздел</h2>');
    });
});

describe('docToHtml: text and marks', () => {
    it('escapes text so that markup in the document stays text', () => {
        const html = docToHtml(doc(p('<script>alert("x")</script> & <b>')));

        expect(html).toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;</p>');
        expect(html).not.toMatch(/<script/i);
    });

    it('applies bold, italic and underline', () => {
        const html = docToHtml(doc({
            type: 'paragraph',
            content: [
                { type: 'text', text: 'ж', marks: [{ type: 'bold' }] },
                { type: 'text', text: 'к', marks: [{ type: 'italic' }] },
                { type: 'text', text: 'п', marks: [{ type: 'underline' }] },
            ],
        }));

        expect(html).toBe('<p><strong>ж</strong><em>к</em><u>п</u></p>');
    });

    it('keeps http and https links', () => {
        const html = docToHtml(doc({
            type: 'paragraph',
            content: [{ type: 'text', text: 'сайт', marks: [{ type: 'link', attrs: { href: 'https://example.com/a' } }] }],
        }));

        expect(html).toBe('<p><a href="https://example.com/a" rel="noopener noreferrer">сайт</a></p>');
    });

    it('drops a javascript: link and keeps its text', () => {
        const html = docToHtml(doc({
            type: 'paragraph',
            content: [{ type: 'text', text: 'клик', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
        }));

        expect(html).toBe('<p>клик</p>');
        expect(html).not.toMatch(/javascript/i);
    });

    it('drops data:, mailto: and relative links', () => {
        for (const href of ['data:text/html,<script>', 'mailto:a@b.c', '/relative', ' javascript:x']) {
            const html = docToHtml(doc({
                type: 'paragraph',
                content: [{ type: 'text', text: 't', marks: [{ type: 'link', attrs: { href } }] }],
            }));
            expect(html).not.toContain('<a ');
        }
    });

    it('does not let a link break out of the href attribute', () => {
        const html = docToHtml(doc({
            type: 'paragraph',
            content: [{
                type: 'text',
                text: 'x',
                marks: [{ type: 'link', attrs: { href: 'https://a.com/" onmouseover="alert(1)' } }],
            }],
        }));

        expect(html).not.toContain('<a ');
        expect(html).not.toContain('onmouseover="alert');
    });

    it('escapes an ampersand in a link', () => {
        const html = docToHtml(doc({
            type: 'paragraph',
            content: [{ type: 'text', text: 'q', marks: [{ type: 'link', attrs: { href: 'https://a.com/?a=1&b=2' } }] }],
        }));

        expect(html).toContain('href="https://a.com/?a=1&amp;b=2"');
    });

    it('escapeHtml escapes the five special characters', () => {
        expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
        expect(escapeHtml(null)).toBe('');
    });
});

describe('docToHtml: lists and tasks', () => {
    it('renders bullet and ordered lists', () => {
        const bullets = docToHtml(doc({
            type: 'bulletList',
            content: [
                { type: 'listItem', content: [p('Один')] },
                { type: 'listItem', content: [p('Два')] },
            ],
        }));
        const ordered = docToHtml(doc({
            type: 'orderedList',
            attrs: { start: 3 },
            content: [{ type: 'listItem', content: [p('Три')] }],
        }));

        expect(bullets).toBe('<ul><li>Один</li>\n<li>Два</li></ul>');
        expect(ordered).toBe('<ol start="3"><li>Три</li></ol>');
    });

    it('does not add a start attribute for the first item', () => {
        const html = docToHtml(doc({
            type: 'orderedList',
            attrs: { start: 1 },
            content: [{ type: 'listItem', content: [p('Один')] }],
        }));

        expect(html).toBe('<ol><li>Один</li></ol>');
    });

    it('marks task items with ☐ and ☑', () => {
        const html = docToHtml(doc({
            type: 'taskList',
            content: [
                { type: 'taskItem', attrs: { checked: true }, content: [p('Сделано')] },
                { type: 'taskItem', attrs: { checked: false }, content: [p('Нет')] },
            ],
        }));

        expect(html).toBe('<ul><li>☑ Сделано</li>\n<li>☐ Нет</li></ul>');
    });
});

describe('docToHtml: spoilers', () => {
    it('renders a spoiler as details with its summary and content', () => {
        const html = docToHtml(doc({
            type: 'spoiler',
            content: [
                { type: 'spoilerSummary', content: [{ type: 'text', text: 'Тайна' }] },
                { type: 'spoilerContent', content: [p('Секрет')] },
            ],
        }));

        expect(html).toBe('<details><summary>Тайна</summary><p>Секрет</p></details>');
    });

    it('uses a default summary when there is none', () => {
        const html = docToHtml(doc({ type: 'spoiler', content: [{ type: 'spoilerContent', content: [p('Х')] }] }));

        expect(html).toBe('<details><summary>Спойлер</summary><p>Х</p></details>');
    });
});

describe('docToHtml: rolls', () => {
    it('turns a roller into an inline Foundry roll with its label', () => {
        const html = docToHtml(doc({
            type: 'paragraph',
            content: [{ type: 'roller', attrs: { formula: '1к6+[STR]', label: 'Удар' } }],
        }));

        expect(html).toBe('<p>[[/r 1d6+@abilities.str.mod]]{Удар}</p>');
    });

    it('takes the label from the node text when attrs have none', () => {
        const html = docToHtml(doc({
            type: 'formula',
            content: [{ type: 'text', text: '2d6' }],
        }));

        expect(html).toBe('[[/r 2d6]]{2d6}');
    });

    it('uses the formula as the label when nothing else is given', () => {
        expect(docToHtml(doc({ type: 'roller', attrs: { formula: '1d4' } }))).toBe('[[/r 1d4]]{1d4}');
    });

    it('removes braces and brackets from the label', () => {
        expect(docToHtml(doc({ type: 'roller', attrs: { formula: '1d4', label: 'a{b}c[d]' } })))
            .toBe('[[/r 1d4]]{a b c d}');
    });

    it('writes a formula that cannot be rolled as plain text', () => {
        const condition = docToHtml(doc({ type: 'roller', attrs: { formula: 'if([STR]>1, 1d6, 0)' } }));
        const comparison = docToHtml(doc({ type: 'roller', attrs: { formula: '1d100cs<=25' } }));

        expect(condition).toBe('if([STR]&gt;1, 1d6, 0)');
        expect(condition).not.toContain('[[/r');
        expect(comparison).toBe('1d100cs&lt;=25');
    });

    it('does not roll an empty formula', () => {
        expect(docToHtml(doc({ type: 'roller', attrs: {} }))).toBe('');
    });
});

describe('docToHtml: resources', () => {
    it('shows the resource name with its counter', () => {
        const html = docToHtml(
            doc({
                type: 'paragraph',
                content: [{ type: 'resource', attrs: { id: 'resource-1', textName: 'traits' } }],
            }),
            { resources: { 'resource-1': { name: 'Channel Divinity', current: 1, max: 1 } } },
        );

        expect(html).toBe('<p>Channel Divinity (1/1)</p>');
    });

    it('returns an empty string for a paragraph without content', () => {
        expect(docToHtml(doc(p('')))).toBe('');
    });

    it('shows only the current value when there is no maximum', () => {
        const html = docToHtml(
            doc({ type: 'paragraph', content: [{ type: 'resource', attrs: { id: 'r' } }] }),
            { resources: { r: { name: 'Ки', current: 2, max: null } } },
        );

        expect(html).toBe('<p>Ки (2)</p>');
    });

    it('falls back to the text name of an unknown resource', () => {
        const html = docToHtml(
            doc({ type: 'paragraph', content: [{ type: 'resource', attrs: { id: 'missing', textName: 'traits' } }] }),
            { resources: {} },
        );

        expect(html).toBe('<p>traits</p>');
    });

    it('does not read inherited keys as resources', () => {
        const html = docToHtml(
            doc({ type: 'paragraph', content: [{ type: 'resource', attrs: { id: 'constructor', textName: 'x' } }] }),
            { resources: {} },
        );

        expect(html).toBe('<p>x</p>');
    });
});

describe('docToHtml: unknown nodes', () => {
    it('keeps the content of an unknown node', () => {
        const html = docToHtml(doc({
            type: 'mystery',
            content: [{ type: 'text', text: 'внутри' }],
        }));

        expect(html).toBe('внутри');
    });

    it('keeps the text of an unknown leaf node that has text', () => {
        expect(docToHtml(doc({ type: 'unknown', text: 'текст <i>' }))).toBe('текст &lt;i&gt;');
    });

    it('returns nothing for an unknown leaf without text', () => {
        expect(docToHtml(doc({ type: 'unknown', attrs: { a: 1 } }))).toBe('');
    });

    it('does not fail on a deeply nested document', () => {
        let node = { type: 'text', text: 'глубоко' };
        for (let i = 0; i < 200; i += 1) node = { type: 'unknown', content: [node] };

        expect(() => docToHtml(doc(node))).not.toThrow();
    });
});
