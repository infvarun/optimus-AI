import { memo } from 'react'
import { Check, ShieldAlert, X } from 'lucide-react'
import type { Approval } from '../data/mock'

interface Props {
  approval: Approval
  onDecide: (id: string, approved: boolean) => void
}

export const ApprovalCard = memo(function ApprovalCard({ approval, onDecide }: Props) {
  const pending = approval.state === 'pending'
  return (
    <section className={`approval approval--${approval.state}`} aria-label="Approval required">
      <header className="approval__head">
        <ShieldAlert size={18} aria-hidden="true" />
        <span className="approval__label">
          {pending ? 'Needs a team lead’s approval' : approval.state === 'approved' ? 'Approved by you' : 'Rejected by you'}
        </span>
        <span className={`badge badge--risk-${approval.risk}`}>{approval.risk} risk</span>
      </header>
      <p className="approval__action">{approval.action}</p>
      <p className="approval__target mono">{approval.target}</p>
      {approval.change && <p className="approval__target mono">Under {approval.change}</p>}
      <p className="approval__reason">{approval.reason}</p>
      <p className="approval__approvers">
        Approvers: {approval.approvers.join(', ')} <span>(leads of the owning team)</span>
      </p>
      {pending && (
        <div className="approval__actions">
          <button className="btn btn--primary" onClick={() => onDecide(approval.id, true)}>
            <Check size={16} aria-hidden="true" /> Approve as lead
          </button>
          <button className="btn btn--secondary" onClick={() => onDecide(approval.id, false)}>
            <X size={16} aria-hidden="true" /> Reject
          </button>
        </div>
      )}
    </section>
  )
})
