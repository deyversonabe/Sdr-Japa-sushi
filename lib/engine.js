import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { persona } from './persona.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const knowledge = read('knowledge.json');
const catalogData = read('catalogo_extraido.json');
const ACTIVE = new Set(['ativo', 'ativo_por_confirmacao_usuario_2026_09_22']);
const catalog = catalogData.catalogo.filter((p) => ACTIVE.has(p.status));
const hidden = catalogData.catalogo.filter((p) => !ACTIVE.has(p.status));
const L = knowledge.links;
export const VERSION = knowledge._meta.versao;
export const BUSINESS = knowledge;
export const CATALOG = catalog;
export const HIDDEN = hidden;

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const has = (t, re) => re.test(t);
const words = (v) => ` ${norm(v)} `;
const isYes = (v) => v === true || ['true','yes','sim','1'].includes(norm(v));
const WA = { type: 'url', label: 'Falar no WhatsApp', url: L.whatsapp };
const RH = { type: 'url', label: 'Enviar currículo', url: L.whatsapp_rh };
const MENU = { type: 'url', label: 'Ver cardápio / pedir', url: L.cardapio_pedido };
const MAP = { type: 'url', label: 'Como chegar', url: L.google_maps };
const REVIEW = () => L.google_avaliacao ? [{type:'url',label:'Avaliar no Google',url:L.google_avaliacao}] : [];
const stateBase = () => ({last_intent:'',last_topic:'',last_bot_reply:'',rating_pending:false,feedback_pending:false,last_event_id:''});
const decodeState = (raw) => {
  if (typeof raw !== 'string') return raw;
  const t = raw.trim();
  if (!t || t.startsWith('{')) return t;
  try { return Buffer.from(t, 'base64url').toString('utf8'); } catch { return t; }
};
export const encodeState = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
// Aceita o chip "Dados completos do contato" do ManyChat (JSON serializado pelo próprio ManyChat),
// evitando JSON quebrado quando a mensagem do cliente tem aspas ou quebras de linha.
export function normalizeInput(input={}) {
  const c = input && typeof input.contact === 'object' && input.contact ? input.contact : null;
  if (!c) return input;
  const cf = c.custom_fields && typeof c.custom_fields === 'object' ? c.custom_fields : {};
  return {
    ...input,
    subscriber_id: input.subscriber_id || c.id || '',
    first_name: input.first_name || c.first_name || '',
    message: input.message ?? c.last_input_text ?? '',
    ai_state: input.ai_state ?? cf.ai_state ?? '',
    atendimento_humano: input.atendimento_humano ?? cf.atendimento_humano,
  };
}
export function parseState(raw) {
  try {
    const dec = decodeState(raw);
    const obj = typeof dec === 'string' ? JSON.parse(dec) : dec;
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? {...stateBase(),...obj} : stateBase();
  } catch { return stateBase(); }
}
const result = (intent,reply,ctas=[],extra={}) => ({intent,reply,ctas,needs_human:false,next_action:'responder',topic:'',...extra});
const fallback = (intent='outro',intro='Não quero te passar uma informação errada. Nossa equipe consegue confirmar direitinho pelo WhatsApp.') =>
  result(intent,intro,[WA],{needs_human:true,next_action:'whatsapp'});
