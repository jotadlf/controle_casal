import { useEffect, useMemo, useState } from 'react'
import { Plus, Check, Trash2, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { analyzeItem, urgencyLabel } from '../lib/predict'
import PurchaseModal from './PurchaseModal'
import Modal from './Modal'

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
  const [sortBy, setSortBy] = useState('urgencia') // urgencia | frequencia

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

  const sorted = useMemo(() => {
    const copy = [...enriched]
    if (sortBy === 'urgencia') {
      copy.sort((a, b) => {
        const da = a.analysis.daysLeft
        const db = b.analysis.daysLeft
        if (da === null) return 1
        if (db === null) return -1
        return da - db
      })
    } else {
      copy.sort((a, b) => b.analysis.timesBought - a.analysis.timesBought)
    }
    return copy
  }, [enriched, sortBy])

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
    }
  }

  async function removeItem(id) {
    await supabase.from('shopping_items').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function markPurchased(item) {
    // abrir modal para preencher preço/unidade antes de inserir
    setPurchaseTarget(item)
  }

  async function confirmPurchase({ price = null, unit = null, quantity = 1 }) {
    if (!purchaseTarget) return
    const item = purchaseTarget
    const today = new Date().toISOString().slice(0, 10)
    // evitar duplicatas: mesma item_id e mesma data
    const exists = purchases.find((p) => p.item_id === item.id && p.purchased_at === today)
    if (exists) {
      // já marcado hoje
      // eslint-disable-next-line no-alert
      alert('Item já marcado como comprado hoje.')
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

    const stripMissingFields = (message, currentPayload) => {
      const missingFields = []
      const fieldMatch = message.match(/(?:'(price|unit|quantity)' column of 'shopping_purchases'|column "(price|unit|quantity)" does not exist)/gi)
      if (fieldMatch) {
        fieldMatch.forEach((match) => {
          const key = match.match(/price|unit|quantity/i)
          if (key) missingFields.push(key[0].toLowerCase())
        })
      }
      const newPayload = { ...basePayload }
      if (price && !missingFields.includes('price')) newPayload.price = Number(String(price).replace(',', '.'))
      if (unit && !missingFields.includes('unit')) newPayload.unit = unit
      if (quantity > 0 && !missingFields.includes('quantity')) newPayload.quantity = quantity
      return newPayload
    }

    while (error && isMissingColumnError(error.message)) {
      const nextPayload = stripMissingFields(error.message, payload)
      if (Object.keys(nextPayload).length === Object.keys(basePayload).length) {
        break
      }
      payload = nextPayload
      const retry = await tryInsert(payload)
      data = retry.data
      error = retry.error
    }

    if (error) {
      // eslint-disable-next-line no-alert
      alert(`Erro ao salvar compra: ${error.message}`)
    } else if (data) {
      if (!payload.price && !payload.unit && payload.quantity === undefined) {
        // eslint-disable-next-line no-alert
        alert('Item marcado como comprado. Preço/quantidade não foram salvos porque a tabela não tem esses campos.')
      }
      setPurchases((prev) => [...prev, data])
    }

    if (error) {
      // eslint-disable-next-line no-alert
      alert(`Erro ao salvar compra: ${error.message}`)
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

  async function endSession() {
    if (!shoppingSessionId) return
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
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <div className="flex-1 flex flex-col gap-2 sm:flex-row sm:items-center">
          {shoppingSessionId ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-sm text-ink/70">Comprando em: <strong>{shoppingSessionStore}</strong></span>
              <span className="text-sm text-ink/70">Total: <strong>{formatCurrency(sessionTotal)}</strong></span>
              <button onClick={endSession} className="rounded-full px-3 py-1 text-xs border border-line text-ink/60">Finalizar</button>
            </div>
          ) : (
            <button
              onClick={() => setShowSessionModal(true)}
              className="rounded-full px-3 py-1 text-xs bg-teal text-white"
            >
              Iniciar Compras
            </button>
          )}
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="Adicionar item"
            className="flex-1 rounded-full border border-line px-4 py-2 text-sm bg-white focus:border-teal outline-none"
          />
        </div>
        <button
          onClick={addItem}
          className="bg-ink text-white rounded-full p-2.5 hover:bg-ink/80 transition-colors"
          aria-label="Adicionar item"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setSortBy('urgencia')}
          className={`px-3 py-1 rounded-full border ${sortBy === 'urgencia' ? 'bg-teal text-white border-teal' : 'border-line text-ink/60'}`}
        >
          Mais urgente
        </button>
        <button
          onClick={() => setSortBy('frequencia')}
          className={`px-3 py-1 rounded-full border ${sortBy === 'frequencia' ? 'bg-teal text-white border-teal' : 'border-line text-ink/60'}`}
        >
          Mais consumidos
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
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 bg-white rounded-card border border-line px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{item.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${colorMap[u.color]}`}>
                      {u.label}
                    </span>
                    {item.analysis.timesBought > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-ink/40 flex items-center gap-1 font-mono">
                          <TrendingUp size={12} /> {item.analysis.timesBought}x comprado
                        </span>
                        {(() => {
                          const itemPurchs = purchases
                            .filter((p) => p.item_id === item.id)
                            .sort((a, b) => new Date(a.purchased_at) - new Date(b.purchased_at))
                          const last = itemPurchs[itemPurchs.length - 1]
                          if (last?.shopping_sessions?.store_name) {
                            return <span className="text-xs text-ink/50">· {last.shopping_sessions.store_name}</span>
                          }
                          return null
                        })()}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => markPurchased(item)}
                    disabled={!!purchaseTarget}
                    className="p-2 rounded-full bg-teal/10 text-teal hover:bg-teal hover:text-white transition-colors"
                    aria-label="Marcar como comprado"
                    title="Marcar como comprado hoje"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-2 rounded-full text-ink/30 hover:bg-coral-light hover:text-coral transition-colors"
                    aria-label="Remover item"
                  >
                    <Trash2 size={16} />
                  </button>
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
                className="flex-1 py-2 rounded-full bg-teal text-white text-sm"
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
