import { useState } from 'react'
import Modal from './Modal'

export default function EventModal({ initialForm, editingEventId, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(initialForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.title.trim()) {
      setFormError('Informe o título do compromisso.')
      return
    }
    if (!form.date) {
      setFormError('Informe a data.')
      return
    }
    if (form.endTime && (!form.time || form.endTime <= form.time)) {
      setFormError('A hora de término deve ser depois do início.')
      return
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      event_date: form.date,
      event_time: form.time || null,
      event_end_time: form.time ? form.endTime || null : null,
    }
    setSaving(true)
    const error = await onSave(payload, editingEventId)
    setSaving(false)
    if (error) {
      setFormError(`Falha ao salvar: ${error.message}`)
      return
    }
    onClose()
  }

  return (
    <Modal
      title={editingEventId ? 'Editar compromisso' : 'Novo compromisso'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {onDelete && (
            <button
              onClick={() => { onDelete(); onClose() }}
              className="py-2 px-4 rounded-full border border-coral/40 text-coral text-sm"
            >
              Excluir
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2 rounded-full border border-line text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-full bg-ink text-base text-sm font-medium disabled:opacity-60"
          >
            {editingEventId ? 'Salvar alterações' : 'Salvar'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <input
          placeholder="Título (ex: Consulta médica)"
          value={form.title}
          onChange={(e) => {
            setForm({ ...form, title: e.target.value })
            if (formError) setFormError('')
          }}
          className={`w-full rounded-full border px-4 py-2 text-sm ${formError ? 'border-coral' : 'border-line'}`}
        />
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="w-full rounded-full border border-line px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={form.time}
            onChange={(e) => {
              setForm({ ...form, time: e.target.value })
              if (formError) setFormError('')
            }}
            className="flex-1 rounded-full border border-line px-3 py-2 text-sm"
          />
          <span className="text-xs text-ink/40 shrink-0">até</span>
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => {
              setForm({ ...form, endTime: e.target.value })
              if (formError) setFormError('')
            }}
            disabled={!form.time}
            className="flex-1 rounded-full border border-line px-3 py-2 text-sm disabled:opacity-40"
          />
        </div>
        {form.endTime && (
          <p className="text-xs text-ink/40 px-1">
            Compromisso vai ocupar o intervalo de {form.time} até {form.endTime} na agenda do dia.
          </p>
        )}
        <textarea
          placeholder="Detalhes (opcional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="w-full rounded-2xl border border-line px-4 py-2 text-sm resize-none"
        />
        {formError && <p className="text-xs text-coral px-1">{formError}</p>}
      </div>
    </Modal>
  )
}
