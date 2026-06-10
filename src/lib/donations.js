import { supabase } from './supabase.js'

// ────────────────────────────────────────────────────────────────────────────
// Conversión filas Supabase ↔ donantes JS
// ────────────────────────────────────────────────────────────────────────────
function rowToDonor(row) {
  return {
    id: row.id,
    zoneId: row.zone_id,
    partId: row.part_id,
    name: row.name,
    message: row.message || '',
    amount: row.amount,
    timestamp: row.created_at,
    isCompany: !!row.is_company,
    logoDataUrl: row.logo_url || null,
    receiptUrl: row.receipt_url || null,
    paymentMethod: row.payment_method || 'transferencia',
    paykuOrderId: row.payku_order_id || null,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// fetchDonations — todas las donaciones de UNA zona específica
// ────────────────────────────────────────────────────────────────────────────
export async function fetchDonations(zoneId) {
  if (!supabase || !zoneId) return []
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .eq('zone_id', zoneId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[donations] fetch error:', error)
    return []
  }
  return (data || []).map(rowToDonor)
}

// ────────────────────────────────────────────────────────────────────────────
// Realtime — suscribirse a nuevas donaciones de UNA zona específica
// ────────────────────────────────────────────────────────────────────────────
export function subscribeNewDonations(zoneId, onInsert) {
  if (!supabase || !zoneId) return () => {}
  const channel = supabase
    .channel(`donations-feed-${zoneId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'donations',
        filter: `zone_id=eq.${zoneId}`,
      },
      (payload) => {
        try {
          onInsert(rowToDonor(payload.new))
        } catch (e) {
          console.error('[donations] realtime callback error:', e)
        }
      }
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// uploadReceipt — sube el comprobante de transferencia al bucket comprobantes
// ────────────────────────────────────────────────────────────────────────────
export async function uploadReceipt(file) {
  if (!supabase || !file) return null
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const rand = Math.random().toString(36).slice(2, 10)
  const path = `comp-${Date.now()}-${rand}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('comprobantes')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    })
  if (uploadError) {
    console.error('[donations] upload receipt error:', uploadError)
    throw uploadError
  }
  const { data } = supabase.storage.from('comprobantes').getPublicUrl(path)
  return data.publicUrl
}

// ────────────────────────────────────────────────────────────────────────────
// insertDonation — sólo INSERT en la tabla (no maneja archivos)
// Útil para insertar múltiples filas con la misma logoUrl/receiptUrl (spillover).
// ────────────────────────────────────────────────────────────────────────────
export async function insertDonation(zoneId, donation) {
  if (!supabase) throw new Error('Supabase no está configurado')
  if (!zoneId) throw new Error('zoneId requerido')

  const id = `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const row = {
    id,
    zone_id: zoneId,
    part_id: donation.partId,
    name: donation.name?.trim() || (donation.isCompany ? 'Empresa' : 'Anónimo'),
    message: donation.message?.trim() || '',
    amount: Number(donation.amount) || 0,
    is_company: !!donation.isCompany,
    logo_url: donation.logoUrl || null,
    receipt_url: donation.receiptUrl || null,
    transfer_first_name: donation.transferFirstName?.trim() || null,
    transfer_last_name: donation.transferLastName?.trim() || null,
    transfer_rut: donation.transferRut?.trim() || null,
    payment_method: donation.paymentMethod || 'transferencia',
    payku_order_id: donation.paykuOrderId || null,
  }
  const { data, error } = await supabase
    .from('donations')
    .insert(row)
    .select()
    .single()
  if (error) {
    console.error('[donations] insert error:', error)
    throw error
  }
  return rowToDonor(data)
}
