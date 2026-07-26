export const WORKSHOP_LABOR_CATEGORIES = [
  {
    category: 'LCGC',
    models: ['Agya', 'Calya'],
    hourlyRate: 163000,
  },
  {
    category: 'Economy',
    models: ['Avanza', 'Velos', 'Rush', 'Raize', 'Etios'],
    hourlyRate: 231000,
  },
  {
    category: 'Standard',
    models: ['Innova', 'Zenix', 'Sienta', 'Yaris', 'Yaris Cross', 'Vios', 'Hilux', 'HiAce'],
    hourlyRate: 297000,
  },
  {
    category: 'Medium Luxury',
    models: ['Corolla Altis', 'Fortuner', 'Voxy', 'Corolla Cross', 'C-HR', 'NAV1'],
    hourlyRate: 511000,
  },
  {
    category: 'Luxury',
    models: [
      'Camry',
      'Alphard',
      'Vellfire',
      'Land Cruiser',
      'GR Corolla',
      'GR Yaris',
      'GR86',
      'bZ4X',
      'Supra',
      'Prius',
      'RAV4',
      'Crown',
      'Harrier',
      'Urban Cruiser',
    ],
    hourlyRate: 580000,
  },
  {
    category: 'Lexus',
    models: ['Lexus'],
    hourlyRate: 636000,
  },
  {
    category: 'CBU Non TAM',
    models: ['CBU Non TAM'],
    hourlyRate: 1272000,
  },
  {
    category: 'Commercial',
    models: ['Dyna', 'Hilux Rangga'],
    hourlyRate: 201000,
  },
];

/**
 * Utility function to lookup hourly labor rate for a given car model name.
 * @param {string} modelName - Model name (e.g. "Yaris", "Avanza", "Alphard")
 * @returns {{ category: string, hourlyRate: number }}
 */
export function getLaborRateForModel(modelName = '') {
  if (!modelName) {
    return { category: 'Standard', hourlyRate: 297000 };
  }

  const clean = String(modelName).trim().toLowerCase();

  for (const item of WORKSHOP_LABOR_CATEGORIES) {
    const matched = item.models.some(
      (m) => clean.includes(m.toLowerCase()) || m.toLowerCase().includes(clean)
    );
    if (matched) {
      return { category: item.category, hourlyRate: item.hourlyRate };
    }
  }

  // Default fallback to Standard rate
  return { category: 'Standard', hourlyRate: 297000 };
}

/**
 * Utility to calculate total labor cost for a job based on Flat Rate Time (FRT / Hours).
 * @param {string} modelName - Model name
 * @param {number} frtHours - Hours required for job (e.g. 1.5 hours)
 * @returns {{ category: string, hourlyRate: number, frtHours: number, totalLaborCost: number }}
 */
export function calculateJobLaborCost(modelName, frtHours = 1.0) {
  const { category, hourlyRate } = getLaborRateForModel(modelName);
  const totalLaborCost = Math.round(hourlyRate * frtHours);
  return {
    category,
    hourlyRate,
    frtHours,
    totalLaborCost,
  };
}
