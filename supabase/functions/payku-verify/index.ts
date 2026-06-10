// Supabase Edge Function · payku-verify
//
// Verifica el estado real de una transacción contra la API de Payku.
// Usa el secret server-side para autenticar.
//
// Recibe (JSON body): { orderId: string }
// Devuelve: { ok: boolean, status: string, raw?: any, error?: string }

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
    const { orderId } = await req.json()
    if (!orderId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'orderId requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const PAYKU_PUBLIC_TOKEN = Deno.env.get('PAYKU_PUBLIC_TOKEN')
    const PAYKU_SECRET_KEY = Deno.env.get('PAYKU_SECRET_KEY')
    const PAYKU_API_URL =
      Deno.env.get('PAYKU_API_URL') || 'https://app.payku.cl/api'

    if (!PAYKU_PUBLIC_TOKEN || !PAYKU_SECRET_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Payku no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const path = `/transaction/${encodeURIComponent(orderId)}`
    const sign = await hmacSha256(PAYKU_SECRET_KEY, path)

    const res = await fetch(`${PAYKU_API_URL}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYKU_PUBLIC_TOKEN}`,
        Sign: sign,
      },
    })

    const data = await res.json().catch(() => ({}))
    console.log('[payku-verify] Respuesta:', JSON.stringify(data))

    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: data?.message_error || 'Error verificando', raw: data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const status = data?.data?.status || data?.status || data?.transaction_status

    return new Response(
      JSON.stringify({
        ok: status === 'success' || status === 'paid' || status === 'completed',
        status,
        raw: data,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
