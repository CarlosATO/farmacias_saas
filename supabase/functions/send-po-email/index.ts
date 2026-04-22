import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, reply_to, subject, html_content, attachment, filename, senderName, companyName } = await req.json()

    if (!to || !reply_to || !subject || !html_content) {
      throw new Error('Missing required fields')
    }

    const fromName = senderName && companyName ? `${senderName} de ${companyName}` : 'Datix'

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `"${fromName}" <compras@datix.cl>`,
        to: [to],
        reply_to: reply_to,
        subject: subject,
        html: html_content,
        attachments: attachment ? [
          {
            filename: filename || 'orden_de_compra.pdf',
            content: attachment, // Espera Base64
          }
        ] : [],
      }),
    })

    const data = await res.json()

    if (res.ok) {
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    } else {
      console.error('Resend API error:', data)
      return new Response(JSON.stringify({ error: data.message || 'Error sending email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
