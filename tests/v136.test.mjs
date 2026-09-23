import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,encodeState,normalizeInput,standardPayload,humanize} from '../lib/engine.js';

const I=(message,extra={})=>resolve({channel:'instagram',message,...extra});

test('v1.3.6: erros de digitação de rodízio (rodisio, rodzio, rudizio) entram no rodízio',()=>{
  for (const m of ['qual o valor do rodisio','rodzio quanto','quanto ta o rudizio','valor rodiziu'])
    assert.equal(I(m).intent,'rodizio',m);
  assert.equal(I('oq tem no rodisio').intent,'rodizio_composicao');
});

test('v1.3.6: saudação com complemento ("oi tudo bem", "boa noite, tudo bem?") não cai no WhatsApp',()=>{
  for (const m of ['oi tudo bem','boa noite, tudo bem?','oii boa noite','ola, tudo bom?','oi pessoal'])
    assert.equal(I(m).intent,'saudacao',m);
});

test('v1.3.6: "99" sozinho identifica 99Food sem criar botão falso',()=>{
  const r=I('vcs tao no 99');
  assert.equal(r.intent,'delivery');
  assert.match(r.reply,/99Food/);
  assert.ok(!r.ctas.some((c)=>/99/.test(c.label)));
});

test('v1.3.6: Hot Roll Philadelphia 10 unid. (grafado Philadelfia no cadastro) é encontrado e o tamanho desempata',()=>{
  const both=I('quanto custa o hot roll philadelphia');
  assert.equal(both.intent,'item_opcoes');
  assert.match(both.reply,/5 unid/); assert.match(both.reply,/10 unid/);
  const ten=I('hot roll philadelfia 10');
  assert.equal(ten.intent,'item_cardapio');
  assert.match(ten.reply,/10 unid\. — R\$ 34,99/);
});

test('v1.3.6: categoria "hot roll" não lista Joys; "mega hot roll" só Mega Hot Roll',()=>{
  const hot=I('tem hot roll');
  assert.ok(!/Joy/.test(hot.reply));
  const mega=I('qual o valor do mega hot roll');
  assert.ok(mega.reply.split('\n').slice(1).filter((l)=>l.includes('R$')).every((l)=>/^Mega Hot Roll/.test(l)));
});

test('v1.3.6: almoço não é anunciado — casa funciona só à noite',()=>{
  const r=I('tem rodízio no almoço?');
  assert.equal(r.intent,'horario');
  assert.match(r.reply,/somente à noite/);
});

test('v1.3.6: VR/Alelo respondem com formas confirmadas e WhatsApp, sem afirmar aceite',()=>{
  const r=I('aceita alelo?');
  assert.equal(r.intent,'pagamento');
  assert.ok(!/Alelo/.test(r.reply));
});

test('v1.3.6: custom_fields em lista (formato API do ManyChat) recupera ai_state',()=>{
  const st=encodeState({last_topic:'rodizio',last_intent:'rodizio'});
  const n=normalizeInput({contact:{id:1,ig_username:'maria.souza92',last_input_text:'oque vem nele',custom_fields:[{id:9,name:'ai_state',type:'text',value:st}]}});
  assert.equal(n.ai_state,st);
  const r=resolve({contact:{id:1,ig_username:'maria.souza92',last_input_text:'quais itens',custom_fields:[{name:'ai_state',value:st}]}});
  assert.equal(r.intent,'rodizio_composicao');
  assert.match(r.reply,/^Maria, no rodízio/);
});

test('v1.3.6: pesquisa não duplica enquanto pendente nem para o mesmo pedido',()=>{
  const a=resolve({event_type:'pedido_confirmado',message:'',event_id:'e1',order_id:'P77'});
  assert.equal(a.intent,'avaliacao_solicitar_nota');
  const b=resolve({event_type:'pedido_confirmado',message:'',event_id:'e2',order_id:'P78',ai_state:encodeState(a.state)});
  assert.equal(b.intent,'pesquisa_duplicada'); assert.equal(b.reply,'');
  const nota=resolve({message:'5',ai_state:encodeState(a.state)});
  assert.equal(nota.intent,'avaliacao_nota');
  const again=resolve({event_type:'pedido_confirmado',message:'',event_id:'e3',order_id:'P77',ai_state:encodeState(nota.state)});
  assert.equal(again.intent,'pesquisa_duplicada');
  const novo=resolve({event_type:'pedido_confirmado',message:'',event_id:'e4',order_id:'P80',ai_state:encodeState(nota.state)});
  assert.equal(novo.intent,'avaliacao_solicitar_nota');
});

test('v1.3.6: citar "avaliação" numa frase não abre pesquisa sem pedido confirmado',()=>{
  assert.notEqual(I('adorei a avaliação de vcs no google').intent,'avaliacao_solicitar_nota');
  assert.equal(I('quero avaliar').intent,'avaliacao_solicitar_nota');
});

test('v1.3.6: menção em Story com texto agradece, nunca "não tenho essa informação"',()=>{
  const r=I('que lindo',{event_type:'story_mention'});
  assert.equal(r.intent,'story_mention');
  assert.equal(r.ctas.length,0);
});

test('v1.3.6: comentário público recebe texto neutro; preço e botões só no Direct',()=>{
  const q=standardPayload(I('quanto custa o rodizio?',{event_type:'instagram_comment'}));
  assert.equal(q.public_reply,'Te respondemos no Direct! 📩');
  assert.ok(!/\d/.test(q.public_reply));
  const c=standardPayload(I('pedido veio frio, que decepção',{event_type:'instagram_comment'}));
  assert.equal(c.intent,'reclamacao');
  assert.ok(!/obrigad/i.test(c.public_reply));
  assert.equal(standardPayload(I('quanto custa o rodizio?')).public_reply,'');
});

test('v1.3.6: timeout da OpenAI limitado a 6 s mesmo com variável maior',async()=>{
  const prev={k:process.env.OPENAI_API_KEY,t:process.env.OPENAI_TIMEOUT_MS};
  process.env.OPENAI_API_KEY='test'; process.env.OPENAI_TIMEOUT_MS='60000';
  let aborted=false; const t0=Date.now();
  const origSet=globalThis.setTimeout; let ms=null;
  globalThis.setTimeout=(fn,d)=>{ms=d;return origSet(fn,0);};
  try {
    const r=await humanize({intent:'saudacao',reply:'Oi!'},(url,opt)=>new Promise((_,rej)=>opt.signal.addEventListener('abort',()=>{aborted=true;rej(Object.assign(new Error('x'),{name:'AbortError'}));})));
    assert.equal(r.reply,'Oi!'); assert.equal(ms,6000); assert.ok(aborted);
  } finally {
    globalThis.setTimeout=origSet;
    process.env.OPENAI_API_KEY=prev.k??''; if(!prev.k) delete process.env.OPENAI_API_KEY;
    if (prev.t===undefined) delete process.env.OPENAI_TIMEOUT_MS; else process.env.OPENAI_TIMEOUT_MS=prev.t;
  }
});
