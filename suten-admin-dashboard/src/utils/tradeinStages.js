export const TRADEIN_TABS = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'pre_inspection', label: 'Pre Inspection' },
  { id: 'inspected', label: 'Inspected' },
  { id: 'dealing', label: 'Dealing' },
  { id: 'cancel', label: 'Cancel' },
  { id: 'all', label: 'All' },
]

export const TRADEIN_STAGE_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  pre_inspection: 'Pre Inspection',
  inspected: 'Inspected',
  dealing: 'Dealing',
  cancel: 'Cancel',
}

export function deriveTradeinAdminStage(r) {
  if (r.adminStage) return r.adminStage
  if (r.status === 'cancelled' || r.status === 'canceled') return 'cancel'
  if (r.status === 'contacted') return 'contacted'
  return 'new'
}

export function adminStageToStatus(adminStage) {
  if (adminStage === 'cancel') return 'cancelled'
  if (adminStage === 'new') return 'new'
  return 'contacted'
}
