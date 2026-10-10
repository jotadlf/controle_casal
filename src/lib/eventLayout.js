import { parseTime } from './date'

// duração assumida pra compromissos sem horário de término, só pra decidir
// com quem eles se sobrepõem na grade (o card ocupa ~meia hora).
const POINT_EVENT_MINUTES = 30

function eventSpan(ev) {
  const start = parseTime(ev.event_time)
  if (!start) return null
  const startMinutes = start.hours * 60 + start.minutes
  const end = parseTime(ev.event_end_time)
  const endMinutes = end ? end.hours * 60 + end.minutes : null
  const hasRange = endMinutes !== null && endMinutes > startMinutes
  return { start: startMinutes, end: hasRange ? endMinutes : startMinutes + POINT_EVENT_MINUTES }
}

// Distribui compromissos que se sobrepõem em colunas lado a lado, como no
// Notion Calendar. Retorna { [id]: { col, cols } }: o compromisso ocupa a
// coluna `col` de um total de `cols` dentro do seu grupo de sobreposição.
export function layoutOverlappingEvents(events) {
  const items = events
    .map((ev) => ({ id: ev.id, span: eventSpan(ev) }))
    .filter((it) => it.span)
    .sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end)

  const layout = {}
  let group = []
  let groupEnd = -1
  let columnEnds = []

  function closeGroup() {
    for (const it of group) layout[it.id].cols = columnEnds.length
    group = []
    columnEnds = []
  }

  for (const it of items) {
    if (it.span.start >= groupEnd) {
      closeGroup()
      groupEnd = -1
    }
    let col = columnEnds.findIndex((end) => end <= it.span.start)
    if (col === -1) {
      col = columnEnds.length
      columnEnds.push(it.span.end)
    } else {
      columnEnds[col] = it.span.end
    }
    layout[it.id] = { col, cols: 1 }
    group.push(it)
    groupEnd = Math.max(groupEnd, it.span.end)
  }
  closeGroup()
  return layout
}
