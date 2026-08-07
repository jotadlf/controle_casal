import { useEffect, useState } from 'react'
import { Plus, Trash2, Archive, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { EmptyState } from './ShoppingList'
import { USERS } from './UserSwitch'

const STATUS = [
  { key: 'pendente', label: 'Pendente', color: 'coral' },
  { key: 'andamento', label: 'Em andamento', color: 'amber' },
  { key: 'concluido', label: 'Concluído', color: 'teal' },
]

const PRIORITY = [
  { key: 'baixa', label: 'Baixa' },
  { key: 'alta', label: 'Alta' },
]

const CATEGORY_OPTIONS = ['Casa', 'Trabalho', 'Pessoal', 'Outro']

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
    category: 'Casa',
    due_date: '',
  })
  const [filter, setFilter] = useState('todos')
  const [alert, setAlert] = useState(null)
  const [showCompletedPanel, setShowCompletedPanel] = useState(false)

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

  async function addRequest() {
    if (!form.title.trim()) return

    const basePayload = {
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      status: 'pendente',
      requested_by: user,
    }

    const enrichPayload = (payload) => {
      if (form.assigned_to) payload.assigned_to = form.assigned_to
      if (form.category) payload.category = form.category
      if (form.due_date) payload.due_date = form.due_date
      return payload
    }

    const tryInsert = async (payload) =>
      supabase.from('repair_requests').insert(payload).select().single()

    let payload = enrichPayload({ ...basePayload })
    let { data, error } = await tryInsert(payload)

    const isMissingColumnError = (message) =>
      /could not find the '(assigned_to|category|due_date)' column of 'repair_requests' in the schema cache|column .* does not exist/i.test(message)

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
      setAlert({
        type: 'error',
        message: `Falha ao criar tarefa: ${error.message}`,
      })
      return
    }

    if (data) {
      setRequests((prev) => [data, ...prev])
      setForm({ title: '', description: '', priority: 'baixa', assigned_to: '', category: 'Casa', due_date: '' })
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
      <div className="flex items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm((v) => !v)}
            aria-label="Nova tarefa"
            title="Nova tarefa"
            className="flex items-center justify-center bg-ink text-white w-10 h-10 rounded-full text-sm font-medium"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => setShowCompletedPanel((v) => !v)}
            aria-label="Arquivados"
            title="Arquivados"
            className="flex items-center justify-center bg-ink/5 text-ink w-10 h-10 rounded-full text-sm font-medium border border-line"
          >
            <Archive size={16} />
          </button>
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

      {showCompletedPanel && (
        <div className="mt-3">
          <ul className="mt-2 space-y-2">
            {[...completedRequests].sort(sortByPriorityThenId).map((req) => (
              <li key={`c-${req.id}`} className={`rounded-card overflow-hidden ${req.priority === 'alta' ? 'bg-coral-light border-coral/30' : req.priority === 'baixa' ? 'bg-blue-50 border-blue-100' : 'bg-white border-line'}`}>
                <div className="flex items-center justify-between gap-3 px-4 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-ink truncate">{req.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${req.priority === 'alta' ? 'bg-coral-light text-coral border-coral/30' : 'bg-base text-ink/60 border-line'}`}>{req.priority === 'alta' ? 'Alta' : 'Baixa'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${'bg-teal-light text-teal-dark border-teal/20'} ml-2`}>{'Concluído'}</span>
                    </div>
                    {req.description && <p className="text-xs text-ink/50 mt-0.5 line-clamp-1">{req.description}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-line rounded-card p-4 space-y-3">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-full border border-line px-4 py-2 text-sm"
          />
          <textarea
            placeholder="Detalhes (opcional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full rounded-2xl border border-line px-4 py-2 text-sm resize-none"
          />
          <div className="flex gap-2 flex-wrap">
            {PRIORITY.map((p) => (
              <button
                key={p.key}
                onClick={() => setForm({ ...form, priority: p.key })}
                className={`px-3 py-1.5 rounded-full text-xs border ${
                  form.priority === p.key ? 'bg-teal text-white border-teal' : 'border-line text-ink/60'
                }`}
              >
                {p.label}
              </button>
            ))}
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="rounded-full border border-line px-3 py-1.5 text-xs bg-white"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              className="rounded-full border border-line px-3 py-1.5 text-xs bg-white"
            >
              <option value="">Atribuir a...</option>
              {USERS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="rounded-full border border-line px-3 py-2 text-sm"
            />
            <button onClick={addRequest} className="flex-1 bg-teal text-white rounded-full py-2 text-sm font-medium">
              Criar tarefa
            </button>
          </div>
        </div>
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
            const statusInfo = STATUS.find((s) => s.key === req.status)
            const colorMap = {
              coral: 'bg-coral-light text-coral border-coral/30',
              amber: 'bg-amber-light text-amber border-amber/40',
              teal: 'bg-teal-light text-teal-dark border-teal/20',
            }
            const isOpen = openId === req.id
            const priorityBadge = req.priority === 'alta'
              ? 'bg-coral-light text-coral border-coral/30'
              : 'bg-base text-ink/60 border-line'
            const cardBg = req.priority === 'alta' ? 'bg-coral-light border-coral/30' : req.priority === 'baixa' ? 'bg-blue-50 border-blue-100' : 'bg-white border-line'
            return (
              <li key={req.id} className={`rounded-card overflow-hidden ${cardBg}`}>
                <div className={`flex items-start justify-between gap-3 px-4 ${isOpen ? 'py-3' : 'py-2'}`}>
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => toggleOpen(req.id)}>
                    <div className="flex items-center gap-2">
                      <p className={`font-medium text-ink ${isOpen ? '' : 'text-sm truncate'}`}>{req.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${priorityBadge}`}> {req.priority === 'alta' ? 'Alta' : 'Baixa'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${colorMap[statusInfo.color]} ml-2`}>{statusInfo.label}</span>
                    </div>
                    {isOpen ? (
                      <>
                        {req.description && <p className="text-sm text-ink/50 mt-0.5">{req.description}</p>}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-xs text-ink/40 font-mono">Pedido por {req.requested_by}</span>
                          {req.assigned_to && (
                            <span className="text-xs text-ink/40 font-mono">→ {req.assigned_to}</span>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                  <button
                    onClick={() => removeRequest(req.id)}
                    className="p-2 rounded-full text-ink/30 hover:bg-coral-light hover:text-coral transition-colors shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="flex gap-2 px-4 pb-3">
                  {isOpen && STATUS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => updateStatus(req, s.key)}
                      className={`text-xs px-2.5 py-1 rounded-full border ${
                        req.status === s.key ? 'bg-ink text-white border-ink' : 'border-line text-ink/50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
