import { useState } from 'react'
import { X, Upload, Loader2 } from 'lucide-react'

// Pré-processamento de imagem (canvas): grayscale, contraste, binarização e upscale.
async function preprocessImage(file) {
  const bitmap = await createImageBitmap(file)
  const targetMinWidth = 1200
  let scale = 1
  if (bitmap.width < targetMinWidth) scale = Math.min(3, targetMinWidth / bitmap.width)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  // converter para grayscale
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imgData.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const gray = 0.299 * r + 0.587 * g + 0.114 * b
    d[i] = d[i + 1] = d[i + 2] = gray
  }

  // aumentar contraste leve
  const contrast = 30
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
  for (let i = 0; i < d.length; i += 4) {
    let v = d[i]
    v = factor * (v - 128) + 128
    v = Math.max(0, Math.min(255, v))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(imgData, 0, 0)

  // binarização simples usando limiar baseado na média
  const imgData2 = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d2 = imgData2.data
  let sum = 0
  for (let i = 0; i < d2.length; i += 4) sum += d2[i]
  const mean = sum / (d2.length / 4)
  const thresh = Math.max(120, mean * 0.85)
  for (let i = 0; i < d2.length; i += 4) {
    const v = d2[i] < thresh ? 0 : 255
    d2[i] = d2[i + 1] = d2[i + 2] = v
  }
  ctx.putImageData(imgData2, 0, 0)

  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

// Leitura 100% no navegador (Tesseract.js), sem custo de API.
// Heurística: usa confidência por palavra, junta linhas de continuação e aplica
// correções leves de OCR para erros comuns em cupons.
function extractItemNames(ocrData) {
  const words = ocrData?.words || []

  // Agrupa palavras por linha (propriedade line_num do Tesseract)
  const linesMap = {}
  words.forEach((w) => {
    const ln = w.line_num ?? 0
    if (!linesMap[ln]) linesMap[ln] = []
    linesMap[ln].push(w)
  })

  const lineNums = Object.keys(linesMap).map(Number).sort((a, b) => a - b)
  const minWordConf = 45
  const noise = /(cnpj|cpf|total|troco|dinheiro|cartao|cart[aã]o|desconto|subtotal|valor pago|forma de pagamento|nfc-e|chave de acesso|protocolo|consumidor|tributos|qtd\.?$|un\.?$)/i
  const pricePattern = /[0-9]+[.,][0-9]{2}$/

  const letterCorrections = (token) => {
    if (!/[A-Za-zÀ-ÿ]/.test(token)) return token
    return token
      .replace(/0/g, 'O')
      .replace(/1/g, 'I')
      .replace(/5/g, 'S')
      .replace(/8/g, 'B')
  }

  const rawLines = lineNums.map((ln) => {
    const ws = linesMap[ln] || []
    const filtered = ws.filter((w) => w.confidence >= minWordConf)
    const text = filtered.map((w) => w.text).join(' ').trim()
    const avgConf = filtered.length ? Math.round(filtered.reduce((s, w) => s + w.confidence, 0) / filtered.length) : 0
    return { text, avgConf }
  })

  // Juntar linhas de continuação curtas (heurística)
  const merged = []
  for (let i = 0; i < rawLines.length; i++) {
    let cur = rawLines[i].text
    if (!cur) continue
    if (
      cur.length < 12 &&
      i + 1 < rawLines.length &&
      rawLines[i + 1].text.length > 0 &&
      rawLines[i + 1].text.length < 30 &&
      !pricePattern.test(cur) &&
      !pricePattern.test(rawLines[i + 1].text)
    ) {
      cur = (cur + ' ' + rawLines[i + 1].text).trim()
      i++
    }
    merged.push(cur)
  }

  const candidates = merged
    .map((line) => line.replace(/\s{2,}/g, ' ').trim())
    .filter((line) => {
      if (!line) return false
      if (line.length < 3 || line.length > 60) return false
      if (noise.test(line)) return false
      const letters = (line.match(/[a-zA-ZÀ-ÿ]/g) || []).length
      if (letters < 2) return false
      const digits = (line.match(/[0-9]/g) || []).length
      if (digits > letters) return false
      return true
    })
    .map((line) =>
      line
        .split(' ')
        .map((t) => {
          if (pricePattern.test(t) || /^[0-9-/.]{2,}$/.test(t)) return t
          return letterCorrections(t)
        })
        .join(' ')
    )

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
      // pré-processa imagem no canvas antes de enviar ao Tesseract
      setProgress(5)
      const processed = await preprocessImage(file)
      setProgress(10)

      const Tesseract = await import('tesseract.js')
      const whitelist = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,-/()ºª%'
      const { data } = await Tesseract.recognize(processed, 'por', {
        logger: (m) => {
          if (m.status === 'recognizing text' || m.status === 'recognizing') setProgress(Math.round(m.progress * 100))
        },
        tessedit_pageseg_mode: 6,
        tessedit_char_whitelist: whitelist,
        oem: 1,
      })
      // log temporário para depuração: inspecione `data.words` no console do navegador
      // Remova em produção
      // eslint-disable-next-line no-console
      console.log('Tesseract data.words:', data.words)
      const names = extractItemNames(data)
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
