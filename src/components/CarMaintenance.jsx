import { useEffect, useState } from 'react'
import { Plus, Trash2, Fuel, Wrench, Droplet, MapPin, HelpCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { EmptyState } from './ShoppingList'

const TYPES = [
  { key: 'combustivel', label: 'Combustível', icon: Fuel },
  { key: 'oficina', label: 'Oficina', icon: Wrench },
  { key: 'oleo', label: 'Óleo', icon: Droplet },
  { key: 'viagem', label: 'Viagem', icon: MapPin },
  { key: 'outro', label: 'Outro', icon: HelpCircle },
]

export default function CarMaintenance({ user }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    type: 'combustivel',
    date: new Date().toISOString().slice(0, 10),
    km: '',
    value: '',
    description: '',
  })

  const formatLocalDate = (date) => {
    if (!date) return ''
    const [year, month, day] = String(date).split('-')
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('pt-BR')
  }

  const getReferenceMonth = (date) => {
    const [year, month] = String(date).split('-')
    return `${year}-${String(month).padStart(2, '0')}-01`
  }

  const CAR_BILL_NAME = 'Gastos com Carro'
  const CAR_BILL_CATEGORY = 'Carro'

  async function ensureCarBill() {
    const { data: billData, error: billError } = await supabase
      .from('bills')
      .select('*')
      .eq('name', CAR_BILL_NAME)
      .maybeSingle()

    if (billError) {
      console.error('Erro ao buscar conta de carro:', billError)
    }

    if (billData) return billData

    const { data: createdBill, error: createError } = await supabase
      .from('bills')
      .insert({
        name: CAR_BILL_NAME,
        category: CAR_BILL_CATEGORY,
        amount: 0,
        due_day: 1,
        active: true,
      })
      .select()
      .single()

    if (createError) {
      console.error('Erro ao criar conta de carro:', createError)
      return null
    }

    return createdBill
  }

  async function syncCarBillForMonth(refMonth, expenses) {
    const bill = await ensureCarBill()
    if (!bill) return

    const total = expenses.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0)

    if (total <= 0) {
      const { data: payment, error: paymentError } = await supabase
        .from('bill_payments')
        .select('*')
        .eq('bill_id', bill.id)
        .eq('reference_month', refMonth)
        .maybeSingle()

      if (payment && !paymentError) {
        await supabase.from('bill_payments').delete().eq('id', payment.id)
      }

      await supabase
        .from('bills')
        .update({ amount: 0 })
        .eq('id', bill.id)

      return
    }

    const { data: existingPayment, error: paymentError } = await supabase
      .from('bill_payments')
      .select('*')
      .eq('bill_id', bill.id)
      .eq('reference_month', refMonth)
      .maybeSingle()

    if (paymentError) {
      console.error('Erro ao buscar pagamento de carro:', paymentError)
    }

    if (existingPayment) {
      await supabase
        .from('bill_payments')
        .update({
          amount: total,
          paid: true,
          paid_at: new Date().toISOString().slice(0, 10),
          paid_by: user,
        })
        .eq('id', existingPayment.id)
    } else {
      await supabase.from('bill_payments').insert({
        bill_id: bill.id,
        reference_month: refMonth,
        amount: total,
        paid: true,
        paid_at: new Date().toISOString().slice(0, 10),
        paid_by: user,
      })
    }

    await supabase
      .from('bills')
      .update({ amount: total })
      .eq('id', bill.id)
  }

  async function syncCarBillFromEntries(entryDate, allEntries) {
    const refMonth = getReferenceMonth(entryDate)
    const monthExpenses = allEntries.filter((entry) => getReferenceMonth(entry.date) === refMonth)
    await syncCarBillForMonth(refMonth, monthExpenses)
  }

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase.from('car_maintenance').select('*').order('date', { ascending: false })
    const entriesData = data || []
    setEntries(entriesData)
    setLoading(false)

    if (entriesData.length > 0) {
      const months = Array.from(new Set(entriesData.map((entry) => getReferenceMonth(entry.date))))
      await Promise.all(months.map((month) => syncCarBillForMonth(month, entriesData.filter((entry) => getReferenceMonth(entry.date) === month))))
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const lastOilChange = entries.find((e) => e.type === 'oleo')

  async function addEntry() {
    if (!form.value) return
    const { data, error } = await supabase
      .from('car_maintenance')
      .insert({
        type: form.type,
        date: form.date,
        km: form.km ? Number(form.km) : null,
        value: Number(form.value),
        description: form.description,
        created_by: user,
      })
      .select()
      .single()
    if (!error && data) {
      const newEntries = [data, ...entries]
      setEntries(newEntries)
      setForm({ type: 'combustivel', date: new Date().toISOString().slice(0, 10), km: '', value: '', description: '' })
      setShowForm(false)
      await syncCarBillFromEntries(data.date, newEntries)
    }
  }

  async function removeEntry(id) {
    const removedEntry = entries.find((e) => e.id === id)
    if (!removedEntry) return
    await supabase.from('car_maintenance').delete().eq('id', id)
    const newEntries = entries.filter((e) => e.id !== id)
    setEntries(newEntries)
    await syncCarBillFromEntries(removedEntry.date, newEntries)
  }

  const total30d = entries
    .filter((e) => (new Date() - new Date(e.date)) / 86400000 <= 30)
    .reduce((s, e) => s + Number(e.value), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-semibold text-xl text-ink">Carro</h2>
          <p className="text-sm text-ink/60">Combustível, oficina, óleo e viagens.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          aria-label="Registrar"
          title="Registrar"
          className="flex items-center justify-center bg-ink text-white w-10 h-10 rounded-full text-sm font-medium"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-line rounded-card p-3">
          <p className="text-xs text-ink/40 font-mono">Últimos 30 dias</p>
          <p className="font-display font-semibold text-lg text-ink">R$ {total30d.toFixed(2)}</p>
        </div>
        <div className="bg-white border border-line rounded-card p-3">
          <p className="text-xs text-ink/40 font-mono">Última troca de óleo</p>
          <p className="font-display font-semibold text-lg text-ink">
            {lastOilChange ? new Date(lastOilChange.date).toLocaleDateString('pt-BR') : '—'}
          </p>
        </div>
      </div>

      {showForm && (
        <div className="bg-white border border-line rounded-card p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setForm({ ...form, type: t.key })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${
                  form.type === t.key ? 'bg-teal text-white border-teal' : 'border-line text-ink/60'
                }`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="flex-1 rounded-full border border-line px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="KM (opc.)"
              value={form.km}
              onChange={(e) => setForm({ ...form, km: e.target.value })}
              className="w-28 rounded-full border border-line px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Valor R$"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              className="w-28 rounded-full border border-line px-3 py-2 text-sm"
            />
          </div>
          <input
            placeholder="Descrição (opcional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-full border border-line px-4 py-2 text-sm"
          />
          <button onClick={addEntry} className="w-full bg-teal text-white rounded-full py-2 text-sm font-medium">
            Salvar registro
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : entries.length === 0 ? (
        <EmptyState text="Nenhum registro do carro ainda." />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const t = TYPES.find((x) => x.key === entry.type) || TYPES[4]
            return (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 bg-white rounded-card border border-line px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-teal-light flex items-center justify-center text-teal-dark shrink-0">
                    <t.icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">
                      {t.label}
                      {entry.description ? ` — ${entry.description}` : ''}
                    </p>
                    <p className="text-xs text-ink/40 font-mono">
                      {formatLocalDate(entry.date)}
                      {entry.km ? ` · ${entry.km} km` : ''} · por {entry.created_by}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-sm text-ink">R$ {Number(entry.value).toFixed(2)}</span>
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="p-2 rounded-full text-ink/30 hover:bg-coral-light hover:text-coral transition-colors"
                  >
                    <Trash2 size={16} />
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
