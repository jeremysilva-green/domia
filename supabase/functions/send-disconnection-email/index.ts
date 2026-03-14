import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { ownerEmail, ownerName, tenantName, tenantEmail, unitInfo, reason } = await req.json();

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@domia.app';

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="color: #111;">Solicitud de desvinculación</h2>
        <p>Hola <strong>${ownerName}</strong>,</p>
        <p>
          Tu inquilino <strong>${tenantName}</strong> (${tenantEmail})
          ha enviado una solicitud de desvinculación
          ${unitInfo ? ` de la unidad <strong>${unitInfo}</strong>` : ''}.
        </p>
        <h3 style="margin-bottom: 8px;">Motivo:</h3>
        <blockquote style="border-left: 3px solid #facc15; margin: 0; padding: 8px 16px; background: #fafafa; color: #444; border-radius: 4px;">
          ${reason}
        </blockquote>
        <p style="margin-top: 24px;">Puedes ver esta solicitud en la bandeja de entrada de tu app <strong>Domia</strong>.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <small style="color: #999;">Este mensaje fue enviado automáticamente desde Domia.</small>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ownerEmail,
        subject: `${tenantName} quiere desvincularme de la propiedad`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend error: ${err}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
