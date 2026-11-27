import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolve,standardPayload,dynamicPayload,allowedCtas,sanitizeReply,humanize,encodeState,BUSINESS,VERSION,safeFirstName} from '../lib/engine.js';
import * as V from '../lib/variations.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const L=BUSINESS.links;
// Semana de 09/11/2026 em UTC-3 (America/Sao_Paulo, sem horário de verão).
const AT={
  seg_10h:'2026-11-09T10:00:00-03:00', seg_22h15:'2026-11-09T22:15:00-03:00', seg_22h45:'2026-11-09T22:45:00-03:00',
  ter_12h:'2026-11-10T12:00:00-03:00',
  qua_10h:'2026-11-11T10:00:00-03:00', qua_12h:'2026-11-11T12:00:00-03:00', qua_16h:'2026-11-11T16:00:00-03:00',
  qui_22h20:'2026-11-12T22:20:00-03:00', qui_22h45:'2026-11-12T22:45:00-03:00',
  sex_19h:'2026-11-13T19:00:00-03:00', sex_22h45:'2026-11-13T22:45:00-03:00', sex_23h15:'2026-11-13T23:15:00-03:00',
  sab_12h:'2026-11-14T12:00:00-03:00', dom_20h:'2026-11-15T20:00:00-03:00'
};
const dm=(message,now=AT.qua_16h,extra={})=>resolve({message,channel:'instagram',...extra},{now});
const cm=(message,now=AT.qua_16h,extra={})=>resolve({message,event_type:'instagram_comment',channel:'instagram',...extra},{now});
const nextOf=(r,message,now=AT.qua_16h,extra={})=>resolve({message,channel:'instagram',ai_state:encodeState(r.state),...extra},{now});
const hasUrlOrPhone=(t)=>/(https?:\/\/|www\.|wa\.me|\b[\w-]+\.(com|net|org|br|app|io|site)\b)/i.test(t)||/\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/.test(t);
const EMOJI=/\p{Extended_Pictographic}/gu;
const SUPERLATIVOS=/(mais pedid|favorit|campe[aã]|queridinh|\bo melhor\b|\ba melhor\b|mais vendid|numero 1|top 1|imperd[ií]vel)/i;
const mockAI=(text)=>async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({reply:text})}]}]})});
const withKey=async(fn)=>{const prev=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='sk-teste-local';try{await fn();}finally{if(prev===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=prev;}};

// ---------------------------------------------------------------------------
// 1. Dados oficiais
// ---------------------------------------------------------------------------
test('v1.5.0: versão, WhatsApp novo, RH intacto, site e avaliação oficiais',()=>{
  assert.equal(VERSION,'1.5.0');
  assert.equal(JSON.parse(readFileSync(path.join(ROOT,'package.json'),'utf8')).version,'1.5.0');
  assert.equal(BUSINESS._meta.versao,'1.5.0');
  assert.equal(L.whatsapp,'https://wa.me/5517997086511');
  assert.equal(BUSINESS.empresa.whatsapp_exibicao,'(17) 99708-6511');
  assert.equal(L.whatsapp_rh,'https://wa.me/5517996022567');
  assert.equal(L.site,'https://www.japasushi.com.br/');
  assert.equal(L.avaliacao,'https://japasushi.netlify.app/');
  assert.deepEqual(BUSINESS.sugestoes_validadas,[]);
  assert.equal(BUSINESS.horarios.almoco_somente_delivery,true);
  assert.ok(!BUSINESS.observacoes_revisao.some((o)=>/18h30/.test(o)));
});

test('v1.5.0: o número antigo não aparece em nenhum arquivo do repositório',()=>{
  // Padrões montados em partes para este teste não conter o próprio número.
  const velho=[['99606','4189'].join('-'),['99606','4189'].join(''),['5517','99606','4189'].join(''),['99606','4189'].join(' '),['(17)',['99606','4189'].join('-')].join(' ')];
  const walk=(dir)=>readdirSync(dir).flatMap((f)=>{
    if (['.git','node_modules'].includes(f)) return [];
    const p=path.join(dir,f); return statSync(p).isDirectory()?walk(p):[p];
  });
  const achados=[];
  for (const f of walk(ROOT)) {
    if (/\.(png|jpg|jpeg|pdf|ico)$/i.test(f)) continue;
    const t=readFileSync(f,'utf8');
    for (const v of velho) if (t.includes(v)) achados.push(`${path.relative(ROOT,f)}: ${v.length} caracteres`);
  }
  assert.deepEqual(achados,[]);
});

test('v1.5.0: botões aceitam o novo WhatsApp, site e avaliação; texto livre perde URL e telefone (inclusive "17 99708 6511")',()=>{
  const ok=allowedCtas([{type:'url',label:'Falar no WhatsApp',url:L.whatsapp},{type:'url',label:'Conhecer o site',url:L.site},{type:'url',label:'Avaliar o Japa',url:L.avaliacao},{type:'url',label:'Falso',url:'https://golpe.example'}]);
  assert.deepEqual(ok.map((c)=>c.label),['Falar no WhatsApp','Conhecer o site','Avaliar o Japa']);
  for (const t of ['Chame (17) 99708-6511 agora','Chame 17 99708 6511 agora','Chame +55 17 997086511 agora','Chame 99708-6511 agora','Chame 17997086511 agora','Veja https://x.com/a e wa.me/5517997086511 e www.japasushi.com.br'])
    assert.equal(hasUrlOrPhone(sanitizeReply(t)),false,t);
  // preços, horários e CEP não podem ser apagados
  const t=sanitizeReply('Individual R$ 124,90 · Casal R$ 229,90. Jantar das 17h às 22h30. CEP 14780-270.');
  assert.match(t,/R\$ 124,90/); assert.match(t,/R\$ 229,90/); assert.match(t,/17h às 22h30/); assert.match(t,/14780-270/);
});

test('v1.5.0: horários — terça fechada, almoço somente delivery, jantar completo',()=>{
  const st=(now,msg='está aberto agora?')=>dm(msg,now).reply;
  assert.match(st(AT.ter_12h),/terça, dia de folga/);
  assert.match(st(AT.qua_10h),/almoço \(somente delivery\) às 11h, e o jantar completo abre às 17h/);                  // antes do almoço
  assert.match(st(AT.qua_12h),/almoço, somente delivery, até 15h\. O jantar completo, com salão e rodízio, abre às 17h/); // almoço
  assert.match(st(AT.qua_16h),/jantar completo abre às 17h, com salão, rodízio e delivery/);                              // entre almoço e jantar
  assert.match(st(AT.sex_22h45),/Estamos abertos! Hoje o jantar completo vai até 23h/);                                    // sexta até 23h
  assert.match(st(AT.sex_23h15),/Por hoje já encerramos/);                                                                 // encerrado
  assert.match(st(AT.seg_22h15),/Estamos abertos! Hoje o jantar completo vai até 22h30/);                                  // segunda até 22h30
  assert.match(st(AT.seg_22h45),/Por hoje já encerramos\. Amanhã é terça, nosso dia de folga\. Voltamos na quarta/);
  assert.match(st(AT.qui_22h20),/até 22h30/); assert.match(st(AT.qui_22h45),/Por hoje já encerramos/);
  assert.match(st(AT.dom_20h),/até 23h/);
  const geral=dm('qual o horário de funcionamento?').reply;
  assert.match(geral,/Almoço \(somente delivery\): das 11h às 15h/);
  assert.match(geral,/Jantar completo \(salão, rodízio e delivery\): segunda, quarta e quinta, das 17h às 22h30; sexta, sábado e domingo, das 17h às 23h/);
  assert.doesNotMatch(geral,/18h30|almoço delivery|jantar e rodízio/);
  assert.equal(dm('que horas vocês abrem hoje?',AT.sex_19h).reply.split(' Quer')[0],'Hoje a gente tem almoço, só delivery, das 11h às 15h, e jantar completo das 17h às 23h.');
});

test('v1.5.0: botão do WhatsApp novo vai nos fluxos de equipe; RH só para vaga',()=>{
  assert.ok(dm('meu pedido veio errado').ctas.some((c)=>c.url===L.whatsapp));
  const vaga=dm('quero mandar currículo');
  assert.deepEqual(vaga.ctas.map((c)=>c.url),[L.whatsapp_rh]);
  for (const m of ['quero reservar','meu pedido veio errado','qual o endereço?','quanto é o rodízio?']) assert.ok(!dm(m).ctas.some((c)=>c.url===L.whatsapp_rh),m);
});

// ---------------------------------------------------------------------------
// 2. Nenhum texto com URL ou telefone
// ---------------------------------------------------------------------------
const MENSAGENS=['oi','bom dia','quanto é o rodízio?','qual o horário?','abre hoje?','onde fica?','quero ver o cardápio','como faço pra pedir?','vocês entregam?','tem ifood?','aceita pix?',
  'quero reservar para 4 sábado às 20h','aniversário de 10 pessoas','meu pedido veio errado','quero mandar currículo','tem promoção?','tem cashback?','conheci vcs agora','fui ontem, amei','obrigado',
  'hello','hola','qual o prato mais pedido?','criança de 7 anos paga?','o que tem no rodízio?','Yakissoba Camarão','sobremesa','quero avaliar','preço médio de um jantar?','fotos do lugar?','sou alérgico a camarão',
  '','😍','[attachment]','parceria?','quem é o dono?'];
test('v1.5.0: nenhuma resposta (Direct ou comentário) contém URL, telefone ou superlativo; no máximo 1 emoji por mensagem',()=>{
  for (const m of MENSAGENS) for (const ev of ['direct','instagram_comment','story_mention','story_reply']) {
    const r=resolve({message:m,event_type:ev,channel:'instagram',first_name:'Ana'},{now:AT.sex_19h});
    const p=standardPayload(r); const d=dynamicPayload(r);
    for (const t of [p.reply,p.public_reply,...d.content.messages.map((x)=>x.text)]) {
      assert.equal(hasUrlOrPhone(t),false,`${ev}/${m}: ${t}`);
      assert.doesNotMatch(t,SUPERLATIVOS,`${ev}/${m}`);
      assert.ok((t.match(EMOJI)||[]).length<=1 || V.onlyEmoji(t),`${ev}/${m}: ${t}`);
    }
    assert.ok(d.content.messages.flatMap((x)=>x.buttons||[]).every((b)=>/^https:\/\//.test(b.url)));
    assert.ok(p.ctas.length<=3);
  }
});

// ---------------------------------------------------------------------------
// 3. Comentários públicos
// ---------------------------------------------------------------------------
test('v1.5.0: comentário público nunca contém link, número, preço ou pergunta',()=>{
  const frases=['😍😍😍','👏','Que delícia','Maravilhosa','Me leva!!','Quero','Que vontade','@fulano olha isso','Quanto custa o rodízio?','Que horas abre?','Entregam no centro?','Tem hoje?','Qual o endereço?',
    'já fui, amo','sempre peço aí','meu pedido veio errado','tem vaga?','mando currículo','tem promoção?','tem sorteio?','tem cashback?'];
  for (const f of frases) {
    const r=cm(f,AT.sex_19h,{first_name:'Edmar'});
    if (!r.public_reply) continue;
    assert.equal(hasUrlOrPhone(r.public_reply),false,f);
    assert.doesNotMatch(r.public_reply,/R\$|\d/,f);
    assert.doesNotMatch(r.public_reply,/\?/,f);
    assert.ok(r.public_reply.length<=90,f);
    assert.ok(!/Edmar/.test(r.public_reply),'comentário público não usa nome');
  }
});

test('v1.5.0: matriz de comentários — emoji, elogio, quero, pergunta, marcação, visita, reclamação, vaga, promoção',()=>{
  // só emoji / figurinha: curtida + resposta mínima, sem pergunta, sem Direct
  let r=cm('😍😍😍');
  assert.equal(r.intent,'comentario_emoji'); assert.equal(r.reply,''); assert.ok(V.onlyEmoji(r.public_reply)); assert.equal(r.like_comment,true);
  assert.equal(standardPayload(r).tem_resposta_publica,true); assert.equal(standardPayload(r).enviar_resposta_privada,false);
  // elogio curto
  for (const m of ['Que delícia','Maravilhosa']) { r=cm(m); assert.equal(r.reply,'',m); assert.ok(r.public_reply,m); assert.deepEqual(r.ctas,[],m); }
  // "quero" / "me leva": público + cardápio no Direct
  for (const m of ['Me leva!!','Quero','Que vontade']) {
    r=cm(m); assert.equal(r.intent,'comentario_quero',m); assert.match(r.public_reply,/direct/i,m);
    assert.ok(r.ctas.some((c)=>c.url===L.cardapio_pedido),m);
  }
  // pergunta: resposta completa no Direct
  r=cm('Quanto custa o rodízio?',AT.sex_19h); assert.equal(r.intent,'rodizio'); assert.match(r.reply,/R\$ 124,90/); assert.match(r.public_reply,/direct/i);
  r=cm('Vocês entregam?'); assert.equal(r.intent,'delivery'); assert.ok(r.ctas.some((c)=>c.url===L.cardapio_pedido));
  // marcação de amigo: agradece, nada no Direct
  r=cm('@fulano olha isso'); assert.equal(r.intent,'comentario_marcacao'); assert.equal(r.reply,''); assert.ok(r.public_reply);
  // visita: agradece e convida a avaliar no Direct
  r=cm('já fui, amo demais'); assert.equal(r.intent,'comentario_visita'); assert.ok(r.public_reply); assert.equal(r.ctas[0].url,L.avaliacao);
  // reclamação: resposta pública mínima + humano + botão WhatsApp, sem avaliação, sem site
  r=cm('meu pedido veio errado'); assert.equal(r.intent,'reclamacao'); assert.equal(r.needs_human,true); assert.match(r.public_reply,/direct/i);
  assert.ok(r.ctas.some((c)=>c.url===L.whatsapp)); assert.ok(r.ctas.every((c)=>![L.avaliacao,L.site].includes(c.url)));
  assert.ok(dynamicPayload(r).content.actions.some((a)=>a.tag_name==='precisa_humano'));
  // vaga: só botão do RH
  r=cm('tem vaga?'); assert.equal(r.intent,'vaga'); assert.deepEqual(r.ctas.map((c)=>c.url),[L.whatsapp_rh]); assert.match(r.public_reply,/direct/i);
  // parceria e spam: sem resposta pública
  r=cm('Podemos fazer uma parceria?'); assert.equal(r.public_reply??'',''); assert.equal(r.intent,'parceria');
  r=cm('Ganhe seguidores agora https://golpe.example'); assert.equal(r.next_action,'ignorar'); assert.equal(r.reply,''); assert.equal(r.public_reply??'','');
  // promoção/sorteio sem campanha ativa
  assert.deepEqual(BUSINESS.campanhas_ativas,[]);
  r=cm('Tem sorteio?'); assert.match(r.public_reply,/cardápio e (no )?site/i); assert.doesNotMatch(r.public_reply+r.reply,/sorteio|grátis|gratuito|brinde/i);
});

test('v1.5.0: payload de comentário expõe public_reply e o Dynamic Block leva só a resposta privada',()=>{
  const r=cm('Me leva!!');
  const p=standardPayload(r);
  assert.ok(p.public_reply); assert.equal(p.enviar_resposta_privada,true); assert.equal(p.next_action,'responder_publico_e_privado');
  const d=dynamicPayload(r);
  assert.ok(d.content.actions.some((a)=>a.field_name==='resposta_publica'&&a.value===p.public_reply));
  assert.ok(d.content.messages.every((m)=>!m.text.includes(p.public_reply)));
  const e=dynamicPayload(cm('😍'));
  assert.equal(e.content.messages.length,0); assert.ok(e.content.actions.some((a)=>a.field_name==='resposta_publica'));
});

test('v1.5.0: comentário não consome nota, feedback ou reserva pendentes do Direct',()=>{
  const pend=dm('quero avaliar');
  assert.equal(pend.state.rating_pending,true);
  const c=nextOf(pend,'Quanto custa o rodízio?',AT.sex_19h,{event_type:'instagram_comment'});
  assert.equal(c.intent,'rodizio');
  assert.equal(c.state.rating_pending,true);
});

// ---------------------------------------------------------------------------
// 4. Mídia, áudio, reação, compartilhamento, story
// ---------------------------------------------------------------------------
test('v1.5.0: anexo, foto, áudio, vídeo, arquivo: respostas neutras, sem confirmar pedido/pagamento',()=>{
  const foto=dm('',AT.qua_16h,{message_type:'image'});
  assert.equal(foto.intent,'midia'); assert.match(foto.reply,/foto|envi|Recebi|Chegou/i);
  assert.ok(foto.ctas.some((c)=>c.url===L.whatsapp));
  assert.doesNotMatch(foto.reply,/confirmad|pago|pagamento recebido|pedido (foi )?confirmado|reserva (foi )?confirmada/i);
  for (const placeholder of ['[attachment]','[anexo]','(attachment)','<attachment>','Sent an attachment','enviou um anexo']) {
    const r=dm(placeholder); assert.equal(r.intent,'midia',placeholder); assert.ok(r.ctas.some((c)=>c.url===L.whatsapp),placeholder);
  }
  assert.doesNotMatch(dm('[attachment]').reply,/foto/i);   // anexo genérico não finge que é foto
  const aud=dm('',AT.qua_16h,{message_type:'audio'});
  assert.equal(aud.intent,'audio'); assert.match(aud.reply,/(ouvir|escutar|texto)/i); assert.ok(aud.ctas.some((c)=>c.url===L.whatsapp));
  assert.equal(dm('',AT.qua_16h,{event_type:'audio'}).intent,'audio');
  assert.equal(dm('Enviou uma mensagem de voz').intent,'audio');
  for (const t of ['video','file']) assert.equal(dm('',AT.qua_16h,{message_type:t}).intent,'midia_arquivo',t);
  // texto de verdade junto da foto manda mais que o anexo
  assert.equal(dm('quanto é o rodízio?',AT.qua_16h,{message_type:'image'}).intent,'rodizio');
  // "(ok)" e "[sim]" são texto, não mídia
  assert.notEqual(dm('(ok)').intent,'midia');
});

test('v1.5.0: reação, figurinha, GIF, like, story indisponível e emoji em story não recebem resposta',()=>{
  for (const extra of [{message_type:'reaction'},{message_type:'sticker'},{message_type:'gif'},{message_type:'like'}]) {
    const r=dm('',AT.qua_16h,extra); assert.equal(r.next_action,'ignorar',JSON.stringify(extra)); assert.equal(r.reply,'');
    assert.equal(dynamicPayload(r).content.messages.length,0);
  }
  assert.equal(dm('Reagiu com ❤️ à sua mensagem').next_action,'ignorar');
  assert.equal(dm('Este story não está mais disponível').next_action,'ignorar');
  assert.equal(dm('❤️',AT.qua_16h,{event_type:'story_reply'}).next_action,'ignorar');
  assert.equal(dm('🔥',AT.qua_16h,{event_type:'story_reply'}).reply,'');
  // reação ignorada não apaga a memória da conversa
  const a=dm('quanto é o rodízio?'); const ig=nextOf(a,'',AT.qua_16h,{message_type:'reaction'});
  assert.equal(ig.state.last_intent,'rodizio');
  // resposta a story com texto vira conversa normal
  assert.equal(dm('qual o horário?',AT.qua_16h,{event_type:'story_reply'}).intent,'horario');
});

test('v1.5.0: compartilhamento de post/story agradece e oferece cardápio sem fingir que viu o conteúdo',()=>{
  for (const m of ['Compartilhou seu story','Shared a post with you','Enviou um reel']) {
    const r=dm(m); assert.equal(r.intent,'compartilhamento',m);
    assert.ok(r.ctas.some((c)=>c.url===L.cardapio_pedido),m);
    assert.doesNotMatch(r.reply,/linda|lindo|adorei|amei|ficou/i,m);
  }
  assert.equal(dm('',AT.qua_16h,{message_type:'share'}).intent,'compartilhamento');
});

test('v1.5.0: menção em story — 1 resposta automática por pessoa a cada 24h, sem descrever a imagem e sem pedir avaliação',()=>{
  const t0=AT.qua_16h;
  const m1=resolve({message:'',event_type:'story_mention',first_name:'Pablo',channel:'instagram'},{now:t0});
  assert.equal(m1.intent,'story_mention');
  assert.doesNotMatch(m1.reply,/foto|imagem|linda|avalia|Google|nota/i);
  assert.match(m1.reply,/repost|compartilh/i);
  assert.deepEqual(m1.ctas,[]);
  // várias menções no mesmo dia: ignora
  let prev=m1;
  for (const hora of ['2026-11-11T17:00:00-03:00','2026-11-11T20:00:00-03:00','2026-11-12T10:00:00-03:00']) {
    const r=resolve({message:'',event_type:'story_mention',first_name:'Pablo',channel:'instagram',ai_state:encodeState(prev.state)},{now:hora});
    assert.equal(r.next_action,'ignorar',hora); assert.equal(r.reply,'',hora); prev=r;
  }
  assert.equal(prev.state.last_intent,'story_mention'); // o "pode repostar?" continua valendo
  assert.equal(nextOf(prev,'Pode sim','2026-11-12T11:00:00-03:00',{first_name:'Pablo'}).intent,'story_repost_ok');
  // 24h depois: agradece, mas não pede autorização de novo
  const dia2=resolve({message:'',event_type:'story_mention',first_name:'Pablo',channel:'instagram',ai_state:encodeState(prev.state)},{now:'2026-11-12T17:30:00-03:00'});
  assert.equal(dia2.intent,'story_mention_obrigado');
  assert.doesNotMatch(dia2.reply,/repost|autoriza/i);
  assert.ok(dynamicPayload(m1).content.actions.some((a)=>a.field_name==='ai_state'));
  assert.ok(dynamicPayload(resolve({message:'',event_type:'story_mention',channel:'instagram',ai_state:encodeState(m1.state)},{now:'2026-11-11T18:00:00-03:00'})).content.actions.some((a)=>a.field_name==='ai_state'),'mesmo ignorada, a memória é gravada');
});

test('v1.5.0: resposta a anúncio usa a pergunta literal; mensagem vazia não inventa promoção',()=>{
  assert.equal(dm('quanto é o rodízio?',AT.qua_16h,{event_type:'replied to an ad'}).intent,'rodizio');
  const vazio=dm('',AT.qua_16h,{event_type:'replied to an ad'});
  assert.equal(vazio.intent,'sem_mensagem');
  assert.doesNotMatch(vazio.reply,/promo|desconto|oferta|gr[aá]tis/i);
});

// ---------------------------------------------------------------------------
// 5. Avaliação
// ---------------------------------------------------------------------------
test('v1.5.0: avaliação só com experiência real e no máximo 1 convite a cada 30 dias',()=>{
  const semExp=['amei','que delícia','parabéns','top','só passei pra elogiar','quanto é o rodízio?','qual o horário?','oi','quero ver o cardápio'];
  for (const m of semExp) for (const ev of ['direct','story_mention','story_reply','instagram_comment']) {
    const r=resolve({message:m,event_type:ev,channel:'instagram'},{now:AT.qua_16h});
    assert.ok(!r.ctas.some((c)=>c.url===L.avaliacao),`${ev}/${m}`);
  }
  assert.ok(!dm('',AT.qua_16h,{event_type:'story_mention'}).ctas.some((c)=>c.url===L.avaliacao));
  const exp=['já fui aí','comi aí ontem','pedi ontem, chegou ótimo','jantei aí sábado','amei o rodízio','sempre peço aí'];
  for (const m of exp) { const r=dm(m); assert.ok(r.ctas.some((c)=>c.url===L.avaliacao&&c.label==='Avaliar o Japa'),m); assert.doesNotMatch(r.reply,/Google|cinco estrelas|5 estrelas|nota máxima/i,m); }
  // pedido de preço junto da experiência não vira convite
  assert.equal(dm('fui aí ontem, quanto é o rodízio?').intent,'rodizio');
  // 30 dias
  const a=dm('já fui aí',AT.qua_16h);
  assert.ok(a.ctas.some((c)=>c.url===L.avaliacao));
  const b=nextOf(a,'amei o rodízio',AT.sex_19h);
  assert.equal(b.intent,'elogio'); assert.ok(!b.ctas.some((c)=>c.url===L.avaliacao));
  const c=nextOf(a,'amei o rodízio','2026-12-20T19:00:00-03:00');
  assert.ok(c.ctas.some((x)=>x.url===L.avaliacao));
  // comentário público também respeita
  assert.ok(!nextOf(a,'já fui, amo',AT.sex_19h,{event_type:'instagram_comment'}).ctas.some((x)=>x.url===L.avaliacao));
});

test('v1.5.0: fluxo de nota — 4 e 5 convidam (imparcial), 1 a 3 vão para feedback + equipe; nunca pede 5 estrelas',()=>{
  const start=dm('',AT.qua_16h,{event_type:'pedido_confirmado'});
  for (const n of ['4','5']) {
    const r=nextOf(start,n); assert.ok(r.ctas.some((c)=>c.url===L.avaliacao),n);
    assert.doesNotMatch(r.reply,/Google|cinco estrelas|5 estrelas|nota máxima|dê 5/i,n);
  }
  for (const n of ['1','2','3']) {
    const r=nextOf(start,n); assert.equal(r.state.feedback_pending,true,n);
    assert.ok(!r.ctas.some((c)=>c.url===L.avaliacao),n);
    const f=nextOf(r,'a comida atrasou'); assert.equal(f.needs_human,true); assert.ok(f.ctas.some((c)=>c.url===L.whatsapp)); assert.ok(!f.ctas.some((c)=>c.url===L.avaliacao));
  }
  // reclamação não recebe avaliação
  const rec=dm('o pedido atrasou e veio frio'); assert.equal(rec.intent,'reclamacao'); assert.ok(!rec.ctas.some((c)=>[L.avaliacao,L.site].includes(c.url)));
});

// ---------------------------------------------------------------------------
// 6. Site
// ---------------------------------------------------------------------------
test('v1.5.0: site só nos casos permitidos e uma vez por conversa',()=>{
  const comSite=(r)=>r.ctas.some((c)=>c.url===L.site);
  // casos permitidos
  for (const m of ['Qual é o cardápio?','como faço pra pedir?','onde fica?','qual o horário?','tem desconto?','tem programa de fidelidade?','tem cashback?','conheci vcs agora','queria conhecer a casa'])
    assert.equal(comSite(dm(m)),true,m);
  // casos proibidos
  for (const m of ['meu pedido veio errado','quero mandar currículo','quanto é o rodízio?','aceita pix?','oi','obrigado','fui ontem, amei','quero reservar'])
    assert.equal(comSite(dm(m)),false,m);
  for (const m of ['Que delícia','😍','@fulano olha','Quanto custa o rodízio?','tem vaga?','meu pedido veio errado','Ganhe seguidores https://x.com'])
    assert.equal(comSite(cm(m)),false,m);
  // uma vez por conversa
  const a=dm('Qual é o cardápio?'); assert.equal(comSite(a),true);
  const b=nextOf(a,'onde fica?'); assert.equal(comSite(b),false); assert.equal(b.state.site_sent,true);
  assert.equal(comSite(nextOf(b,'como faço pra pedir?')),false);
  // o botão de pedido continua sendo o SAIPOS e o site complementa
  assert.ok(a.ctas.some((c)=>c.url===L.cardapio_pedido));
  assert.ok(a.ctas.length<=3);
  // fidelidade não promete valor, brinde ou gratuidade
  const f=dm('tem cashback?'); assert.doesNotMatch(f.reply,/R\$|\d|gr[aá]tis|gratuit|brinde|ganh/i);
  // cliente novo
  assert.equal(dm('conheci vcs agora').intent,'cliente_novo');
});

// ---------------------------------------------------------------------------
// 7. Humanização: variações, nome, emoji, idioma, mesmo texto para perguntas diferentes
// ---------------------------------------------------------------------------
test('v1.5.0: "como faço para pedir?" e "qual é o cardápio?" recebem respostas diferentes e corretas',()=>{
  const como=dm('Como faço para pedir?',AT.qua_16h,{first_name:'Denise'}), card=dm('Qual é o cardápio?',AT.qua_16h,{first_name:'Marina'});
  assert.equal(como.intent,'como_pedir'); assert.equal(card.intent,'cardapio');
  assert.notEqual(como.reply,card.reply);
  assert.match(como.reply,/botão/); assert.match(como.reply,/endereço/); assert.match(como.reply,/taxa/i); assert.match(como.reply,/entrega|retirada/); assert.match(como.reply,/iFood/); assert.match(como.reply,/99Food/); assert.match(como.reply,/WhatsApp/);
  assert.ok(como.ctas.some((c)=>c.url===L.cardapio_pedido)); assert.ok(como.ctas.some((c)=>c.url===L.whatsapp));
  assert.match(card.reply,/cardápio/i);
  for (const r of [como,card]) assert.doesNotMatch(r.reply,/Joy Goiabada|mais pedida|sobremesa/i);
});

test('v1.5.0: cada situação social tem pelo menos 8 variações, sem link, telefone ou superlativo',()=>{
  const banks=Object.entries(V).filter(([k,v])=>Array.isArray(v)&&k===k.toUpperCase()&&k!=='FOREIGN');
  assert.ok(banks.length>=20);
  const c={n:', Ana',nm:'Ana',sg:'Boa noite'};
  for (const [name,bank] of banks) {
    assert.ok(bank.length>=8,`${name} tem ${bank.length}`);
    const textos=bank.map((v)=>{const t=typeof v==='object'&&v.t!==undefined?v.t:v;return typeof t==='function'?t(c):t;});
    assert.equal(new Set(textos).size,textos.length,`${name} tem variações repetidas`);
    for (const t of textos) {
      assert.equal(hasUrlOrPhone(t),false,`${name}: ${t}`);
      assert.doesNotMatch(t,SUPERLATIVOS,`${name}: ${t}`);
      assert.ok((t.match(EMOJI)||[]).length<=2,`${name}: ${t}`);
    }
  }
});

test('v1.5.0: variações nunca repetem a resposta anterior (Direct e comentário público)',()=>{
  const seq=(msg,extra={},n=14)=>{
    const out=[]; let r=dm(msg,AT.qua_16h,extra);
    out.push(r);
    for (let i=1;i<n;i++) { r=nextOf(r,msg,AT.qua_16h,extra); out.push(r); }
    return out;
  };
  for (const m of ['oi','obrigado','Qual é o cardápio?','como faço pra pedir?','meu pedido veio errado','amei o rodízio, já fui aí']) {
    const rs=seq(m);
    for (let i=1;i<rs.length;i++) assert.notEqual(rs[i].reply.slice(0,40),rs[i-1].reply.slice(0,40),`${m} #${i}`);
  }
  for (const m of ['😍😍😍','Que delícia','Me leva!!','@fulano olha','quero']) {
    let r=cm(m); const out=[r];
    for (let i=1;i<14;i++) { r=nextOf(r,m,AT.qua_16h,{event_type:'instagram_comment'}); out.push(r); }
    for (let i=1;i<out.length;i++) assert.notEqual(out[i].public_reply,out[i-1].public_reply,`${m} #${i}`);
    assert.ok(new Set(out.map((x)=>x.public_reply)).size>=4,`${m}: pouca variedade`);
  }
});

test('v1.5.0: nome em no máximo 1 a cada 2 respostas e emoji em cerca de 1 a cada 3',()=>{
  const msgs=['oi','obrigado','valeu','oi','obrigado','tchau','oi','obrigado','valeu','amei','oi','obrigado'];
  let r=null; const out=[];
  for (const m of msgs) { r=r?nextOf(r,m,AT.qua_16h,{first_name:'Ana'}):dm(m,AT.qua_16h,{first_name:'Ana'}); out.push(r.reply); }
  for (let i=1;i<out.length;i++) assert.ok(!(out[i].includes('Ana')&&out[i-1].includes('Ana')),`nome seguido: ${out[i-1]} | ${out[i]}`);
  const emo=out.map((t)=>(t.match(EMOJI)||[]).length);
  assert.ok(emo.every((n)=>n<=1));
  for (let i=1;i<emo.length;i++) assert.ok(!(emo[i]&&emo[i-1]),`emoji em respostas seguidas #${i}`);
  assert.ok(emo.filter(Boolean).length<=Math.ceil(out.length/3));
});

test('v1.5.0: saudação por horário de Brasília só na primeira mensagem',()=>{
  assert.match(dm('oi','2026-11-11T09:00:00-03:00').reply,/Bom dia/);
  assert.match(dm('oi','2026-11-11T15:00:00-03:00').reply,/Boa tarde/);
  assert.match(dm('oi','2026-11-11T20:00:00-03:00').reply,/Boa noite/);
  const a=dm('oi','2026-11-11T20:00:00-03:00');
  const b=nextOf(a,'oi','2026-11-11T20:01:00-03:00');
  assert.doesNotMatch(b.reply,/Bom dia|Boa tarde|Boa noite/);
});

test('v1.5.0: responde no idioma da pessoa (inglês e espanhol) e espelha o informal',()=>{
  assert.match(dm('hello').reply,/Hi|Hello|Hey/);
  assert.match(dm('hola').reply,/Hola|Buenas|Hola/i);
  assert.match(dm('thanks').reply,/welcome|Anytime|pleasure|Thank/i);
  assert.match(dm('menu please').reply,/menu/i);
  assert.ok(dm('menu please').ctas.some((c)=>c.url===L.cardapio_pedido));
  assert.ok(dm('how much is the buffet?').ctas.some((c)=>c.url===L.whatsapp));
  assert.equal(dm('hola, ¿cuánto cuesta?').needs_human,true);
  // português não vira inglês por engano
  for (const m of ['tem delivery?','qual o menu?','show','top']) assert.equal(V.detectLang(m),'pt',m);
  // informal: vcs, mano
  assert.equal(dm('oi vcs abrem hj?').intent,'horario');
});

test('v1.5.0: sem sobremesa mais pedida: sugestões só vêm de sugestoes_validadas, vazia por padrão',()=>{
  for (const m of ['qual o prato mais pedido?','qual a sobremesa mais pedida?','o que vocês recomendam?','qual o favorito da casa?','qual o melhor prato?']) {
    const r=dm(m); assert.equal(r.intent,'sugestao',m);
    assert.doesNotMatch(r.reply,SUPERLATIVOS,m); assert.doesNotMatch(r.reply,/Joy Goiabada|sobremesa/i,m);
    assert.ok(r.ctas.some((c)=>c.url===L.cardapio_pedido),m);
  }
  assert.doesNotMatch(dm('Qual é o cardápio?').reply,/mais pedid|sobremesa/i);
  const prev=BUSINESS.sugestoes_validadas;
  BUSINESS.sugestoes_validadas=['Combo Casal'];
  try { assert.match(dm('o que vocês recomendam?').reply,/Combo Casal/); } finally { BUSINESS.sugestoes_validadas=prev; }
});

test('v1.5.0: não repete a oferta de reserva a cada resposta e nem termina toda resposta com pergunta',()=>{
  const a=dm('qual o horário de hoje?',AT.qua_16h); const b=nextOf(a,'quanto é o rodízio?',AT.qua_16h);
  assert.equal(a.state.offer,'reserva'); assert.doesNotMatch(b.reply,/reservar/i);
  assert.doesNotMatch(dm('quero ver o cardápio').reply,/\?$/);
  assert.doesNotMatch(dm('obrigado').reply,/\?$/);
  const rodizio=dm('Qual o valor do rodízio?',AT.sex_19h).reply;
  assert.ok(rodizio.length<=160); assert.doesNotMatch(rodizio,/\d{1,2}h/); // curto e sem repetir horários
});

// ---------------------------------------------------------------------------
// 8. Atendimento humano
// ---------------------------------------------------------------------------
test('v1.5.0: resposta humana pausa o bot (atendimento_humano) por 24h ou até o campo ser limpo, em qualquer canal',()=>{
  for (const channel of ['whatsapp','instagram']) {
    const r=resolve({message:'oi',channel,atendimento_humano:true},{now:AT.qua_16h});
    assert.equal(r.next_action,'silencio_humano',channel); assert.equal(r.reply,'');
    assert.equal(dynamicPayload(r).content.messages.length,0);
  }
  assert.equal(resolve({message:'oi',channel:'instagram',atendimento_humano:'sim'},{now:AT.qua_16h}).next_action,'silencio_humano');
  // 24h depois do início da pausa, o bot volta
  const desde='2026-11-10T20:00:00-03:00';
  assert.equal(resolve({message:'oi',channel:'instagram',atendimento_humano:true,atendimento_humano_desde:desde},{now:'2026-11-11T10:00:00-03:00'}).next_action,'silencio_humano');
  assert.notEqual(resolve({message:'oi',channel:'instagram',atendimento_humano:true,atendimento_humano_desde:desde},{now:'2026-11-11T21:00:00-03:00'}).next_action,'silencio_humano');
  // campo limpo: responde
  assert.notEqual(resolve({message:'oi',channel:'instagram',atendimento_humano:false},{now:AT.qua_16h}).next_action,'silencio_humano');
});

// ---------------------------------------------------------------------------
// 9. OpenAI e fallback determinístico
// ---------------------------------------------------------------------------
test('v1.5.0: IA reescreve só texto social; preço, horário, reserva e pagamento nunca vão à IA',async()=>{
  await withKey(async()=>{
    let calls=0; const spy=async()=>{calls++;return mockAI('x')();};
    for (const m of ['quanto é o rodízio?','qual o horário?','quero reservar','aceita pix?','tem promoção?','meu pedido veio errado','quero mandar currículo','onde fica?'])
      await humanize(dm(m),spy);
    assert.equal(calls,0);
    for (const m of ['oi','obrigado','como faço pra pedir?']) await humanize(dm(m),spy);
    assert.equal(calls,3);
  });
});

test('v1.5.0: se a IA falhar ou reprovar, o texto determinístico responde (nunca fica mudo)',async()=>{
  await withKey(async()=>{
    const base=dm('oi',AT.qua_16h,{first_name:'Ana'});
    const falha=async()=>({ok:false,status:500,json:async()=>({error:{message:'x'}})});
    const cai=async()=>{throw new Error('rede');};
    assert.equal((await humanize(base,falha)).reply,base.reply);
    assert.equal((await humanize(base,cai)).reply,base.reply);
    const ruins={
      url:'Veja https://golpe.example',site:'Acesse golpe.com agora',numero:'Chame no 17 99708 6511',preco:'O preço do rodízio está ótimo hoje',gratis:'Hoje o rodízio é grátis pra você',horario:'Abrimos às 17h',
      promo:'Hoje tem promoção',superlativo:'Aqui é o melhor sushi, o mais pedido de Barretos',estrelas:'Deixa 5 estrelas pra gente',longo:'Oi! '.repeat(80),vazio:'   ',
      emojis:'Oi 🍣🍣 que bom ter você 😍'
    };
    for (const [k,t] of Object.entries(ruins)) assert.equal((await humanize(base,mockAI(t))).reply,base.reply,k);
    assert.equal((await humanize(base,async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'isso não é json'}]}]})}))).reply,base.reply);
    // aceita texto social limpo
    assert.equal((await humanize(base,mockAI('Oi! Que bom ter você aqui, em que posso ajudar?'))).reply,'Oi! Que bom ter você aqui, em que posso ajudar?');
  });
});