const itemReply = (p) => `${p.nome} — ${p.valor}${p.descricao ? `\n${p.descricao}` : '\nNão tenho descrição confirmada deste item.'}`;
const compact = (p) => `${p.nome} — ${p.valor}`;
const questions = /(quanto|preco|valor|acompanha|serve|tem esse|e esse|deste|desse)/;
const getState = (input) => {
  const s = parseState(input.ai_state ?? input.state);
  if (!s.last_intent && input.last_intent) s.last_intent = String(input.last_intent);
  if (!s.last_topic && input.last_topic) s.last_topic = String(input.last_topic);
  if (!s.last_bot_reply && input.last_bot_reply) s.last_bot_reply = String(input.last_bot_reply);
  if (!s.rating_pending && isYes(input.avaliacao_pendente)) s.rating_pending = true;
  if (!s.feedback_pending && isYes(input.avaliacao_feedback_pendente)) s.feedback_pending = true;
  return s;
};
function lookup(text) {
  const n = norm(text), padded = ` ${n} `;
  if (!n || n.length < 5) return [];
  const hits = [];
  for (const p of catalog) {
    const full = norm(p.nome), stem = full.replace(/\s+(?:\d+\s+)?(?:unid|unidades|laminas|g|ml)\b.*/, '').trim();
    if (full.length>=5 && padded.includes(` ${full} `)) {hits.push({p,score:100+full.length});continue;}
    if (stem.length>=9 && padded.includes(` ${stem} `)) hits.push({p,score:stem.length});
  }
  if (!hits.length) return [];
  hits.sort((a,b) => b.score-a.score);
  // Quando a busca contém o nome completo, prefere apenas essa apresentação; no empate, explicita variações.
  const best=hits[0].score;
  return hits.filter((h)=>h.score===best).map((h)=>h.p).slice(0,4);
}
const group = (category) => {
  const aliases={
    'combos':['Combos','Combos Individuais'],
    'combo':['Combos','Combos Individuais'],
    'pratos quentes':['Pratos Quentes'],
    'yakissoba':['Pratos Quentes'],
    'yakimeshi':['Pratos Quentes'],
    'tepan':['Pratos Quentes'],
    'temaki':['Temaki individuais'],
    'temakis':['Temaki individuais'],
    'poke':['Monte Seu Poke'],
    'sobremesa':['Sobremesa'],
    'sashimi':['Sashimis'],
    'entradas':['Entradas'],
    'bebidas':['Bebidas'],
    'drink':['Drinks'],
    'joy sem arroz':['Joy Especial (SEM ARROZ)'],
    'oniguiri':['Oniguiri'],
    'hot roll':['Mega Hot Roll','Sushi à La Carte']
  };
  const cats = aliases[category] ?? [category];
  return catalog.filter((p)=>cats.includes(p.categoria) && (!['yakissoba','yakimeshi','tepan'].includes(category) || norm(p.nome).startsWith(category)));
};
const ratingValue = (raw) => {
  const m = norm(raw).match(/^(?:(?:nota|dou|avalio com) )?([1-5])(?: (?:estrelas|estrela|de 5))?$/);
  return m ? Number(m[1]) : null;
};
const forbiddenSubject = (n) => /\b(dono|proprietari\w*|assumi|trocou de dono|rafa|influenciador\w*|influencer\w*)\b/.test(n);
const needsCare = (n) => /\b(alergia|alergico|gluten|contaminacao cruzada|intolerancia|vegano|celiaco)\b/.test(n);
const complaint = (n) => /\b(reclamacao|reclamar|estorno|cancelar|reembolso|errado|faltou|atrasad\w*|demorou|frio|estragado|problema)\b/.test(n) && !/sem problema|deu tudo certo/.test(n);
const jobs = (n) => /\b(vaga|vagas|emprego|empregos|curriculo|curriculos|trabalhar|trabalho|contratacao|contratando|contrata|contratam|contratar|rh|selecao|entrevista|freela|freelancer|estagio|sushiman|garcom|garconete|cozinheiro|cozinheira)\b/.test(n);
const partnership = (n) => /\b(parceria|permuta|divulgacao|agencia|trafego|consultoria|representante|proposta comercial|publi)\b/.test(n);
const praise = (n) => /\b(amei|adorei|maravilhoso|maravilhosa|perfeito|delicioso|sensacional|parabens|top)\b/.test(n);
const gradePrompt = () => 'Que bom ter você com a gente! De 1 a 5, que nota você dá à sua experiência? Pode responder só com o número.';

