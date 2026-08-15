export default function Modal({ title, children, onClose, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="bg-white rounded-card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-5 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 text-ink/40 hover:text-ink">✕</button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </div>
  )
}
