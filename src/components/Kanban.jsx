import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { loadTasks, sortByPriorityThenId } from '../lib/tasks'
import Modal from './Modal'
import FabButton from './FabButton'

const COLUMN_GAP = 12 // px, precisa bater com o gap-3 do grid de colunas abaixo

function currentWeekRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

function Card({ req, direction, dragX, isActiveDrag, onDragStart, onDragMove, onDragEnd, onDragCancel, onRemove }) {
  const isDone = req.status === 'concluido'
  return (
    <li className={`relative rounded-card ${isActiveDrag ? 'z-20' : ''}`}>
      <div
        className={`relative bg-card border border-line rounded-card px-3 py-2.5 ${isActiveDrag ? 'shadow-lg' : ''}`}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isActiveDrag ? 'none' : 'transform 0.2s ease',
          touchAction: 'pan-y',
        }}
        onPointerDown={(e) => onDragStart(e, req.id)}
        onPointerMove={(e) => onDragMove(e, req.id, direction)}
        onPointerUp={(e) => onDragEnd(e, req.id, req, direction)}
        onPointerCancel={onDragCancel}
      >
        <div className="flex items-start justify-between gap-1">
          <p className={`text-sm font-medium truncate flex-1 min-w-0 ${isDone ? 'text-ink/40 line-through' : 'text-ink'}`}>
            {req.title}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(req.id) }}
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

  // arrastar card: o card acompanha o dedo/mouse até a coluna vizinha.
  // passar da metade do caminho muda o status; soltar antes disso volta pro lugar.
  const dragStartX = useRef(0)
  const [drag, setDrag] = useState({ id: null, x: 0, dragging: false, distance: 0 })

  function handleDragStart(e, id) {
    dragStartX.current = e.clientX
    const distance = e.currentTarget.getBoundingClientRect().width + COLUMN_GAP
    setDrag({ id, x: 0, dragging: true, distance })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleDragMove(e, id, direction) {
    const clientX = e.clientX
    setDrag((d) => {
      if (!d.dragging || d.id !== id) return d
      const rawDx = clientX - dragStartX.current
      const dx = direction === 'right'
        ? Math.min(Math.max(rawDx, 0), d.distance)
        : Math.max(Math.min(rawDx, 0), -d.distance)
      return { ...d, x: dx }
    })
  }

  function handleDragEnd(e, id, req, direction) {
    setDrag((d) => {
      if (d.id !== id || !d.dragging) return d
      const past = Math.abs(d.x) > d.distance / 2
      if (past) {
        const target = direction === 'right' ? d.distance : -d.distance
        setTimeout(() => {
          updateStatus(req, direction === 'right' ? 'concluido' : 'pendente')
          setDrag({ id: null, x: 0, dragging: false, distance: 0 })
        }, 180)
        return { ...d, x: target, dragging: false }
      }
      return { id: null, x: 0, dragging: false, distance: 0 }
    })
  }

  function handleDragCancel() {
    setDrag({ id: null, x: 0, dragging: false, distance: 0 })
  }

  const pending = [...requests.filter((r) => r.status !== 'concluido')].sort(sortByPriorityThenId)
  const done = (() => {
    const { start, end } = currentWeekRange()
    return requests
      .filter((r) => {
        if (r.status !== 'concluido' || !r.completed_at) return false
        const completedAt = new Date(r.completed_at)
        return completedAt >= start && completedAt < end
      })
      .sort(sortByPriorityThenId)
  })()

  const pastThreshold = drag.dragging && drag.distance > 0 && Math.abs(drag.x) > drag.distance / 2
  const highlightDone = pastThreshold && pending.some((r) => r.id === drag.id)
  const highlightPending = pastThreshold && done.some((r) => r.id === drag.id)

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink/40">Arraste um card pra outra coluna pra mudar o status.</p>

      <FabButton onClick={() => { setTitle(''); setFormError(''); setShowForm(true) }} label="Nova tarefa">
        <Plus size={16} />
      </FabButton>

      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className={`space-y-2 rounded-card p-1.5 transition-colors ${highlightPending ? 'bg-ink/5' : ''}`}>
            <p className="text-xs font-medium text-ink/50 px-1">Pendente ({pending.length})</p>
            {pending.length === 0 ? (
              <p className="text-xs text-ink/30 px-1">Nada por aqui.</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((req) => (
                  <Card
                    key={req.id}
                    req={req}
                    direction="right"
                    dragX={drag.id === req.id ? drag.x : 0}
                    isActiveDrag={drag.id === req.id && drag.dragging}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                    onRemove={removeTask}
                  />
                ))}
              </ul>
            )}
          </div>
          <div className={`space-y-2 rounded-card p-1.5 transition-colors ${highlightDone ? 'bg-teal-light' : ''}`}>
            <p className="text-xs font-medium text-ink/50 px-1">Concluído esta semana ({done.length})</p>
            {done.length === 0 ? (
              <p className="text-xs text-ink/30 px-1">Nada por aqui.</p>
            ) : (
              <ul className="space-y-2">
                {done.map((req) => (
                  <Card
                    key={req.id}
                    req={req}
                    direction="left"
                    dragX={drag.id === req.id ? drag.x : 0}
                    isActiveDrag={drag.id === req.id && drag.dragging}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                    onRemove={removeTask}
                  />
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
