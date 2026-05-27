// ────────────────────────────────────────────────────────────────────────────
// Persistencia local de donaciones POR ZONA (sin backend todavía).
// Estructura en localStorage:
//   pon-tu-ladrillo-tp:donors:<zoneId>  →  JSON array de donaciones
//
// Cuando se conecte a Supabase, este archivo se reemplaza por uno que llame
// a la API. La interfaz pública (fetchDonations / createDonation) se mantiene.
// ────────────────────────────────────────────────────────────────────────────

const KEY_PREFIX = 'pon-tu-ladrillo-tp:donors:'

function keyFor(zoneId) {
  return `${KEY_PREFIX}${zoneId}`
}

export function fetchDonations(zoneId) {
  if (typeof window === 'undefined' || !zoneId) return []
  try {
    const raw = window.localStorage.getItem(keyFor(zoneId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveDonations(zoneId, donations) {
  if (typeof window === 'undefined' || !zoneId) return
  try {
    window.localStorage.setItem(keyFor(zoneId), JSON.stringify(donations))
  } catch {
    // modo privado u otro error: silencioso por ahora
  }
}

export function createDonation(zoneId, donation) {
  const id = `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const record = {
    id,
    partId: donation.partId,
    name: donation.name?.trim() || (donation.isCompany ? 'Empresa' : 'Anónimo'),
    message: donation.message?.trim() || '',
    amount: Number(donation.amount) || 0,
    timestamp: new Date().toISOString(),
    isCompany: !!donation.isCompany,
    logoDataUrl: donation.logoDataUrl || null,
    // metadatos privados de la transferencia (no se muestran públicamente)
    transferFirstName: donation.transferFirstName || null,
    transferLastName: donation.transferLastName || null,
    transferRut: donation.transferRut || null,
  }
  const existing = fetchDonations(zoneId)
  const updated = [record, ...existing]
  saveDonations(zoneId, updated)
  return record
}
