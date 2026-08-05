import { useState } from 'react'
import { X, Upload, Loader2 } from 'lucide-react'

// Leitura 100% no navegador (Tesseract.js), sem custo de API.
// Heurística: pega linhas de texto que parecem nome de produto (letras, sem ser
// totalmente numéricas) e filtra ruído comum de cupom fiscal (CNPJ, totais, etc).
function extractItemNames(rawText) {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const noise = /(cnpj|cpf|total|troco|dinheiro|cartao|cart[aã]o|desconto|subtotal|valor pago|forma de pagamento|nfc-e|chave de acesso|protocolo|consumidor|tributos|qtd\.?$|un\.?$)/i

  const candidates = lines.filter((line) => {
    if (line.length < 3 || line.length > 45) return false
    if (noise.test(line)) return false
    const letters = (line.match(/[a-zA-ZÀ-ÿ]/g) || []).length
    if (letters < 3) return false
    // descarta linhas majoritariamente numéricas (preços, códigos de barra)
    const digits = (line.match(/[0-9]/g) || []).length
    if (digits > letters) return false
    return true
  })

  // remove duplicadas mantendo ordem, limita a 25 pra não poluir
  const seen = new Set()
  const unique = []
  for (const c of candidates) {
    const key = c.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(c)
    }
  }
  return unique.slice(0, 25)
}

export default function ReceiptScanner({ onClose, onConfirm }) {
  const [status, setStatus] = useState('idle') // idle | processing | review
  const [progress, setProgress] = useState(0)
  const [candidates, setCandidates] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('processing')
    setError('')
    try {
      const Tesseract = await import('tesseract.js')
      const { data } = await Tesseract.recognize(file, 'por', {
        logger: (m) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100))
        },
      })
      const names = extractItemNames(data.text)
      setCandidates(names)
      setSelected(new Set(names))
      setStatus('review')
    } catch (err) {
      setError('Não consegui ler essa imagem. Tente uma foto mais nítida, com boa luz.')
      setStatus('idle')
    }
  }

  function toggle(name) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-lg">Ler comprovante</h3>
          <button onClick={onClose} className="p-1 text-ink/40 hover:text-ink">
            <X size={20} />
          </button>
        </div>

        {status === 'idle' && (
          <div>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-line rounded-card py-10 cursor-pointer hover:border-teal transition-colors">
              <Upload size={28} className="text-teal" />
              <span className="text-sm text-ink/60">Tire uma foto ou escolha da galeria</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
            </label>
            {error && <p className="text-coral text-sm mt-2">{error}</p>}
            <p className="text-xs text-ink/40 mt-3">
              Leitura feita no seu navegador (gratuita). Cupom nítido e bem iluminado funciona melhor.
            </p>
          </div>
        )}

        {status === 'processing' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 size={28} className="animate-spin text-teal" />
            <p className="text-sm text-ink/60">Lendo comprovante... {progress}%</p>
          </div>
        )}

        {status === 'review' && (
          <div className="space-y-3">
            <p className="text-sm text-ink/60">
              Marque os itens que são de fato produtos (a leitura automática pode incluir ruído):
            </p>
            {candidates.length === 0 ? (
              <p className="text-sm text-coral">Não encontrei itens legíveis. Tente uma foto melhor.</p>
            ) : (
              <ul className="space-y-1 max-h-64 overflow-y-auto">
                {candidates.map((name) => (
                  <li key={name}>
                    <label className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-base cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(name)}
                        onChange={() => toggle(name)}
                        className="accent-teal"
                      />
                      <span className="truncate">{name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStatus('idle')}
                className="flex-1 py-2 rounded-full border border-line text-sm text-ink/60"
              >
                Tentar outra foto
              </button>
              <button
                onClick={() => onConfirm(Array.from(selected))}
                disabled={selected.size === 0}
                className="flex-1 py-2 rounded-full bg-teal text-white text-sm disabled:opacity-40"
              >
                Adicionar {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
