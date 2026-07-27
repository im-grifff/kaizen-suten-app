import { deriveTradeinAdminStage } from './tradeinStages.js'

/**
 * Label pipeline untuk ditampilkan di modal Hasil Taksasi (dipakai AppraisalResultModal).
 * Memakai stage admin yang sama (new/contacted/pre_inspection/inspected/dealing/cancel).
 */
export function pipelineLabel(r) {
  const stage = deriveTradeinAdminStage(r)
  const map = {
    new: 'Baru',
    contacted: 'Dihubungi',
    pre_inspection: 'Pre Inspeksi',
    inspected: 'Inspeksi',
    dealing: 'Dealing',
    cancel: 'Batal',
  }
  return map[stage] || String(stage)
}