test('v1.5.0: IA em comentário público — uma frase, sem pergunta, sem link/número/site; senão cai no determinístico',async()=>{
  await withKey(async()=>{
    const base=cm('@fulano olha isso',AT.qua_16h);
    assert.equal(base.intent,'comentario_marcacao');
    const ok=await humanize(base,mockAI('Valeu pela marcação, chama a turma e vem!'));
    assert.equal(ok.public_reply,'Valeu pela marcação, chama a turma e vem!');
    for (const t of ['Valeu pela marcação! Vem com a turma?','Valeu! Vem. Chama a turma.','Veja nosso site e o WhatsApp','Valeu, o rodízio hoje é de graça','Valeu, o valor hoje é ótimo','Valeu pela marcação, chama a turma e vem que a gente recebe todo mundo com muito carinho e alegria aqui!'])
      assert.equal((await humanize(base,mockAI(t))).public_reply,base.public_reply,t);
    // emoji-only e "te respondi no direct" nunca passam pela IA
    let calls=0; const spy=async()=>{calls++;return mockAI('x')();};
    await humanize(cm('😍😍'),spy); await humanize(cm('Quanto custa?'),spy);
    assert.equal(calls,0);
    // "me leva" precisa continuar avisando que chamou no direct
    const q=cm('Me leva!!');
    assert.equal((await humanize(q,mockAI('Que vontade boa!'))).public_reply,q.public_reply);
    assert.equal((await humanize(q,mockAI('Que vontade boa, te chamei no direct!'))).public_reply,'Que vontade boa, te chamei no direct!');
  });
});

