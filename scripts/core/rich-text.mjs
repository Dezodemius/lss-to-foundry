/**
 * LSS text-editor documents (ProseMirror / Tiptap JSON) to HTML for dnd5e text fields.
 * Design: docs/DESIGN.md §4.5.
 *
 * Only a whitelist of nodes is rendered. Every text and attribute value is escaped and links are
 * limited to http(s). Unknown nodes keep their content, so a new editor node never breaks the import.
 * Foundry inline rolls `[[/r ...]]` are written as plain text when the formula contains characters
 * that would be altered by HTML escaping (`<`, `>`, `&`, quotes).
 *
 * Pure: no Foundry globals.
 */

import { toFoundryFormula } from './formula.mjs';

/** Recursion limit for malformed, deeply nested documents. */
const MAX_DEPTH = 64;

/**
 * @typedef {object} RichTextContext
 * @property {Record<string, { name?: string, current?: number, max?: number|null }>} [resources]
 *   `data.resources` of the character. Keys are resource ids.
 */

/**
 * Escape a value for HTML text or for a double-quoted attribute.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Render a whole LSS document.
 * @param {object|string} doc  ProseMirror document (`text.<key>.value.data`). A JSON string and the
 *   `text.<key>.value` wrapper are accepted as well.
 * @param {RichTextContext} [ctx]
 * @returns {string} HTML, or '' when the document has no visible content
 */
export function docToHtml(doc, ctx = {}) {
    const root = asNode(doc);
    if (!root) return '';
    const html = renderNode(root, ctx, 0).trim();
    return hasVisibleContent(html) ? html : '';
}

/**
 * Render a single node of a document, for example one block.
 * @param {object|string} block
 * @param {RichTextContext} [ctx]
 * @returns {string} HTML, possibly ''
 */
