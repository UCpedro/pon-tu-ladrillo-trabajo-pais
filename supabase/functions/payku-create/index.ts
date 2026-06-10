// Supabase Edge Function · payku-create
//
// Crea una transacción de Payku desde el backend. El secret NUNCA toca el
// frontend — vive en los Edge Function Secrets de Supabase.
//
// Recibe (JSON body):
//   { amount, orderId, subject, urlreturn, urlcancel, email? }
//
// Devuelve (JSON):
//   200 → { ok: true, url: "https://...", id: "tr_..." }
//   400 → { ok: false, error: "..." }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(message)
  )
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { amount, orderId, subject, urlreturn, urlcancel, email } =
      await req.json()

    // Validación básica
    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'amount inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!orderId || !urlreturn) {
      return new Response(
        JSON.stringify({ ok: false, error: 'orderId y urlreturn son obligatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Secrets (vienen de Supabase Edge Function Secrets, no del repo)
    const PAYKU_PUBLIC_TOKEN = Deno.env.get('PAYKU_PUBLIC_TOKEN')
    const PAYKU_SECRET_KEY = Deno.env.get('PAYKU_SECRET_KEY')
    const PAYKU_API_URL =
      Deno.env.get('PAYKU_API_URL') || 'https://app.payku.cl/api'

    if (!PAYKU_PUBLIC_TOKEN || !PAYKU_SECRET_KEY) {
      console.error('[payku-create] Faltan secrets de Payku')
      return new Response(
        JSON.stringify({ ok: false, error: 'Payku no está configurado en el servidor' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload = {
      amount: Math.round(amount),
      order: orderId,
      subject: subject || 'Aporte a Trabajo País',
      email: email || 'donaciones@pon-tu-ladrillo.cl',
      urlreturn,
      urlcancel: urlcancel || urlreturn,
    }

    const bodyString = JSON.stringify(payload)
    const sign = await hmacSha256(PAYKU_SECRET_KEY, bodyString)

    console.log('[payku-create] Llamando a Payku con:', { orderId, amount: payload.amount })

    const res = await fetch(`${PAYKU_API_URL}/transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PAYKU_PUBLIC_TOKEN}`,
        Sign: sign,
      },
      body: bodyString,
    })

    const data = await res.json().catch(() => ({}))
    console.log('[payku-create] Respuesta Payku:', JSON.stringify(data))

    // Payku puede responder 200 con status:"failed" en el body
    if (!res.ok || data?.status === 'failed' || data?.type === 'Unprocessable Entity') {
      const errMsg =
        data?.message_error ||
        data?.error?.message ||
        data?.message ||
        `Payku rechazó la transacción (HTTP ${res.status})`
      return new Response(
        JSON.stringify({ ok: false, error: errMsg, raw: data }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const checkoutUrl =
      data?.data?.url ||
      data?.url ||
      data?.checkout_url ||
      data?.payment_url ||
      data?.data?.url_pago

    // Payku puede devolver el ID interno en varios lugares — lo necesitamos
    // para poder verificar después la transacción.
    const paykuId =
      data?.id ||
      data?.data?.id ||
      data?.transaction_id ||
      data?.data?.transaction_id ||
      data?.txid ||
      data?.data?.txid

    console.log('[payku-create] Checkout URL:', checkoutUrl, '| Payku ID:', paykuId)

    if (!checkoutUrl) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Payku no devolvió URL de checkout',
          raw: data,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        url: checkoutUrl,
        paykuId,
        raw: data,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[payku-create] Error inesperado:', err)
    return new Response(
      JSON.stringify({ ok: false, error: err.message || 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
