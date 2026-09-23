import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/manychat.js';

function call(method,body={},headers={},query={}) {
  const req={method,body,headers,query};
  const res={statusCode:200,headers:{},status(code){this.statusCode=code;return this;},
    setHeader(k,v){this.headers[k]=v;return this;},json(obj){this.body=obj;return this;}};
  return handler(req,res).then(()=>res);
}
const SECRET='SEGREDO_TESTE_LOCAL_12345678901234567890';

test('GET health check não mostra segredos',async()=>{
  const r=await call('GET');
  assert.equal(r.statusCode,200);assert.equal(r.body.ok,true);
  assert.equal(r.body.business,'Japa Sushi Lounge');
  assert.equal(r.body.catalogo_ativo,178);
  assert.equal(r.body.rodizio_grupos_configurados,3);
  assert.equal(r.body.app_version,'1.3.2');
  assert.equal(r.body.ifood_confirmed,true);
  assert.equal(r.body.food99_confirmed,true);
  assert.equal(r.body.ifood_button_configured,false);
  assert.equal(r.body.food99_button_configured,false);
  assert.equal(JSON.stringify(r.body).includes(SECRET),false);
});

test('POST exige token longo igual e falha fechado',async()=>{
  delete process.env.WEBHOOK_SECRET;
  assert.equal((await call('POST',{message:'oi'})).statusCode,401);
  process.env.WEBHOOK_SECRET=SECRET;
  assert.equal((await call('POST',{message:'oi'},{'x-webhook-secret':'errado'})).statusCode,401);
  assert.equal((await call('POST',{message:'oi'},{'x-webhook-secret':'SEGREDO_TESTE_LOCAL_12345678901234567891'})).statusCode,401);
});

test('requisição padrão retorna contato, sem URL no texto',async()=>{
  process.env.WEBHOOK_SECRET=SECRET;
  const r=await call('POST',{message:'Quanto custa o Combo Casal?',channel:'instagram'},
    {'x-webhook-secret':SECRET});
  assert.equal(r.statusCode,200);
  assert.equal(r.body.intent,'item_cardapio');
  assert.match(r.body.reply,/R\$ 169,99/);
  assert.equal(r.body.cta_1_type,'url');
  assert.doesNotMatch(r.body.reply,/https?:\/\//);
});

test('requisição Dynamic Block responde no protocolo ManyChat v2 com botões',async()=>{
  process.env.WEBHOOK_SECRET=SECRET;
  const r=await call('POST',{message:'currículo',channel:'instagram',response_mode:'dynamic'},
    {'x-webhook-secret':SECRET});
  assert.equal(r.statusCode,200);
  assert.equal(r.body.version,'v2');
  assert.equal(r.body.content.type,'instagram');
  assert.equal(r.body.content.messages[0].buttons[0].caption,'Enviar currículo');
  assert.equal(r.body.content.messages[0].buttons[0].url,'https://wa.me/5517996022567');
  assert.ok(r.body.content.actions.find(a=>a.field_name==='ai_state'));
});

test('payload inválido não vaza detalhes e queda inesperada usa saída segura',async()=>{
  process.env.WEBHOOK_SECRET=SECRET;
  const malformed=await call('POST','{JSON RUIM',{'x-webhook-secret':SECRET});
  assert.equal(malformed.statusCode,200);
  assert.equal(malformed.body.intent,'erro_seguro');
  assert.equal(malformed.body.cta_1_url,'https://wa.me/5517996064189');
  const invalid=await call('POST',[],{'x-webhook-secret':SECRET});
  assert.equal(invalid.statusCode,400);
});

test('method not allowed',async()=>{
  assert.equal((await call('PUT')).statusCode,405);
});
