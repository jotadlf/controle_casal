import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Check, Archive, X, AlertCircle, Pencil, ChevronDown, ListChecks } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import {
  TASK_SELECT,
  formatDue,
  isOverdue,
  isThisWeek,
  loadTasks,
  saveSubtasks,
  sortByPriorityThenDate,
  sortedSubtasks,
  toISODate,
} from '../lib/tasks'
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

const OWNER_FILTERS = [
  { key: 'todas', label: 'Todas' },
  { key: 'minhas', label: 'Minhas' },
  { key: 'casal', label: 'Casal' },
]

// text-base também define o tamanho da fonte (cor "base" x tamanho do Tailwind), daí o !text-[11px]
export const filterChipClass = (active) =>
  `px-2.5 py-1 rounded-full border !text-[11px] leading-4 ${active ? 'bg-ink text-base border-ink' : 'border-line text-ink/60'}`

const emptyForm = (user) => ({
  title: '',
  description: '',
  priority: 'baixa',
  assigned_to: user,
  due_date: toISODate(new Date()),
  subtasks: [],
})

const hasDetails = (req) => Boolean(req.description || req.assigned_to || req.subtasks?.length)

// quem criou e quem recebeu a tarefa veem; tarefa sem responsável (assigned_to vazio) é do casal e aparece pros dois
function canSee(req, user) {
  return !req.assigned_to || req.assigned_to === user || req.requested_by === user
}

// "do casal" é o que os dois enxergam: sem responsável ou atribuída por um ao outro
function matchesOwner(req, ownerFilter, user) {
  if (ownerFilter === 'minhas') return req.assigned_to === user
  if (ownerFilter === 'casal') return !req.assigned_to || req.assigned_to !== req.requested_by
  return true
}

