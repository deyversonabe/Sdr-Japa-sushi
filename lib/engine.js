import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { persona } from './persona.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const knowledge = read('knowledge.json');
const catalogData = read('catalogo_extraido.json');
const rodizioGroups = read('rodizio_grupos_atendimento.json');
const ACTIVE = new Set(['ativo', 'ativo_por_confirmacao_usuario_2026_09_22']);
const catalog = catalogData.catalogo.filter((p) => ACTIVE.has(p.status));
const hidden = catalogData.catalogo.filter((p) => !ACTIVE.has(p.status));
const L = knowledge.links;
export const VERSION = knowledge._meta.versao;
export const BUSINESS = knowledge;
export const CATALOG = catalog;
export const HIDDEN = hidden;
export const RODIZIO_GROUPS = rodizioGroups;

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const has = (t, re) => re.test(t);
const words = (v) => ` ${norm(v)} `;
const isYes = (v) => v === true || ['true','yes','sim','1'].includes(norm(v));
const WA = { type: 'url', label: 'Falar no WhatsApp', url: L.whatsapp };
const RH = { type: 'url', label: 'Enviar currículo', url: L.whatsapp_rh };
const MENU = { type: 'url', label: 'Ver cardápio / pedir', url: L.cardapio_pedido };
const MAP = { type: 'url', label: 'Como chegar', url: L.google_maps };
// Canais iFood e 99Food foram confirmados. Links de loja só viram botões após validação.
// Também podem ser cadastrados nas variáveis opcionais IFOOD_STORE_URL e FOOD99_STORE_URL da Vercel.
function validatedMarketplaceUrl(raw, platform) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname.toLowerCase();
    if (platform === 'ifood') {
      if (!['ifood.com.br', 'www.ifood.com.br'].includes(host) || !pathname.startsWith('/delivery/')) return null;
    } else if (platform === 'food99') {
      if (!['99app.com', 'www.99app.com'].includes(host) || !/^\/99food\/[^/]+\/[^/]+\/[^/]+/.test(pathname)) return null;
    } else return null;
    return u.toString();
  } catch { return null; }
}
export function marketplaceStatus() {
  const ifood = validatedMarketplaceUrl(process.env.IFOOD_STORE_URL || L.ifood, 'ifood');
  const food99 = validatedMarketplaceUrl(process.env.FOOD99_STORE_URL || L.food99, 'food99');
  return { ifood, food99 };
}
const marketplaceButton = (platform) => {
  const url = marketplaceStatus()[platform];
  return url ? {type:'url',label:platform==='ifood'?'Pedir no iFood':'Pedir no 99Food',url} : null;
};
const deliveryButtons = () => [MENU, marketplaceButton('ifood'), marketplaceButton('food99'), WA]
  .filter(Boolean).slice(0,3);
const marketplaceButtons = (platform) => [marketplaceButton(platform),MENU,WA]
  .filter(Boolean).slice(0,3);
const REVIEW = () => L.google_avaliacao ? [{type:'url',label:'Avaliar no Google',url:L.google_avaliacao}] : [];
const stateBase = () => ({last_intent:'',last_topic:'',last_bot_reply:'',rating_pending:false,feedback_pending:false,last_event_id:'',offer:'',reserva:null});
const decodeState = (raw) => {
  if (typeof raw !== 'string') return raw;
  const t = raw.trim();
  if (!t || t.startsWith('{')) return t;
  try { return Buffer.from(t, 'base64url').toString('utf8'); } catch { return t; }
};
// Memória em base64url: evita JSON quebrado quando o ManyChat reinsere ai_state no corpo da requisição.
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
    first_name: input.first_name || c.first_name || c.name || c.ig_username || '',
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
const jobs = (n) => /\b(vaga|vagas|emprego|curriculo|trabalhar|contratacao|rh|selecao|entrevista|contratando|freelance|freelancer|procuro trabalho)\b/.test(n) ||
  (/\b(entregador|entregadores|sushiman|sushiwoman|cozinheiro|cozinheira|garcom|garcon|auxiliar de cozinha)\b/.test(n) &&
    /\b(precisa|precisando|preciso|procuro|vaga|disponivel|contrata|contratar|trabalho|trabalhar|fixo|oportunidade|sou)\b/.test(n));
const partnership = (n) => /\b(parceria|permuta|divulgacao|agencia|trafego|consultoria|representante|proposta comercial|publi)\b/.test(n);
const praise = (n) => /\b(amei|adorei|maravilhoso|maravilhosa|perfeito|delicioso|sensacional|parabens|top|elogiar|elogio)\b/.test(n);
const gradePrompt = () => 'Que bom ter você com a gente! De 1 a 5, que nota você dá à sua experiência? Pode responder só com o número.';
const rodizioPreferencias = rodizioGroups.guia_por_preferencia;
const preferenceText = (key) => {
  const group=rodizioPreferencias[key];
  return `${group.titulo}:\n${group.itens.map((x)=>`• ${x}`).join('\n')}`;
};
const preferenceKeys = (n) => [
  /\b(frito|frita|fritos|fritas|empanado|empanada|empanados|empanadas)\b/.test(n) && 'fritos_empanados',
  /\b(grelhado|grelhada|grelhados|grelhadas)\b/.test(n) && 'grelhados',
  /\bsem arroz\b/.test(n) && 'sem_arroz'
].filter(Boolean);
// Abreviações comuns de Direct → forma completa (só palavra inteira, depois da normalização).
const ABREV = {vcs:'voces',vc:'voce',vces:'voces',q:'que',oq:'o que',pq:'porque',hj:'hoje',tbm:'tambem',tb:'tambem',
  qto:'quanto',oque:'o que',oqe:'o que',qnto:'quanto',qt:'quanto',ond:'onde',aond:'onde',aonde:'onde',end:'endereco',ender:'endereco',
  msm:'mesmo',td:'tudo',blz:'beleza',obg:'obrigado',vlw:'valeu',hrs:'horas',hr:'horas',cmg:'comigo',tah:'esta',ta:'esta',tao:'estao'};
