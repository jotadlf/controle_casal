export default function FabButton({ onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="fixed z-20 bottom-20 right-4 sm:bottom-6 sm:right-6 flex items-center justify-center bg-ink text-white w-10 h-10 rounded-full shadow-lg hover:bg-ink/80 transition-colors"
    >
      {children}
    </button>
  )
}
