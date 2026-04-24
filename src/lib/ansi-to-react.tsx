/**
 * Lightweight ANSI SGR escape code → React element renderer.
 *
 * Handles: bold, dim, italic, underline, reset, 8-color,
 * 256-color (38;5;N), and 24-bit RGB (38;2;R;G;B) for fg/bg.
 * Strips sequences it doesn't understand so they never leak
 * into the visible output.
 */

import React from "react";

// Standard 8 colors (SGR 30-37 / 40-47)
const COLORS_8: Record<number, string> = {
  0: "#1e1e1e", // black
  1: "#e06c75", // red
  2: "#98c379", // green
  3: "#e5c07b", // yellow / gold
  4: "#61afef", // blue
  5: "#c678dd", // magenta
  6: "#56b6c2", // cyan
  7: "#abb2bf", // white
};

// Bright variants (SGR 90-97 / 100-107)
const BRIGHT_8: Record<number, string> = {
  0: "#5c6370",
  1: "#e06c75",
  2: "#98c379",
  3: "#d19a66",
  4: "#61afef",
  5: "#c678dd",
  6: "#56b6c2",
  7: "#ffffff",
};

// 256-color palette (first 16 = standard, 16-231 = 6×6×6 cube, 232-255 = grayscale)
function color256(n: number): string {
  if (n < 8) return COLORS_8[n] ?? "#abb2bf";
  if (n < 16) return BRIGHT_8[n - 8] ?? "#abb2bf";
  if (n < 232) {
    const idx = n - 16;
    const r = Math.floor(idx / 36);
    const g = Math.floor((idx % 36) / 6);
    const b = idx % 6;
    return `rgb(${r ? r * 40 + 55 : 0},${g ? g * 40 + 55 : 0},${b ? b * 40 + 55 : 0})`;
  }
  const gray = 8 + (n - 232) * 10;
  return `rgb(${gray},${gray},${gray})`;
}

interface Style {
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  fg?: string;
  bg?: string;
}

function applyParams(params: number[], style: Style): Style {
  const s = { ...style };
  let i = 0;
  while (i < params.length) {
    const p = params[i];
    if (p === 0) {
      // Reset all
      return {};
    } else if (p === 1) {
      s.bold = true;
    } else if (p === 2) {
      s.dim = true;
    } else if (p === 3) {
      s.italic = true;
    } else if (p === 4) {
      s.underline = true;
    } else if (p === 22) {
      s.bold = false;
      s.dim = false;
    } else if (p === 23) {
      s.italic = false;
    } else if (p === 24) {
      s.underline = false;
    } else if (p >= 30 && p <= 37) {
      s.fg = COLORS_8[p - 30];
    } else if (p === 38) {
      // Extended fg: 38;5;N or 38;2;R;G;B
      if (params[i + 1] === 5 && i + 2 < params.length) {
        s.fg = color256(params[i + 2]);
        i += 2;
      } else if (params[i + 1] === 2 && i + 4 < params.length) {
        s.fg = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
        i += 4;
      }
    } else if (p === 39) {
      delete s.fg;
    } else if (p >= 40 && p <= 47) {
      s.bg = COLORS_8[p - 40];
    } else if (p === 48) {
      // Extended bg
      if (params[i + 1] === 5 && i + 2 < params.length) {
        s.bg = color256(params[i + 2]);
        i += 2;
      } else if (params[i + 1] === 2 && i + 4 < params.length) {
        s.bg = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
        i += 4;
      }
    } else if (p === 49) {
      delete s.bg;
    } else if (p >= 90 && p <= 97) {
      s.fg = BRIGHT_8[p - 90];
    } else if (p >= 100 && p <= 107) {
      s.bg = BRIGHT_8[p - 100];
    }
    i++;
  }
  return s;
}

function styleToCSS(s: Style): React.CSSProperties | undefined {
  const css: React.CSSProperties = {};
  let any = false;
  if (s.bold) { css.fontWeight = "bold"; any = true; }
  if (s.dim) { css.opacity = 0.6; any = true; }
  if (s.italic) { css.fontStyle = "italic"; any = true; }
  if (s.underline) { css.textDecoration = "underline"; any = true; }
  if (s.fg) { css.color = s.fg; any = true; }
  if (s.bg) { css.backgroundColor = s.bg; css.borderRadius = "2px"; css.padding = "0 2px"; any = true; }
  return any ? css : undefined;
}

// Regex: ESC [ <params> m   - SGR sequence
const ANSI_RE = /\x1b\[([0-9;]*)m/g;

export function AnsiText({ text }: { text: string }) {
  // Fast path: no escape codes
  if (!text.includes("\x1b[")) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let style: Style = {};
  let lastIndex = 0;
  let key = 0;

  let match: RegExpExecArray | null;
  ANSI_RE.lastIndex = 0;
  while ((match = ANSI_RE.exec(text)) !== null) {
    // Text before this escape
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      const css = styleToCSS(style);
      parts.push(css ? <span key={key++} style={css}>{chunk}</span> : chunk);
    }
    // Parse SGR params
    const rawParams = match[1];
    const params = rawParams ? rawParams.split(";").map(Number) : [0];
    style = applyParams(params, style);
    lastIndex = ANSI_RE.lastIndex;
  }

  // Remaining text after last escape
  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    const css = styleToCSS(style);
    parts.push(css ? <span key={key++} style={css}>{chunk}</span> : chunk);
  }

  return <span className="whitespace-pre-wrap">{parts}</span>;
}