const expandAbbrev = (n) => n.split(' ').map((w)=>ABREV[w]??w).join(' ');
// Localização: termos fortes ou "onde" + contexto de lugar, sem roubar perguntas de cardápio/pedido/reserva.
const locationQuestion = (n) => {
  if (/\b(endereco|localizacao|localizad[oa]s?|situad[oa]s?|como chegar|como chego|pra chegar|para chegar|chegar ai|chegar ate|mapa|maps|waze|gps|rota|ponto de referencia|qual (a )?rua|em que rua|que rua|fica onde|ficam onde)\b/.test(n)) return true;
  if (!/\bonde\b/.test(n)) return false;
  if (/\b(cardapio|menu|pedir|pedido|comprar|entrega|delivery|ifood|99 ?food|reserv\w*|pag\w*|curriculo|vaga)\b/.test(n)) return false;
  return /^(e )?onde( e| fica| ficam| esta| estao)?( voces| o japa| o restaurante)?$/.test(n) ||
    /\bonde\b.*\b(e|fica|ficam|esta|estao|voces|voce|restaurante|japa|loja|lugar|casa)\b/.test(n);
};
const rodizioDetailQuestion = (n) => /\b(o que tem|o que vem|quais itens|quais opcoes|lista|composicao|variedades|opcoes do rodizio|itens do rodizio|o que inclui)\b/.test(n);
// Primeiro nome seguro para tratamento pessoal: só letras, até 20 caracteres; senão, sem nome.
const NOT_A_NAME = new Set(['user','usuario','usuaria','oficial','official','loja','store','shop','contato','perfil','admin',
  'instagram','insta','ig','the','eu','sr','sra','dr','dra','material','comercial','empresa','restaurante','delivery','studio','estudio']);
