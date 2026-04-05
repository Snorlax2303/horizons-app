// Supabase Edge Function for Gemini AI Template Generation
// Deploy this to Supabase Edge Functions

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

serve(async (req) => {
  try {
    const { briefing, currentTemplate, actionType } = await req.json();

    let systemPrompt = '';
    
    switch (actionType) {
      case 'suggest':
        systemPrompt = `You are a WhatsApp message template generator. Create a professional message template based on this briefing: "${briefing}". 
        You MUST include these variables in your template: {{nome}}, {{plano}}, {{valor}}, {{qtd_acessos}}, {{vencimento}}, {{mes}}, {{ano}}.
        Make it friendly, professional, and suitable for billing/subscription reminders. Return only the template text.`;
        break;
      case 'improve':
        systemPrompt = `Improve this WhatsApp message template while PRESERVING ALL {{variables}}: "${currentTemplate}".
        Make it more professional and engaging, but keep all the variables intact: {{nome}}, {{plano}}, {{valor}}, {{qtd_acessos}}, {{vencimento}}, {{mes}}, {{ano}}.
        Return only the improved template text.`;
        break;
      case 'variations':
        systemPrompt = `Generate 3 variations of this template while PRESERVING ALL {{variables}}: "${currentTemplate}".
        Each variation should maintain the variables: {{nome}}, {{plano}}, {{valor}}, {{qtd_acessos}}, {{vencimento}}, {{mes}}, {{ano}}.
        Return the variations separated by "---".`;
        break;
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }]
        })
      }
    );

    const geminiData = await geminiResponse.json();
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return new Response(
      JSON.stringify({ success: true, template: generatedText }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});