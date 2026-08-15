import { useEffect, useState } from 'react'

const KEY = 'casa-app:usuario'
export const USERS = ['Jairon', 'Bruna']

export function useCurrentUser() {
  const [user, setUser] = useState(() => localStorage.getItem(KEY) || '')
  useEffect(() => {
    if (user) localStorage.setItem(KEY, user)
  }, [user])
  return [user, setUser]
}

export default function UserSwitch({ user, setUser }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink/50 hidden sm:inline">Eu sou:</span>
      <div className="flex rounded-full bg-ink/5 p-1">
        {USERS.map((u) => (
          <button
            key={u}
            onClick={() => setUser(u)}
            className={`px-3 py-1 text-sm rounded-full font-medium transition-colors ${
              user === u ? 'bg-ink text-white' : 'text-ink/60 hover:bg-white/50'
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  )
}