export function resolve(input={}) {
  input = normalizeInput(input);
  const s = getState(input);
  const raw = String(input.message ?? input.text ?? '').slice(0,4000);
  const n = norm(raw.replace(/rodiozio|rodizzio|rodizo|rrodizio/gi,'rodizio').replace(/temaky/gi,'temaki').replace(/sachimi/gi,'sashimi').replace(/filadelfia|philadelfia/gi,'philadelphia'));
  const event = norm(input.event_type || 'direct');
  const channel = norm(input.channel||'instagram')==='whatsapp' ? 'whatsapp' : 'instagram';
  const eventId = String(input.event_id || '').slice(0,128);
  if (channel==='whatsapp' && isYes(input.atendimento_humano)) return {
    ...result('humano_ativo','',[],{next_action:'silencio_humano'}),state:s,channel
  };
  if (eventId && s.last_event_id===eventId) return {
    ...result('duplicado','',[],{next_action:'ignorar'}),state:s,channel
  };
  let r;
  if (event==='pedido confirmado' || event==='feedback request') {
    r=result('avaliacao_solicitar_nota',gradePrompt());
    s.rating_pending=true; s.feedback_pending=false;
  } else if (s.feedback_pending) {
    s.feedback_pending=false;
    r=result('avaliacao_feedback','Obrigado por nos contar. Vamos encaminhar seu comentário à equipe. Seu relato faz diferença para melhorarmos.',
      [...REVIEW(),WA].slice(0,3),{needs_human:true,next_action:'registrar_feedback',feedback:raw});
  } else if (s.rating_pending) {
    const note=ratingValue(raw);
    if (!note) r=result('avaliacao_nota_invalida','Me manda só uma nota de 1 a 5, por favor.');
    else {
      s.rating_pending=false;
      if (note<=4) {
        s.feedback_pending=true;
        r=result('avaliacao_nota','Obrigado pela sinceridade. O que poderíamos melhorar? Pode me contar em uma frase.',
          [...REVIEW(),WA],{nota:note,next_action:'aguardar_feedback'});
      } else {
        r=result('avaliacao_nota',L.google_avaliacao
          ? 'Que bom saber que gostou! Obrigado por avaliar sua experiência. Se quiser, uma avaliação sincera no Google ajuda outras pessoas a conhecerem a casa.'
          : 'Que bom saber que gostou! Obrigado por avaliar sua experiência. Agradecemos por compartilhar sua opinião!',
          REVIEW(),{nota:note});
      }
    }
  } else if (event==='story mention' && !n) {
    r=result('story_mention','Obrigado por lembrar do Japa! Adoramos receber sua marcação. 🍣');
  } else if (event==='audio' || event==='voice' || norm(input.message_type).includes('audio')) {
    r=fallback('audio','Recebi seu áudio! Para não deixar sua dúvida sem resposta, nossa equipe pode te ajudar no WhatsApp.');
  } else if (jobs(n)) {
    r=result('vaga','Que bom ter seu interesse em trabalhar com a gente! O nosso RH recebe currículos e informações sobre seleção pelo botão abaixo.',[RH]);
  } else if (complaint(n)) {
    r=fallback('reclamacao','Sinto muito pelo ocorrido. Quero que nossa equipe entenda seu caso e te ajude diretamente pelo WhatsApp.');
  } else if (needsCare(n)) {
    r=fallback('cuidados_alimentares','Para confirmar ingredientes e cuidados no preparo com segurança, converse com nossa equipe pelo WhatsApp.');
  } else if (partnership(n)) {
    r=result('parceria','Agradecemos o contato! Você pode deixar sua proposta resumida por aqui; nossa equipe analisará conforme a necessidade.');
  } else if (forbiddenSubject(n)) {
    r=result('assunto_interno','Posso te ajudar com informações sobre nosso cardápio, pedidos e reservas. Precisa de alguma dessas opções?', [MENU,WA]);
  } else if (/\b(avaliar|avaliacao|dar nota|feedback|nota pro japa)\b/.test(n)) {
    s.rating_pending=true;
    r=result('avaliacao_solicitar_nota',gradePrompt());
  } else if (/\b(atendente|humano|pessoa|falar com voces|falar com alguem|ajuda)\b/.test(n)) {
    r=fallback('humano','Claro! Você consegue falar com nossa equipe diretamente pelo botão do WhatsApp.');
  } else if (/\b(reserva|reservar|agendar|marcar uma mesa|quero uma mesa|mesa para|aniversario|evento)\b/.test(n)) {
    r=result('reserva',
      `Podemos organizar sua reserva! Precisaremos do nome, dia, horário e quantidade de pessoas. ${knowledge.reserva.sinal_texto}`,
      [WA],{needs_human:true,next_action:'whatsapp'});
  } else if (/\b(crianca|criancas|infantil|anos|menor de 9)\b/.test(n) && /\b(rodizio|paga|pagam|valor|crianca|infantil)\b/.test(n)) {
    r=result('rodizio_infantil',`Menores de 9 anos não pagam rodízio. Crianças de 9 a 11 anos completos pagam ${knowledge.rodizio.infantil_9_a_11}. Bebidas e sobremesas são à parte.`,[MENU],{topic:'rodizio'});
  } else if (/\b(bebida|bebidas|sobremesa|sobremesas|incluso|inclusa|inclui|entra no rodizio)\b/.test(n) && /rodizio|inclus|entra/.test(n)) {
    r=result('rodizio_inclusoes','Bebidas e sobremesas não estão inclusas no rodízio; são cobradas separadamente.',[MENU],{topic:'rodizio'});
  } else if (/\b(rodizio)\b/.test(n)) {
    r=result('rodizio',
      `Temos rodízio todos os dias! Individual: ${knowledge.rodizio.individual}. Casal: ${knowledge.rodizio.casal}. Infantil (9 a 11 anos): ${knowledge.rodizio.infantil_9_a_11}; menores de 9 anos não pagam. Bebidas e sobremesas à parte.`,
      [WA,MENU],{topic:'rodizio'});
  } else if (/\b(pix|debito|credito|cartao|dinheiro|ticket|pagamento|vale refeicao|parcelamento|parcela)\b/.test(n)) {
    r=result('pagamento',`Aceitamos ${knowledge.formas_pagamento.confirmados.join(', ')}. Se precisar confirmar alguma bandeira específica ou parcelamento, nossa equipe ajuda pelo WhatsApp.`,[WA]);
  } else if (/\b(endereco|onde fica|localizacao|mapa|como chegar|rota|fica onde)\b/.test(n)) {
    r=result('localizacao',`Estamos na ${knowledge.empresa.endereco}. Você pode abrir a rota pelo botão abaixo.`,[MAP]);
  } else if (/\b(horario|horas|abrem|abre|aberto|fecham|fecha|funcionamento|domingo|hoje a noite)\b/.test(n)) {
    r=result('horario','Abrimos todas as noites: domingo a quinta, das 18h30 às 23h; sexta e sábado, das 18h30 à meia-noite. Em feriados, confirme eventuais alterações com a equipe.',[WA]);
  } else if (/\b(entrega|entregam|entregar|entregas|delivery|ifood|retirada|retirar|buscar|taxa|frete|bairro|motoboy)\b/.test(n)) {
    r=result('delivery','Temos entrega e retirada! Para consultar a taxa de entrega, informe seu endereço no cardápio digital.',[MENU,WA]);
  } else if (/\b(pedir|pedido|comprar|encomendar|quero fazer meu pedido|quero encomendar)\b/.test(n)) {
    r=result('pedido','Você pode escolher os itens e finalizar seu pedido no cardápio digital. Para entrega, o valor da taxa aparece após informar seu endereço.',[MENU]);
  } else if (/\b(promocao|promocoes|promo|cupom|desconto|oferta)\b/.test(n)) {
    r=result('promocao','Para conferir os combos e os valores disponíveis, veja nosso cardápio digital pelo botão abaixo.',[MENU]);
  } else if (/\b(cardapio|menu|a la carte|ala carte|o que tem|quais pratos|ver os pratos)\b/.test(n)) {
    r=result('cardapio','Temos rodízio, sushi à la carte, entradas, temakis, combos, poke, pratos quentes e muito mais. No botão abaixo você encontra o cardápio digital.',[MENU]);
  } else if (questions.test(n) && s.last_topic) {
    const p=catalog.find((x)=>x.id===s.last_topic);
    r=p ? result('item_cardapio',itemReply(p),[MENU],{topic:p.id}) : null;
  }
  if (!r) {
    const found=lookup(n);
    if (found.length===1) {
      const p=found[0]; r=result('item_cardapio',itemReply(p),[MENU],{topic:p.id});
    } else if (found.length>1) {
      r=result('item_opcoes',`Encontrei estas opções:\n${found.map((p)=>`${p.nome} (${p.categoria}) — ${p.valor}`).join('\n')}\nQual delas você procura?`,[MENU],{topic:'itens'});
    }
  }
  if (!r) {
    const list = [
      ['combos','combos'],['combo','combo'],['temakis','temakis'],['temaki','temaki'],
      ['yakissoba','yakissoba'],['yakimeshi','yakimeshi'],['tepan','tepan'],
      ['pratos quentes','pratos quentes'],['sashimis','sashimi'],['sashimi','sashimi'],
      ['oniguiri','oniguiri'],['poke','poke'],['sobremesas','sobremesa'],
      ['sobremesa','sobremesa'],['entradas','entradas'],['bebidas','bebidas'],
      ['drinks','drink'],['joy sem arroz','joy sem arroz'],['hot roll','hot roll']
    ];
    const cat=list.find(([alias])=>words(n).includes(` ${alias} `));
    if (cat) {
      const all=group(cat[1]);
      const stop=new Set(['tem','temos','voces','vcs','qual','quais','quero','valor','quanto','preco','de','do','da','com','o','a','os','as','um','uma','e','ai','ta','esta']);
      const extra=n.split(' ').filter((t)=>t.length>2&&!stop.has(t)&&!cat[0].split(' ').includes(t)&&!cat[1].split(' ').includes(t));
      const narrowed=extra.length?all.filter((p)=>extra.every((t)=>norm(p.nome).includes(t))):[];
      const matches=narrowed.length?narrowed:all;
      const summary=matches.slice(0,5).map(compact).join('\n');
      r=matches.length?result('categoria_cardapio',
        `Estas são algumas opções de ${cat[0]}:\n${summary}${matches.length>5?'\nTemos outras opções no cardápio digital.':''}`,
        [MENU],{topic:cat[1]}):fallback('categoria_indisponivel');
    }
  }
  if (!r) {
    if (event==='instagram comment') {
      r=praise(n)?result('elogio','Que alegria ler isso! Obrigado pelo carinho. 🍣', /\b(ja fui|visitei|comi ai)\b/.test(n)?REVIEW():[]):result('comentario','Obrigado por passar aqui! Se quiser saber algo sobre o Japa, pode me mandar uma mensagem.');
    } else if (praise(n)) {
      r=result('elogio',L.google_avaliacao
        ? 'Que alegria saber que você gostou! Agradecemos o carinho. Se já nos visitou, sua avaliação sincera no Google é muito bem-vinda.'
        : 'Que alegria saber que você gostou! Agradecemos o carinho e esperamos receber você novamente.',REVIEW());
    } else if (/^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite|oie|oii)[ !.]*$/.test(n)) {
      r=result('saudacao','Oi! Seja bem-vindo(a) ao Japa Sushi Lounge. Posso ajudar com rodízio, cardápio, pedidos, horários ou reservas. 🍣');
    } else if (/^(obrigado|obrigada|obg|valeu|vlw|tchau|ate mais|show)[ !.]*$/.test(n)) {
      r=result('agradecimento','Nós que agradecemos! Quando precisar, estamos por aqui. 🍣');
    } else if (!n) {
      r=event==='story mention' ? result('story_mention','Obrigado por lembrar da gente! 🍣') : result('sem_mensagem','Oi! Me conta o que você gostaria de saber sobre o Japa.');
    } else if (/\b(proprietari|influenciador|rafa)\b/.test(n)) {
      r=result('assunto_interno','Posso ajudar com nosso cardápio, pedidos e reservas.',[MENU,WA]);
    } else {
      r=fallback('outro','Quero te ajudar direitinho, mas não tenho essa informação confirmada por aqui. Nossa equipe pode esclarecer no WhatsApp.');
    }
  }
  if (eventId) s.last_event_id=eventId;
  s.last_intent=r.intent;
  if (r.topic) s.last_topic=r.topic;
  s.last_bot_reply=r.reply.slice(0,400);
  return {...r,state:s,channel};
}

