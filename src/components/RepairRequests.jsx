import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Check, Archive, X, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { EmptyState } from './ShoppingList'
import { USERS } from './UserSwitch'
import Modal from './Modal'
import FabButton from './FabButton'

const STATUS = [
  { key: 'pendente', label: 'Pendente', color: 'coral' },
  { key: 'concluido', label: 'Concluído', color: 'teal' },
]

const PRIORITY = [
  { key: 'baixa', label: 'Baixa' },
  { key: 'alta', label: 'Alta' },
]

const DRAG_THRESHOLD = 88
const CLICK_THRESHOLD = 6

export default function Tasks({ user }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'baixa',
    assigned_to: '',
  })
  const [formError, setFormError] = useState('')
  const [filter, setFilter] = useState('todos')
  const [alert, setAlert] = useState(null)
  const [showCompletedPanel, setShowCompletedPanel] = useState(false)

  useEffect(() => {
    if (!alert) return
    const timer = setTimeout(() => setAlert(null), 3500)
    return () => clearTimeout(timer)
  }, [alert])

  async function loadAll() {
    setLoading(true)
    const { data, error } = await supabase.from('repair_requests').select('*').order('id', { ascending: false })
    if (error) {
      console.error('Falha ao carregar tarefas:', error)
      setRequests([])
      setLoading(false)
      return
    }

    // função utilitária para parsear datas em formatos variados
    const parseDue = (raw) => {
      if (!raw) return null
      const s = String(raw)
      const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
      const d = new Date(s)
      if (!isNaN(d.getTime())) return d
      const maybe = s.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (maybe) return new Date(Number(maybe[1]), Number(maybe[2]) - 1, Number(maybe[3]))
      return null
    }

    const now = new Date()
    const MS_PER_DAY = 1000 * 60 * 60 * 24
    const toUpdate = []

    const normalized = (data || []).map((t) => {
      const due = parseDue(t.due_date)
      if (due) {
        const daysPast = Math.floor((now.getTime() - due.getTime()) / MS_PER_DAY)
        if (daysPast > 4 && t.priority !== 'alta') {
          toUpdate.push(t.id)
          return { ...t, priority: 'alta' }
        }
      }
      return t
    })

    // aplicar updates no banco de forma assíncrona (não aguardamos para não bloquear render)
    if (toUpdate.length > 0) {
      Promise.all(
        toUpdate.map((id) =>
          supabase.from('repair_requests').update({ priority: 'alta' }).eq('id', id)
        )
      ).catch((e) => console.error('Falha ao escalonar prioridades:', e))
    }

    setRequests(normalized)
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])


  function toggleOpen(id) {
    if (openId === id) {
      setOpenId(null)
    } else {
      setOpenId(id)
    }
  }

  // arrastar card: direita = concluir, esquerda = remover, movimento mínimo = clique (abre detalhes)
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

  function handleDragEnd(e, id, req) {
    if (drag.id !== id) return
    const dx = drag.x

    if (!drag.dragging) return

    if (Math.abs(dx) < CLICK_THRESHOLD) {
      setDrag({ id: null, x: 0, dragging: false })
      const hasDetails = Boolean(req.description || req.assigned_to)
      if (hasDetails) toggleOpen(id)
      return
    }

    if (dx > DRAG_THRESHOLD) {
      setDrag({ id, x: 600, dragging: false })
      setTimeout(() => {
        updateStatus(req, 'concluido')
        setDrag({ id: null, x: 0, dragging: false })
      }, 180)
      return
    }

    if (dx < -DRAG_THRESHOLD) {
      setDrag({ id, x: -600, dragging: false })
      setTimeout(() => {
        removeRequest(req.id)
        setDrag({ id: null, x: 0, dragging: false })
      }, 180)
      return
    }

    setDrag({ id: null, x: 0, dragging: false })
  }

  async function addRequest() {
    if (!form.title.trim()) {
      setFormError('Informe o nome da tarefa.')
      return
    }

    const basePayload = {
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      status: 'pendente',
      requested_by: user,
    }

    const enrichPayload = (payload) => {
      if (form.assigned_to) payload.assigned_to = form.assigned_to
      // due_date não é escolhido pelo usuário: guarda a data de criação só como registro
      payload.due_date = new Date().toISOString().slice(0, 10)
      return payload
    }

    const tryInsert = async (payload) =>
      supabase.from('repair_requests').insert(payload).select().single()

    let payload = enrichPayload({ ...basePayload })
    let { data, error } = await tryInsert(payload)

    const isMissingColumnError = (message) =>
      /could not find the '(assigned_to|due_date)' column of 'repair_requests' in the schema cache|column .* does not exist/i.test(message)

    if (error && isMissingColumnError(error.message)) {
      const retry = await tryInsert({ ...basePayload })
      data = retry.data
      error = retry.error
      if (!error) {
        setAlert({
          type: 'info',
          message:
            'Tarefa criada. Alguns campos extras não foram salvos porque o backend não tem essas colunas.',
        })
      }
    }

    if (error) {
      console.error('Erro ao criar tarefa:', error)
      setFormError(`Falha ao criar tarefa: ${error.message}`)
      return
    }

    if (data) {
      setRequests((prev) => [data, ...prev])
      setForm({ title: '', description: '', priority: 'baixa', assigned_to: '' })
      setFormError('')
      setShowForm(false)
      if (!alert || alert.type !== 'info') {
        setAlert({ type: 'info', message: 'Tarefa criada com sucesso.' })
      }
    }
  }

  async function updateStatus(req, status) {
    const { data } = await supabase
      .from('repair_requests')
      .update({ status, completed_at: status === 'concluido' ? new Date().toISOString() : null })
      .eq('id', req.id)
      .select()
      .single()
    setRequests((prev) => prev.map((r) => (r.id === data.id ? data : r)))
  }

  async function removeRequest(id) {
    await supabase.from('repair_requests').delete().eq('id', id)
    setRequests((prev) => prev.filter((r) => r.id !== id))
  }

  

  // by default 'todos' shows only non-concluded tasks; concluded tasks live in a separate panel
  const filtered = requests.filter((r) =>
    filter === 'todos' ? r.status !== 'concluido' : filter === 'todos' || r.status === filter
  )

  const completedRequests = requests.filter((r) => r.status === 'concluido')

  const priorityRank = (p) => (p === 'alta' ? 1 : 0)

  const sortByPriorityThenId = (a, b) => {
    const pa = priorityRank(a.priority)
    const pb = priorityRank(b.priority)
    if (pa !== pb) return pb - pa // alta first
    return (b.id || 0) - (a.id || 0)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-semibold text-xl text-ink">Tarefas</h2>
        <p className="text-sm text-ink/60">Arraste um card para a direita pra concluir, para a esquerda pra remover.</p>
      </div>

      <div className="fixed z-20 bottom-20 right-4 sm:bottom-6 sm:right-6 flex items-center gap-2">
        <button
          onClick={() => setShowCompletedPanel((v) => !v)}
          aria-label="Arquivados"
          title="Arquivados"
          className="flex items-center justify-center bg-white text-ink w-10 h-10 rounded-full shadow-lg border border-line hover:bg-ink/5 transition-colors"
        >
          <Archive size={16} />
        </button>
        <FabButton onClick={() => { setFormError(''); setShowForm(true) }} label="Nova tarefa" inline>
          <Plus size={16} />
        </FabButton>
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

      {showCompletedPanel && (
        <div className="mt-3">
          <ul className="mt-2 space-y-2">
            {[...completedRequests].sort(sortByPriorityThenId).map((req) => (
              <li key={`c-${req.id}`} className="flex items-center gap-3 rounded-card overflow-hidden bg-white border border-line px-4 py-2">
                <span className="shrink-0 inline-block w-2 h-2 rounded-full bg-teal" title="Concluído" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink/50 truncate line-through">{req.title}</p>
                  {req.description && <p className="text-xs text-ink/40 mt-0.5 line-clamp-1">{req.description}</p>}
                </div>
                {req.priority === 'alta' && (
                  <AlertCircle size={14} className="shrink-0 text-coral" aria-label="Prioridade alta" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showForm && (
        <Modal
          title="Nova tarefa"
          onClose={() => { setShowForm(false); setFormError('') }}
          footer={
            <div className="flex gap-2">
              <button
                onClick={() => { setShowForm(false); setFormError('') }}
                className="flex-1 py-2 rounded-full border border-line text-sm"
              >
                Cancelar
              </button>
              <button onClick={addRequest} className="flex-1 py-2 rounded-full bg-ink text-white text-sm font-medium">
                Criar tarefa
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <input
                placeholder="Nome da tarefa"
                value={form.title}
                onChange={(e) => {
                  setForm({ ...form, title: e.target.value })
                  if (formError) setFormError('')
                }}
                className={`w-full rounded-full border px-4 py-2 text-sm ${formError ? 'border-coral' : 'border-line'}`}
              />
              {formError && <p className="text-xs text-coral mt-1 px-1">{formError}</p>}
            </div>
            <textarea
              placeholder="Detalhes (opcional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded-2xl border border-line px-4 py-2 text-sm resize-none"
            />
            <div className="flex gap-2">
              {PRIORITY.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setForm({ ...form, priority: p.key })}
                  className={`px-3 py-1.5 rounded-full text-xs border ${
                    form.priority === p.key
                      ? p.key === 'baixa'
                        ? 'bg-ink/5 text-ink/70 border-line'
                        : 'bg-coral-light text-coral border-coral/30'
                      : 'border-line text-ink/60'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <select
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              className="w-full rounded-full border border-line px-4 py-2 text-sm bg-white"
            >
              <option value="">Atribuir a...</option>
              {USERS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      <div className="flex gap-2 text-xs flex-wrap">
        <button
          onClick={() => setFilter('todos')}
          className={`px-3 py-1 rounded-full border ${filter === 'todos' ? 'bg-ink text-white border-ink' : 'border-line text-ink/60'}`}
        >
          Todos
        </button>
        {STATUS.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            className={`px-3 py-1 rounded-full border ${filter === s.key ? 'bg-ink text-white border-ink' : 'border-line text-ink/60'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : filtered.length === 0 ? (
        <EmptyState text="Nada por aqui. Crie o primeiro pedido acima." />
      ) : (
        <ul className="space-y-2">
          {[...filtered].sort(sortByPriorityThenId).map((req) => {
            const isOpen = openId === req.id
            const isDone = req.status === 'concluido'
            const hasDetails = Boolean(req.description || req.assigned_to)
            const isDragging = drag.id === req.id
            const dragX = isDragging ? drag.x : 0
            const isActiveDrag = isDragging && drag.dragging
            return (
              <li key={req.id} className="relative rounded-card overflow-hidden">
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
                  className={`relative flex items-center gap-3 bg-white border border-line rounded-card ${hasDetails ? 'cursor-pointer' : ''}`}
                  style={{
                    transform: `translateX(${dragX}px)`,
                    transition: isDragging && drag.dragging ? 'none' : 'transform 0.2s ease',
                    touchAction: 'pan-y',
                  }}
                  onPointerDown={(e) => handleDragStart(e, req.id)}
                  onPointerMove={(e) => handleDragMove(e, req.id)}
                  onPointerUp={(e) => handleDragEnd(e, req.id, req)}
                  onPointerCancel={() => setDrag({ id: null, x: 0, dragging: false })}
                >
                  <span
                    className={`shrink-0 ml-4 inline-block w-2 h-2 rounded-full ${isDone ? 'bg-teal' : 'bg-ink/20'}`}
                    title={isDone ? 'Concluído' : 'Pendente'}
                  />

                  <div className={`min-w-0 flex-1 px-4 ${isOpen ? 'py-3' : 'py-2'}`}>
                    <p className={`font-medium text-ink ${isOpen ? '' : 'text-sm truncate'} ${isDone ? 'line-through text-ink/40' : ''}`}>
                      {req.title}
                    </p>
                    {isOpen ? (
                      <>
                        {req.description && <p className="text-sm text-ink/50 mt-1">{req.description}</p>}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-xs text-ink/40">Pedido por {req.requested_by}</span>
                          {req.assigned_to && (
                            <span className="text-xs text-ink/40">→ {req.assigned_to}</span>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>

                  {req.priority === 'alta' && (
                    <AlertCircle size={14} className="shrink-0 mr-4 text-coral" aria-label="Prioridade alta" />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