export function safeFirstName(raw) {
  // Aceita também @usuario do Instagram (ex.: deyverson_abe → Deyverson) quando o perfil não tem nome.
  const w = String(raw ?? '').trim().replace(/^@/,'').split(/[\s._\-0-9]+/).filter(Boolean)[0] || '';
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'-]{2,20}$/.test(w)) return '';
  if (NOT_A_NAME.has(norm(w))) return '';
  return w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1).toLocaleLowerCase('pt-BR');
}
const withName = (nome, comNome, semNome) => nome ? comNome : semNome;
// ---------------------------------------------------------------------------
// Horário e rodízio por dia da semana (fuso de Barretos). Os dados vêm de data/knowledge.json.
// ---------------------------------------------------------------------------
const H = knowledge.horarios;
const R = knowledge.rodizio;
const DAY_NAMES = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const dayWith = (dow) => `${[0,6].includes(dow) ? 'no' : 'na'} ${DAY_NAMES[dow]}`;
const isWeekend = (dow) => [5,6,0].includes(dow);           // sexta a domingo
const dinnerOf = (dow) => isWeekend(dow) ? H.jantar_rodizio.sex_a_dom : H.jantar_rodizio.seg_a_qui;
const priceTier = (dow) => isWeekend(dow) ? R.sex_a_dom_feriados : R.seg_a_qui;
const isClosedDay = (dow) => dow === H.dia_fechado_numero;
// ctx.now (ISO) existe só para testes e simulações; o webhook nunca o repassa.
export function nowBR(iso) {
  let d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) d = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const dow = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[get('weekday')];
  const hh = Number(get('hour')) % 24;
  return {dow, min: hh*60 + Number(get('minute'))};
}
// Próximo dia aberto depois de `dow` (pula a terça) e como falar dele.
function nextOpenDay(dow) {
  let next = (dow + 1) % 7, label = 'amanhã';
  if (isClosedDay(next)) { next = (next + 1) % 7; label = DAY_NAMES[next]; }
  return {dow: next, label};
}
const hoursLine = (dow) => {
  const j = dinnerOf(dow);
  return `almoço delivery das ${H.almoco_delivery.abre} às ${H.almoco_delivery.fecha} e jantar com rodízio das ${j.abre} às ${j.fecha}`;
};
function dayFromText(n, now) {
  if (/\b(fim de semana|final de semana|fds|feriado|feriados)\b/.test(n)) return {tier:'fim', label: /feriado/.test(n) ? 'em feriados' : 'no fim de semana'};
  if (/\bsegunda a quinta\b/.test(n)) return {tier:'semana', label:'de segunda a quinta'};
  if (/\bsexta a domingo\b/.test(n)) return {tier:'fim', label:'de sexta a domingo'};
  if (/\bhoje\b|\bagora\b|\besta noite\b/.test(n)) return {dow: now.dow, label:'hoje', today:true};
  if (/\bamanha\b/.test(n)) return {dow: (now.dow + 1) % 7, label:'amanhã'};
  for (const [w, d] of [['domingo',0],['segunda',1],['terca',2],['quarta',3],['quinta',4],['sexta',5],['sabado',6]])
    if (new RegExp(`\\b${w}\\b`).test(n)) return {dow: d, label: dayWith(d)};
  return null;
}
function statusNow(now) {
  const {dow, min} = now;
  if (isClosedDay(dow)) return {state:'terca'};
  const j = dinnerOf(dow), a = H.almoco_delivery;
  if (min >= j.abre_min && min < j.fecha_min) return {state:'jantar', j};
  if (min >= a.abre_min && min < a.fecha_min) return {state:'almoco', j};
  if (min < a.abre_min) return {state:'antes_almoco', j};
  if (min < j.abre_min) return {state:'entre', j};
  return {state:'encerrado', j};
}
function horarioReply(n, now, nome) {
  const day = dayFromText(n, now);
  const askNow = /\b(hoje|agora|aberto|aberta|abertos|abertas|fechado|fechada|fechados|funcionando|funciona|funcionam|abre|abrem|fecha|fecham|que horas|folga)\b/.test(n);
  const who = nome ? `, ${nome}` : '';
  const a0 = H.almoco_delivery, sq0 = H.jantar_rodizio.seg_a_qui, sd0 = H.jantar_rodizio.sex_a_dom;
  const full = {text:`A gente funciona de quarta a segunda; terça é o nosso dia de folga.\n\nAlmoço delivery: ${a0.abre} às ${a0.fecha}.\nJantar e rodízio: ${sq0.dias_texto}, das ${sq0.abre} às ${sq0.fecha}; ${sd0.dias_texto}, das ${sd0.abre} às ${sd0.fecha}.\n\nEm feriados, confirme com a equipe.`, offer:''};
  if (day?.tier) return full;
  if (day && day.dow !== undefined && !day.today) {
    if (isClosedDay(day.dow)) {
      const nx = nextOpenDay(day.dow);
      return {text:`${day.label === 'amanhã' ? 'Amanhã' : `Na ${DAY_NAMES[day.dow]}`} é o dia de folga do Japa. Voltamos ${dayWith(nx.dow)}, com ${hoursLine(nx.dow)}.`, offer:''};
    }
    return {text:`${day.label === 'amanhã' ? 'Amanhã' : day.label.replace(/^./, (c) => c.toUpperCase())} a gente atende com ${hoursLine(day.dow)}. Quer que eu te ajude a reservar sua mesa?`, offer:'reserva'};
  }
  if (askNow || day?.today) {
    const st = statusNow(now);
    const nx = nextOpenDay(now.dow);
    if (st.state === 'terca') return {text:`${nome ? `${nome}, hoje` : 'Hoje'} é terça, dia de folga do Japa. Amanhã a gente volta com ${hoursLine(nx.dow)}. 🍣`, offer:''};
    if (st.state === 'jantar') return {text:`Estamos abertos${who}! Hoje o jantar e o rodízio vão até ${st.j.fecha}. Quer que eu te ajude a garantir sua mesa?`, offer:'reserva'};
    if (st.state === 'almoco') return {text:`Agora estamos no almoço delivery${who}, até ${H.almoco_delivery.fecha}. O salão e o rodízio abrem às ${st.j.abre}. Quer que eu te ajude a reservar?`, offer:'reserva'};
    if (st.state === 'antes_almoco') return {text:`Hoje a gente começa com o almoço delivery às ${H.almoco_delivery.abre}, e o jantar com rodízio abre às ${st.j.abre}. Quer que eu te ajude a reservar?`, offer:'reserva'};
    if (st.state === 'entre') return {text:`Hoje a gente abre às ${st.j.abre} para o jantar e o rodízio${who}. Quer que eu te ajude a reservar sua mesa?`, offer:'reserva'};
    const tomorrow = nx.label === 'amanhã' ? 'Amanhã' : `Amanhã é terça, nosso dia de folga. Voltamos na ${nx.label}`;
    return {text:`Por hoje já encerramos${who}. ${tomorrow}${nx.label === 'amanhã' ? ' a gente volta' : ''} com ${hoursLine(nx.dow)}. 🍣`, offer:''};
  }
  return full;
}
const kids = () => `Crianças de ${R.infantil_de} a ${R.infantil_ate} anos pagam ${R.infantil_5_a_11}.`;
function rodizioPrecosReply(n, now, nome) {
  const open = withName(nome, `Aê, ${nome}! Boa escolha 😍`, 'Boa escolha! 😍');
  const day = dayFromText(n, now);
  const tail = ` ${kids()} Bebidas e sobremesas ficam à parte. Quer reservar sua mesa? Se preferir, te mostro as opções fritas, grelhadas ou sem arroz.`;
  const line = (t) => `Individual ${t.individual} · Casal ${t.casal}`;
  if (day && (day.tier || day.dow !== undefined)) {
    if (day.dow !== undefined && isClosedDay(day.dow)) {
      const nx = nextOpenDay(day.dow), t = priceTier(nx.dow);
      return `${open} ${day.today ? 'Hoje é terça, dia de folga do Japa' : 'Na terça o Japa descansa'}. O rodízio volta ${day.today ? 'amanhã' : dayWith(nx.dow)}: ${line(t)}.${tail}`;
    }
    const t = day.tier ? (day.tier === 'fim' ? R.sex_a_dom_feriados : R.seg_a_qui) : priceTier(day.dow);
    const when = day.today ? `Hoje (${DAY_NAMES[day.dow]})` : day.label.replace(/^./, (c) => c.toUpperCase());
    return `${open} ${when} o rodízio é: ${line(t)}.${tail}`;
  }
  return `${open} O rodízio é servido de ${R.dias_texto}:\n\n`+
    `🍣 Segunda a quinta — ${line(R.seg_a_qui)}\n🍣 Sexta a domingo e feriados — ${line(R.sex_a_dom_feriados)}\n🍣 Crianças de ${R.infantil_de} a ${R.infantil_ate} anos — ${R.infantil_5_a_11}\n\n`+
    `Bebidas e sobremesas ficam à parte. Quer reservar sua mesa? Se preferir, te mostro as opções fritas, grelhadas ou sem arroz.`;
}
// Resposta curta (uma bolha): resumo do rodízio sem listar item por item; o detalhe fica sob pedido.
const rodizioResumo = (nome='') =>
  `${nome ? `${nome}, no rodízio` : 'No rodízio'} você tem sushis e sashimis, niguiris, hossomakis, uramakis, joys, hot rolls, entradas e pratos quentes como yakissoba e missoshirô. 🍣\n\n`+
  `Individual ${R.seg_a_qui.individual} (seg a qui) ou ${R.sex_a_dom_feriados.individual} (sex a dom e feriados) · Casal ${R.seg_a_qui.casal} ou ${R.sex_a_dom_feriados.casal} · crianças de ${R.infantil_de} a ${R.infantil_ate} anos ${R.infantil_5_a_11}. Bebidas e sobremesas à parte.\n\n`+
  `Quer ver as opções fritas, grelhadas ou sem arroz? É só me pedir.`;