export default function Tasks({ user }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [form, setForm] = useState(() => emptyForm(user))
  const [ownerFilter, setOwnerFilter] = useState('todas')
  const [newSubtask, setNewSubtask] = useState('')
  const [formError, setFormError] = useState('')
  const [filter, setFilter] = useState('todos')
  const [alert, setAlert] = useState(null)
  const [showCompletedPanel, setShowCompletedPanel] = useState(false)
  const [showNextWeeks, setShowNextWeeks] = useState(false)

  useEffect(() => {
    if (!alert) return
    const timer = setTimeout(() => setAlert(null), 3500)
    return () => clearTimeout(timer)
  }, [alert])

  async function loadAll() {
    setLoading(true)
    const { tasks, error } = await loadTasks()
    if (error) {
      console.error('Falha ao carregar tarefas:', error)
      setRequests([])
      setLoading(false)
      return
    }
    setRequests(tasks)
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
      if (hasDetails(req)) toggleOpen(id)
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

  function openNewForm() {
    setEditingId(null)
    setForm(emptyForm(user))
    setNewSubtask('')
    setFormError('')
    setShowForm(true)
  }

  function openEditForm(req) {
    setEditingId(req.id)
    setForm({
      title: req.title,
      description: req.description || '',
      priority: req.priority,
      assigned_to: req.assigned_to || '',
      due_date: req.due_date || '',
      subtasks: sortedSubtasks(req),
    })
    setNewSubtask('')
    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setFormError('')
  }

  function addFormSubtask() {
    const title = newSubtask.trim()
    if (!title) return
    setForm({ ...form, subtasks: [...form.subtasks, { title }] })
    setNewSubtask('')
  }

  function updateFormSubtask(index, title) {
    setForm({ ...form, subtasks: form.subtasks.map((s, i) => (i === index ? { ...s, title } : s)) })
  }

  function removeFormSubtask(index) {
    setForm({ ...form, subtasks: form.subtasks.filter((_, i) => i !== index) })
  }

  // inclui o que ficou digitado no campo de microtarefa sem apertar o +
  function formSubtasksToSave() {
    return [...form.subtasks, { title: newSubtask }]
      .map((s) => ({ ...s, title: s.title.trim() }))
      .filter((s) => s.title)
  }

  async function reloadTask(id) {
    const { data, error } = await supabase.from('repair_requests').select(TASK_SELECT).eq('id', id).single()
    if (error) {
      console.error('Falha ao recarregar tarefa:', error)
      return
    }
    setRequests((prev) => prev.map((r) => (r.id === id ? data : r)))
  }

  async function syncSubtasks(id, current) {
    const { error } = await saveSubtasks(id, current, formSubtasksToSave())
    if (error) {
      console.error('Erro ao salvar microtarefas:', error)
      setAlert({ type: 'error', message: `Tarefa salva, mas as microtarefas falharam: ${error.message}` })
    }
    await reloadTask(id)
    return !error
  }

  async function saveRequest() {
    if (editingId) await updateRequest()
    else await addRequest()
  }

  async function updateRequest() {
    if (!form.title.trim()) {
      setFormError('Informe o nome da tarefa.')
      return
    }

    const { error } = await supabase
      .from('repair_requests')
      .update({
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        assigned_to: form.assigned_to || null,
        due_date: form.due_date || null,
      })
      .eq('id', editingId)

    if (error) {
      console.error('Erro ao salvar tarefa:', error)
      setFormError(`Falha ao salvar tarefa: ${error.message}`)
      return
    }

    const current = requests.find((r) => r.id === editingId)?.subtasks || []
    const subtasksSaved = await syncSubtasks(editingId, current)
    closeForm()
    if (subtasksSaved) setAlert({ type: 'info', message: 'Tarefa atualizada.' })
  }

  async function toggleSubtask(sub) {
    const { error } = await supabase.from('repair_subtasks').update({ done: !sub.done }).eq('id', sub.id)
    if (error) {
      console.error('Erro ao marcar microtarefa:', error)
      setAlert({ type: 'error', message: `Não foi possível marcar a microtarefa: ${error.message}` })
      return
    }
    setRequests((prev) =>
      prev.map((r) =>
        r.id === sub.request_id
          ? { ...r, subtasks: r.subtasks.map((s) => (s.id === sub.id ? { ...s, done: !sub.done } : s)) }
          : r,
      ),
    )
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
      payload.due_date = form.due_date || null
      return payload
    }

    const tryInsert = async (payload) =>
      supabase.from('repair_requests').insert(payload).select(TASK_SELECT).single()

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
      const subtasksSaved = await syncSubtasks(data.id, [])
      closeForm()
      if (subtasksSaved && (!alert || alert.type !== 'info')) {
        setAlert({ type: 'info', message: 'Tarefa criada com sucesso.' })
      }
    }
  }

  async function updateStatus(req, status) {
    const { data } = await supabase
      .from('repair_requests')
      .update({ status, completed_at: status === 'concluido' ? new Date().toISOString() : null })
      .eq('id', req.id)
      .select(TASK_SELECT)
      .single()
    setRequests((prev) => prev.map((r) => (r.id === data.id ? data : r)))
  }

  async function removeRequest(id) {
    await supabase.from('repair_requests').delete().eq('id', id)
    setRequests((prev) => prev.filter((r) => r.id !== id))
  }

  

  // by default 'todos' shows only non-concluded tasks; concluded tasks live in a separate panel
  const visibleRequests = requests.filter((r) => canSee(r, user) && matchesOwner(r, ownerFilter, user))

  const filtered = visibleRequests.filter((r) =>
    filter === 'todos' ? r.status !== 'concluido' : filter === 'todos' || r.status === filter
  )

  const completedRequests = visibleRequests.filter((r) => r.status === 'concluido')

  // tarefas concluídas não têm mais semana: aparecem numa lista só
  const sections = (
    filter === 'concluido'
      ? [{ key: 'concluidas', items: filtered }]
      : [
          { key: 'essa-semana', label: 'Essa semana', items: filtered.filter((r) => isThisWeek(r)) },
          { key: 'proximas', label: 'Próximas semanas', collapsible: true, items: filtered.filter((r) => !isThisWeek(r)) },
        ]
  ).filter((s) => s.items.length > 0)

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
          className="flex items-center justify-center bg-card text-ink w-10 h-10 rounded-full shadow-lg border border-line hover:bg-ink/5 transition-colors"
        >
          <Archive size={16} />
        </button>
        <FabButton onClick={openNewForm} label="Nova tarefa" inline>
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
            {[...completedRequests].sort(sortByPriorityThenDate).map((req) => (
              <li key={`c-${req.id}`} className="flex items-center gap-3 rounded-card overflow-hidden bg-card border border-line px-4 py-2">
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
          title={editingId ? 'Editar tarefa' : 'Nova tarefa'}
          onClose={closeForm}
          footer={
            <div className="flex gap-2">
              <button
                onClick={closeForm}
                className="flex-1 py-2 rounded-full border border-line text-sm"
              >
                Cancelar
              </button>
              <button onClick={saveRequest} className="flex-1 py-2 rounded-full bg-ink text-base text-sm font-medium">
                {editingId ? 'Salvar' : 'Criar tarefa'}
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
            <label className="block">
              <span className="block text-xs text-ink/60 mb-1 px-1">Data</span>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full rounded-full border border-line px-4 py-2 text-sm bg-card"
              />
            </label>
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
            <label className="block">
              <span className="block text-xs text-ink/60 mb-1 px-1">Atribuída a</span>
              <select
                value={form.assigned_to}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                className="w-full rounded-full border border-line px-4 py-2 text-sm bg-card"
              >
                {USERS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
                <option value="">Casal</option>
              </select>
            </label>
            <div className="space-y-2">
              <span className="block text-xs text-ink/60 px-1">Microtarefas</span>
              {form.subtasks.map((sub, index) => (
                <div key={sub.id || index} className="flex items-center gap-2">
                  <input
                    value={sub.title}
                    onChange={(e) => updateFormSubtask(index, e.target.value)}
                    aria-label={`Microtarefa ${index + 1}`}
                    className="min-w-0 flex-1 rounded-full border border-line px-4 py-2 text-sm"
                  />
                  <button
                    onClick={() => removeFormSubtask(index)}
                    aria-label="Remover microtarefa"
                    className="shrink-0 p-1.5 text-ink/30 hover:text-coral rounded-full"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  placeholder="Adicionar microtarefa"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addFormSubtask()}
                  className="min-w-0 flex-1 rounded-full border border-line px-4 py-2 text-sm"
                />
                <button
                  onClick={addFormSubtask}
                  aria-label="Adicionar microtarefa"
                  className="shrink-0 p-1.5 text-ink/50 hover:text-ink rounded-full"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <div className="flex gap-1">
          {OWNER_FILTERS.map((o) => (
            <button key={o.key} onClick={() => setOwnerFilter(o.key)} className={filterChipClass(ownerFilter === o.key)}>
              {o.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          <button onClick={() => setFilter('todos')} className={filterChipClass(filter === 'todos')}>
            Todos
          </button>
          {STATUS.map((s) => (
            <button key={s.key} onClick={() => setFilter(s.key)} className={filterChipClass(filter === s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : filtered.length === 0 ? (
        <EmptyState text="Nada por aqui. Crie o primeiro pedido acima." />
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.key} className="space-y-2">
              {section.collapsible ? (
                <h3>
                  <button
                    onClick={() => setShowNextWeeks((v) => !v)}
                    aria-expanded={showNextWeeks}
                    className="w-full flex items-center justify-between gap-2 rounded-card border border-line bg-card px-4 py-2 font-display font-semibold text-sm text-ink/70 hover:bg-ink/5 transition-colors"
                  >
                    <span>
                      {section.label} <span className="font-body font-normal text-xs text-ink/40">({section.items.length})</span>
                    </span>
                    <ChevronDown size={16} className={`shrink-0 transition-transform ${showNextWeeks ? 'rotate-180' : ''}`} />
                  </button>
                </h3>
              ) : section.label ? (
                <h3 className="font-display font-semibold text-sm text-ink/70">{section.label}</h3>
              ) : null}
              <ul className={`space-y-2 ${section.collapsible && !showNextWeeks ? 'hidden' : ''}`}>
                {[...section.items].sort(sortByPriorityThenDate).map((req) => {
                  const isOpen = openId === req.id
                  const isDone = req.status === 'concluido'
                  const isDragging = drag.id === req.id
                  const dragX = isDragging ? drag.x : 0
                  const isActiveDrag = isDragging && drag.dragging
                  const subtasks = sortedSubtasks(req)
                  const doneCount = subtasks.filter((s) => s.done).length
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
                        className={`relative flex items-center gap-3 bg-card border border-line rounded-card ${hasDetails(req) ? 'cursor-pointer' : ''}`}
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

                        <div className={`min-w-0 flex-1 pl-1 ${isOpen ? 'py-3' : 'py-2'}`}>
                          <p className={`font-medium text-ink ${isOpen ? '' : 'text-sm truncate'} ${isDone ? 'line-through text-ink/40' : ''}`}>
                            {req.title}
                          </p>
                          {isOpen ? (
                            <>
                              {req.description && <p className="text-sm text-ink/50 mt-1">{req.description}</p>}
                              {subtasks.length > 0 && (
                                <ul className="mt-2 space-y-1" onPointerDown={(e) => e.stopPropagation()}>
                                  {subtasks.map((sub) => (
                                    <li key={sub.id}>
                                      <label className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={sub.done}
                                          onChange={() => toggleSubtask(sub)}
                                          className="shrink-0 w-4 h-4 accent-teal"
                                        />
                                        <span className={sub.done ? 'line-through text-ink/40' : 'text-ink/80'}>{sub.title}</span>
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="text-xs text-ink/40">Pedido por {req.requested_by}</span>
                                {req.assigned_to && (
                                  <span className="text-xs text-ink/40">→ {req.assigned_to}</span>
                                )}
                              </div>
                            </>
                          ) : null}
                        </div>

                        <div className="shrink-0 flex items-center gap-2 mr-2">
                          {req.assigned_to !== user && (
                            <span className="text-xs text-ink/40">{req.assigned_to || 'Casal'}</span>
                          )}
                          {subtasks.length > 0 && (
                            <span
                              className={doneCount === subtasks.length ? 'text-ink/30' : 'text-teal'}
                              role="img"
                              aria-label={`${doneCount} de ${subtasks.length} microtarefas feitas`}
                              title={`${doneCount} de ${subtasks.length} microtarefas feitas`}
                            >
                              <ListChecks size={14} />
                            </span>
                          )}
                          {req.due_date && (
                            <span className={`text-xs ${!isDone && isOverdue(req) ? 'text-coral' : 'text-ink/40'}`}>
                              {formatDue(req.due_date)}
                            </span>
                          )}
                          {req.priority === 'alta' && (
                            <AlertCircle size={14} className="text-coral" aria-label="Prioridade alta" />
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditForm(req) }}
                            onPointerDown={(e) => e.stopPropagation()}
                            aria-label="Editar tarefa"
                            className="p-1.5 text-ink/30 hover:text-ink/60 rounded-full"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
