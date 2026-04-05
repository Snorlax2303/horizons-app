// Supabase Edge Function for W-API WhatsApp Message Sending
// Deploy this to Supabase Edge Functions

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const WAPI_BASE_URL = Deno.env.get('WAPI_BASE_URL');
const WAPI_INSTANCE_ID = Deno.env.get('WAPI_INSTANCE_ID');
const WAPI_TOKEN = Deno.env.get('WAPI_TOKEN');
const WAPI_CLIENT_TOKEN = Deno.env.get('WAPI_CLIENT_TOKEN');

serve(async (req) => {
  try {
    const { phone, message, campanhaId, envioId } = await req.json();

    // Call W-API to send message
    const wapiResponse = await fetch(
      `${WAPI_BASE_URL}/instances/${WAPI_INSTANCE_ID}/client/action/send-message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${WAPI_TOKEN}`,
          'X-Client-Token': WAPI_CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: phone,
          message: message,
          isGroup: false
        })
      }
    );

    const wapiData = await wapiResponse.json();

    if (wapiData.success) {
      return new Response(
        JSON.stringify({
          success: true,
          messageId: wapiData.messageId,
          status: 'enviado'
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: wapiData.error,
          status: 'falha'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        status: 'falha'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});