const ageFrom = (n) => {
  if (/\b(bebe|meses|mes)\b/.test(n)) return 0;
  const m = n.match(/\b(\d{1,2}) anos?\b/);
  return m ? Number(m[1]) : null;
};
function infantilReply(n) {
  const age = ageFrom(n);
  const extra = ' Bebidas e sobremesas ficam à parte.';
  if (age !== null && age >= R.infantil_de && age <= R.infantil_ate) return {text:`${kids()}${extra}`, human:false};
  if (age !== null) return {text:`${age < R.infantil_de ? `Para crianças menores de ${R.infantil_de} anos` : `A partir de ${R.infantil_ate + 1} anos`} eu prefiro confirmar direitinho com a equipe, para não te passar nada errado. Toque no botão e fale com a gente.`, human:true};
  return {text:`${kids()} Para menores de ${R.infantil_de} anos, a equipe confirma pelo WhatsApp.${extra}`, human:false};
}

// ---------------------------------------------------------------------------
// Reserva guiada: uma pergunta por vez; no fim, botão do WhatsApp com a mensagem pronta.
// O bot não confirma mesa nem cobra sinal.
// ---------------------------------------------------------------------------
const NUM_WORDS = {um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,quinze:15,vinte:20};
function parsePessoas(n, strict) {
  if (/\bcasal\b/.test(n)) return 2;
  let m = n.match(/\b(\d{1,2}) (?:pessoas?|lugares|convidados?|pax)\b/) ||
    n.match(/\b(?:para|pra|somos|seremos|mesa de|mesa para|mesa pra) (\d{1,2})\b(?! ?(?:h|horas?)\b)/);
  if (!m && strict) m = n.match(/^(?:somos |seremos |vamos ser )?(\d{1,2})$/);
  if (m) { const v = Number(m[1]); return v >= 1 && v <= 80 ? v : null; }
  const w = n.match(new RegExp(`\\b(?:para |pra |somos |seremos )?(${Object.keys(NUM_WORDS).join('|')})(?: pessoas?)?$`)) ||
    (strict ? null : n.match(new RegExp(`\\b(${Object.keys(NUM_WORDS).join('|')}) pessoas?\\b`)));
  return w ? NUM_WORDS[w[1]] : null;
}
function parseDia(n, raw, now) {
  const d = dayFromText(n, now);
  if (d && d.dow !== undefined) return {texto: d.today ? 'hoje' : d.label === 'amanhã' ? 'amanhã' : DAY_NAMES[d.dow], dow: d.dow};
  const sl = String(raw).match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  if (sl && Number(sl[1]) <= 31 && Number(sl[2]) <= 12) return {texto:`${sl[1]}/${sl[2]}`};
  const dm = n.match(/\bdia (\d{1,2})\b/);
  if (dm && Number(dm[1]) <= 31) return {texto:`dia ${dm[1]}`};
  return null;
}
function parseHora(raw, strict) {
  const t = String(raw).toLowerCase();
  const m = t.match(/\b(\d{1,2})\s*h(?:oras?)?\s*(\d{2})?\b/) || t.match(/\b(\d{1,2}):(\d{2})\b/) || (strict ? t.trim().match(/^(\d{1,2})$/) : null);
  if (!m) return null;
  const hh = Number(m[1]), mm = m[2] ? Number(m[2]) : 0;
  if (hh < 0 || hh > 23 || mm > 59) return null;
  return `${hh}h${mm ? String(mm).padStart(2, '0') : ''}`;
}
const cleanName = (v) => String(v ?? '').replace(/\b(?:https?:\/\/|www\.)\S*/gi, ' ').replace(/\S+\.(?:com|br|net|org|co|io|app|site)\S*/gi, ' ')
  .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
