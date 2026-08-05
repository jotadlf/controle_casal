import { useState } from 'react'
import Modal from './Modal'

export default function PurchaseModal({ item, defaultPrice = '', defaultUnit = '', defaultQuantity = 1, onCancel, onConfirm }) {
  const [price, setPrice] = useState(defaultPrice)
  const [unit, setUnit] = useState(defaultUnit)
  const [quantity, setQuantity] = useState(defaultQuantity)

  return (
    <Modal
      title={`Registrar compra — ${item?.name || ''}`}
      onClose={onCancel}
      footer={
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-full border border-line text-sm">Cancelar</button>
          <button onClick={() => onConfirm({ price: price || null, unit: unit || null, quantity })} className="flex-1 py-2 rounded-full bg-teal text-white text-sm">Salvar</button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-center">
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço (ex: 8.50)" className="w-full rounded-full border border-line px-4 py-2 text-sm" />
          <div className="flex items-center gap-2 rounded-full border border-line px-2 py-2">
            <button
              type="button"
              onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
              className="h-9 w-9 rounded-full bg-ink/5 text-ink hover:bg-ink/10 transition-colors"
            >
              -
            </button>
            <span className="w-12 text-center text-sm font-medium">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((prev) => prev + 1)}
              className="h-9 w-9 rounded-full bg-ink/5 text-ink hover:bg-ink/10 transition-colors"
            >
              +
            </button>
          </div>
        </div>
        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unidade (ex: UN, KG)" className="w-full rounded-full border border-line px-4 py-2 text-sm" />
      </div>
    </Modal>
  )
}
