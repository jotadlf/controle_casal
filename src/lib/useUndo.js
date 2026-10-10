import { useCallback, useEffect, useRef, useState } from 'react'

const UNDO_TIMEOUT_MS = 6000

export function isTypingTarget(target) {
  if (!target) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

// Guarda a última ação desfazível (mover, redimensionar, excluir, duplicar…)
// por alguns segundos, como o "Desfazer" do Notion. `push(label, undo)`
// registra a ação; `undo` é uma função async que reverte a mudança.
// Ctrl/Cmd+Z também desfaz enquanto o aviso está na tela, a menos que
// `enabled` seja falso (ex.: outra tela por cima).
export function useUndo({ enabled = true } = {}) {
  const [pending, setPending] = useState(null) // null | { label, undo }
  const pendingRef = useRef(null)
  const timer = useRef(null)

  const set = useCallback((value) => {
    pendingRef.current = value
    setPending(value)
  }, [])

  const dismiss = useCallback(() => {
    clearTimeout(timer.current)
    set(null)
  }, [set])

  const push = useCallback((label, undo) => {
    clearTimeout(timer.current)
    set({ label, undo })
    timer.current = setTimeout(() => set(null), UNDO_TIMEOUT_MS)
  }, [set])

  const runUndo = useCallback(async () => {
    const current = pendingRef.current
    if (!current) return
    dismiss()
    await current.undo()
  }, [dismiss])

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (!pending || !enabled) return
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !isTypingTarget(e.target)) {
        e.preventDefault()
        runUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pending, enabled, runUndo])

  return { pending, push, dismiss, runUndo }
}
