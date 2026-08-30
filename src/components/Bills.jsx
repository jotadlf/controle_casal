import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Check, CheckCircle2, Circle, Pencil, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { dueDateInMonth, daysUntil, referenceMonthOf, currentReferenceMonth, monthLabel, urgencyColor, installmentNumber } from '../lib/bills'
import { EmptyState } from './ShoppingList'
import Modal from './Modal'
import FabButton from './FabButton'

const CATEGORIES = ['Aluguel', 'Água', 'Luz', 'Internet', 'Gás', 'Outro']
const DRAG_THRESHOLD = 88

export default function Bills({ user }) {
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    category: 'Outro',
    amount: '',
    due_day: '',
    recurrence_type: 'recurring',
    installments_total: '',
  })
  const [formError, setFormError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const viewRefMonth = referenceMonthOf(viewMonth)
  const isCurrentMonth = viewRefMonth === currentReferenceMonth()

  function changeMonth(delta) {
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1))
  }

  const { totalOpen, totalPaid } = useMemo(() => {
    let open = 0
    let paid = 0
    for (const bill of bills) {
      const payment = payments.find((p) => p.bill_id === bill.id)
      if (payment?.paid) {
        paid += Number(payment.amount ?? 0)
      } else {
        open += Number(bill.amount ?? 0)
      }
    }
    return { totalOpen: open, totalPaid: paid }
  }, [bills, payments])

  const totalGeral = totalOpen + totalPaid

  const formatCurrency = (value) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)

  async function loadAll() {
    setLoading(true)
    const [{ data: billsData }, { data: paymentsData }] = await Promise.all([
      supabase.from('bills').select('*').eq('active', true).order('due_day'),
      supabase.from('bill_payments').select('*').eq('reference_month', viewRefMonth),
    ])
    const allBills = billsData || []
    const currentBills = allBills.filter((bill) => {
      if (bill.recurrence_type !== 'installment') return true
      const number = installmentNumber(bill, viewRefMonth)
      return number >= 1 && number <= bill.installments_total
    })

    setBills(currentBills)
    setPayments(paymentsData || [])
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRefMonth])

  const rows = useMemo(() => {
    return bills.map((bill) => {
      const payment = payments.find((p) => p.bill_id === bill.id)
      const due = dueDateInMonth(bill.due_day, viewMonth)
      const left = daysUntil(due)
      const installment =
        bill.recurrence_type === 'installment'
          ? { number: installmentNumber(bill, viewRefMonth), total: bill.installments_total }
          : null
      return { ...bill, payment, due, left, installment }
    }).sort((a, b) => {
      if (!!a.payment?.paid !== !!b.payment?.paid) return a.payment?.paid ? 1 : -1
      return a.left - b.left
    })
  }, [bills, payments, viewMonth, viewRefMonth])

  function resetForm() {
    setForm({ name: '', category: 'Outro', amount: '', due_day: '', recurrence_type: 'recurring', installments_total: '' })
    setEditingId(null)
  }

  function openEditForm(bill) {
    setEditingId(bill.id)
    setForm({
      name: bill.name,
      category: bill.category,
      amount: bill.amount != null ? String(bill.amount) : '',
      due_day: String(bill.due_day),
      recurrence_type: bill.recurrence_type || 'recurring',
      installments_total: bill.installments_total != null ? String(bill.installments_total) : '',
    })
    setFormError('')
    setShowForm(true)
  }

  async function saveBill() {
    if (!form.name.trim() || !form.due_day) {
      setFormError('Informe o nome e o dia de vencimento.')
      return
    }
    const isInstallment = form.recurrence_type === 'installment'
    if (isInstallment && (!form.installments_total || Number(form.installments_total) < 1)) {
      setFormError('Informe a quantidade de parcelas.')
      return
    }
    const payload = {
      name: form.name.trim(),
      category: form.category,
      amount: form.amount ? Number(form.amount) : null,
      due_day: Number(form.due_day),
      recurrence_type: form.recurrence_type,
      installments_total: isInstallment ? Number(form.installments_total) : null,
    }

    if (editingId) {
      const { data, error } = await supabase.from('bills').update(payload).eq('id', editingId).select().single()
      if (error) {
        setFormError(`Falha ao salvar conta: ${error.message}`)
        return
      }
      if (data) setBills((prev) => prev.map((b) => (b.id === data.id ? data : b)))
    } else {
      const { data, error } = await supabase
        .from('bills')
        .insert({ ...payload, active: true, start_month: viewRefMonth })
        .select()
        .single()
      if (error) {
        setFormError(`Falha ao salvar conta: ${error.message}`)
        return
      }
      if (data) setBills((prev) => [...prev, data])
    }

    resetForm()
    setFormError('')
    setShowForm(false)
  }

  async function removeBill(id) {
    await supabase.from('bills').update({ active: false }).eq('id', id)
    setBills((prev) => prev.filter((b) => b.id !== id))
  }

  // arrastar card: direita = marcar pago/reabrir, esquerda = remover
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

  function handleDragEnd(e, id, bill) {
    if (drag.id !== id) return
    const dx = drag.x

    if (!drag.dragging) return

    if (dx > DRAG_THRESHOLD) {
      setDrag({ id: null, x: 0, dragging: false })
      togglePaid(bill)
      return
    }

    if (dx < -DRAG_THRESHOLD) {
      setDrag({ id, x: -600, dragging: false })
      setTimeout(() => {
        removeBill(bill.id)
        setDrag({ id: null, x: 0, dragging: false })
      }, 180)
      return
    }

    setDrag({ id: null, x: 0, dragging: false })
  }

  async function togglePaid(bill) {
    const refMonth = viewRefMonth
    if (bill.payment) {
      const { data } = await supabase
        .from('bill_payments')
        .update({ paid: !bill.payment.paid, paid_at: !bill.payment.paid ? new Date().toISOString().slice(0, 10) : null, paid_by: user })
        .eq('id', bill.payment.id)
        .select()
        .single()
      setPayments((prev) => prev.map((p) => (p.id === data.id ? data : p)))
    } else {
      const { data } = await supabase
        .from('bill_payments')
        .insert({
          bill_id: bill.id,
          reference_month: refMonth,
          amount: bill.amount,
          paid: true,
          paid_at: new Date().toISOString().slice(0, 10),
          paid_by: user,
        })
        .select()
        .single()
      setPayments((prev) => [...prev, data])
    }
  }

  const colorMap = {
    coral: 'bg-coral-light text-coral border-coral/30',
    amber: 'bg-amber-light text-amber border-amber/40',
    teal: 'bg-teal-light text-teal-dark border-teal/20',
    gray: 'bg-ink/5 text-ink/40 border-ink/10',
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-semibold text-xl text-ink">Contas</h2>
        <p className="text-xs text-ink/40 mt-0.5">Arraste uma conta para a direita pra marcar como paga, para a esquerda pra remover.</p>
      </div>

      <div className="flex items-center justify-between bg-white border border-line rounded-card px-3 py-2">
        <button onClick={() => changeMonth(-1)} aria-label="Mês anterior" className="p-1.5 rounded-full text-ink/50 hover:bg-ink/5">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold text-sm text-ink capitalize">{monthLabel(viewMonth)}</span>
          {!isCurrentMonth && (
            <button
              onClick={() => setViewMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
              className="text-xs px-2 py-0.5 rounded-full border border-line text-ink/60 hover:bg-ink/5"
            >
              Hoje
            </button>
          )}
        </div>
        <button onClick={() => changeMonth(1)} aria-label="Próximo mês" className="p-1.5 rounded-full text-ink/50 hover:bg-ink/5">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-line rounded-card p-3">
          <p className="text-xs text-ink/40">Em aberto</p>
          <p className="font-display font-semibold text-lg text-coral">{formatCurrency(totalOpen)}</p>
        </div>
        <div className="bg-white border border-line rounded-card p-3">
          <p className="text-xs text-ink/40">Pago</p>
          <p className="font-display font-semibold text-lg text-teal-dark">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-white border border-line rounded-card p-3">
          <p className="text-xs text-ink/40">Total</p>
          <p className="font-display font-semibold text-lg text-ink">{formatCurrency(totalGeral)}</p>
        </div>
      </div>

      <FabButton onClick={() => { resetForm(); setFormError(''); setShowForm(true) }} label="Nova conta">
        <Plus size={16} />
      </FabButton>

      {showForm && (
        <Modal
          title={editingId ? 'Editar conta' : 'Nova conta'}
          onClose={() => { setShowForm(false); setFormError(''); resetForm() }}
          footer={
            <div className="flex gap-2">
              <button
                onClick={() => { setShowForm(false); setFormError(''); resetForm() }}
                className="flex-1 py-2 rounded-full border border-line text-sm"
              >
                Cancelar
              </button>
              <button onClick={saveBill} className="flex-1 py-2 rounded-full bg-ink text-white text-sm font-medium">
                {editingId ? 'Salvar alterações' : 'Salvar conta'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <input
              placeholder="Nome (ex: Aluguel)"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value })
                if (formError) setFormError('')
              }}
              className={`w-full rounded-full border px-4 py-2 text-sm ${formError ? 'border-coral' : 'border-line'}`}
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-full border border-line px-4 py-2 text-sm bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Dia venc."
                min="1"
                max="31"
                value={form.due_day}
                onChange={(e) => {
                  setForm({ ...form, due_day: e.target.value })
                  if (formError) setFormError('')
                }}
                className={`flex-1 rounded-full border px-3 py-2 text-sm ${formError ? 'border-coral' : 'border-line'}`}
              />
              <input
                type="number"
                placeholder="Valor (opc.)"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="flex-1 rounded-full border border-line px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setForm({ ...form, recurrence_type: 'recurring' }); if (formError) setFormError('') }}
                className={`flex-1 py-2 rounded-full border text-sm ${form.recurrence_type === 'recurring' ? 'bg-ink text-white border-ink' : 'border-line text-ink/60'}`}
              >
                Recorrente
              </button>
              <button
                type="button"
                onClick={() => { setForm({ ...form, recurrence_type: 'installment' }); if (formError) setFormError('') }}
                className={`flex-1 py-2 rounded-full border text-sm ${form.recurrence_type === 'installment' ? 'bg-ink text-white border-ink' : 'border-line text-ink/60'}`}
              >
                Parcelada
              </button>
            </div>
            {form.recurrence_type === 'installment' && (
              <input
                type="number"
                placeholder="Quantas parcelas"
                min="1"
                value={form.installments_total}
                onChange={(e) => {
                  setForm({ ...form, installments_total: e.target.value })
                  if (formError) setFormError('')
                }}
                className={`w-full rounded-full border px-4 py-2 text-sm ${formError ? 'border-coral' : 'border-line'}`}
              />
            )}
            {formError && <p className="text-xs text-coral px-1">{formError}</p>}
          </div>
        </Modal>
      )}

      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : rows.length === 0 ? (
        <EmptyState text="Nenhuma conta neste mês." />
      ) : (
        <ul className="space-y-2">
          {rows.map((bill) => {
            const paid = !!bill.payment?.paid
            const color = urgencyColor(bill.left, paid)
            const isDragging = drag.id === bill.id
            const isActiveDrag = isDragging && drag.dragging
            const dragX = isDragging ? drag.x : 0
            return (
              <li key={bill.id} className="relative rounded-card overflow-hidden">
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
                  className="relative flex items-center gap-3 bg-white rounded-card border border-line px-4 py-3"
                  style={{
                    transform: `translateX(${dragX}px)`,
                    transition: isActiveDrag ? 'none' : 'transform 0.2s ease',
                    touchAction: 'pan-y',
                  }}
                  onPointerDown={(e) => handleDragStart(e, bill.id)}
                  onPointerMove={(e) => handleDragMove(e, bill.id)}
                  onPointerUp={(e) => handleDragEnd(e, bill.id, bill)}
                  onPointerCancel={() => setDrag({ id: null, x: 0, dragging: false })}
                >
                  <span className="shrink-0 text-teal">
                    {paid ? <CheckCircle2 size={22} /> : <Circle size={22} className="text-ink/20" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${paid ? 'text-ink/40 line-through' : 'text-ink'}`}>{bill.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-ink/40">
                        {bill.category}
                        {bill.amount ? ` · R$ ${Number(bill.amount).toFixed(2)}` : ''}
                      </span>
                      {bill.installment && (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-line text-ink/50">
                          Parcela {bill.installment.number}/{bill.installment.total}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${colorMap[color]}`}>
                        {paid
                          ? 'Pago'
                          : bill.left < 0
                          ? `Venceu há ${Math.abs(bill.left)}d`
                          : bill.left === 0
                          ? 'Vence hoje'
                          : `Vence em ${bill.left}d`}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditForm(bill) }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Editar conta"
                    className="shrink-0 p-2 text-ink/30 hover:text-ink/60 rounded-full"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
