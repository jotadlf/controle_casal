import { useEffect, useMemo, useState } from 'react'
import { Shuffle, Star, ThumbsUp, ThumbsDown, RotateCcw, ExternalLink, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Modal from './Modal'
import { EmptyState } from './ShoppingList'

export default function Movies({ user }) {
  const [movies, setMovies] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawn, setDrawn] = useState(null)
  const [undoing, setUndoing] = useState(null)
  const [alert, setAlert] = useState(null)

  useEffect(() => {
    if (!alert) return
    const timer = setTimeout(() => setAlert(null), 3500)
    return () => clearTimeout(timer)
  }, [alert])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase.from('movies').select('*').order('imdb_rank')
      if (error) setAlert({ type: 'error', message: `Não foi possível carregar os filmes: ${error.message}` })
      setMovies(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const available = useMemo(() => movies.filter((m) => !m.watched), [movies])
  const watched = useMemo(
    () => movies.filter((m) => m.watched).sort((a, b) => (b.watched_at || '').localeCompare(a.watched_at || '')),
    [movies],
  )

  function draw() {
    // evita repetir o mesmo filme duas vezes seguidas quando há opção
    const pool = available.length > 1 && drawn ? available.filter((m) => m.id !== drawn.id) : available
    if (pool.length === 0) return
    setDrawn(pool[Math.floor(Math.random() * pool.length)])
  }

  function applyUpdate(data) {
    setMovies((prev) => prev.map((m) => (m.id === data.id ? data : m)))
  }

  async function updateMovie(id, fields) {
    const { data, error } = await supabase.from('movies').update(fields).eq('id', id).select().single()
    if (error) {
      setAlert({ type: 'error', message: `Não foi possível salvar: ${error.message}` })
      return null
    }
    applyUpdate(data)
    return data
  }

  async function markWatched() {
    const saved = await updateMovie(drawn.id, {
      watched: true,
      watched_at: new Date().toISOString(),
      watched_by: user,
    })
    if (saved) {
      setDrawn(null)
      setAlert({ type: 'info', message: `"${saved.title}" foi pra lista de assistidos.` })
    }
  }

  function rate(movie, value) {
    // tocar de novo no mesmo joinha tira a avaliação
    const liked = movie.liked === value ? null : value
    updateMovie(movie.id, { liked, rated_by: liked === null ? null : user })
  }

  async function confirmUndo() {
    await updateMovie(undoing.id, {
      watched: false,
      watched_at: null,
      watched_by: null,
      liked: null,
      rated_by: null,
    })
    setUndoing(null)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-semibold text-xl text-ink">Filmes</h2>
        <p className="text-xs text-ink/40 mt-0.5">
          {available.length} pra sortear · {watched.length} assistido{watched.length === 1 ? '' : 's'}
        </p>
      </div>

      {alert && (
        <div className={`rounded-card border px-4 py-3 text-sm flex items-start justify-between gap-3 ${
          alert.type === 'error'
            ? 'bg-coral/10 border-coral text-coral'
            : 'bg-teal/10 border-teal text-teal'
        }`}>
          <span>{alert.message}</span>
          <button
            onClick={() => setAlert(null)}
            className="rounded-full p-1 text-current hover:bg-black/5 transition-colors"
            aria-label="Fechar alerta"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : (
        <>
          <div className="bg-card rounded-card border border-line p-5 space-y-4">
            {drawn ? (
              <div className="space-y-4 animate-pop-in">
                <MovieInfo movie={drawn} large />
                <div className="space-y-2">
                  <p className="text-sm text-ink/60 text-center">Assistir?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDrawn(null)}
                      className="flex-1 py-2 rounded-full border border-line text-sm"
                    >
                      Não
                    </button>
                    <button
                      onClick={markWatched}
                      className="flex-1 py-2 rounded-full bg-ink text-base text-sm font-medium"
                    >
                      Sim
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink/50 text-center">
                {available.length === 0 ? 'Vocês já assistiram todos os filmes da lista!' : 'Sem ideia do que assistir? Deixa a sorte escolher.'}
              </p>
            )}
            <button
              onClick={draw}
              disabled={available.length === 0}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium transition-colors disabled:opacity-40 ${
                drawn ? 'border border-line text-ink hover:bg-ink/5' : 'bg-ink text-base hover:bg-ink/80'
              }`}
            >
              <Shuffle size={16} /> {drawn ? 'Sortear outro' : 'Sortear'}
            </button>
          </div>

          <div className="space-y-2">
            <h3 className="font-display font-semibold text-ink">Já assistidos</h3>
            {watched.length === 0 ? (
              <EmptyState text="Nenhum filme assistido ainda." />
            ) : (
              <ul className="space-y-2">
                {watched.map((movie) => (
                  <li key={movie.id} className="bg-card rounded-card border border-line px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <MovieInfo movie={movie} />
                      {movie.watched_at && (
                        <p className="text-xs text-ink/40 mt-1">
                          Assistido em {new Date(movie.watched_at).toLocaleDateString('pt-BR')}
                          {movie.liked !== null && movie.rated_by ? ` · avaliado por ${movie.rated_by}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        onClick={() => rate(movie, true)}
                        aria-label="Gostei"
                        title="Gostei"
                        className={`p-2 rounded-full transition-colors ${
                          movie.liked === true ? 'bg-teal/15 text-teal-dark' : 'text-ink/30 hover:text-ink/60'
                        }`}
                      >
                        <ThumbsUp size={18} fill={movie.liked === true ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => rate(movie, false)}
                        aria-label="Não gostei"
                        title="Não gostei"
                        className={`p-2 rounded-full transition-colors ${
                          movie.liked === false ? 'bg-coral/15 text-coral' : 'text-ink/30 hover:text-ink/60'
                        }`}
                      >
                        <ThumbsDown size={18} fill={movie.liked === false ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => setUndoing(movie)}
                        aria-label="Desmarcar como assistido"
                        title="Desmarcar como assistido"
                        className="p-2 rounded-full text-ink/30 hover:text-ink/60 transition-colors"
                      >
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {undoing && (
        <Modal
          title="Desmarcar filme"
          onClose={() => setUndoing(null)}
          footer={
            <div className="flex gap-2">
              <button onClick={() => setUndoing(null)} className="flex-1 py-2 rounded-full border border-line text-sm">
                Cancelar
              </button>
              <button onClick={confirmUndo} className="flex-1 py-2 rounded-full bg-ink text-base text-sm font-medium">
                Desmarcar
              </button>
            </div>
          }
        >
          <p className="text-sm text-ink/70">
            "{undoing.title}" volta pra lista de sorteio e a avaliação é apagada.
          </p>
        </Modal>
      )}
    </div>
  )
}

function MovieInfo({ movie, large = false }) {
  return (
    <div className={large ? 'text-center space-y-2' : 'min-w-0'}>
      <p className={`font-medium text-ink ${large ? 'font-display text-xl' : 'truncate'}`}>{movie.title}</p>
      <div className={`flex items-center gap-3 text-xs text-ink/50 ${large ? 'justify-center' : ''}`}>
        <span>#{movie.imdb_rank} no IMDB</span>
        <span className="flex items-center gap-1">
          <Star size={12} className="text-amber" fill="currentColor" /> {Number(movie.imdb_rating).toFixed(1)}
        </span>
        {large && (
          <a
            href={movie.imdb_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 hover:text-ink"
          >
            IMDB <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  )
}
