// ────────────────────────────────────────────────────────────────────────────
// Integración con Payku (pasarela de pago chilena · Webpay / transferencia)
//
// Arquitectura SEGURA:
//   Frontend (sin secret) → Supabase Edge Function (con secret) → Payku API
//
// El secret de Payku NO está en el frontend. Vive solo en los Edge Function
// Secrets de Supabase, server-side.
//
// Funciones expuestas a Supabase:
//   POST {SUPABASE_URL}/functions/v1/payku-create  → crea transacción
//   POST {SUPABASE_URL}/functions/v1/payku-verify  → verifica estado
// ────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const PENDING_KEY = 'pon-tu-ladrillo:payku-pending'

export function isPaykuConfigured() {
  // Como ahora el secret vive en el backend, desde el front solo necesitamos
  // que Supabase esté configurado (donde están deployadas las funciones).
  return !!SUPABASE_URL && !!SUPABASE_KEY
}

// Storage helpers para guardar la donación pendiente mientras el usuario
// está afuera del sitio en el checkout de Payku.
export function stashPendingDonation(orderId, donation, paykuId = null) {
  try {
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ orderId, paykuId, donation, ts: Date.now() })
    )
  } catch (e) {
    console.warn('[payku] no se pudo guardar pending donation:', e)
  }
}

export function popPendingDonation() {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    window.localStorage.removeItem(PENDING_KEY)
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ────────────────────────────────────────────────────────────────────────────
// createPaykuTransaction
// ────────────────────────────────────────────────────────────────────────────
// Llama a la Edge Function payku-create. Ella habla con Payku (con el secret
// server-side), genera la firma HMAC, y devuelve la URL del checkout.
// ────────────────────────────────────────────────────────────────────────────
export async function createPaykuTransaction(donation) {
  if (!isPaykuConfigured()) {
    const msg =
      '⚠️ Supabase no está configurado. Falta VITE_SUPABASE_URL / VITE_SUPABASE_KEY en .env.local.'
    alert(msg)
    throw new Error(msg)
  }

  const orderId = `tp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const baseUrl = window.location.origin
  // Incluimos la zona en la URL de retorno para que el usuario vuelva
  // exactamente a la página de donde salió a pagar (no a la raíz, que
  // redirige a /zona-comun por default).
  const zonePath = donation.zoneId ? `/${donation.zoneId}` : ''
  const returnUrl = `${baseUrl}${zonePath}?payku_status=success&order=${encodeURIComponent(orderId)}`
  const cancelUrl = `${baseUrl}${zonePath}?payku_status=cancel&order=${encodeURIComponent(orderId)}`

  console.log('[payku] Creando transacción via Edge Function:', {
    orderId,
    amount: donation.amount,
  })

  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/payku-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify({
        amount: Math.round(donation.amount),
        orderId,
        subject: `Aporte a ${donation.targetPart?.name || 'Trabajo País'}`,
        urlreturn: returnUrl,
        urlcancel: cancelUrl,
      }),
    })
  } catch (err) {
    console.error('[payku] Error de red llamando a Edge Function:', err)
    alert('No se pudo conectar al backend. Revisa tu conexión.')
    throw err
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok || !data.ok) {
    console.error('[payku] Edge Function rechazó:', response.status, data)
    const errMsg = data?.error || `Error ${response.status}`
    alert(`No se pudo crear el pago:\n${errMsg}`)
    throw new Error(errMsg)
  }

  console.log('[payku] Transacción creada:', data)

  // Guardamos la donación con el paykuId que devolvió la API. Lo
  // necesitamos después para verificar (no podemos usar nuestro orderId).
  stashPendingDonation(orderId, donation, data.paykuId)

  // Redirige al checkout de Payku
  window.location.href = data.url
  return { orderId, paykuId: data.paykuId, checkoutUrl: data.url }
}

// ────────────────────────────────────────────────────────────────────────────
// verifyPaykuTransaction
// ────────────────────────────────────────────────────────────────────────────
// Llama a la Edge Function payku-verify para confirmar que el pago se hizo.
// ────────────────────────────────────────────────────────────────────────────
export async function verifyPaykuTransaction({ orderId, paykuId } = {}) {
  if (!isPaykuConfigured()) {
    return { ok: false, error: 'Supabase no configurado' }
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/payku-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify({ orderId, paykuId }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      console.error('[payku] verify error:', res.status, data)
      return { ok: false, status: res.status, error: data?.error }
    }

    console.log('[payku] Estado de la transacción:', data)
    return data
  } catch (err) {
    console.error('[payku] Error de red verificando:', err)
    return { ok: false, error: err.message }
  }
}
