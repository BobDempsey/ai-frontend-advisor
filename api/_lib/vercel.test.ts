import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GROUNDING_FILES } from './grounding';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** The paths in an `includeFiles` value, which is one path or a `{a,b,c}` brace list. */
function includedPaths(pattern: string): string[] {
  const brace = /^\{(.*)\}$/.exec(pattern);
  return (brace ? (brace[1] ?? '').split(',') : [pattern]).map((p) => p.trim()).filter(Boolean);
}

describe('vercel.json', () => {
  const config = JSON.parse(readFileSync(join(repoRoot, 'vercel.json'), 'utf8')) as {
    functions?: Record<string, { includeFiles?: string }>;
  };
  const includeFiles = config.functions?.['api/chat.ts']?.includeFiles ?? '';
  const included = includedPaths(includeFiles);

  it('ships every grounding file with the chat function', () => {
    const missing = GROUNDING_FILES.filter((file) => !included.includes(file));
    expect(missing, `includeFiles is ${includeFiles}`).toEqual([]);
  });

  it('lists only paths that match files in the repo', () => {
    expect(included.length).toBeGreaterThan(0);
    for (const path of included) {
      const star = /^(.*)\/\*(\.\w+)$/.exec(path);
      if (star) {
        const [, dir = '', ext = ''] = star;
        expect(readdirSync(join(repoRoot, dir)).some((f) => f.endsWith(ext)), path).toBe(true);
      } else {
        expect(existsSync(join(repoRoot, path)), path).toBe(true);
      }
    }
  });

  it('reads a brace list and a single path', () => {
    expect(includedPaths('{a.md,b/*.json}')).toEqual(['a.md', 'b/*.json']);
    expect(includedPaths('a.md')).toEqual(['a.md']);
  });
});