const waPrefill = (text) => `${L.whatsapp}?text=${encodeURIComponent(text)}`;
const reservaMissing = (res) => (res.pessoas ? (res.dia ? (res.hora ? (res.aniv && !res.aniversariante ? 'aniversariante' : null) : 'hora') : 'dia') : 'pessoas');
const RES_QUESTION = {
  pessoas: 'Quantas pessoas vão ser? (Se for casal, é só dizer "casal".)',
  dia: 'Para qual dia vocês estão pensando?',
  hora: 'E que horas pretendem chegar?',
  aniversariante: 'Quem é o aniversariante? Vou deixar a equipe avisada para receber com carinho 🎂'
};
const reservaEscape = (n, raw) => /\?/.test(raw) || raw.length > 60 ||
  /\b(cancel\w*|deixa|esquece|nao quero|outra coisa|cardapio|valor|quanto|preco|horario|endereco|onde|pagamento|vaga|curriculo|delivery|entrega)\b/.test(n);
function reservaNext(res, nome, now, intro = '') {
  const missing = reservaMissing(res);
  if (missing) return result('reserva', `${intro}${RES_QUESTION[missing]}`.trim(), [], {topic:'reserva', reserva:res});
  const nm = nome ? ` Meu nome é ${nome}.` : '';
  const aniv = res.aniv ? ` É aniversário de ${res.aniversariante}.` : '';
  const msg = `Olá! Quero reservar para ${res.pessoas} ${res.pessoas === 1 ? 'pessoa' : 'pessoas'}, ${res.dia} às ${res.hora}.${nm}${aniv}`;
  const cake = res.aniv ? ' Sobre o bolo de aniversário, a equipe combina as condições com você por lá.' : '';
  return result('reserva_pronta',
    `Perfeito${nome ? `, ${nome}` : ''}! Anotei: ${res.pessoas} ${res.pessoas === 1 ? 'pessoa' : 'pessoas'}, ${res.dia} às ${res.hora}.${cake} ${knowledge.reserva.sinal_texto} É só tocar no botão para falar com a equipe, que a mensagem já vai pronta 👇`,
    [{type:'url', label:'Reservar no WhatsApp', url: waPrefill(msg)}], {needs_human:true, next_action:'whatsapp', topic:'reserva', reserva:null});
}
function reservaStart(n, raw, nome, now, aniv) {
  const res = {aniv: !!aniv};
  const p = parsePessoas(n, false); if (p) res.pessoas = p;
  const d = parseDia(n, raw, now); if (d) res.dia = d.texto;
  const h = parseHora(raw, false); if (h) res.hora = h;
  const intro = aniv
    ? `${withName(nome, `Que lindo, ${nome}! 🎂`, 'Que lindo! 🎂')} No Japa, quem reúne pelo menos ${knowledge.aniversario.minimo_convidados} convidados e faz o rodízio ganha um bolo do Palácio das Delícias, com 3 sabores à escolha e receita para até 15 pessoas. As condições a equipe combina com você. `
    : `${withName(nome, `Oba, ${nome}! Vamos organizar sua reserva.`, 'Vamos organizar sua reserva!')} `;
  return reservaNext(res, nome, now, intro);
}
function reservaStep(s, n, raw, nome, now) {
  const res = {...s.reserva};
  const field = reservaMissing(res);
  let ok = false, note = '';
  if (field === 'pessoas') { const v = parsePessoas(n, true); if (v) { res.pessoas = v; ok = true; } }
  else if (field === 'dia') {
    const d = parseDia(n, raw, now);
    if (d && d.dow !== undefined && isClosedDay(d.dow)) note = 'Às terças a gente descansa 😊 Funcionamos de quarta a segunda; que dia fica bom para vocês? ';
    else if (d) { res.dia = d.texto; ok = true; }
  } else if (field === 'hora') { const v = parseHora(raw, true); if (v) { res.hora = v; ok = true; } }
  else if (field === 'aniversariante') { const v = cleanName(raw); if (v.length >= 2) { res.aniversariante = v; ok = true; } }
  if (ok) { res.fails = 0; return reservaNext(res, nome, now); }
  res.fails = (res.fails || 0) + (note ? 0 : 1);
  if (res.fails >= 2) {
    const msg = `Olá! Quero fazer uma reserva${res.pessoas ? ` para ${res.pessoas} pessoas` : ''}${res.dia ? `, ${res.dia}` : ''}${res.hora ? ` às ${res.hora}` : ''}.${nome ? ` Meu nome é ${nome}.` : ''}`;
    return result('reserva_pronta', 'Sem problema! Toque no botão e conte para a equipe, que eles finalizam sua reserva por lá.',
      [{type:'url', label:'Reservar no WhatsApp', url: waPrefill(msg)}], {needs_human:true, next_action:'whatsapp', topic:'reserva', reserva:null});
  }
  return result('reserva', `${note || 'Não consegui entender direitinho. '}${RES_QUESTION[field]}`, [], {topic:'reserva', reserva:res});
}
const affirm = (n) => /^(sim|quero|quero sim|pode|pode sim|pode ser|claro|bora|vamos|isso|com certeza|por favor|ok|quero reservar|me ajuda|aham)[ !.]*$/.test(n);