// Segurança: nunca transformar mensagem do cliente em URL, nunca soltar URL em texto.
const URL_RE=/\b(?:https?:\/\/|www\.|wa\.me\/)[^\s)]+/ig;
export function sanitizeReply(s) {
  return String(s||'').replace(URL_RE,'').replace(/\n{3,}/g,'\n\n').trim().slice(0,2000);
}
export function allowedCtas(ctas) {
  const approved=Object.values(L).filter((u)=>typeof u==='string' && /^https:\/\//.test(u));
  return (ctas||[]).filter((c)=>approved.includes(c.url) && c.type==='url')
    .slice(0,3).map((c)=>({type:'url',label:String(c.label).slice(0,20),url:c.url}));
}
const aiEligible = new Set(['saudacao','agradecimento','story_mention']);
export async function humanize(r,fetchImpl=globalThis.fetch) {
  if (!aiEligible.has(r.intent) || !process.env.OPENAI_API_KEY || !r.reply) return r;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),Number(process.env.OPENAI_TIMEOUT_MS||8000));
  try {
    const http=await fetchImpl('https://api.openai.com/v1/responses',{
      method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
      body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',store:false,
        instructions:persona,input:'Responda somente em json no formato {"reply":"texto"}. Dados: '+JSON.stringify({intent:r.intent,resposta_autorizada:r.reply}),
        text:{format:{type:'json_object'}},max_output_tokens:160})
    });
    if (!http.ok) {let m='';try{m=String((await http.json())?.error?.message||'').slice(0,160);}catch{} console.warn('OPENAI_REPLY_ERROR',http.status,m);return r;}
    const data=await http.json();
    const output=(data.output||[]).flatMap((o)=>o.content||[])
      .filter((c)=>c.type==='output_text').map((c)=>c.text).join('');
    const candidate=JSON.parse(output).reply;
    // Somente mensagens SOCIAIS, sem alegações comerciais; nunca usar novas URLs ou números.
    if (typeof candidate!=='string' || candidate.length>260 || !candidate.trim() ||
      /(?:https?:\/\/|www\.|wa\.me|\b[\w-]+\.(?:com(?:\.br)?|net(?:\.br)?|org(?:\.br)?|br|app|io|site)\b)/i.test(candidate) ||
      /(?:\d|pix|preco|valor|horario|reserva confirmada|promocao|cupom|proprietari|dono|rafa|influenciador)/i.test(norm(candidate))) return r;
    return {...r,reply:candidate.trim()};
  } catch(e) {console.warn('OPENAI_REPLY_ERROR',e.name);return r;}
  finally {clearTimeout(timeout);}
}

