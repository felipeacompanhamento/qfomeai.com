// Design System Canonical Tokens for QFomeAI
export const DESIGN_TOKENS = {
  colors: {
    primary: {
      default: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white',
      soft: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
      text: 'text-emerald-600',
      border: 'border-emerald-600',
      ring: 'focus:ring-emerald-500/20 focus:border-emerald-500',
    },
    secondary: {
      default: 'bg-white hover:bg-stone-50 active:bg-stone-100 text-stone-700 border border-stone-200',
      soft: 'bg-stone-100 text-stone-700',
      text: 'text-stone-700',
      border: 'border-stone-200',
    },
    ghost: {
      default: 'bg-transparent hover:bg-stone-100 active:bg-stone-200 text-stone-600 hover:text-stone-900',
    },
    danger: {
      default: 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white',
      soft: 'bg-rose-50 text-rose-700 border border-rose-200/60',
      text: 'text-rose-600',
      border: 'border-rose-300',
      ring: 'focus:ring-rose-500/20 focus:border-rose-500',
    },
    warning: {
      default: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white',
      soft: 'bg-amber-50 text-amber-800 border border-amber-200/60',
      text: 'text-amber-600',
      border: 'border-amber-300',
    },
    success: {
      default: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white',
      soft: 'bg-emerald-50 text-emerald-800 border border-emerald-200/60',
      text: 'text-emerald-600',
      border: 'border-emerald-300',
    },
    info: {
      default: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white',
      soft: 'bg-blue-50 text-blue-800 border border-blue-200/60',
      text: 'text-blue-600',
      border: 'border-blue-300',
    },
    neutral: {
      background: 'bg-stone-50',
      surface: 'bg-white',
      border: 'border-stone-200',
      borderSoft: 'border-stone-100',
      textPrimary: 'text-stone-800',
      textSecondary: 'text-stone-500',
      textMuted: 'text-stone-400',
    },
  },
  radius: {
    card: 'rounded-3xl',
    cardCompact: 'rounded-2xl',
    button: 'rounded-xl',
    input: 'rounded-xl',
    modal: 'rounded-3xl',
    badge: 'rounded-full',
  },
  spacing: {
    page: 'space-y-6 font-sans',
    cardPadding: 'p-4 sm:p-5',
    cardPaddingLarge: 'p-5 sm:p-6',
    toolbarGap: 'gap-3',
  },
  shadows: {
    card: 'shadow-sm',
    dropdown: 'shadow-lg',
    modal: 'shadow-xl',
  },
} as const;
