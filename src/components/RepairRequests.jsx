import { useEffect, useState } from 'react'
import { Plus, Trash2, MessageCircle, Send } from 'lucide-react'
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

const CATEGORY_OPTIONS = ['Casa', 'Trabalho', 'Pessoal']

export default function Tasks({ user }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [comments, setComments] = useState({})
  const [commentDraft, setCommentDraft] = useState('')
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'baixa',
    assigned_to: '',
    category: 'Casa',
    due_date: '',
  })
  const [filter, setFilter] = useState('todos')

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase.from('repair_requests').select('*').order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function loadComments(id) {
    const { data } = await supabase
      .from('repair_comments')
      .select('*')
      .eq('request_id', id)
      .order('created_at')
    setComments((prev) => ({ ...prev, [id]: data || [] }))
  }

  function toggleOpen(id) {
    if (openId === id) {
      setOpenId(null)
    } else {
      setOpenId(id)
      if (!comments[id]) loadComments(id)
    }
  }

  async function addRequest() {
    if (!form.title.trim()) return
    const { data, error } = await supabase
      .from('repair_requests')
      .insert({
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        status: 'pendente',
        requested_by: user,
        assigned_to: form.assigned_to || null,
        category: form.category || 'Outro',
        due_date: form.due_date || null,
      })
      .select()
      .single()
    if (!error && data) {
      setRequests((prev) => [data, ...prev])
      setForm({ title: '', description: '', priority: 'media', assigned_to: '', category: 'Outro', due_date: '' })
      setShowForm(false)
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

  async function sendComment(id) {
    if (!commentDraft.trim()) return
    const { data } = await supabase
      .from('repair_comments')
      .insert({ request_id: id, author: user, comment: commentDraft.trim() })
      .select()
      .single()
    setComments((prev) => ({ ...prev, [id]: [...(prev[id] || []), data] }))
    setCommentDraft('')
  }

  const filtered = requests.filter((r) => filter === 'todos' || r.status === filter)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
            <h2 className="font-display font-semibold text-xl text-ink">Tarefas</h2>
            <p className="text-sm text-ink/60">Tarefas gerais (reparos, pendências de casa, documentos, pessoais).</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 bg-ink text-white px-4 py-2 rounded-full text-sm font-medium"
          >
            <Plus size={16} /> Nova tarefa
          </button>
        </div>

      {showForm && (
        <div className="bg-white border border-line rounded-card p-4 space-y-3">
          <input
            placeholder="Ex: Vazamento na pia da cozinha"
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
          {filtered.map((req) => {
            const statusInfo = STATUS.find((s) => s.key === req.status)
            const colorMap = {
              coral: 'bg-coral-light text-coral border-coral/30',
              amber: 'bg-amber-light text-amber border-amber/40',
              teal: 'bg-teal-light text-teal-dark border-teal/20',
            }
            const isOpen = openId === req.id
            return (
              <li key={req.id} className="bg-white rounded-card border border-line overflow-hidden">
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => toggleOpen(req.id)}>
                    <p className="font-medium text-ink">{req.title}</p>
                    {req.description && <p className="text-sm text-ink/50 mt-0.5">{req.description}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${colorMap[statusInfo.color]}`}>
                        {statusInfo.label}
                      </span>
                      <span className="text-xs text-ink/40 font-mono">Pedido por {req.requested_by}</span>
                      {req.assigned_to && (
                        <span className="text-xs text-ink/40 font-mono">→ {req.assigned_to}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeRequest(req.id)}
                    className="p-2 rounded-full text-ink/30 hover:bg-coral-light hover:text-coral transition-colors shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="flex gap-2 px-4 pb-3">
                  {STATUS.map((s) => (
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
                  <button
                    onClick={() => toggleOpen(req.id)}
                    className="ml-auto text-xs px-2.5 py-1 rounded-full border border-line text-ink/50 flex items-center gap-1"
                  >
                    <MessageCircle size={12} /> {isOpen ? 'Fechar' : 'Comentários'}
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-line bg-base px-4 py-3 space-y-2">
                    {(comments[req.id] || []).length === 0 && (
                      <p className="text-xs text-ink/40">Sem comentários ainda.</p>
                    )}
                    {(comments[req.id] || []).map((c) => (
                      <div key={c.id} className="text-sm">
                        <span className="font-medium text-ink">{c.author}: </span>
                        <span className="text-ink/70">{c.comment}</span>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <input
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendComment(req.id)}
                        placeholder="Escrever um comentário..."
                        className="flex-1 rounded-full border border-line px-3 py-1.5 text-sm bg-white"
                      />
                      <button
                        onClick={() => sendComment(req.id)}
                        className="p-2 rounded-full bg-teal text-white"
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
