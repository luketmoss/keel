import { describe, it, expect } from 'vitest';

import { readGlobalCss } from './test-css';

// The tokens come from the suite file (#446), so read the stylesheet the build
// sees: global.css with ui/tokens/suite.css resolved into its token blocks.
const css = readGlobalCss();

/**
 * Extract the content of the :root block from CSS source.
 */
function extractRootBlock(source: string): string {
  const re = /:root\s*\{/g;
  const match = re.exec(source);
  if (!match) return '';

  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

const rootBlock = extractRootBlock(css);

// Helper: extract [data-theme="dark"] block
function extractDarkBlock(source: string): string {
  const re = /\[data-theme=["']dark["']\]\s*\{/g;
  const match = re.exec(source);
  if (!match) return '';
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

const darkBlock = extractDarkBlock(css);

// Hive's light theme has a block of its own since #446; it used to be :root.
function extractLightBlock(source: string): string {
  const re = /\[data-theme=["']light["']\]\s*\{/g;
  const match = re.exec(source);
  if (!match) return '';
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

const lightBlock = extractLightBlock(css);

describe('Design tokens: shared vocabulary (Issue #191)', () => {
  describe('AC1: Spacing scale tokens', () => {
    it.each([
      ['--space-xs', '4px'],
      ['--space-sm', '8px'],
      ['--space-md', '16px'],
      ['--space-lg', '24px'],
      ['--space-xl', '32px'],
      ['--space-2xl', '48px'],
    ])('%s equals %s in :root', (token, value) => {
      expect(rootBlock).toMatch(new RegExp(`${token}:\\s*${value}`));
    });
  });

  describe('AC2: Typography scale and font-stack tokens', () => {
    it.each([
      ['--text-xs', '0.75rem'],
      ['--text-sm', '0.875rem'],
      ['--text-base', '1rem'],
      ['--text-lg', '1.125rem'],
      ['--text-xl', '1.25rem'],
      ['--text-2xl', '1.5rem'],
    ])('%s equals %s in :root', (token, value) => {
      expect(rootBlock).toMatch(new RegExp(`${token}:\\s*${value}`));
    });

    it('--font-sans is defined in :root', () => {
      expect(rootBlock).toMatch(/--font-sans:/);
    });

    it('--font-mono is defined in :root', () => {
      expect(rootBlock).toMatch(/--font-mono:/);
    });
  });

  describe('AC3: Transition tokens', () => {
    it('--transition-fast equals 150ms ease', () => {
      expect(rootBlock).toMatch(/--transition-fast:\s*150ms ease/);
    });

    it('--transition-normal equals 250ms ease', () => {
      expect(rootBlock).toMatch(/--transition-normal:\s*250ms ease/);
    });
  });

  describe('AC4: Surface and text colour tokens', () => {
    // #446: the suite supplies these. Raised is white in light, muted text is
    // the AA tone, and --color-border-light is the suite's hairline; Hive's old
    // outline meaning moved to --color-border-strong.
    it('--color-surface-raised is #ffffff in [data-theme="light"]', () => {
      expect(lightBlock).toMatch(/--color-surface-raised:\s*#ffffff/);
    });

    it('--color-border-light is #e8eaed in [data-theme="light"]', () => {
      expect(lightBlock).toMatch(/--color-border-light:\s*#e8eaed/);
    });

    it('--color-text-muted is #606b76 in [data-theme="light"]', () => {
      expect(lightBlock).toMatch(/--color-text-muted:\s*#606b76/);
    });

    it('--color-surface-raised is #252528 in [data-theme="dark"]', () => {
      expect(darkBlock).toMatch(/--color-surface-raised:\s*#252528/);
    });

    it('--color-border-light is #25252b in [data-theme="dark"]', () => {
      expect(darkBlock).toMatch(/--color-border-light:\s*#25252b/);
    });

    it('--color-text-muted is #868e98 in [data-theme="dark"]', () => {
      expect(darkBlock).toMatch(/--color-text-muted:\s*#868e98/);
    });
  });

  describe('AC5: Border radius tokens', () => {
    it('--radius-md is defined in :root', () => {
      expect(rootBlock).toMatch(/--radius-md:/);
    });

    it('--radius-lg equals 16px in :root', () => {
      expect(rootBlock).toMatch(/--radius-lg:\s*16px/);
    });

    it('--radius-full equals 9999px in :root', () => {
      expect(rootBlock).toMatch(/--radius-full:\s*9999px/);
    });

    it('existing --radius remains 8px', () => {
      expect(rootBlock).toMatch(/--radius:\s*8px/);
    });

    it('existing --radius-sm remains 4px', () => {
      expect(rootBlock).toMatch(/--radius-sm:\s*4px/);
    });
  });
});

describe('Design tokens: gold color scheme (Issue #190)', () => {
  describe('AC1: Gold primary tokens in light mode', () => {
    it('--color-primary is #805F00 in light theme', () => {
      expect(lightBlock).toMatch(/--color-primary:\s*#805F00/);
    });
    it('--color-primary-hover is #6B5000 in light theme', () => {
      expect(lightBlock).toMatch(/--color-primary-hover:\s*#6B5000/);
    });
    it('--color-primary-rgb is 128, 95, 0 in light theme', () => {
      expect(lightBlock).toMatch(/--color-primary-rgb:\s*128, 95, 0/);
    });
    it('--color-focus is #805F00 in light theme', () => {
      expect(lightBlock).toMatch(/--color-focus:\s*#805F00/);
    });
  });

  describe('AC2: Gold primary tokens in dark mode', () => {
    it('--color-primary is #F5B700 in dark mode', () => {
      expect(darkBlock).toMatch(/--color-primary:\s*#F5B700/);
    });
    it('--color-primary-hover is #FFD54F in dark mode', () => {
      expect(darkBlock).toMatch(/--color-primary-hover:\s*#FFD54F/);
    });
    it('--color-primary-rgb is 245, 183, 0 in dark mode', () => {
      expect(darkBlock).toMatch(/--color-primary-rgb:\s*245, 183, 0/);
    });
    it('--color-focus is #F5B700 in dark mode', () => {
      expect(darkBlock).toMatch(/--color-focus:\s*#F5B700/);
    });
  });

  describe('AC3: Accent token for logo/branding', () => {
    it('--color-accent is #F5B700 in :root', () => {
      expect(rootBlock).toMatch(/--color-accent:\s*#F5B700/);
    });
    it('--color-accent is not redefined per theme, so it is #F5B700 in dark mode too', () => {
      expect(darkBlock).not.toMatch(/--color-accent:/);
      expect(lightBlock).not.toMatch(/--color-accent:/);
    });
  });

  describe('AC4: WCAG AA contrast for interactive elements', () => {
    // #447: the light fill is dark enough for white text, so the text is a token:
    // white in light, #1f1f1f in dark (as it was).
    it('.btn-primary uses var(--color-on-primary), #1f1f1f in dark and not white', () => {
      const match = css.match(/\.btn-primary\s*\{[^}]*\}/);
      expect(match).not.toBeNull();
      expect(match![0]).toContain('color: var(--color-on-primary)');
      expect(match![0]).not.toContain('color: white');
      expect(darkBlock).toMatch(/--color-on-primary:\s*#1f1f1f/);
    });
  });

  describe('AC5: No blue primary remnants', () => {
    it('no #1976d2 in global.css', () => {
      expect(css).not.toContain('#1976d2');
    });
    it('no #90caf9 in global.css', () => {
      expect(css).not.toContain('#90caf9');
    });
    it('no #1565c0 in global.css', () => {
      expect(css).not.toContain('#1565c0');
    });
    it('no #64b5f6 in global.css', () => {
      expect(css).not.toContain('#64b5f6');
    });
  });

  describe('AC6: Semantic and neutral tokens unchanged', () => {
    it('--color-bg is #f0f2f5', () => {
      expect(lightBlock).toMatch(/--color-bg:\s*#f0f2f5/);
    });
    it('--color-surface is #ffffff', () => {
      expect(lightBlock).toMatch(/--color-surface:\s*#ffffff/);
    });
    it('--color-border is #dadce0', () => {
      expect(lightBlock).toMatch(/--color-border:\s*#dadce0/);
    });
    it('--color-text is #1f1f1f', () => {
      expect(lightBlock).toMatch(/--color-text:\s*#1f1f1f/);
    });
    it('--color-text-secondary is #5f6368', () => {
      expect(lightBlock).toMatch(/--color-text-secondary:\s*#5f6368/);
    });
  });
});

describe('UX alignment (Issue #192)', () => {
  describe('AC1: Login card styling', () => {
    it('login-card has max-width 400px', () => {
      const match = css.match(/\.login-card\s*\{[^}]*\}/);
      expect(match).not.toBeNull();
      expect(match![0]).toContain('max-width: 400px');
    });
    it('login-card has border-radius var(--radius-lg)', () => {
      const match = css.match(/\.login-card\s*\{[^}]*\}/);
      expect(match![0]).toContain('border-radius: var(--radius-lg)');
    });
    it('login-card has width 100%', () => {
      const match = css.match(/\.login-card\s*\{[^}]*\}/);
      expect(match![0]).toContain('width: 100%');
    });
    it('login-screen has padding var(--space-lg)', () => {
      const match = css.match(/\.login-screen\s*\{[^}]*\}/);
      expect(match![0]).toContain('padding: var(--space-lg)');
    });
    it('login-card h1 uses var(--text-2xl)', () => {
      const match = css.match(/\.login-card h1\s*\{[^}]*\}/);
      expect(match![0]).toContain('var(--text-2xl)');
    });
    it('login-btn has width 100% and font-weight 600', () => {
      const match = css.match(/\.login-btn\s*\{[^}]*\}/);
      expect(match![0]).toContain('width: 100%');
      expect(match![0]).toContain('font-weight: 600');
    });
  });

  describe('AC2: Button touch targets', () => {
    it('.btn has min-height 48px', () => {
      const match = css.match(/\.btn\s*\{[^}]*\}/);
      expect(match![0]).toContain('min-height: 48px');
    });
    it('.btn has font-weight 600', () => {
      const match = css.match(/\.btn\s*\{[^}]*\}/);
      expect(match![0]).toContain('font-weight: 600');
    });
    it('.btn has border-radius var(--radius)', () => {
      const match = css.match(/\.btn\s*\{[^}]*\}/);
      expect(match![0]).toContain('border-radius: var(--radius)');
    });
  });

  describe('AC3: Form input styling', () => {
    it('form inputs have padding 12px 16px', () => {
      const match = css.match(/\.form-field input,[\s\S]*?\.form-field textarea\s*\{[^}]*\}/);
      expect(match).not.toBeNull();
      expect(match![0]).toContain('padding: 12px 16px');
    });
    it('form inputs have min-height 48px', () => {
      const match = css.match(/\.form-field input,[\s\S]*?\.form-field textarea\s*\{[^}]*\}/);
      expect(match![0]).toContain('min-height: 48px');
    });
    it('form inputs have font-size 16px', () => {
      const match = css.match(/\.form-field input,[\s\S]*?\.form-field textarea\s*\{[^}]*\}/);
      expect(match![0]).toContain('font-size: 16px');
    });
    it('form inputs have border-radius var(--radius)', () => {
      const match = css.match(/\.form-field input,[\s\S]*?\.form-field textarea\s*\{[^}]*\}/);
      expect(match![0]).toContain('border-radius: var(--radius)');
    });
    it('form inputs use var(--color-surface-raised) background', () => {
      const match = css.match(/\.form-field input,[\s\S]*?\.form-field textarea\s*\{[^}]*\}/);
      expect(match![0]).toContain('var(--color-surface-raised)');
    });
  });

  describe('AC4: Modal styling', () => {
    it('overlay uses rgba(0,0,0,0.4) via --color-overlay', () => {
      expect(lightBlock).toMatch(/--color-overlay:\s*rgba\(0,\s*0,\s*0,\s*0\.4\)/);
      expect(css.match(/\.modal-overlay\s*\{[^}]*\}/)![0]).toContain('var(--color-overlay)');
    });
    it('.modal has border-radius var(--radius-lg)', () => {
      const match = css.match(/\.modal\s*\{[^}]*\}/);
      expect(match![0]).toContain('border-radius: var(--radius-lg)');
    });
  });

  describe('AC5: Toast at top-center', () => {
    it('.toast uses top positioning', () => {
      const match = css.match(/\.toast\s*\{[^}]*\}/);
      expect(match![0]).toContain('top: calc(var(--header-height');
      expect(match![0]).not.toContain('bottom:');
    });
    it('toast-in animates from translateY(-16px)', () => {
      const match = css.match(/@keyframes toast-in\s*\{[^}]*from\s*\{[^}]*\}/);
      expect(match).not.toBeNull();
      expect(match![0]).toContain('translateY(-16px)');
    });
  });

  describe('AC6: Theme toggle surface-elevate style', () => {
    it('.theme-toggle-active uses surface background', () => {
      const match = css.match(/\.theme-toggle-active\s*\{[^}]*\}/);
      expect(match![0]).toContain('var(--color-surface)');
      expect(match![0]).not.toContain('var(--color-primary)');
    });
    it('.theme-toggle-active uses color: var(--color-text)', () => {
      const match = css.match(/\.theme-toggle-active\s*\{[^}]*\}/);
      expect(match![0]).toContain('color: var(--color-text)');
      expect(match![0]).not.toContain('color: white');
    });
    it('.theme-toggle-active has box-shadow', () => {
      const match = css.match(/\.theme-toggle-active\s*\{[^}]*\}/);
      expect(match![0]).toContain('box-shadow:');
    });
  });
});

describe('Design token: --color-primary-light (Issue #104)', () => {
  // AC1: Token defined in :root
  describe('AC1: Token defined in :root', () => {
    it('--color-primary-light is defined in :root', () => {
      expect(rootBlock).toContain('--color-primary-light');
    });

    it('uses color-mix with 8% primary', () => {
      expect(rootBlock).toMatch(
        /--color-primary-light:\s*color-mix\(in srgb,\s*var\(--color-primary\)\s+8%,\s*transparent\)/,
      );
    });

    it('no dark-mode override for --color-primary-light', () => {
      const darkThemeMatch = css.match(/\[data-theme=["']dark["']\]\s*\{([^}]*)\}/);
      if (darkThemeMatch) {
        expect(darkThemeMatch[1]).not.toContain('--color-primary-light');
      }
    });
  });

  // AC2: Ad-hoc primary tints unified under the token
  describe('AC2: Ad-hoc tints replaced with var(--color-primary-light)', () => {
    it('.share-member-highlight uses var(--color-primary-light)', () => {
      const match = css.match(/\.share-member-highlight\s*\{[^}]*\}/);
      expect(match).not.toBeNull();
      expect(match![0]).toContain('var(--color-primary-light)');
      expect(match![0]).not.toContain('rgba(var(--color-primary-rgb)');
    });

    it('.quick-date-chip:hover uses var(--color-surface) background', () => {
      const match = css.match(/\.quick-date-chip:hover\s*\{[^}]*\}/);
      expect(match).not.toBeNull();
      expect(match![0]).toContain('var(--color-surface)');
    });

    it('.btn-icon-danger:hover no longer has transparent primary-rgb fallback', () => {
      const match = css.match(/\.btn-icon-danger:hover\s*\{[^}]*\}/);
      expect(match).not.toBeNull();
      expect(match![0]).not.toContain('rgba(var(--color-primary-rgb)');
    });

    it('@keyframes share-fade retains 15% primary-rgb value', () => {
      const match = css.match(/@keyframes share-fade\s*\{[^}]*from\s*\{[^}]*\}[^}]*\}/);
      expect(match).not.toBeNull();
      expect(match![0]).toContain('rgba(var(--color-primary-rgb), 0.15)');
    });
  });
});

describe('Column header text wrapping (Issue #232)', () => {
  // Helper to extract a CSS rule block by selector
  function extractRule(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped + '\\s*\\{([^}]*?)\\}');
    const match = css.match(re);
    return match ? match[1] : '';
  }

  it('AC1: .column-header h2 can shrink and wrap a long name, and the row keeps its buttons beside it', () => {
    const rule = extractRule('.column-header h2');
    expect(rule).toContain('min-width: 0');
    expect(rule).toContain('word-break: break-word');
    expect(extractRule('.column-header-row')).toContain('align-items: center');
  });

  it('AC2: .column-count has flex-shrink: 0', () => {
    const rule = extractRule('.column-count');
    expect(rule).toContain('flex-shrink: 0');
  });

  it('AC2: .column-add-btn has flex-shrink: 0', () => {
    const rule = extractRule('.column-add-btn');
    expect(rule).toContain('flex-shrink: 0');
  });

  it('AC2: .column-sort-btn has flex-shrink: 0', () => {
    expect(css).toMatch(/\.column-sort-btn,\s*\.column-add-btn\s*\{[^}]*flex-shrink: 0/);
  });
});
