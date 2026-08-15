import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Check, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { analyzeItem, urgencyLabel } from '../lib/predict'
import { currentReferenceMonth } from '../lib/bills'
import PurchaseModal from './PurchaseModal'
import Modal from './Modal'

const DRAG_THRESHOLD = 88

export default function ShoppingList({ user }) {
  const [items, setItems] = useState([])
  const [purchases, setPurchases] = useState([])
  const [newName, setNewName] = useState('')
  const [shoppingSessionId, setShoppingSessionId] = useState(null)
  const [shoppingSessionStore, setShoppingSessionStore] = useState('')
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [recentStores, setRecentStores] = useState([])
  const [purchaseTarget, setPurchaseTarget] = useState(null)
  const [modalStoreName, setModalStoreName] = useState('')
  const [loading, setLoading] = useState(true)
  const [supportsPurchaseExtras, setSupportsPurchaseExtras] = useState(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [alert, setAlert] = useState(null)
  const inputContainerRef = useRef(null)

  async function loadAll() {
    setLoading(true)
    // buscar items, purchases (incluindo sessão) e sugestões de lojas
    const [{ data: itemsData }, { data: purchasesData }, { data: sessions }] = await Promise.all([
      supabase.from('shopping_items').select('*').order('name'),
      // tenta trazer dados aninhados de shopping_sessions via relacionamento (se existir)
      supabase.from('shopping_purchases').select('*, shopping_sessions(store_name)'),
      supabase.from('shopping_sessions').select('store_name').order('started_at', { ascending: false }).limit(50),
    ])
    setItems(itemsData || [])
    setPurchases(purchasesData || [])
    const distinct = Array.from(new Set((sessions || []).map((s) => s.store_name))).slice(0, 5)
    setRecentStores(distinct)
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const enriched = useMemo(() => {
    return items.map((item) => {
      const itemPurchases = purchases.filter((p) => p.item_id === item.id)
      const analysis = analyzeItem(itemPurchases)
      return { ...item, analysis }
    })
  }, [items, purchases])

  const suggestions = useMemo(() => {
    const query = newName.trim().toLowerCase()
    if (!query) return []

    return enriched
      .filter((item) => String(item.name).toLowerCase().includes(query))
      .sort((a, b) => {
        const aCount = a.analysis.timesBought ?? 0
        const bCount = b.analysis.timesBought ?? 0
        if (aCount !== bCount) return bCount - aCount
        return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
      })
      .slice(0, 5)
  }, [enriched, newName])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inputContainerRef.current && !inputContainerRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const today = new Date().toISOString().slice(0, 10)

  const sorted = useMemo(() => {
    const copy = [...enriched]
    return copy.sort((a, b) => {
      const aBought = purchases.some((p) => p.item_id === a.id)
      const bBought = purchases.some((p) => p.item_id === b.id)
      if (aBought !== bBought) return aBought ? 1 : -1
      return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    })
  }, [enriched, purchases])

  const sessionTotal = useMemo(() => {
    if (!shoppingSessionId) return 0
    return purchases
      .filter((p) => p.session_id === shoppingSessionId)
      .reduce((sum, p) => {
        const priceValue = Number(p.price ?? 0)
        const quantityValue = Number(p.quantity ?? 1)
        return sum + priceValue * Math.max(1, quantityValue)
      }, 0)
  }, [purchases, shoppingSessionId])

  const formatCurrency = (value) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)

  async function addItem() {
    if (!newName.trim()) return
    const { data, error } = await supabase
      .from('shopping_items')
      .insert({ name: newName.trim() })
      .select()
      .single()
    if (!error && data) {
      setItems((prev) => [...prev, data])
      setNewName('')
      setShowSuggestions(false)
    }
  }

  async function activateSuggestion(item) {
    if (item.on_list) {
      setAlert({ type: 'info', message: 'Item já está na lista.' })
      setNewName('')
      setShowSuggestions(false)
      return
    }

    const { data, error } = await supabase
      .from('shopping_items')
      .update({ on_list: true })
      .eq('id', item.id)
      .select()
      .single()

    const isOnListMissingColumn = (message = '') =>
      /could not find.*on_list|column .* does not exist/i.test(message)

    if (error) {
      if (isOnListMissingColumn(error.message)) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, on_list: true } : i)))
        setAlert({ type: 'warning', message: 'Item reativado localmente; campo on_list não existe no backend.' })
      } else {
        setAlert({ type: 'error', message: `Não foi possível reativar item: ${error.message}` })
        return
      }
    } else if (data) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? data : i)))
      setAlert({ type: 'info', message: 'Item reativado na lista.' })
    }

    setNewName('')
    setShowSuggestions(false)
  }

  async function removeItem(id) {
    await supabase.from('shopping_items').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function markPurchased(item) {
    // abrir modal para preencher preço/unidade antes de inserir
    setPurchaseTarget(item)
  }

  // arrastar card: direita = marcar como comprado, esquerda = remover
  const dragStartX = useRef(0)
  const [drag, setDrag] = useState({ id: null, x: 0, dragging: false })

  function handleDragStart(e, id) {
    if (purchaseTarget) return
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

  async function confirmPurchase({ price = null, unit = null, quantity = 1 }) {
    if (!purchaseTarget) return
    const item = purchaseTarget
    const today = new Date().toISOString().slice(0, 10)
    // evitar duplicatas: mesma item_id e mesma data
    const exists = purchases.find((p) => p.item_id === item.id && p.purchased_at === today)
    if (exists) {
      setAlert({ type: 'warning', message: 'Item já marcado como comprado hoje.' })
      setPurchaseTarget(null)
      return
    }

    const basePayload = { item_id: item.id, purchased_at: today, purchased_by: user }
    if (shoppingSessionId) basePayload.session_id = shoppingSessionId

    const addOptionalFields = (payload) => {
      if (price) payload.price = Number(String(price).replace(',', '.'))
      if (unit) payload.unit = unit
      if (quantity > 0) payload.quantity = quantity
      return payload
    }

    const tryInsert = async (payload) => {
      return await supabase.from('shopping_purchases').insert(payload).select('*, shopping_sessions(store_name)').single()
    }

    let payload = addOptionalFields({ ...basePayload })
    let { data, error } = await tryInsert(payload)

    const isMissingColumnError = (message) =>
      /could not find the '(price|unit|quantity)' column of 'shopping_purchases' in the schema cache|column .* does not exist/i.test(message)

    if (error && isMissingColumnError(error.message)) {
      const retry = await tryInsert({ ...basePayload })
      data = retry.data
      error = retry.error
      if (!error) {
        setAlert({ type: 'info', message: 'Item marcado como comprado. Preço/quantidade não foram salvos porque a tabela não tem esses campos.' })
      }
    }

    if (error) {
      setAlert({ type: 'error', message: `Erro ao salvar compra: ${error.message}` })
    } else if (data) {
      setPurchases((prev) => [...prev, data])
    }

    setPurchaseTarget(null)
  }

  async function startSession(storeName) {
    const { data, error } = await supabase
      .from('shopping_sessions')
      .insert({ store_name: storeName, started_by: user })
      .select()
      .single()
    if (!error && data) {
      setShoppingSessionId(data.id)
      setShoppingSessionStore(data.store_name)
      setShowSessionModal(false)
      // refresh recent stores
      const { data: sessions } = await supabase.from('shopping_sessions').select('store_name').order('started_at', { ascending: false }).limit(50)
      const distinct = Array.from(new Set((sessions || []).map((s) => s.store_name))).slice(0, 5)
      setRecentStores(distinct)
    }
  }

  async function createPaidShoppingBill(total) {
    const today = new Date().toISOString().slice(0, 10)
    const dueDay = Number(today.slice(8, 10)) || 1
    const billName = `Compras ${shoppingSessionStore}`

    const { data: billData, error: billError } = await supabase
      .from('bills')
      .insert({
        name: billName,
        category: 'Compras',
        amount: total,
        due_day: dueDay,
        active: true,
      })
      .select()
      .single()

    if (billError || !billData) {
      console.error('Falha ao criar conta de compras', billError)
      return
    }

    const refMonth = currentReferenceMonth()
    await supabase.from('bill_payments').insert({
      bill_id: billData.id,
      reference_month: refMonth,
      amount: total,
      paid: true,
      paid_at: today,
      paid_by: user,
    })
  }

  async function endSession() {
    if (!shoppingSessionId) return
    const total = sessionTotal
    if (total > 0) {
      await createPaidShoppingBill(total)
    }
    await supabase.from('shopping_sessions').update({ ended_at: new Date().toISOString() }).eq('id', shoppingSessionId)
    setShoppingSessionId(null)
    setShoppingSessionStore('')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-semibold text-xl text-ink">Lista de compras</h2>
          <p className="text-sm text-ink/60">Previsão automática baseada no histórico de compras.</p>
          <p className="text-xs text-ink/40 mt-0.5">Arraste um item para a direita pra comprar, para a esquerda pra remover.</p>
        </div>
      </div>
      {alert && (
        <div className={`rounded-card border px-4 py-3 text-sm flex items-start justify-between gap-3 ${
          alert.type === 'error'
            ? 'bg-coral/10 border-coral text-coral'
            : alert.type === 'warning'
            ? 'bg-amber/10 border-amber text-amber'
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

      <div className="flex gap-2 items-center">
        <div className="flex-1 flex flex-col gap-2 sm:flex-row sm:items-center">
          {shoppingSessionId ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-sm text-ink/70">Comprando em: <strong>{shoppingSessionStore}</strong></span>
              <span className="text-sm text-ink/70">Total: <strong>{formatCurrency(sessionTotal)}</strong></span>
              <button onClick={endSession} className="rounded-full px-3 py-1 text-xs bg-ink text-white hover:bg-ink/80 transition-colors">Finalizar</button>
            </div>
          ) : (
            <button
              onClick={() => setShowSessionModal(true)}
              className="rounded-full px-3 py-1 text-xs border border-line text-ink/70 hover:bg-ink/5 transition-colors"
            >
              Iniciar Compras
            </button>
          )}
          <div ref={inputContainerRef} className="relative flex-1">
            <input
              value={newName}
              onChange={(e) => {
                const value = e.target.value
                setNewName(value)
                setShowSuggestions(Boolean(value.trim()))
              }}
              onFocus={() => setShowSuggestions(Boolean(newName.trim()))}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              placeholder="Adicionar item"
              className="w-full rounded-full border border-line px-4 py-2 text-sm bg-white focus:border-teal outline-none"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 z-10 rounded-card border border-line bg-white shadow-xl overflow-hidden">
                {suggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => activateSuggestion(item)}
                    className="w-full text-left px-4 py-3 text-sm text-ink hover:bg-teal-light transition-colors"
                  >
                    <div className="font-medium truncate">{item.name}</div>
                    {item.analysis.timesBought > 0 && (
                      <div className="text-[11px] text-ink/50 mt-0.5">{item.analysis.timesBought}x comprado</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={addItem}
          className="bg-ink text-white rounded-full p-2.5 hover:bg-ink/80 transition-colors"
          aria-label="Adicionar item"
        >
          <Plus size={18} />
        </button>
      </div>


      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : sorted.length === 0 ? (
        <EmptyState text="Nenhum item ainda. Adicione o primeiro item acima." />
      ) : (
        <ul className="space-y-2">
          {sorted.map((item) => {
            const u = urgencyLabel(item.analysis.daysLeft)
            const colorMap = {
              coral: 'bg-coral-light text-coral border-coral/30',
              amber: 'bg-amber-light text-amber border-amber/40',
              teal: 'bg-teal-light text-teal-dark border-teal/20',
              gray: 'bg-ink/5 text-ink/50 border-ink/10',
            }
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
                  className="relative flex items-center justify-between gap-3 bg-white rounded-card border border-line px-4 py-3"
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
                  <div className="min-w-0">
                    <p className={`font-medium truncate ${alreadyBoughtToday ? 'text-ink/40 line-through' : 'text-ink'}`}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${colorMap[u.color]}`}>
                        {u.label}
                      </span>
                      {item.analysis.timesBought > 0 && (() => {
                        const itemPurchs = purchases
                          .filter((p) => p.item_id === item.id)
                          .sort((a, b) => new Date(a.purchased_at) - new Date(b.purchased_at))
                        const last = itemPurchs[itemPurchs.length - 1]
                        const store = last?.shopping_sessions?.store_name
                        return (
                          <span className="text-xs text-ink/40">
                            {item.analysis.timesBought}x comprado{store ? ` · ${store}` : ''}
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {purchaseTarget && (
        <PurchaseModal
          item={purchaseTarget}
          onCancel={() => setPurchaseTarget(null)}
          onConfirm={confirmPurchase}
        />
      )}

      {showSessionModal && (
        <Modal
          title="Iniciar sessão de compras"
          onClose={() => setShowSessionModal(false)}
          footer={
            <div className="flex gap-2">
              <button onClick={() => setShowSessionModal(false)} className="flex-1 py-2 rounded-full border border-line text-sm">Cancelar</button>
              <button
                onClick={() => {
                  const name = modalStoreName.trim() || (recentStores[0] || '')
                  if (name) startSession(name)
                }}
                className="flex-1 py-2 rounded-full bg-ink text-white text-sm"
              >
                Iniciar
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <input
              value={modalStoreName}
              onChange={(e) => setModalStoreName(e.target.value)}
              placeholder={recentStores[0] ? `Sugestão: ${recentStores[0]}` : 'Nome do mercado'}
              className="w-full rounded-full border border-line px-4 py-2 text-sm"
            />
            {recentStores.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {recentStores.map((s) => (
                  <button key={s} onClick={() => setModalStoreName(s)} className="px-3 py-1 rounded-full border border-line text-xs">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
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