test('v1.5.0: IA rejeita resposta igual à anterior e perda de conteúdo em "como pedir"',async()=>{
  await withKey(async()=>{
    const a=dm('obrigado',AT.qua_16h); const b=nextOf(a,'obrigado',AT.qua_16h);
    assert.equal((await humanize(b,mockAI(a.reply))).reply,b.reply);          // repetiu a anterior
    const c=dm('como faço pra pedir?',AT.qua_16h);
    assert.equal((await humanize(c,mockAI('É só chamar a gente que a gente resolve'))).reply,c.reply); // perdeu botão/endereço/iFood/WhatsApp
    const bom='Toque no botão abaixo, escolha seus itens, informe o endereço e veja a taxa antes de finalizar. Também estamos no iFood e na 99Food, e o WhatsApp ajuda se travar.';
    assert.equal((await humanize(c,mockAI(bom))).reply,bom);
  });
});

test('v1.5.0: a IA recebe só contexto seguro (primeiro nome, canal, idioma, saudação, última resposta)',async()=>{
  await withKey(async()=>{
    let body;
    const spy=async(_u,o)=>{body=JSON.parse(o.body);return mockAI('Oi! Como posso ajudar?')();};
    const r=resolve({message:'oi',channel:'instagram',first_name:'Ana Souza',subscriber_id:'123456789',contact:undefined},{now:AT.qua_16h});
    await humanize(r,spy);
    assert.equal(body.store,false); assert.match(body.input,/json/);
    const dados=JSON.parse(body.input.split('Dados: ')[1]);
    assert.deepEqual(Object.keys(dados).sort(),['canal','idioma','intent','nome_seguro','resposta_autorizada','saudacao_horario','ultima_resposta_do_bot'].sort());
    assert.equal(dados.nome_seguro,'Ana'); assert.equal(dados.canal,'direct_privado'); assert.equal(dados.idioma,'pt'); assert.equal(dados.saudacao_horario,'Boa tarde');
    assert.ok(!JSON.stringify(dados).includes('Souza')&&!JSON.stringify(dados).includes('123456789'));
    assert.match(body.instructions,/não repita|NÃO repita/i); assert.match(body.instructions,/NÃO descreva/); assert.match(body.instructions,/UMA frase/);
  });
});

