/** Theme pack data (E002) — the industry-standard set (opencode's JSON
 * themes, MIT) mapped onto OpenKai's token slots, hex converted to xterm-256.
 * Generated from the upstream JSON; do not hand-tune values here.
 */

export interface ThemePack {
  dark?: Record<string, number>;
  light?: Record<string, number>;
}

export const THEME_PACKS: Record<string, ThemePack> = {
  "catppuccin": {
    "dark": {
      "surface1": 59,
      "surface2": 17,
      "surface3": 17,
      "text": 189,
      "textMuted": 145,
      "highlight": 153,
      "highlightDanger": 217,
      "toolBorder": 102,
      "attention": 223
    },
    "light": {
      "surface1": 231,
      "surface2": 231,
      "surface3": 189,
      "text": 66,
      "textMuted": 103,
      "highlight": 69,
      "highlightDanger": 161,
      "toolBorder": 146,
      "attention": 179
    }
  },
  "dracula": {
    "dark": {
      "surface3": 60,
      "text": 231,
      "textMuted": 103,
      "highlight": 183,
      "highlightDanger": 210,
      "attention": 229
    },
    "light": {
      "highlight": 183,
      "highlightDanger": 210,
      "attention": 229
    }
  },
  "gruvbox": {
    "dark": {
      "surface1": 235,
      "surface2": 59,
      "surface3": 95,
      "text": 223,
      "textMuted": 144,
      "highlight": 145,
      "highlightDanger": 203,
      "toolBorder": 95,
      "attention": 214
    },
    "light": {
      "surface1": 230,
      "surface2": 223,
      "surface3": 187,
      "text": 59,
      "textMuted": 102,
      "highlight": 30,
      "highlightDanger": 124,
      "toolBorder": 187,
      "attention": 130
    }
  },
  "nord": {
    "dark": {
      "surface1": 59,
      "surface2": 60,
      "surface3": 60,
      "text": 231,
      "highlight": 152,
      "highlightDanger": 174,
      "toolBorder": 60,
      "attention": 180
    },
    "light": {
      "surface1": 231,
      "surface2": 195,
      "surface3": 189,
      "text": 59,
      "textMuted": 60,
      "highlight": 109,
      "highlightDanger": 174,
      "toolBorder": 66,
      "attention": 180
    }
  },
  "one-dark": {
    "dark": {
      "surface1": 59,
      "surface2": 59,
      "surface3": 59,
      "text": 146,
      "textMuted": 102,
      "highlight": 111,
      "highlightDanger": 174,
      "attention": 186
    },
    "light": {
      "surface1": 231,
      "surface2": 231,
      "surface3": 231,
      "text": 59,
      "textMuted": 145,
      "highlight": 69,
      "highlightDanger": 173,
      "attention": 178
    }
  },
  "rosepine": {
    "dark": {
      "surface1": 17,
      "surface2": 59,
      "surface3": 59,
      "textMuted": 103,
      "highlight": 152,
      "highlightDanger": 211,
      "toolBorder": 59,
      "attention": 222
    },
    "light": {
      "surface1": 231,
      "surface2": 231,
      "surface3": 230,
      "textMuted": 145,
      "highlight": 67
    }
  },
  "solarized": {
    "dark": {
      "surface1": 23,
      "surface2": 23,
      "text": 145,
      "textMuted": 102,
      "highlight": 74,
      "highlightDanger": 167,
      "attention": 178
    },
    "light": {
      "surface1": 230,
      "surface2": 230,
      "text": 103,
      "textMuted": 145,
      "highlight": 74,
      "highlightDanger": 167,
      "attention": 178
    }
  },
  "tokyonight": {
    "dark": {
      "surface1": 59,
      "surface2": 59,
      "surface3": 59,
      "text": 189,
      "textMuted": 146,
      "highlight": 147,
      "highlightDanger": 210,
      "toolBorder": 102,
      "attention": 216
    },
    "light": {
      "surface1": 189,
      "surface2": 188,
      "surface3": 188,
      "text": 68,
      "textMuted": 145,
      "highlight": 69,
      "highlightDanger": 204,
      "toolBorder": 145,
      "attention": 136
    }
  }
};