export function resolve(input={}, ctx={}) {
  input = normalizeInput(input);
  const now = nowBR(ctx.now);
  const s = getState(input);
  const nome = safeFirstName(input.first_name);
  const raw = String(input.message ?? input.text ?? '').slice(0,4000);
  let n = norm(raw.replace(/rodiozio|rodizzio|rodizo|rrodizio/gi,'rodizio').replace(/temaky/gi,'temaki')
    .replace(/sachimi/gi,'sashimi').replace(/filadelfia|philadelfia/gi,'philadelphia'));
  n = expandAbbrev(n);
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
  } else if (s.reserva && !reservaEscape(n,raw)) {
    r=reservaStep(s,n,raw,nome,now);
  } else if (event==='story mention' && !n) {
    r=result('story_mention',`${withName(nome,`Que foto linda, ${nome}! 🤩`,'Que foto linda! 🤩')} Obrigado por marcar o Japa. Posso repostar nos nossos stories? Se preferir que fique só entre nós, é só me dizer 😊`);
  } else if (s.last_intent==='story_mention' && /^(pode|pode sim|sim|claro|com certeza|autorizo|pode repostar|pode postar|fica a vontade|a vontade)[ !.]*$/.test(n)) {
    r=result('story_repost_ok',`Combinado${nome?`, ${nome}`:''}! 🍣 Obrigado de novo. Quando quiser voltar com a turma, é só me chamar que eu ajudo com a mesa.`);
  } else if (s.last_intent==='story_mention' && /^(nao|nao pode|prefiro que nao|melhor nao|nao precisa)[ !.]*$/.test(n)) {
    r=result('story_repost_nao',`Sem problema${nome?`, ${nome}`:''}, fica só entre nós 😊 Obrigado de novo pela marcação!`);
  } else if (event==='audio' || event==='voice' || norm(input.message_type).includes('audio')) {
    r=fallback('audio','Recebi seu áudio! Para não deixar sua dúvida sem resposta, nossa equipe pode te ajudar no WhatsApp.');
  } else if (jobs(n)) {
    r=result('vaga',`${withName(nome,`Que bom, ${nome}! Adoramos seu`,'Que bom ter seu')} interesse em fazer parte do time! 🙌`+' As vagas e os currículos são com o nosso RH: é só tocar no botão e falar por lá.',[RH]);
  } else if (complaint(n)) {
    r=fallback('reclamacao',`Sinto muito pelo ocorrido${nome?`, ${nome}`:''}.`+' Quero que nossa equipe entenda seu caso e te ajude diretamente pelo WhatsApp.');
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
  } else if (/\b(aniversario|aniversariante|niver)\b/.test(n)) {
    r=reservaStart(n,raw,nome,now,true); r.intent = r.intent==='reserva' ? 'aniversario' : r.intent;
  } else if (/\b(reserva|reservar|agendar|marcar uma mesa|quero uma mesa|mesa para|evento)\b/.test(n) || (s.offer==='reserva' && affirm(n))) {
    r=reservaStart(n,raw,nome,now,false);
  } else if (/\b(crianca|criancas|infantil|anos|ano|bebe|menor de 9|menor de 5|filho|filha|filhos|filhas)\b/.test(n) && /\b(rodizio|paga|pagam|valor|crianca|infantil|filho|filha|filhos|filhas)\b/.test(n)) {
    const k=infantilReply(n);
    r=result('rodizio_infantil',k.text,[WA],{topic:'rodizio',needs_human:k.human,next_action:k.human?'whatsapp':'responder'});
  } else if (/\b(bebidas?|sobremesas?)\b/.test(n) && /\b(rodizio|inclus[oa]s?|inclui|entra)\b/.test(n)) {
    r=result('rodizio_inclusoes','Bebidas e sobremesas não estão inclusas no rodízio; são cobradas separadamente.',[MENU],{topic:'rodizio'});
  } else if (preferenceKeys(n).length && !/\b(joy|temaki|combo|poke|adicional)\b/.test(n) &&
    (/\b(rodizio|o que|quais|opcoes|tem|mostra|me fala|frito|fritos|grelhado|grelhados)\b/.test(n) || s.last_topic==='rodizio' || n==='sem arroz')) {
    const keys=preferenceKeys(n);
    const guia=keys.map(preferenceText).join('\n\n');
    const alaCarte=keys.includes('sem_arroz')
      ? `\n\nOs Joys Especiais sem arroz são uma categoria separada do à la carte; não são anunciados como inclusos no rodízio.` : '';
    r=result('rodizio_preferencias',
      `Aqui está nosso guia por preferência, separado da lista principal do rodízio:\n\n${guia}\n\n`+
      `Esses são itens cadastrados no rodízio, não opções extras. Consulte a disponibilidade com nossa equipe.${alaCarte}`,
      [MENU,WA],{topic:'rodizio'});
  } else if (/^(e )?o que (tem|vem|inclui|entra|serve|servem)( ai| nele| no rodizio| de bom)?$/.test(n) ||
    /\brodizio\b/.test(n) && rodizioDetailQuestion(n) ||
    s.last_topic==='rodizio' && rodizioDetailQuestion(n)) {
    r=result('rodizio_composicao',rodizioResumo(nome),
      [MENU,WA],{topic:'rodizio'});
  } else if (/\b(rodizio)\b/.test(n)) {
    r=result('rodizio',rodizioPrecosReply(n,now,nome),[WA,MENU],{topic:'rodizio',offer:'reserva'});
  } else if (/\b(pix|debito|credito|cartao|dinheiro|ticket|pagamento|pago|pagar|vale refeicao|parcelamento|parcela)\b/.test(n)) {
    r=result('pagamento',`Aceitamos ${knowledge.formas_pagamento.confirmados.join(', ')}. Se precisar confirmar alguma bandeira específica ou parcelamento, nossa equipe ajuda pelo WhatsApp.`,[WA]);
  } else if (locationQuestion(n)) {
    r=result('localizacao',`${withName(nome,`Claro, ${nome}! 📍`,'Claro! 📍')} Estamos na ${knowledge.empresa.endereco}. É só tocar no botão abaixo para abrir a rota.`,[MAP]);
  } else if (/\b(horario|horarios|horas|abrem|abre|aberto|aberta|abertos|abertas|fecham|fecha|fechado|fechada|fechados|funcionamento|funciona|funcionam|funcionando|folga|domingo|hoje a noite)\b/.test(n)) {
    const h=horarioReply(n,now,nome);
    r=result('horario',h.text,[WA],{offer:h.offer});
  } else if (/\b(cade (o |a )?(meu |minha )?(pedido|entrega|comida)|pedido esta (anotado|a caminho)|esta anotado|foi anotado|ja saiu|saiu o pedido|status do pedido|acompanhar (o )?pedido|onde esta (o |meu )?pedido)\b/.test(n)) {
    r=result('pedido_status',`Entendi${nome?`, ${nome}`:''}. Para conferir seu pedido com agilidade, toque no botão e mande seu nome e endereço por lá, que a equipe acompanha pelo WhatsApp.`,[WA],{needs_human:true,next_action:'whatsapp'});
  } else if (/\b(?:i ?food|99 ?food)\b/.test(n)) {
    const platform=/\b99 ?food\b/.test(n)?'food99':'ifood';
    const label=platform==='ifood'?'iFood':'99Food';
    const hasStoreLink=!!marketplaceStatus()[platform];
    r=result('delivery',hasStoreLink
      ? `Sim, estamos no ${label}! Você pode abrir nossa loja pelo botão abaixo. Também temos pedidos diretos pelo SAIPOS, com entrega e retirada. Taxas e preços de cada plataforma aparecem no respectivo aplicativo.`
      : `Sim, estamos no ${label}! Procure Japa Sushi Lounge, em Barretos, no aplicativo. Ainda não temos o link direto da loja confirmado para este botão; se preferir, peça pelo nosso cardápio digital.`,
      marketplaceButtons(platform));
  } else if (/\b(entrega|entregas|entregam|entregar|entregando|delivery|retirada|retirar|buscar|taxa|frete|bairro|motoboy)\b/.test(n)) {
    r=result('delivery','Temos entrega e retirada pelo nosso cardápio digital (SAIPOS). Também atendemos pelo iFood e 99Food! No SAIPOS, a taxa aparece ao informar seu endereço. Nos aplicativos, consulte as taxas e os preços exibidos por cada plataforma.',deliveryButtons());
  } else if (/\b(pedir|pedido|comprar|encomendar|quero fazer meu pedido|quero encomendar)\b/.test(n)) {
    r=result('pedido','Você pode pedir pelo nosso cardápio digital (SAIPOS), com entrega ou retirada, ou pelo iFood e 99Food. Consulte os valores e as taxas diretamente no canal escolhido.',deliveryButtons());
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
      const matches=group(cat[1]);
      const summary=matches.slice(0,5).map(compact).join('\n');
      r=matches.length?result('categoria_cardapio',
        `Estas são algumas opções de ${cat[0]}:\n${summary}${matches.length>5?'\nTemos outras opções no cardápio digital.':''}`,
        [MENU],{topic:cat[1]}):fallback('categoria_indisponivel');
    }
  }
  if (!r) {
    if (event==='instagram comment') {
      r=praise(n)?result('elogio','Que alegria ler isso! Obrigado pelo carinho. 🍣', /\b(ja fui|visitei|comi ai)\b/.test(n)?REVIEW():[]):
        /^quero[ !.]*$/.test(n)?result('comentario_quero',`Aí vai${nome?`, ${nome}`:''}! 🍣 O cardápio completo, com entrega e retirada, está no botão abaixo.`,[MENU],{topic:'cardapio'}):
        result('comentario',`${withName(nome,`Oi, ${nome}!`,'Oi!')} Vi seu comentário no nosso post e fiquei feliz 😊 Quer saber do rodízio no salão ou prefere pedir em casa?`);
    } else if (praise(n)) {
      r=result('elogio',L.google_avaliacao
        ? 'Que alegria saber que você gostou! Agradecemos o carinho. Se já nos visitou, sua avaliação sincera no Google é muito bem-vinda.'
        : 'Que alegria saber que você gostou! Agradecemos o carinho e esperamos receber você novamente.',REVIEW());
    } else if (/^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite|oie|oii)[ !.]*$/.test(n)) {
      r=result('saudacao',`${withName(nome,`Oiê, ${nome}!`,'Oiê!')} Seja muito bem-vindo(a) ao Japa Sushi Lounge 🍣✨\n${isClosedDay(now.dow)?`Hoje é terça, nosso dia de folga, mas amanhã a gente volta com ${hoursLine(nextOpenDay(now.dow).dow)}. Posso te ajudar com rodízio, cardápio ou reserva?`:'Tô aqui pra te ajudar rapidinho. Me conta: quer saber do rodízio, cardápio, delivery, reserva ou como chegar?'}`,[MENU,WA]);
    } else if (/^(obrigado|obrigada|obg|valeu|vlw|tchau|ate mais|show)[ !.]*$/.test(n)) {
      r=result('agradecimento',`Nós que agradecemos${nome?`, ${nome}`:''}! Quando precisar, é só chamar. 🍣`);
    } else if (!n) {
      r=event==='story mention' ? result('story_mention',`${withName(nome,`Que foto linda, ${nome}! 🤩`,'Que foto linda! 🤩')} Obrigado por marcar o Japa. Posso repostar nos nossos stories?`) : result('sem_mensagem',`${withName(nome,`Oi, ${nome}!`,'Oi!')} Recebi aqui 🍣 Posso te ajudar com rodízio, pedido em casa ou reserva de mesa?`);
    } else if (/\b(proprietari|influenciador|rafa)\b/.test(n)) {
      r=result('assunto_interno','Posso ajudar com nosso cardápio, pedidos e reservas.',[MENU,WA]);
    } else {
      r=fallback('outro',`Quero te ajudar direitinho${nome?`, ${nome}`:''}. Toque no botão e fale com a equipe no WhatsApp, que eles te respondem por lá.`);
    }
  }
  if (eventId) s.last_event_id=eventId;
  s.reserva = r.reserva ?? null;
  s.offer = r.offer || '';
  delete r.reserva; delete r.offer;
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
  const approved=[...Object.values(L), ...Object.values(marketplaceStatus())]
    .filter((u)=>typeof u==='string' && /^https:\/\//.test(u));
  const prefill=`${L.whatsapp}?text=`;
  return (ctas||[]).filter((c)=>c.type==='url' && (approved.includes(c.url) || (typeof c.url==='string' && c.url.startsWith(prefill) && c.url.length<=900)))
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
    // Diagnóstico sem conteúdo do cliente: só o motivo do descarte (filtros inalterados).
    const reason = typeof candidate!=='string' || !candidate.trim() ? 'vazio' :
      candidate.length>260 ? 'longo' :
      /(?:https?:\/\/|www\.|wa\.me|\b[\w-]+\.(?:com(?:\.br)?|net(?:\.br)?|org(?:\.br)?|br|app|io|site)\b)/i.test(candidate) ? 'link' :
      /(?:\d|pix|preco|valor|horario|reserva confirmada|promocao|cupom|proprietari|dono|rafa|influenciador)/i.test(norm(candidate)) ? 'termo_bloqueado' : '';
    if (reason) {console.info('OPENAI_REPLY_FILTERED',r.intent,reason);return r;}
    console.info('OPENAI_REPLY_OK',r.intent);
    return {...r,reply:candidate.trim()};
  } catch(e) {console.warn('OPENAI_REPLY_ERROR',e.name);return r;}
  finally {clearTimeout(timeout);}
}

