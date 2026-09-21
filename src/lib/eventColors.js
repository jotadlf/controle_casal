export const EVENT_COLORS = [
  {
    key: 'sky',
    label: 'Azul',
    swatch: 'bg-sky-400',
    card: 'bg-sky-200 dark:bg-sky-900/50 border-sky-400 dark:border-sky-600',
    text: 'text-sky-900 dark:text-sky-200',
    subtext: 'text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  {
    key: 'rose',
    label: 'Rosa',
    swatch: 'bg-rose-400',
    card: 'bg-rose-200 dark:bg-rose-900/50 border-rose-400 dark:border-rose-600',
    text: 'text-rose-900 dark:text-rose-200',
    subtext: 'text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  {
    key: 'amber',
    label: 'Âmbar',
    swatch: 'bg-amber-400',
    card: 'bg-amber-200 dark:bg-amber-900/50 border-amber-400 dark:border-amber-600',
    text: 'text-amber-900 dark:text-amber-200',
    subtext: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  {
    key: 'emerald',
    label: 'Verde',
    swatch: 'bg-emerald-400',
    card: 'bg-emerald-200 dark:bg-emerald-900/50 border-emerald-400 dark:border-emerald-600',
    text: 'text-emerald-900 dark:text-emerald-200',
    subtext: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  {
    key: 'violet',
    label: 'Violeta',
    swatch: 'bg-violet-400',
    card: 'bg-violet-200 dark:bg-violet-900/50 border-violet-400 dark:border-violet-600',
    text: 'text-violet-900 dark:text-violet-200',
    subtext: 'text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  {
    key: 'slate',
    label: 'Cinza',
    swatch: 'bg-slate-400',
    card: 'bg-slate-200 dark:bg-slate-800/60 border-slate-400 dark:border-slate-500',
    text: 'text-slate-900 dark:text-slate-200',
    subtext: 'text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-500',
  },
]

export const DEFAULT_EVENT_COLOR = 'sky'

export function getEventColor(key) {
  return EVENT_COLORS.find((c) => c.key === key) || EVENT_COLORS[0]
}
