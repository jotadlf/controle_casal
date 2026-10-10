import { X } from 'lucide-react'

export default function UndoToast({ undo }) {
  if (!undo.pending) return null
  return (
    <div className="fixed z-50 left-1/2 -translate-x-1/2 bottom-36 sm:bottom-20 flex items-center gap-3 bg-ink text-base rounded-full shadow-lg pl-4 pr-1.5 py-1.5 text-sm animate-pop-in max-w-[calc(100vw-2rem)]">
      <span className="truncate">{undo.pending.label}</span>
      <button onClick={undo.runUndo} className="font-semibold text-teal-light hover:underline shrink-0">
        Desfazer
      </button>
      <button onClick={undo.dismiss} aria-label="Fechar aviso" className="p-1 rounded-full opacity-60 hover:opacity-100 shrink-0">
        <X size={14} />
      </button>
    </div>
  )
}