// Divide por parágrafos/frases para não cortar nomes de pratos em mensagens do Instagram.
function splitReply(text,maxChars=780) {
  const parts=[];
  let rest=String(text||'').trim();
  while (rest.length>maxChars) {
    const window=rest.slice(0,maxChars+1);
    const para=window.lastIndexOf('\n\n');
    const line=window.lastIndexOf('\n');
    const sentence=window.lastIndexOf('. ');
    const space=window.lastIndexOf(' ');
    const boundary=para>=maxChars*0.35 ? para+2 :
      line>=maxChars*0.35 ? line+1 :
      sentence>=maxChars*0.35 ? sentence+2 :
      space>=maxChars*0.35 ? space+1 : maxChars;
    parts.push(rest.slice(0,boundary).trim());
    rest=rest.slice(boundary).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function standardPayload(r) {
  const reply=sanitizeReply(r.reply),cs=allowedCtas(r.ctas);
  const parts = splitReply(reply,780);
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
  const chunks=splitReply(text,780);
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
  if (r.intent==='cardapio'||r.intent==='categoria_cardapio'||r.intent==='rodizio_composicao'||r.intent==='rodizio_preferencias') actions.push({action:'add_tag',tag_name:'interesse_cardapio'});
  if (r.intent==='reserva'||r.intent==='reserva_pronta'||r.intent==='aniversario') actions.push({action:'add_tag',tag_name:'interesse_reserva'});
  if (r.intent==='aniversario') actions.push({action:'add_tag',tag_name:'interesse_aniversario'});
  if (r.intent==='story_repost_ok') actions.push({action:'add_tag',tag_name:'repost_autorizado'});
  if (r.intent==='vaga') actions.push({action:'add_tag',tag_name:'candidato_rh'});
  if (r.needs_human) actions.push({action:'add_tag',tag_name:'precisa_humano'});
  return {version:'v2',content:{type:r.channel,messages:messages.slice(0,10),actions:actions.slice(0,5),quick_replies:[]}};
}
