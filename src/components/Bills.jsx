import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { nextDueDate, daysUntil, currentReferenceMonth, urgencyColor } from '../lib/bills'
import { EmptyState } from './ShoppingList'

const CATEGORIES = ['Aluguel', 'Água', 'Luz', 'Internet', 'Gás', 'Outro']

export default function Bills({ user }) {
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', category: 'Outro', amount: '', due_day: '' })
  const [showForm, setShowForm] = useState(false)

  const totalSpentThisMonth = useMemo(() => {
    return payments.reduce((sum, payment) => {
      if (!payment.paid) return sum
      return sum + Number(payment.amount ?? 0)
    }, 0)
  }, [payments])

  const formatCurrency = (value) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)

  async function loadAll() {
    setLoading(true)
    const refMonth = currentReferenceMonth()
    const [{ data: billsData }, { data: paymentsData }] = await Promise.all([
      supabase.from('bills').select('*').eq('active', true).order('due_day'),
      supabase.from('bill_payments').select('*').eq('reference_month', refMonth),
    ])
    setBills(billsData || [])
    setPayments(paymentsData || [])
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const rows = useMemo(() => {
    return bills.map((bill) => {
      const payment = payments.find((p) => p.bill_id === bill.id)
      const due = nextDueDate(bill.due_day)
      const left = daysUntil(due)
      return { ...bill, payment, due, left }
    }).sort((a, b) => {
      if (!!a.payment?.paid !== !!b.payment?.paid) return a.payment?.paid ? 1 : -1
      return a.left - b.left
    })
  }, [bills, payments])

  async function addBill() {
    if (!form.name.trim() || !form.due_day) return
    const { data, error } = await supabase
      .from('bills')
      .insert({
        name: form.name.trim(),
        category: form.category,
        amount: form.amount ? Number(form.amount) : null,
        due_day: Number(form.due_day),
        active: true,
      })
      .select()
      .single()
    if (!error && data) {
      setBills((prev) => [...prev, data])
      setForm({ name: '', category: 'Outro', amount: '', due_day: '' })
      setShowForm(false)
    }
  }

  async function removeBill(id) {
    await supabase.from('bills').update({ active: false }).eq('id', id)
    setBills((prev) => prev.filter((b) => b.id !== id))
  }

  async function togglePaid(bill) {
    const refMonth = currentReferenceMonth()
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-semibold text-xl text-ink">Contas recorrentes</h2>
          <p className="text-sm text-ink/60">Vencimentos do mês atual.</p>
          <p className="text-sm text-teal font-semibold">Gasto total do mês: {formatCurrency(totalSpentThisMonth)}</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 bg-ink text-white px-4 py-2 rounded-full text-sm font-medium"
        >
          <Plus size={16} /> Nova conta
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-line rounded-card p-4 space-y-3">
          <input
            placeholder="Nome (ex: Aluguel)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-full border border-line px-4 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="flex-1 rounded-full border border-line px-3 py-2 text-sm bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Dia venc."
              min="1"
              max="31"
              value={form.due_day}
              onChange={(e) => setForm({ ...form, due_day: e.target.value })}
              className="w-28 rounded-full border border-line px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Valor (opc.)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-32 rounded-full border border-line px-3 py-2 text-sm"
            />
          </div>
          <button onClick={addBill} className="w-full bg-teal text-white rounded-full py-2 text-sm font-medium">
            Salvar conta
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : rows.length === 0 ? (
        <EmptyState text="Nenhuma conta cadastrada ainda." />
      ) : (
        <ul className="space-y-2">
          {rows.map((bill) => {
            const paid = !!bill.payment?.paid
            const color = urgencyColor(bill.left, paid)
            return (
              <li
                key={bill.id}
                className="flex items-center justify-between gap-3 bg-white rounded-card border border-line px-4 py-3"
              >
                <button onClick={() => togglePaid(bill)} className="shrink-0 text-teal">
                  {paid ? <CheckCircle2 size={22} /> : <Circle size={22} className="text-ink/20" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${paid ? 'text-ink/40 line-through' : 'text-ink'}`}>{bill.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-ink/40 font-mono">{bill.category}</span>
                    {bill.amount && (
                      <span className="text-xs text-ink/40 font-mono">
                        R$ {Number(bill.amount).toFixed(2)}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${colorMap[color]}`}>
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
                  onClick={() => removeBill(bill.id)}
                  className="p-2 rounded-full text-ink/30 hover:bg-coral-light hover:text-coral transition-colors shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
