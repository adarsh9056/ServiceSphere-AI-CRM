import { useMemo } from 'react'
import { useQuery, useMutation } from '@apollo/client/react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { GET_DEALS, MOVE_DEAL } from '../graphql/operations'

const STAGES = [
  { id: 'NEW', label: 'New' },
  { id: 'CONTACTED', label: 'Contacted' },
  { id: 'QUALIFIED', label: 'Qualified' },
  { id: 'PROPOSAL', label: 'Proposal' },
  { id: 'NEGOTIATION', label: 'Negotiation' },
  { id: 'WON', label: 'Won' },
  { id: 'LOST', label: 'Lost' },
]

function DealCard({ deal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  })
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : undefined,
        opacity: isDragging ? 0.85 : 1,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm active:cursor-grabbing dark:border-slate-700 dark:bg-slate-950"
    >
      <div className="text-sm font-semibold text-slate-900 dark:text-white">{deal.lead.name}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{deal.lead.company || '—'}</div>
      {deal.value && (
        <div className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400">
          ${Number(deal.value).toLocaleString()}
        </div>
      )}
    </div>
  )
}

function Column({ stageId, label, deals }) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId })
  return (
    <div
      ref={setNodeRef}
      className={[
        'flex min-h-[320px] w-72 shrink-0 flex-col gap-3 rounded-xl border bg-slate-50 p-3 dark:bg-slate-900/40',
        isOver ? 'border-blue-500 ring-2 ring-blue-400/40' : 'border-slate-200 dark:border-slate-800',
      ].join(' ')}
    >
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          {label}
        </h3>
        <span className="text-[10px] text-slate-400">{deals.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  )
}

export default function Pipeline() {
  const { data, loading, refetch } = useQuery(GET_DEALS)
  const [moveDeal] = useMutation(MOVE_DEAL)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.id, []]))
    for (const deal of data?.getDeals || []) {
      if (map[deal.stage]) map[deal.stage].push(deal)
    }
    return map
  }, [data])

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return
    const dealId = String(active.id)
    const newStage = String(over.id)
    const deal = data?.getDeals?.find((d) => d.id === dealId)
    if (!deal || deal.stage === newStage) return
    await moveDeal({ variables: { id: dealId, stage: newStage } })
    refetch()
  }

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading pipeline…</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Deal pipeline</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Drag cards to update stages. Changes save to PostgreSQL immediately.
        </p>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((col) => (
            <Column key={col.id} stageId={col.id} label={col.label} deals={byStage[col.id] || []} />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
