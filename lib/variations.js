// Banco de variações de texto do Japa Sushi Lounge (v1.5.0).
// Só contém texto SOCIAL e instruções genéricas: nenhum preço, horário, promoção ou link.
// Os fatos (preço, horário, rodízio, reserva, pagamento) continuam vindo de data/knowledge.json.
// Cada situação tem pelo menos 8 variações; `pick` nunca repete a variação usada na última resposta.

// Hash simples e estável (FNV-1a) para escolher variação sem aleatoriedade: o mesmo cliente com a
// mesma mensagem recebe a mesma resposta, e os testes ficam reproduzíveis.
export const hash = (str) => {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

const strip = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sameOpening = (a, b) => !!a && !!b && strip(a).slice(0, 40) === strip(b).slice(0, 40);

// Cada variação é string ou função (c) => string, ou { t, i, foto } com marcas:
//  i: jeito mais informal (preferido quando o cliente escreve "vcs", "mano" etc.)
//  foto: só faz sentido quando o envio é uma imagem
// c = { n: ', Nome' | '', nm: 'Nome' | '', sg: 'Bom dia' }
export function pick(bank, c, seed, prevReply = '', { informal = false, filter } = {}) {
  let list = bank.map((v) => (typeof v === 'object' && !Array.isArray(v) && v.t !== undefined ? v : { t: v }));
  if (filter) list = list.filter(filter);
  const rendered = list.map((v) => ({ ...v, text: (typeof v.t === 'function' ? v.t(c) : v.t).trim() }));
  let pool = rendered.filter((v) => !sameOpening(v.text, prevReply));
  if (!pool.length) pool = rendered;
  if (informal) { const inf = pool.filter((v) => v.i); if (inf.length) pool = inf; }
  return pool[hash(seed) % pool.length].text;
}

// ---------------------------------------------------------------------------
// Direct: conversa social
// ---------------------------------------------------------------------------
export const SAUDACAO_PRIMEIRA = [
  (c) => `${c.sg}${c.n}! Seja bem-vindo(a) ao Japa Sushi Lounge. Como posso te ajudar?`,
  (c) => `${c.sg}${c.n}! Que bom ter você por aqui. Me conta o que você procura: rodízio, cardápio, delivery ou reserva?`,
  (c) => `${c.sg}! Obrigado por chamar o Japa Sushi Lounge${c.n}. Em que posso ajudar?`,
  (c) => `Oi${c.n}! ${c.sg} e seja bem-vindo(a) ao Japa. É sobre pedido, rodízio ou reserva?`,
  (c) => `${c.sg}${c.n}! Chegou no lugar certo pra matar a vontade de sushi. Como posso ajudar?`,
  (c) => `${c.sg}${c.n}, tudo bem? Aqui é o Japa Sushi Lounge. Posso ajudar com cardápio, rodízio, entrega ou reserva.`,
  { i: true, t: (c) => `Oiê${c.n}! ${c.sg}. O que você gostaria de saber sobre o Japa?` },
  (c) => `${c.sg}${c.n}! Seja bem-vindo(a). Posso te ajudar com rodízio, cardápio, entrega ou reserva.`
];
export const SAUDACAO_DEPOIS = [
  (c) => `Oi de novo${c.n}! Em que posso ajudar?`,
  (c) => `Pode falar${c.n}, estou por aqui.`,
  (c) => `Oi${c.n}! O que você precisa?`,
  (c) => `Tô aqui${c.n}. Me conta como posso ajudar.`,
  (c) => `Opa${c.n}! Pode mandar sua dúvida.`,
  { i: true, t: (c) => `Oiê${c.n}! Sobre o que você quer saber?` },
  (c) => `Estou por aqui${c.n}. É sobre cardápio, rodízio ou reserva?`,
  (c) => `Pode mandar${c.n}, vou te ajudar com o que precisar.`
];
export const AGRADECIMENTO = [
  (c) => `Nós que agradecemos${c.n}!`,
  (c) => `Disponha${c.n}! Qualquer coisa, é só chamar.`,
  (c) => `Por nada${c.n}. Estamos por aqui quando precisar.`,
  (c) => `Imagina${c.n}, foi um prazer ajudar.`,
  { i: true, t: (c) => `Valeu${c.n}! Até a próxima.` },
  (c) => `Obrigado você${c.n}! Quando quiser, é só chamar. 🍣`,
  (c) => `Que bom ter ajudado${c.n}. Conte com a gente.`,
  { i: true, t: (c) => `Tamo junto${c.n}! Qualquer dúvida, é só falar.` }
];
export const SEM_MENSAGEM = [
  (c) => `Oi${c.n}! Recebi aqui. Posso te ajudar com rodízio, pedido em casa ou reserva de mesa?`,
  (c) => `Olá${c.n}! Sua mensagem chegou, mas veio sem texto. Me conta o que você precisa?`,
  (c) => `Oi${c.n}! Pode me escrever o que você procura? Ajudo com cardápio, rodízio ou reserva.`,
  (c) => `Recebi${c.n}! Sobre o que você quer falar: pedido, rodízio ou reserva?`,
  (c) => `Oi${c.n}, tô por aqui. Me diz como posso ajudar.`,
  (c) => `Olá${c.n}! Veio uma mensagem vazia. Pode escrever sua dúvida?`,
  (c) => `Opa${c.n}! Escreve pra mim o que você precisa que eu ajudo.`,
  (c) => `Oi${c.n}! Se quiser pedir, ver o rodízio ou reservar, é só me dizer.`
];
export const CLIENTE_NOVO = [
  (c) => `Que bom ter você por aqui${c.n}! Seja bem-vindo(a) ao Japa. Pelos botões abaixo você vê o cardápio e conhece a casa.`,
  (c) => `Seja bem-vindo(a)${c.n}! Para conhecer o Japa e pedir, é só tocar nos botões abaixo.`,
  (c) => `Que legal te conhecer${c.n}! O cardápio e o nosso site estão nos botões logo abaixo.`,
  (c) => `Oi${c.n}, muito prazer! Se quiser conhecer a casa e ver o cardápio, os botões abaixo levam você.`,
  (c) => `Bem-vindo(a) ao Japa${c.n}! Dá uma olhada no cardápio e no site pelos botões abaixo.`,
  (c) => `Que bom que você chegou${c.n}! Cardápio e site estão nos botões abaixo, para você conhecer tudo com calma.`,
  (c) => `Prazer em ter você aqui${c.n}! Os botões abaixo mostram o cardápio e um pouco mais sobre o Japa.`,
  (c) => `Seja muito bem-vindo(a)${c.n}! Para começar, o cardápio e o site estão logo abaixo.`
];
export const FIDELIDADE = [
  (c) => `As informações sobre fidelidade e benefícios ficam no nosso site, no botão abaixo. Lá estão as condições atualizadas.`,
  (c) => `Tudo sobre fidelidade está no site do Japa${c.n}. É só tocar no botão abaixo para ver as condições.`,
  (c) => `Para saber como funciona a fidelidade, o caminho é o nosso site, no botão abaixo.`,
  (c) => `Os detalhes e as condições de fidelidade estão no site${c.n}, pelo botão abaixo.`,
  (c) => `No site você confere o que existe de fidelidade e as condições, sempre atualizadas. Botão logo abaixo.`,
  (c) => `Sobre fidelidade e cashback, as regras ficam no nosso site${c.n}. Toca no botão abaixo.`,
  (c) => `As condições de fidelidade são publicadas no site do Japa. O botão abaixo leva até lá.`,
  (c) => `Pra ver o que temos de fidelidade, é só abrir o site pelo botão abaixo${c.n}.`
];
export const ELOGIO_GERAL = [
  (c) => `Que bom ler isso${c.n}! Obrigado pelo carinho.`,
  (c) => `Ficamos felizes com sua mensagem${c.n}. Obrigado!`,
  (c) => `Obrigado pelo carinho${c.n}! Isso motiva muito a equipe.`,
  (c) => `Que recado bom${c.n}! A equipe vai adorar saber.`,
  (c) => `Agradecemos de coração${c.n}!`,
  (c) => `Muito obrigado${c.n}! Palavras assim alegram o nosso dia. 😊`,
  { i: true, t: (c) => `Valeu pelo carinho${c.n}! Fica o convite pra voltar sempre.` },
  (c) => `Que bom que você gostou${c.n}! Obrigado por falar com a gente.`
];
// Convite à avaliação (somente com experiência real e fora do intervalo de 30 dias). Convite imparcial.
export const ELOGIO_VISITA = [
  (c) => `Que bom saber${c.n}! Ficamos muito felizes. Se quiser, conta como foi pra gente: sua avaliação sincera ajuda muito 👇`,
  (c) => `Obrigado por contar${c.n}! Se tiver um minutinho, sua avaliação sincera ajuda a gente a melhorar sempre.`,
  (c) => `Ficamos felizes em receber você${c.n}! Se quiser, deixe sua avaliação sincera pelo botão abaixo.`,
  (c) => `Que alegria${c.n}! Sua opinião sincera é muito importante pra nós; o botão abaixo leva até a avaliação.`,
  (c) => `Obrigado por contar${c.n}! Sua avaliação sincera, seja ela qual for, ajuda a gente a melhorar. É só tocar abaixo.`,
  { i: true, t: (c) => `Valeu por compartilhar${c.n}! Se quiser deixar sua avaliação sincera, o botão está logo abaixo.` },
  (c) => `Que bom ter você por aqui${c.n}! Sua avaliação sincera ajuda muito; é só tocar no botão abaixo.`,
  (c) => `Obrigado pelo retorno${c.n}! Quando puder, conta pra gente como foi a sua experiência, no botão abaixo.`
];
export const NOTA_ALTA = [
  (c) => `Que bom saber que você gostou${c.n}! Obrigado por avaliar. Se quiser, deixe sua avaliação sincera pelo botão abaixo.`,
  (c) => `Obrigado pela nota${c.n}! Ficamos felizes. Se tiver um minutinho, sua avaliação sincera ajuda muito, no botão abaixo.`,
  (c) => `Que alegria${c.n}! Obrigado por contar como foi. Sua avaliação sincera ajuda outras pessoas a conhecerem a casa.`,
  (c) => `Valeu pela nota${c.n}! Se quiser registrar sua opinião, o botão abaixo leva à avaliação.`,
  (c) => `Ficamos muito felizes${c.n}! Sua avaliação sincera é bem-vinda, é só tocar no botão abaixo.`,
  (c) => `Obrigado por avaliar${c.n}! Se quiser dizer com suas palavras como foi, o botão abaixo ajuda.`,
  (c) => `Que bom${c.n}! Agradecemos a nota. Se puder, conte sua experiência no botão abaixo.`,
  (c) => `Muito obrigado pela nota${c.n}! Sua opinião sincera faz diferença, e o botão abaixo leva até ela.`
];
export const STORY_PEDIR_REPOST = [
  (c) => `Obrigado por marcar o Japa${c.n}! Posso repostar nos nossos stories?`,
  (c) => `Valeu pela marcação${c.n}! Posso compartilhar nos stories do Japa?`,
  (c) => `Que legal ter você marcando a gente${c.n}! Você autoriza repostar nos nossos stories?`,
  (c) => `Obrigado pela marcação${c.n}! Podemos repostar nos nossos stories?`,
  (c) => `Que bom ser lembrado${c.n}! Obrigado pela marcação. Você nos autoriza a repostar?`,
  (c) => `Obrigado por marcar o Japa${c.n}! Se preferir que fique só entre nós, é só falar; senão, podemos repostar?`,
  { i: true, t: (c) => `Valeu por marcar a gente${c.n}! Posso repostar nos stories?` },
  (c) => `Marcação recebida${c.n}, obrigado! Posso repostar nos nossos stories?`
];
export const STORY_SO_AGRADECE = [
  (c) => `Obrigado por marcar o Japa de novo${c.n}!`,
  (c) => `Valeu pela marcação${c.n}!`,
  (c) => `Que bom ser lembrado outra vez${c.n}. Obrigado!`,
  (c) => `Agradecemos mais uma marcação${c.n}!`,
  (c) => `Obrigado por lembrar da gente${c.n}!`,
  (c) => `Recebemos a marcação${c.n}, obrigado!`,
  { i: true, t: (c) => `Valeu por marcar a gente${c.n}!` },
  (c) => `Que alegria ver a marcação${c.n}. Obrigado!`
];
export const COMPARTILHAMENTO = [
  (c) => `Obrigado por compartilhar${c.n}! Se quiser, o cardápio completo está no botão abaixo.`,
  (c) => `Valeu por compartilhar com a gente${c.n}! O cardápio fica aqui no botão, se quiser dar uma olhada.`,
  (c) => `Que legal receber isso${c.n}! Obrigado. Se bater a vontade, o cardápio está no botão abaixo.`,
  (c) => `Recebemos seu compartilhamento${c.n}, obrigado! O cardápio está logo abaixo se quiser ver.`,
  (c) => `Obrigado pelo carinho de compartilhar${c.n}! Quando quiser pedir, é só tocar no botão.`,
  (c) => `Obrigado por lembrar da gente${c.n}! O cardápio completo está no botão abaixo.`,
  { i: true, t: (c) => `Agradecemos o compartilhamento${c.n}! Se quiser ver o cardápio, é só tocar abaixo.` },
  (c) => `Valeu${c.n}! Se quiser pedir ou conhecer o cardápio, o botão está aqui embaixo.`
];
// ---------------------------------------------------------------------------
// Direct: mídia sem texto (nunca confirmar pedido, pagamento ou reserva por imagem)
// ---------------------------------------------------------------------------
export const MIDIA = [
  { foto: true, t: () => `Recebi sua foto! Se for sobre um pedido ou comprovante, a equipe confere pelo WhatsApp — é só tocar no botão.` },
  { foto: true, t: (c) => `Foto recebida${c.n}! Se for de pedido ou comprovante, a equipe confere pelo WhatsApp, pelo botão abaixo.` },
  (c) => `Recebi o que você enviou${c.n}! Para pedido ou comprovante, quem confere é a equipe, pelo botão do WhatsApp.`,
  (c) => `Obrigado pelo envio${c.n}. Se for sobre pedido ou comprovante, fale com a equipe pelo botão abaixo.`,
  (c) => `Chegou${c.n}! Pedido e comprovante a equipe confere pelo WhatsApp, é só tocar no botão.`,
  (c) => `Recebi${c.n}! Se o envio for de pedido ou comprovante, a equipe confere pelo WhatsApp.`,
  (c) => `Vi que você enviou algo${c.n}. Para pedido ou comprovante, é com a equipe, pelo botão do WhatsApp.`,
  (c) => `Envio recebido! Assuntos de pedido ou comprovante a equipe resolve pelo WhatsApp, no botão abaixo.`
];
export const AUDIO = [
  () => `Recebi seu áudio, mas por aqui não consigo ouvir. Pode me escrever ou chamar no WhatsApp?`,
  (c) => `Seu áudio chegou${c.n}, mas aqui eu não consigo ouvir. Pode escrever sua dúvida ou falar com a equipe pelo WhatsApp?`,
  (c) => `Não consigo ouvir áudios por aqui${c.n}. Pode me mandar por texto ou chamar a equipe no WhatsApp?`,
  (c) => `Recebi o áudio, mas só leio texto${c.n}. Se preferir, a equipe te atende pelo botão do WhatsApp.`,
  () => `Obrigado pelo áudio! Aqui eu só consigo ler texto. Pode escrever, ou falar com a equipe no WhatsApp.`,
  (c) => `Áudio recebido${c.n}, mas não consigo ouvir por aqui. Escreve pra mim ou toca no botão do WhatsApp.`,
  (c) => `Aqui eu não consigo escutar áudio${c.n}. Me manda em texto, ou chama a equipe pelo WhatsApp.`,
  () => `Recebi seu áudio! Só que eu não consigo ouvir. Pode digitar sua dúvida ou ir direto pro WhatsApp?`
];
export const VIDEO_ARQUIVO = [
  (c) => `Recebi${c.n}! Se precisar de algo, é só escrever aqui ou chamar no WhatsApp.`,
  (c) => `Obrigado pelo envio${c.n}. Se for sobre pedido, a equipe te atende pelo botão do WhatsApp.`,
  (c) => `Chegou aqui${c.n}! Para qualquer assunto de pedido, a equipe ajuda pelo WhatsApp.`,
  (c) => `Recebi o arquivo${c.n}. Se quiser falar com a equipe, o botão do WhatsApp está abaixo.`,
  (c) => `Envio recebido${c.n}! Me escreve o que você precisa ou fala com a equipe no WhatsApp.`,
  (c) => `Obrigado${c.n}, recebi. Qualquer dúvida, escreva aqui ou toque no botão do WhatsApp.`,
  (c) => `Recebido${c.n}! Se precisar de ajuda com pedido, a equipe está no WhatsApp.`,
  (c) => `Valeu pelo envio${c.n}. Se quiser conversar com a equipe, é só tocar no botão.`
];
// ---------------------------------------------------------------------------
// Direct: cardápio, como pedir, reclamação (fatos validados em knowledge.json)
// ---------------------------------------------------------------------------
export const CARDAPIO = [
  () => `Aqui está o cardápio completo, com entrega ou retirada 👇`,
  () => `O cardápio completo está logo abaixo, é só tocar no botão. Dá pra pedir com entrega ou retirada.`,
  (c) => `Pronto${c.n}! Esse é o nosso cardápio completo, com entrega ou retirada.`,
  (c) => `Pode escolher à vontade${c.n}: o cardápio completo está no botão abaixo.`,
  () => `Toca no botão pra ver o cardápio completo, com opção de entrega ou retirada.`,
  (c) => `Tá aqui o nosso cardápio${c.n}! Entrega ou retirada, você escolhe na hora de pedir.`,
  (c) => `O cardápio completo é por aqui${c.n}, no botão abaixo. Entrega ou retirada, como preferir.`,
  (c) => `Olha o cardápio completo aí embaixo${c.n}, com entrega ou retirada.`
];
export const COMO_PEDIR = [
  () => `É bem simples: toca no botão aqui embaixo, escolhe seus itens, coloca o endereço (a taxa aparece antes de finalizar) e escolhe entrega ou retirada. Também estamos no iFood e na 99Food. Se travar em algum passo, é só falar com a gente no WhatsApp.`,
  (c) => `Funciona assim${c.n}: toque no botão abaixo, escolha os itens, informe o endereço (a taxa aparece antes de finalizar) e marque entrega ou retirada. Estamos também no iFood e na 99Food. Se algo travar, a equipe ajuda no WhatsApp.`,
  (c) => `Pedir é fácil${c.n}! Abra o cardápio pelo botão, monte seu pedido, coloque o endereço e veja a taxa antes de finalizar. Entrega ou retirada, você escolhe. iFood e 99Food também funcionam. Qualquer dúvida, chama a equipe no WhatsApp.`,
  (c) => `Passo a passo${c.n}: 1) toque no botão abaixo; 2) escolha seus itens; 3) informe o endereço, que a taxa aparece antes de fechar; 4) escolha entrega ou retirada. Se preferir, também estamos no iFood e na 99Food. Se precisar de ajuda, é só falar no WhatsApp.`,
  (c) => `Pelo botão abaixo você abre o cardápio, escolhe os itens e coloca o endereço${c.n}. A taxa de entrega aparece antes de finalizar, e dá pra escolher retirada também. Estamos no iFood e na 99Food. Travou? A equipe ajuda no WhatsApp.`,
  (c) => `Bem tranquilo${c.n}: abre o cardápio no botão, escolhe o que quer, informa o endereço (taxa à vista antes de finalizar) e define entrega ou retirada. Também atendemos pelo iFood e pela 99Food. Se precisar, chama a equipe no WhatsApp.`,
  (c) => `Vou te explicar${c.n}: o botão abaixo abre o cardápio; lá você escolhe os itens, informa o endereço e vê a taxa antes de finalizar, com entrega ou retirada. O iFood e a 99Food também são opções. Se der qualquer problema, o WhatsApp está aqui embaixo.`,
  (c) => `Dá pra pedir em poucos toques${c.n}: botão abaixo, itens, endereço (a taxa aparece antes de confirmar) e entrega ou retirada. Estamos no iFood e na 99Food também. Se tiver dificuldade, a equipe te ajuda pelo WhatsApp.`
];
export const RECLAMACAO = [
  () => `Sinto muito por isso. Quero que nossa equipe resolva com você agora: me chama no WhatsApp pelo botão abaixo, por favor.`,
  (c) => `Sinto muito${c.n}. Vamos resolver isso: fala com a nossa equipe pelo botão do WhatsApp, por favor.`,
  (c) => `Lamento o ocorrido${c.n}. A equipe vai cuidar disso com você agora, pelo botão do WhatsApp abaixo.`,
  (c) => `Sinto muito pelo transtorno${c.n}. Toca no botão abaixo e conta pra equipe no WhatsApp, que eles resolvem com você.`,
  (c) => `Poxa, sinto muito${c.n}. Quero que a equipe resolva isso com você; é só tocar no botão do WhatsApp.`,
  (c) => `Desculpa pelo ocorrido${c.n}. Chama a equipe no WhatsApp pelo botão abaixo, que eles resolvem com você.`,
  (c) => `Sinto muito por isso${c.n}. Nossa equipe quer ouvir você e resolver: toque no botão abaixo.`,
  (c) => `Lamentamos muito${c.n}. Fala com a nossa equipe pelo botão do WhatsApp, que ela cuida disso agora.`
];
// ---------------------------------------------------------------------------
// Comentários PÚBLICOS: uma frase, sem pergunta, sem link, sem número, sem preço, sem horário.
// ---------------------------------------------------------------------------
export const COM_EMOJI = ['🍣❤️', '❤️🍣', '🍣😊', '🙌🍣', '🍣✨', '❤️', '🍣🙏', '😋🍣'];
export const COM_ELOGIO = [
  'Obrigado pelo carinho! 🍣', 'Que bom que gostou! ❤️', 'A gente agradece, viu!', 'Valeu demais pelo carinho!',
  'Ficamos felizes com seu comentário!', 'Muito obrigado! 😊', 'Que recado bom, obrigado!', 'Obrigado por passar aqui!'
];
export const COM_QUERO = [
  'Bora! Te chamei no direct 🍣', 'Vem pra cá! Te mandei mensagem no direct.', 'Que vontade boa! Já te chamei no direct.',
  'Te chamei no direct com tudo certinho!', 'Partiu! Olha seu direct 😋', 'Já te enviei o caminho no direct!',
  'Vamos matar essa vontade! Te chamei no direct.', 'Te mandei mensagem no direct, dá uma olhada!'
];
export const COM_MARCACAO = [
  'Obrigado por marcar! Vem com a turma!', 'Que legal! Vem com a turma toda 🍣', 'Valeu pela marcação! Esperamos vocês.',
  'Obrigado por lembrar da gente! Vem com a galera.', 'Marcação certeira! Será um prazer receber vocês.',
  'Valeu por marcar! Vem conhecer com a turma.', 'Agradecemos a marcação! Chama a turma e vem.', 'Que bom! Chama a turma e vem.'
];
export const COM_VISITA = [
  'Que bom ter você por aqui! Obrigado pelo carinho.', 'A gente agradece demais a sua visita!', 'Obrigado por fazer parte do Japa!',
  'Que alegria saber disso! Obrigado!', 'Ficamos felizes demais em receber você!', 'Valeu pelo carinho, sempre bem-vindo!',
  'Muito obrigado por confiar na gente! 🍣', 'Seu carinho faz toda a diferença, obrigado!'
];
export const COM_PERGUNTA = [
  'Te respondi no direct 😊', 'Já te respondi por mensagem no direct!', 'Olha seu direct, respondi por lá.',
  'Te mandei a resposta no direct!', 'Respondi no seu direct, dá uma olhada.', 'Te chamei no direct com a resposta!',
  'Mandei no direct, dá uma olhada!', 'Resposta enviada no seu direct!'
];
export const COM_RECLAMACAO = [
  'Sinto muito, vamos te chamar no direct.', 'Lamentamos, já te chamei no direct pra resolver.', 'Sinto muito por isso, te chamei no direct.',
  'Desculpa o transtorno, vamos falar com você no direct.', 'Sentimos muito, nossa equipe vai te chamar no direct.',
  'Sinto muito, olha seu direct que vamos resolver.', 'Lamentamos o ocorrido, te chamamos no direct.', 'Sinto muito, vamos resolver pelo direct.'
];
export const COM_VAGA = [
  'Te mandei o contato no direct.', 'Já te enviei o contato no direct.', 'Olha seu direct, mandei o contato certo.',
  'Enviei o contato por mensagem no direct.', 'Te chamei no direct com o contato certo.', 'O contato foi no seu direct, dá uma olhada.',
  'Mandei o contato no direct, dá uma olhada!', 'Contato enviado no seu direct!'
];
export const COM_PROMO = [
  'Os valores e novidades estão no cardápio e no site. Te chamei no direct!', 'Valores e novidades ficam no cardápio e no site, te mandei no direct.',
  'Tudo de novo está no cardápio e no site, te chamei no direct.', 'Cardápio e site trazem os valores e as novidades; olha seu direct.',
  'Os valores e novidades estão no cardápio e no site, te mandei os botões no direct.', 'Novidades e valores ficam no cardápio e no site. Te chamei no direct 😊',
  'No cardápio e no site você vê valores e novidades, te mandei no direct.', 'Cardápio e site mostram valores e novidades, já te chamei no direct.'
];

// ---------------------------------------------------------------------------
// Outros idiomas (resposta no mesmo idioma): só saudação, agradecimento, cardápio e encaminhamento.
// ---------------------------------------------------------------------------
export const FOREIGN = {
  en: {
    saudacao: [(c) => `Hi${c.n}! Welcome to Japa Sushi Lounge. How can I help you?`, (c) => `Hello${c.n}! Thanks for reaching out to Japa Sushi Lounge. What can I help you with?`,
      (c) => `Hey${c.n}! Welcome to Japa. Ask me about our menu, buffet or reservations.`, (c) => `Hi${c.n}, great to see you here! How can I help?`],
    agradecimento: [(c) => `You're welcome${c.n}!`, (c) => `Anytime${c.n}! We're here if you need anything.`, (c) => `Our pleasure${c.n}!`, (c) => `Thank you${c.n}! See you soon.`],
    cardapio: [() => `Here is our full menu, with delivery or pickup 👇`, () => `Tap the button below to see the full menu, with delivery or pickup.`,
      () => `Our full menu is just below, with delivery or pickup options.`, () => `You can order through the button below, with delivery or pickup.`],
    outro: [() => `Thanks for your message! To make sure you get the right information, our team can help you on WhatsApp. Just tap the button below.`,
      () => `Thank you! Our team can help you directly on WhatsApp, using the button below.`,
      () => `Thanks for reaching out! For this, please talk to our team on WhatsApp through the button below.`,
      () => `We'd love to help! Our team will answer you on WhatsApp, just tap the button below.`]
  },
  es: {
    saudacao: [(c) => `¡Hola${c.n}! Bienvenido(a) a Japa Sushi Lounge. ¿En qué puedo ayudarte?`, (c) => `¡Hola${c.n}! Gracias por escribir a Japa Sushi Lounge. ¿Qué necesitas?`,
      (c) => `¡Buenas${c.n}! Bienvenido(a) a Japa. Puedo ayudarte con el menú, el rodízio o reservas.`, (c) => `¡Hola${c.n}, qué bueno verte por aquí! ¿Cómo puedo ayudarte?`],
    agradecimento: [(c) => `¡De nada${c.n}!`, (c) => `¡Con gusto${c.n}! Estamos aquí si necesitas algo.`, (c) => `¡A ti${c.n}! Hasta pronto.`, (c) => `¡Gracias a ti${c.n}!`],
    cardapio: [() => `Aquí está nuestro menú completo, con entrega o retiro 👇`, () => `Toca el botón de abajo para ver el menú completo, con entrega o retiro.`,
      () => `El menú completo está justo abajo, con opción de entrega o retiro.`, () => `Puedes pedir con el botón de abajo, con entrega o retiro.`],
    outro: [() => `¡Gracias por tu mensaje! Para darte la información correcta, nuestro equipo te ayuda por WhatsApp con el botón de abajo.`,
      () => `¡Gracias! Nuestro equipo puede ayudarte directamente por WhatsApp, usando el botón de abajo.`,
      () => `¡Gracias por escribir! Para esto, habla con nuestro equipo por WhatsApp en el botón de abajo.`,
      () => `¡Con gusto te ayudamos! Nuestro equipo responde por WhatsApp, toca el botón de abajo.`]
  }
};
export function detectLang(n) {
  const t = ` ${n} `;
  if (/ (hello|hi there|hey there|good (morning|afternoon|evening)|thanks|thank you|how much|do you|are you|what time|opening hours|menu please|reservation|where are you|price) /.test(t) && !/ (voce|voces|vc|vcs|pra|para o|quanto|cardapio) /.test(t)) return 'en';
  if (/ (hola|buenas|buenos dias|buenas tardes|buenas noches|gracias|cuanto|cuesta|precio|donde|horario de atencion|quiero|tienen) /.test(t) && !/ (voce|voces|vc|vcs|obrigado|cardapio) /.test(t)) return 'es';
  return 'pt';
}
export const foreignKind = (n) =>
  /^(hello|hi|hey|hola|buenas|buenos dias|buenas tardes|buenas noches|good morning|good afternoon|good evening|hi there)[ !.]*$/.test(n) ? 'saudacao' :
  /^(thanks|thank you|gracias|thx|muchas gracias|thank you so much)[ !.]*$/.test(n) ? 'agradecimento' :
  /\b(menu|carta|cardapio)\b/.test(n) ? 'cardapio' : 'outro';

// ---------------------------------------------------------------------------
// Emoji: no máximo 1 por mensagem e só em cerca de 1 de cada 3 respostas.
// ---------------------------------------------------------------------------
const EMOJI_RE = /\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*/gu;
export const countEmoji = (t) => (String(t).match(EMOJI_RE) || []).length;
export const onlyEmoji = (t) => { const s = String(t || '').trim(); return !!s && !s.replace(EMOJI_RE, '').replace(/[\s‍️!?.,]+/g, ''); };
export function applyEmojiPolicy(text, sinceEmoji) {
  const count = countEmoji(text);
  if (!count) return { text, hasEmoji: false };
  let kept = 0;
  const allow = sinceEmoji >= 2; // duas respostas seguidas sem emoji liberam um emoji
  const out = String(text).replace(EMOJI_RE, (m) => (allow && kept++ === 0 ? m : ''))
    .replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]+([!?.,])/g, '$1').trim();
  return { text: out, hasEmoji: allow };
}
// Saudação pelo horário de Brasília.
export const saudacaoHorario = (min) => (min < 12 * 60 ? 'Bom dia' : min < 18 * 60 ? 'Boa tarde' : 'Boa noite');
