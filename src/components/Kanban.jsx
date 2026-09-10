import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { loadTasks, sortByPriorityThenId } from '../lib/tasks'
import Modal from './Modal'
import FabButton from './FabButton'

const DRAG_THRESHOLD = 88

export default function Kanban({ user }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [formError, setFormError] = useState('')

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

  async function addTask() {
    if (!title.trim()) {
      setFormError('Informe o nome da tarefa.')
      return
    }
    const { data, error } = await supabase
      .from('repair_requests')
      .insert({
        title: title.trim(),
        description: '',
        priority: 'baixa',
        status: 'pendente',
        requested_by: user,
        due_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()
    if (error) {
      setFormError(`Falha ao criar tarefa: ${error.message}`)
      return
    }
    if (data) {
      setRequests((prev) => [data, ...prev])
      setTitle('')
      setFormError('')
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
    if (data) setRequests((prev) => prev.map((r) => (r.id === data.id ? data : r)))
  }

  async function removeTask(id) {
    await supabase.from('repair_requests').delete().eq('id', id)
    setRequests((prev) => prev.filter((r) => r.id !== id))
  }

  const dragStartX = useRef(0)
  const [drag, setDrag] = useState({ id: null, x: 0, dragging: false })

  function handleDragStart(e, id) {
    dragStartX.current = e.clientX
    setDrag({ id, x: 0, dragging: true })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleDragMove(e, id, direction) {
    if (!drag.dragging || drag.id !== id) return
    const rawDx = e.clientX - dragStartX.current
    // pendente só arrasta pra direita (concluir), concluído só pra esquerda (reabrir)
    const dx = direction === 'right' ? Math.max(rawDx, 0) : Math.min(rawDx, 0)
    setDrag((d) => (d.id === id ? { ...d, x: dx } : d))
  }

  function handleDragEnd(e, id, req, direction) {
    if (drag.id !== id) return
    const dx = drag.x
    if (!drag.dragging) return

    const triggered = direction === 'right' ? dx > DRAG_THRESHOLD : dx < -DRAG_THRESHOLD
    if (triggered) {
      setDrag({ id, x: direction === 'right' ? 600 : -600, dragging: false })
      setTimeout(() => {
        updateStatus(req, direction === 'right' ? 'concluido' : 'pendente')
        setDrag({ id: null, x: 0, dragging: false })
      }, 180)
      return
    }

    setDrag({ id: null, x: 0, dragging: false })
  }

  function Card({ req, direction }) {
    const isDragging = drag.id === req.id
    const isActiveDrag = isDragging && drag.dragging
    const dragX = isDragging ? drag.x : 0
    const isDone = req.status === 'concluido'

    return (
      <li className="relative rounded-card overflow-hidden">
        <div className={`absolute inset-0 flex items-center px-3 ${direction === 'right' ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[10px] font-medium ${direction === 'right' ? 'text-teal-dark' : 'text-coral'} transition-opacity ${isActiveDrag ? 'opacity-100' : 'opacity-0'}`}>
            {direction === 'right' ? 'Concluir' : 'Reabrir'}
          </span>
        </div>
        <div
          className="relative bg-card border border-line rounded-card px-3 py-2.5"
          style={{
            transform: `translateX(${dragX}px)`,
            transition: isActiveDrag ? 'none' : 'transform 0.2s ease',
            touchAction: 'pan-y',
          }}
          onPointerDown={(e) => handleDragStart(e, req.id)}
          onPointerMove={(e) => handleDragMove(e, req.id, direction)}
          onPointerUp={(e) => handleDragEnd(e, req.id, req, direction)}
          onPointerCancel={() => setDrag({ id: null, x: 0, dragging: false })}
        >
          <div className="flex items-start justify-between gap-1">
            <p className={`text-sm font-medium truncate flex-1 min-w-0 ${isDone ? 'text-ink/40 line-through' : 'text-ink'}`}>
              {req.title}
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); removeTask(req.id) }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Remover tarefa"
              className="shrink-0 p-1 -m-1 text-ink/25 hover:text-coral rounded-full"
            >
              <Trash2 size={12} />
            </button>
          </div>
          {req.priority === 'alta' && !isDone && (
            <AlertCircle size={12} className="text-coral mt-1" aria-label="Prioridade alta" />
          )}
        </div>
      </li>
    )
  }

  const pending = [...requests.filter((r) => r.status !== 'concluido')].sort(sortByPriorityThenId)
  const done = [...requests.filter((r) => r.status === 'concluido')].sort(sortByPriorityThenId)

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink/40">Arraste um card pra direita pra concluir, ou pra esquerda (na coluna Concluído) pra reabrir.</p>

      <FabButton onClick={() => { setTitle(''); setFormError(''); setShowForm(true) }} label="Nova tarefa">
        <Plus size={16} />
      </FabButton>

      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink/50 px-1">Pendente ({pending.length})</p>
            {pending.length === 0 ? (
              <p className="text-xs text-ink/30 px-1">Nada por aqui.</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((req) => (
                  <Card key={req.id} req={req} direction="right" />
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink/50 px-1">Concluído ({done.length})</p>
            {done.length === 0 ? (
              <p className="text-xs text-ink/30 px-1">Nada por aqui.</p>
            ) : (
              <ul className="space-y-2">
                {done.map((req) => (
                  <Card key={req.id} req={req} direction="left" />
                ))}
              </ul>
            )}
          </div>
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
              <button onClick={addTask} className="flex-1 py-2 rounded-full bg-ink text-base text-sm font-medium">
                Criar tarefa
              </button>
            </div>
          }
        >
          <input
            placeholder="Nome da tarefa"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (formError) setFormError('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            className={`w-full rounded-full border px-4 py-2 text-sm ${formError ? 'border-coral' : 'border-line'}`}
            autoFocus
          />
          {formError && <p className="text-xs text-coral mt-1 px-1">{formError}</p>}
        </Modal>
      )}
    </div>
  )
}
