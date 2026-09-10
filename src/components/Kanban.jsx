import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { loadTasks, sortByPriorityThenId } from '../lib/tasks'
import Modal from './Modal'
import FabButton from './FabButton'

function currentWeekRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

function Card({ req, dx, dy, isActiveDrag, onDragStart, onDragMove, onDragEnd, onDragCancel, onRemove }) {
  const isDone = req.status === 'concluido'
  return (
    <li className={`relative rounded-card ${isActiveDrag ? 'z-30' : ''}`}>
      <div
        className={`relative bg-card border border-line rounded-card px-3 py-2.5 ${isActiveDrag ? 'shadow-xl' : ''}`}
        style={{
          transform: `translate(${dx}px, ${dy}px) ${isActiveDrag ? 'scale(1.04)' : 'scale(1)'}`,
          transition: isActiveDrag ? 'none' : 'transform 0.2s ease',
          touchAction: 'none',
        }}
        onPointerDown={(e) => onDragStart(e, req.id)}
        onPointerMove={(e) => onDragMove(e, req.id)}
        onPointerUp={(e) => onDragEnd(e, req.id, req)}
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
    const completedAt = status === 'concluido' ? new Date().toISOString() : null
    // atualiza local na hora (arraste fica instantâneo) e reconcilia com o banco depois
    setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status, completed_at: completedAt } : r)))
    const { data, error } = await supabase
      .from('repair_requests')
      .update({ status, completed_at: completedAt })
      .eq('id', req.id)
      .select()
      .single()
    if (!error && data) setRequests((prev) => prev.map((r) => (r.id === data.id ? data : r)))
  }

  async function removeTask(id) {
    await supabase.from('repair_requests').delete().eq('id', id)
    setRequests((prev) => prev.filter((r) => r.id !== id))
  }

  // arrastar card: solto de verdade, acompanha o ponteiro em qualquer direção.
  // soltar do lado da coluna oposta muda o status; soltar do lado de origem cancela.
  const gridRef = useRef(null)
  const dragStart = useRef({ x: 0, y: 0 })
  const [drag, setDrag] = useState({ id: null, dx: 0, dy: 0, dragging: false, hoverColumn: null })

  function columnAt(clientX) {
    if (!gridRef.current) return null
    const rect = gridRef.current.getBoundingClientRect()
    return clientX < rect.left + rect.width / 2 ? 'pendente' : 'concluido'
  }

  function handleDragStart(e, id) {
    dragStart.current = { x: e.clientX, y: e.clientY }
    setDrag({ id, dx: 0, dy: 0, dragging: true, hoverColumn: null })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleDragMove(e, id) {
    const { clientX, clientY } = e
    setDrag((d) => {
      if (!d.dragging || d.id !== id) return d
      return {
        ...d,
        dx: clientX - dragStart.current.x,
        dy: clientY - dragStart.current.y,
        hoverColumn: columnAt(clientX),
      }
    })
  }

  function handleDragEnd(e, id, req) {
    if (drag.id !== id || !drag.dragging) return
    const originColumn = req.status === 'concluido' ? 'concluido' : 'pendente'
    const target = drag.hoverColumn
    setDrag({ id: null, dx: 0, dy: 0, dragging: false, hoverColumn: null })
    if (target && target !== originColumn) {
      updateStatus(req, target)
    }
  }

  function handleDragCancel() {
    setDrag({ id: null, dx: 0, dy: 0, dragging: false, hoverColumn: null })
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

  const draggedReq = requests.find((r) => r.id === drag.id)
  const originColumn = draggedReq ? (draggedReq.status === 'concluido' ? 'concluido' : 'pendente') : null
  const highlightPending = drag.dragging && drag.hoverColumn === 'pendente' && originColumn !== 'pendente'
  const highlightDone = drag.dragging && drag.hoverColumn === 'concluido' && originColumn !== 'concluido'

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink/40">Arraste um card pra outra coluna pra mudar o status.</p>

      <FabButton onClick={() => { setTitle(''); setFormError(''); setShowForm(true) }} label="Nova tarefa">
        <Plus size={16} />
      </FabButton>

      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : (
        <div ref={gridRef} className="grid grid-cols-2 gap-3">
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
                    dx={drag.id === req.id ? drag.dx : 0}
                    dy={drag.id === req.id ? drag.dy : 0}
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
                    dx={drag.id === req.id ? drag.dx : 0}
                    dy={drag.id === req.id ? drag.dy : 0}
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