export function blockToHtml(block, ctx = {}) {
    const node = asNode(block);
    return node ? renderNode(node, ctx, 0).trim() : '';
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asNode(value) {
    let node = value;
    if (typeof node === 'string') {
        try {
            node = JSON.parse(node);
        } catch {
            return null;
        }
    }
    if (!isObject(node)) return null;
    // The `text.<key>.value` wrapper holds the document in `data`.
    if (node.type === undefined && isObject(node.data)) return node.data;
    return node;
}

function hasVisibleContent(html) {
    if (/<hr>/.test(html)) return true;
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim() !== '';
}

/** First non-empty string among the arguments, trimmed. */
function firstText(...values) {
    const found = values.find((value) => typeof value === 'string' && value.trim() !== '');
    return found ? found.trim() : '';
}

/** Plain text of a node and its descendants. */
function textOf(node) {
    if (!isObject(node)) return '';
    if (typeof node.text === 'string') return node.text;
    if (Array.isArray(node.content)) return node.content.map(textOf).join('');
    return '';
}

/** Only http(s) links are kept (no `javascript:`, `data:` or relative URLs). */
function safeHref(value) {
    if (typeof value !== 'string') return '';
    const href = value.trim();
    return /^https?:\/\/[^\s"'<>`]+$/i.test(href) ? href : '';
}

/* -------------------------------------------- */
/*  Node rendering                              */
/* -------------------------------------------- */

function renderNode(node, ctx, depth) {
    if (!isObject(node) || depth > MAX_DEPTH) return '';
    switch (node.type) {
        case 'doc':
            return renderChildren(node, ctx, depth, '\n');
        case 'text':
            return renderText(node);
        case 'paragraph':
            return `<p>${renderChildren(node, ctx, depth)}</p>`;
        case 'heading':
            return renderHeading(node, ctx, depth);
        case 'hardBreak':
            return '<br>';
        case 'divider':
            return '<hr>';
        case 'bulletList':
        case 'taskList':
            return `<ul>${renderChildren(node, ctx, depth, '\n')}</ul>`;
        case 'orderedList':
            return `<ol${orderedStart(node)}>${renderChildren(node, ctx, depth, '\n')}</ol>`;
        case 'listItem':
            return `<li>${renderItem(node, ctx, depth)}</li>`;
        case 'taskItem': {
            const checked = node.attrs?.checked === true || node.attrs?.checked === 'true';
            return `<li>${checked ? '☑' : '☐'} ${renderItem(node, ctx, depth)}</li>`;
        }
        case 'spoiler':
            return renderSpoiler(node, ctx, depth);
        case 'roller':
        case 'formula':
            return renderRoll(node);
        case 'resource':
            return renderResource(node, ctx);
        default:
            // Unknown node (spoilerSummary and spoilerContent outside a spoiler included):
            // keep its content, never fail.
            if (Array.isArray(node.content)) return renderChildren(node, ctx, depth);
            return typeof node.text === 'string' ? escapeHtml(node.text) : '';
    }
}

function renderChildren(node, ctx, depth, separator = '') {
    if (!Array.isArray(node.content)) return '';
    return node.content.map((child) => renderNode(child, ctx, depth + 1)).join(separator);
}

/** A list item with a single paragraph reads better as inline text. */
function renderItem(node, ctx, depth) {
    const content = Array.isArray(node.content) ? node.content : [];
    if (content.length === 1 && isObject(content[0]) && content[0].type === 'paragraph') {
        return renderChildren(content[0], ctx, depth + 1);
    }
    return renderChildren(node, ctx, depth);
}

function renderHeading(node, ctx, depth) {
    const level = Math.min(6, Math.max(1, Math.trunc(Number(node.attrs?.level)) || 2));
    return `<h${level}>${renderChildren(node, ctx, depth)}</h${level}>`;
}

function orderedStart(node) {
    const raw = node.attrs?.start;
    if (raw === undefined || raw === null || raw === '') return '';
    const start = Number(raw);
    return Number.isInteger(start) && start > 1 ? ` start="${start}"` : '';
}

function renderSpoiler(node, ctx, depth) {
    let summary = '';
    let body = '';
    for (const child of Array.isArray(node.content) ? node.content : []) {
        if (isObject(child) && child.type === 'spoilerSummary') {
            summary += renderChildren(child, ctx, depth + 1);
        } else {
            body += renderNode(child, ctx, depth + 1);
        }
    }
    return `<details><summary>${summary.trim() || 'Спойлер'}</summary>${body}</details>`;
}

function renderText(node) {
    let html = escapeHtml(typeof node.text === 'string' ? node.text : '');
    for (const mark of Array.isArray(node.marks) ? node.marks : []) {
        const type = isObject(mark) ? mark.type : undefined;
        if (type === 'bold') {
            html = `<strong>${html}</strong>`;
        } else if (type === 'italic') {
            html = `<em>${html}</em>`;
        } else if (type === 'underline') {
            html = `<u>${html}</u>`;
        } else if (type === 'link') {
            const href = safeHref(mark.attrs?.href);
            if (href) html = `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${html}</a>`;
        }
        // Other marks are not part of the LSS editor contract: the text is kept as it is.
    }
    return html;
}

/**
 * Roller and formula nodes become Foundry inline rolls: `[[/r 1d20+5]]{Attack}`.
 * The formula is looked up in attrs.formula, attrs.value and so on, then in the node text.
 */
function renderRoll(node) {
    const attrs = isObject(node.attrs) ? node.attrs : {};
    const source = firstText(attrs.formula, attrs.value, attrs.dice, attrs.expression, attrs.text, textOf(node));
    const translated = toFoundryFormula(source);
    const formula = translated.formula;
    if (!translated.ok || !formula || /[<>&"']/.test(formula)) return escapeHtml(source);
    const label = sanitizeLabel(firstText(attrs.label, attrs.name, textOf(node), translated.label, source));
    return `[[/r ${formula}]]{${label}}`;
}

/** Braces and brackets would break the `[[...]]{...}` syntax of an inline roll. */
function sanitizeLabel(label) {
    return escapeHtml(String(label).replace(/[{}[\]\r\n]/g, ' ').trim());
}

/** A resource node is shown as «name (current/max)» using the character's resources. */
function renderResource(node, ctx) {
    const attrs = isObject(node.attrs) ? node.attrs : {};
    const resources = isObject(ctx?.resources) ? ctx.resources : {};
    const id = typeof attrs.id === 'string' ? attrs.id : '';
    const resource = id && Object.prototype.hasOwnProperty.call(resources, id) ? resources[id] : null;
    if (!isObject(resource)) return escapeHtml(firstText(attrs.textName));

    const name = firstText(resource.name, attrs.textName);
    const current = typeof resource.current === 'number' && Number.isFinite(resource.current) ? resource.current : null;
    const max = typeof resource.max === 'number' && Number.isFinite(resource.max) ? resource.max : null;
    if (current === null) return escapeHtml(name);
    const counter = max === null ? `${current}` : `${current}/${max}`;
    return `${escapeHtml(name)} (${escapeHtml(counter)})`;
}
