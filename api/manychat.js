import crypto from 'node:crypto';
import {resolve,humanize,standardPayload,dynamicPayload,VERSION,BUSINESS,CATALOG} from '../lib/engine.js';

const json=(res,code,obj)=>res.status(code).setHeader('Content-Type','application/json; charset=utf-8').json(obj);
function authorized(req) {
  const secret=process.env.WEBHOOK_SECRET;
  // Em produção, nunca iniciar sem segredo; health GET não passa pela autenticação.
  if (!secret || secret.length<24) return false;
  const presented=req.headers['x-webhook-secret'] ||
    String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if (typeof presented !== 'string') return false;
  const a=Buffer.from(presented),b=Buffer.from(secret);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
export default async function handler(req,res) {
  if (req.method==='GET') return json(res,200,{
    ok:true,app_version:VERSION,business:BUSINESS.empresa.nome,
    catalogo_ativo:CATALOG.length,openai_configured:!!process.env.OPENAI_API_KEY,
    webhook_secret_configured:!!process.env.WEBHOOK_SECRET,
    google_review_configured:!!BUSINESS.links.google_avaliacao
  });
  if (req.method!=='POST') return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  if (!authorized(req)) return json(res,401,{ok:false,error:'UNAUTHORIZED'});
  try {
    const input=typeof req.body==='string' ? JSON.parse(req.body) : req.body;
    if (!input || typeof input!=='object' || Array.isArray(input)) return json(res,400,{ok:false,error:'INVALID_BODY'});
    const base=resolve(input);
    const r=await humanize(base);
    const dynamic=req.query?.mode==='dynamic'||input.response_mode==='dynamic';
    const answer=dynamic?dynamicPayload(r):standardPayload(r);
    return json(res,200,answer);
  } catch (e) {
    // Não logar nome, telefone, mensagem nem tokens dos clientes.
    console.error('BOT_FATAL_ERROR',e?.name||'UnknownError');
    const input=typeof req.body==='object'&&req.body ? req.body : {};
    const channel=input.channel==='whatsapp'?'whatsapp':'instagram';
    const r={intent:'erro_seguro',reply:'Tive uma instabilidade aqui. Nossa equipe pode continuar seu atendimento no WhatsApp.',
      channel,needs_human:true,next_action:'whatsapp',topic:'',ctas:[
        {type:'url',label:'Falar no WhatsApp',url:BUSINESS.links.whatsapp}],
      state:{last_intent:'erro_seguro',last_topic:'',last_bot_reply:'',rating_pending:false,feedback_pending:false,last_event_id:''}};
    return json(res,200,req.query?.mode==='dynamic'?dynamicPayload(r):standardPayload(r));
  }
}
