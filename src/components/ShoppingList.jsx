import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Check, Trash2, X, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Modal from './Modal'

const DRAG_THRESHOLD = 88
const CLICK_THRESHOLD = 6

export default function ShoppingList({ user }) {
  const [items, setItems] = useState([])
  const [purchases, setPurchases] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAddInput, setShowAddInput] = useState(false)
  const [alert, setAlert] = useState(null)
  const [editingItemId, setEditingItemId] = useState(null)
  const [editName, setEditName] = useState('')
  const addInputRef = useRef(null)

  useEffect(() => {
    if (!alert) return
    const timer = setTimeout(() => setAlert(null), 3500)
    return () => clearTimeout(timer)
  }, [alert])

  async function loadAll() {
    setLoading(true)
    const [{ data: itemsData }, { data: purchasesData }] = await Promise.all([
      supabase.from('shopping_items').select('*').order('name'),
      supabase.from('shopping_purchases').select('item_id, purchased_at'),
    ])
    setItems(itemsData || [])
    setPurchases(purchasesData || [])
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    if (showAddInput) addInputRef.current?.focus()
  }, [showAddInput])

  const today = new Date().toISOString().slice(0, 10)

  const sorted = useMemo(() => {
    const copy = [...items]
    return copy.sort((a, b) => {
      const aBought = purchases.some((p) => p.item_id === a.id && p.purchased_at === today)
      const bBought = purchases.some((p) => p.item_id === b.id && p.purchased_at === today)
      if (aBought !== bBought) return aBought ? 1 : -1
      return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    })
  }, [items, purchases, today])

  async function addItem() {
    const name = newName.trim()
    if (!name) {
      setShowAddInput(false)
      return
    }
    const alreadyExists = items.some((i) => i.name.toLowerCase() === name.toLowerCase())
    if (alreadyExists) {
      setAlert({ type: 'info', message: 'Item já está na lista.' })
      setNewName('')
      setShowAddInput(false)
      return
    }
    const { data, error } = await supabase.from('shopping_items').insert({ name }).select().single()
    if (error) {
      setAlert({ type: 'error', message: `Não foi possível adicionar item: ${error.message}` })
    } else if (data) {
      setItems((prev) => [...prev, data])
    }
    setNewName('')
    setShowAddInput(false)
  }

  function openEditItem(item) {
    setEditingItemId(item.id)
    setEditName(item.name)
  }

  async function saveEditItem() {
    if (!editName.trim() || !editingItemId) {
      setEditingItemId(null)
      return
    }
    const { data, error } = await supabase
      .from('shopping_items')
      .update({ name: editName.trim() })
      .eq('id', editingItemId)
      .select()
      .single()
    if (!error && data) {
      setItems((prev) => prev.map((i) => (i.id === data.id ? data : i)))
    }
    setEditingItemId(null)
    setEditName('')
  }

  async function removeItem(id) {
    await supabase.from('shopping_items').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function markPurchased(item) {
    const alreadyToday = purchases.some((p) => p.item_id === item.id && p.purchased_at === today)
    if (alreadyToday) return
    const { data, error } = await supabase
      .from('shopping_purchases')
      .insert({ item_id: item.id, purchased_at: today, purchased_by: user })
      .select('item_id, purchased_at')
      .single()
    if (!error && data) {
      setPurchases((prev) => [...prev, data])
    }
  }

  // arrastar card: direita = marcar como comprado, esquerda = remover
  const dragStartX = useRef(0)
  const [drag, setDrag] = useState({ id: null, x: 0, dragging: false })

  function handleDragStart(e, id) {
    dragStartX.current = e.clientX
    setDrag({ id, x: 0, dragging: true })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleDragMove(e, id) {
    if (!drag.dragging || drag.id !== id) return
    const dx = e.clientX - dragStartX.current
    setDrag((d) => (d.id === id ? { ...d, x: dx } : d))
  }

  function handleDragEnd(e, id, item) {
    if (drag.id !== id) return
    const dx = drag.x

    if (!drag.dragging) return

    if (Math.abs(dx) < CLICK_THRESHOLD) {
      setDrag({ id: null, x: 0, dragging: false })
      return
    }

    if (dx > DRAG_THRESHOLD) {
      setDrag({ id: null, x: 0, dragging: false })
      markPurchased(item)
      return
    }

    if (dx < -DRAG_THRESHOLD) {
      setDrag({ id, x: -600, dragging: false })
      setTimeout(() => {
        removeItem(item.id)
        setDrag({ id: null, x: 0, dragging: false })
      }, 180)
      return
    }

    setDrag({ id: null, x: 0, dragging: false })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-semibold text-xl text-ink">Lista de compras</h2>
        <p className="text-xs text-ink/40 mt-0.5">Arraste um item para a direita pra marcar como comprado, para a esquerda pra remover.</p>
      </div>

      {alert && (
        <div className={`rounded-card border px-4 py-3 text-sm flex items-start justify-between gap-3 ${
          alert.type === 'error'
            ? 'bg-coral/10 border-coral text-coral'
            : 'bg-teal/10 border-teal text-teal'
        }`}>
          <span>{alert.message}</span>
          <button
            onClick={() => setAlert(null)}
            className="rounded-full p-1 text-current hover:bg-black/5 transition-colors"
            aria-label="Fechar alerta"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="fixed z-20 bottom-20 right-4 sm:bottom-6 sm:right-6 flex items-center gap-2">
        <div
          className={`relative overflow-hidden transition-all duration-300 ease-out ${
            showAddInput ? 'w-48 sm:w-64 opacity-100' : 'w-0 opacity-0'
          }`}
        >
          <input
            ref={addInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="Adicionar item"
            className="w-48 sm:w-64 rounded-full border border-line px-4 py-2 text-sm bg-card shadow-lg focus:border-teal outline-none"
          />
        </div>
        <button
          onClick={() => (showAddInput ? addItem() : setShowAddInput(true))}
          aria-label={showAddInput ? 'Confirmar item' : 'Adicionar item'}
          title={showAddInput ? 'Confirmar item' : 'Adicionar item'}
          className="shrink-0 flex items-center justify-center bg-ink text-base w-10 h-10 rounded-full shadow-lg hover:bg-ink/80 transition-colors"
        >
          {showAddInput ? <Check size={16} /> : <Plus size={16} />}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : sorted.length === 0 ? (
        <EmptyState text="Nenhum item ainda. Toque no + abaixo para adicionar." />
      ) : (
        <ul className="space-y-2">
          {sorted.map((item) => {
            const alreadyBoughtToday = purchases.some(
              (p) => p.item_id === item.id && p.purchased_at === today,
            )
            const isDragging = drag.id === item.id
            const isActiveDrag = isDragging && drag.dragging
            const dragX = isDragging ? drag.x : 0
            return (
              <li key={item.id} className="relative rounded-card overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-between px-5">
                  <Check
                    size={18}
                    className={`text-teal-dark transition-all ${isActiveDrag && dragX > 0 ? 'opacity-100' : 'opacity-0'} ${dragX > DRAG_THRESHOLD ? 'scale-125' : 'scale-100'}`}
                  />
                  <Trash2
                    size={18}
                    className={`text-coral transition-all ${isActiveDrag && dragX < 0 ? 'opacity-100' : 'opacity-0'} ${dragX < -DRAG_THRESHOLD ? 'scale-125' : 'scale-100'}`}
                  />
                </div>

                <div
                  className="relative bg-card rounded-card border border-line flex items-center justify-between gap-3 px-4 py-3"
                  style={{
                    transform: `translateX(${dragX}px)`,
                    transition: isActiveDrag ? 'none' : 'transform 0.2s ease',
                    touchAction: 'pan-y',
                  }}
                  onPointerDown={(e) => handleDragStart(e, item.id)}
                  onPointerMove={(e) => handleDragMove(e, item.id)}
                  onPointerUp={(e) => handleDragEnd(e, item.id, item)}
                  onPointerCancel={() => setDrag({ id: null, x: 0, dragging: false })}
                >
                  <p className={`font-medium truncate ${alreadyBoughtToday ? 'text-ink/40 line-through' : 'text-ink'}`}>
                    {item.name}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditItem(item) }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Editar item"
                    className="shrink-0 p-1.5 text-ink/30 hover:text-ink/60 rounded-full"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editingItemId && (
        <Modal
          title="Editar item"
          onClose={() => setEditingItemId(null)}
          footer={
            <div className="flex gap-2">
              <button onClick={() => setEditingItemId(null)} className="flex-1 py-2 rounded-full border border-line text-sm">
                Cancelar
              </button>
              <button onClick={saveEditItem} className="flex-1 py-2 rounded-full bg-ink text-base text-sm font-medium">
                Salvar
              </button>
            </div>
          }
        >
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveEditItem()}
            className="w-full rounded-full border border-line px-4 py-2 text-sm"
            autoFocus
          />
        </Modal>
      )}
    </div>
  )
}

export function EmptyState({ text }) {
  return (
    <div className="border border-dashed border-line rounded-card px-4 py-8 text-center text-sm text-ink/40">
      {text}
    </div>
  )
}
