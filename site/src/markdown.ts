/**
 * Markdown to HTML at build time, for the write-up and the screen spec. The
 * converter runs inside the Vite config and never ships to the browser.
 *
 * The prose is not rewritten. Three things are added around it: ids on the
 * headings so a contents list can link to them, links from a library's name to
 * its build detail view, and an "assembly kit" tag after a kit's name in any
 * table that has no kind column of its own, since those tables carry the hand
 * built counts site spec section 8 wants labeled.
 */
import { Marked, type Token, type Tokens } from 'marked';
import { ROSTER } from '../../scripts/roster';
import { detailHref, esc, kindTag } from './html';

export interface Converted {
  html: string;
  /** Second level headings, in order, for the contents list. */
  toc: { id: string; text: string }[];
}

export interface ConvertOptions {
  /** Relative path from the page to the site root. */
  rel: string;
  /** Link library names to their detail views. */
  linkLibraries: boolean;
  /** Maps each relative link in the source to its place on the site. */
  links: Record<string, string>;
  /** Extra HTML placed right after the heading with this text. */
  afterHeading?: { text: string; html: string };
}

const LIBRARIES = Object.entries(ROSTER)
  .map(([build, entry]) => ({ build, library: entry.library, kit: entry.kind === 'assembly-kit' }))
  .sort((a, b) => b.library.length - a.library.length);

const LIBRARY_PATTERN = new RegExp(
  `(?<![\\w/])(${LIBRARIES.map((l) => l.library.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})(?![\\w/])`,
  'g',
);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

type Flags = { noLink: boolean; kitTag: boolean };

function hasChildren(token: Token): token is Token & { tokens: Token[] } {
  return 'tokens' in token && Array.isArray(token.tokens);
}

export function convert(source: string, options: ConvertOptions): Converted {
  const flags = new WeakMap<Token, Flags>();
  const toc: Converted['toc'] = [];
  const used = new Set<string>();
  let afterHeadingPlaced = false;

  const mark = (tokens: Token[], ctx: Flags): void => {
    for (const token of tokens) {
      if (token.type === 'text' && !hasChildren(token)) flags.set(token, ctx);
      const inner: Flags =
        token.type === 'link' || token.type === 'heading' || token.type === 'codespan' ? { ...ctx, noLink: true } : ctx;
      if (hasChildren(token)) mark(token.tokens, inner);
      if (token.type === 'list') for (const item of (token as Tokens.List).items) mark(item.tokens, inner);
      if (token.type === 'table') {
        const table = token as Tokens.Table;
        const hasKind = table.header.some((cell) => cell.text.trim().toLowerCase() === 'kind');
        const cellCtx = { ...inner, kitTag: !hasKind };
        for (const cell of table.header) mark(cell.tokens, { ...cellCtx, noLink: true });
        for (const row of table.rows) for (const cell of row) mark(cell.tokens, cellCtx);
      }
    }
  };

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        let id = slugify(text);
        while (used.has(id)) id = `${id}-x`;
        used.add(id);
        if (depth === 2) toc.push({ id, text });
        let extra = '';
        if (options.afterHeading && text === options.afterHeading.text) {
          extra = options.afterHeading.html;
          afterHeadingPlaced = true;
        }
        return `<h${depth} id="${id}">${inner}</h${depth}>\n${extra}`;
      },
      text(token) {
        if ('tokens' in token && token.tokens) return this.parser.parseInline(token.tokens);
        const html = 'escaped' in token && token.escaped ? token.text : esc(token.text);
        const flag = flags.get(token);
        if (!options.linkLibraries || !flag || flag.noLink) return html;
        return html.replace(LIBRARY_PATTERN, (name: string) => {
          const lib = LIBRARIES.find((l) => l.library === name);
          if (!lib) return name;
          const tag = flag.kitTag && lib.kit ? ` ${kindTag('assembly-kit')}` : '';
          return `<a href="${detailHref(options.rel, lib.build)}">${name}</a>${tag}`;
        });
      },
    },
  });

  const rewriteLink = (token: Token): void => {
    if (token.type !== 'link' && token.type !== 'image') return;
    const link = token as Tokens.Link;
    if (/^(https?:|mailto:|#)/.test(link.href)) return;
    const target = options.links[link.href];
    if (target === undefined) {
      throw new Error(`markdown link "${link.href}" has no place on the site. Map it in site/vite.config.ts.`);
    }
    link.href = target;
  };

  const tokens = marked.lexer(source);
  mark(tokens, { noLink: false, kitTag: false });
  marked.walkTokens(tokens, rewriteLink);
  // Wide tables and code blocks scroll sideways at narrow widths. A scrolling
  // region has to take keyboard focus, and it needs a name to be announced.
  let tables = 0;
  const html = marked
    .parser(tokens)
    .replace(/<table>/g, () => {
      tables += 1;
      return `<div class="my-6 overflow-x-auto rounded-lg border" role="region" tabindex="0" aria-label="Table ${tables}"><table>`;
    })
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<pre>/g, '<pre tabindex="0">');
  if (options.afterHeading && !afterHeadingPlaced) {
    throw new Error(`markdown source has no heading "${options.afterHeading.text}" to place the site link after`);
  }
  return { html, toc };
}