export function standardPayload(r) {
  const reply=sanitizeReply(r.reply),cs=allowedCtas(r.ctas);
  const parts = reply.match(/[\s\S]{1,850}/g)||[];
  const payload={ok:true,app_version:VERSION,channel:r.channel,reply,
    reply_part_1:parts[0]||'',reply_part_2:parts[1]||'',reply_part_3:parts[2]||'',
    intent:r.intent,topic:r.topic||'',needs_human:!!r.needs_human,next_action:r.next_action,
    cta_count:cs.length,ctas:cs,ai_state:encodeState(r.state),
    avaliacao_pendente:!!r.state.rating_pending,
    avaliacao_feedback_pendente:!!r.state.feedback_pending,
    avaliacao_nota:r.nota??null,
    avaliacao_feedback:r.feedback??'',
    ...Object.fromEntries([0,1,2].flatMap((i)=>[[`cta_${i+1}_type`,cs[i]?.type||''],
      [`cta_${i+1}_label`,cs[i]?.label||''],[`cta_${i+1}_url`,cs[i]?.url||'']]))};
  return payload;
}
export function dynamicPayload(r) {
  const p=standardPayload(r); const text=p.reply;
  // Dynamic Block v2: bolha com botões sempre curta. Para textos longos, usa bolhas anteriores separadas.
  const messages=[];
  const chunks=text.match(/[\s\S]{1,800}/g)||[];
  if (chunks.length===0) return {version:'v2',content:{type:r.channel,messages:[],actions:[],quick_replies:[]}};
  chunks.forEach((chunk,i)=> {
    if (i===chunks.length-1 && (chunk.length>550 || p.cta_count>0 && chunk.length>480)) {
      messages.push({type:'text',text:chunk});
      messages.push({type:'text',text:'É só tocar no botão abaixo:',buttons:p.ctas.map((c)=>({type:'url',caption:c.label,url:c.url}))});
    } else {
      const m={type:'text',text:chunk};
      if (i===chunks.length-1 && p.cta_count) m.buttons=p.ctas.map((c)=>({type:'url',caption:c.label,url:c.url}));
      messages.push(m);
    }
  });
  const actions=[{action:'set_field_value',field_name:'ai_state',value:p.ai_state}];
  if (r.nota) actions.push({action:'set_field_value',field_name:'avaliacao_nota',value:r.nota});
  if (r.feedback) actions.push({action:'set_field_value',field_name:'avaliacao_feedback',value:r.feedback.slice(0,800)});
  if (r.intent==='pedido') actions.push({action:'add_tag',tag_name:'interesse_pedido'});
  if (r.intent==='cardapio'||r.intent==='categoria_cardapio') actions.push({action:'add_tag',tag_name:'interesse_cardapio'});
  if (r.intent==='reserva') actions.push({action:'add_tag',tag_name:'interesse_reserva'});
  if (r.needs_human) actions.push({action:'add_tag',tag_name:'precisa_humano'});
  return {version:'v2',content:{type:r.channel,messages:messages.slice(0,10),actions:actions.slice(0,5),quick_replies:[]}};
}
