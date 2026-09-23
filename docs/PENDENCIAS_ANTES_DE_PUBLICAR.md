# Pontos que precisam de resposta do responsável

Este arquivo registra **lacunas reais** dos documentos fornecidos. A solução não transforma lacunas em suposições. A primeira versão deve permanecer em **homologação** até que os itens essenciais sejam confirmados.

## Essenciais para publicar

| Prioridade | Questão objetiva | Evidência / situação atual | Comportamento de segurança já implementado |
|---|---|---|---|
| **Alta** | **Idade infantil — confirmado** | A instrução diz tanto “até 9 anos não pagam” quanto “de 9 a 11 anos R$ 54,90”; o cardápio registra infantil de 9 a 11 anos. | Confirmado: **menores de 9 anos não pagam**; de **9 a 11 anos completos pagam R$ 54,90**. |
| **Alta** | **Link de avaliação Google — fornecido** | Foi fornecida URL de rota para o Maps; não é comprovadamente URL de avaliação. | Link fornecido foi configurado em `knowledge.json`. Testar abertura em dispositivo real antes da publicação. |
| **Alta** | **A tabela de preços e a disponibilidade do PDF de 16/09 continuam iguais ao SAIPOS de hoje?** | PDF é a última base documental disponível; o responsável confirmou pratos quentes ativos em 22/09. | Itens e valores são reproduzidos exatamente como na fonte, mas alterações posteriores no PDV não são conhecidas. Conferir antes de publicar. |
| **Alta** | **Quais combos “promocionais” do PDF estão realmente vigentes?** | 6 Combos Salmão e “Combo Dia dos Namorados” têm natureza promocional. O responsável proibiu referência à promoção antiga sem especificar qual. | O responsável determinou não anunciar promoções: consultas de combos promocionais encaminham para o **botão do cardápio SAIPOS**. Os sete registros continuam bloqueados na base local, sem oferta automática. |
| **Alta** | **Existe um evento real de pedido confirmado que possa disparar avaliação?** | Não foi fornecido acesso ou webhook autorizado do SAIPOS para esse gatilho. | O código fornece `event_type=pedido_confirmado`; o ManyChat **não** deve agendar pesquisa a partir de intenção de compra. A integração desse evento requer ação operacional. |

## Novo bloco de rodízio v1.2.0

A lista principal e o grupo separado por preferência já estão implementados no webhook. Antes de publicar, peça à cozinha para confirmar que os itens cadastrados **continuam efetivamente no rodízio**, especialmente fritos/empanados, os dois sushis grelhados e os itens servidos sem arroz. Não anuncie Joy Especial (SEM ARROZ) do à la carte como incluso sem confirmação expressa. Bebidas e sobremesas permanecem cobradas separadamente. Consulte `docs/RODIZIO_GRUPOS_MANYCHAT.md`.

## Recomendáveis para melhorar precisão

| Pergunta | Por quê |
|---|---|
| Reserva com 50%: qual a **base de cálculo** (rodízio ou valor estimado da reserva), antecedência mínima, capacidade máxima e política de cancelamento? | O bot informa apenas a existência do adiantamento e encaminha à equipe. Não presume valores específicos nem confirma mesa. |
| Confirma todas as bandeiras de ticket/refeição (Ticket, VR, Alelo, Sodexo, Caju, Ben) e parcelamento? | Só estão confirmados **Ticket refeição**, Pix, débito, crédito e dinheiro; bandeiras específicas além de Ticket são encaminhadas ao humano. |
| Qual a composição oficial do **Combo Casal** e dos itens do cardápio sem descrição? | O PDF contém R$ 169,99 para Combo Casal, mas **não informa composição**. O bot não lista peças nem ingredientes inexistentes na fonte. |
| Existe raio de entrega, pedido mínimo ou taxa base fixa? | O usuário confirmou que o cliente consulta a taxa pelo endereço no SAIPOS; nenhum raio, mínimo, ETA ou valor fixo foi presumido. |
| O feriado altera horário? | Horários regulares foram fornecidos, sem calendário especial. O bot recomenda confirmar eventuais mudanças com a equipe. |
| A composição detalhada do rodízio está homologada **sem bebida e sobremesa**? | A lista interna de peças do PDF inclui títulos de bebida e sobremesa; a regra comercial expressa do responsável diz que ambos são **cobrados à parte**. O bot não promete itens internos cuja disponibilidade não foi esclarecida. |

## Informações que estão definidas e não devem ser reabertas sem motivo

- Atendimento humano: **(17) 99606-4189**.
- Currículo, vaga, emprego, entrevista e contratação: **RH (17) 99602-2567**, exclusivamente.
- Rodízio: todos os dias; individual **R$ 114,90**; casal **R$ 199,90**; infantil **R$ 54,90** conforme faixa aprovada; bebidas/sobremesas cobradas à parte.
- Pagamento: Pix, débito, crédito, dinheiro e Ticket refeição.
- Pedidos: SAIPOS com entrega e retirada; consulta de frete pelo endereço.
- Localização: Avenida 13, 657, Centro, Barretos/SP; rota Maps recebida.
- Pratos quentes: **ativos por confirmação do responsável em 22/09/2026**.
- Proibido: expor troca de proprietário, buscas pessoais por influencers/parcerias, conteúdo de promoção anterior, preços ou descrições inventados; jamais ativar IA do ManyChat.

## Como atualizar

Depois das respostas do responsável, altere **somente** o campo correspondente em `data/knowledge.json` ou o registro preciso de `data/catalogo_extraido.json`. Acrescente ou adapte testes em `tests/engine.test.mjs`. Se for um dado que aparece nos textos fixos de `lib/engine.js` (como idade infantil), atualize essa resposta e rode `npm run check`. Registre a data e a origem do dado no commit GitHub.

## Integrações iFood e 99Food — atualização 23/09/2026

O responsável confirmou que o Japa Sushi Lounge também recebe pedidos de delivery pelo **iFood** e **99Food**. As URLs diretas da loja **ainda não foram fornecidas**. Não associar automaticamente resultados de pesquisa ou restaurantes homônimos à empresa. Enquanto os links estiverem pendentes, o bot menciona ambos os aplicativos e orienta buscar o Japa Sushi Lounge em Barretos, mas oferece só os botões já validados: SAIPOS e WhatsApp.

Para liberar botões específicos, receber os links compartilhados pelas **lojas oficiais** em cada app, validar a identidade da loja e incluí-los em `links.ifood`/`links.food99` ou nas variáveis opcionais `IFOOD_STORE_URL`/`FOOD99_STORE_URL` da Vercel. Conferir preços e taxas no próprio aplicativo; não assumir igualdade entre canais. Ver `docs/ENTREGA_SAIPOS_IFOOD_99FOOD.md`.