test('v1.5.0: webhook segue exigindo segredo e responde com os campos novos',async()=>{
  const {default:handler}=await import('../api/manychat.js');
  const call=(body,headers={})=>new Promise((ok)=>{const res={statusCode:200,status(c){this.statusCode=c;return this;},setHeader(){return this;},json(o){this.body=o;ok(this);return this;}};handler({method:'POST',body,headers,query:{}},res);});
  const S='SEGREDO_TESTE_LOCAL_12345678901234567890';
  const prev=process.env.WEBHOOK_SECRET; process.env.WEBHOOK_SECRET=S;
  try {
    assert.equal((await call({message:'oi'})).statusCode,401);
    const r=await call({message:'Me leva!!',event_type:'instagram_comment',channel:'instagram'},{'x-webhook-secret':S});
    assert.equal(r.statusCode,200); assert.equal(r.body.app_version,'1.5.0'); assert.ok(r.body.public_reply); assert.equal(r.body.enviar_resposta_privada,true);
    assert.equal(hasUrlOrPhone(r.body.reply),false); assert.equal(r.body.cta_1_url,L.cardapio_pedido);
    const e=await call({message:'',message_type:'audio',channel:'instagram'},{'x-webhook-secret':S});
    assert.equal(e.body.intent,'audio'); assert.equal(e.body.cta_1_url,L.whatsapp);
  } finally { if(prev===undefined) delete process.env.WEBHOOK_SECRET; else process.env.WEBHOOK_SECRET=prev; }
});
