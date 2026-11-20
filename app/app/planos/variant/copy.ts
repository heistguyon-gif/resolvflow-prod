import type { Question } from './types';

export const resources = [
  { title: 'Perfis em um painel', text: 'Consulte os perfis habilitados da sua operação.' },
  { title: 'Campanhas de Reels', text: 'Prepare campanhas com mídia própria antes de programar.' },
  { title: 'Cópia em rascunho', text: 'Duplique a estrutura de uma campanha para revisar uma nova ação.' },
  { title: 'Revisão da programação', text: 'Confira os destinos e as configurações antes da confirmação.' },
  { title: 'Estados da fila', text: 'Acompanhe a operação e identifique o que pede atenção.' },
] as const;

export const commonQuestions: Question[] = [
  { question: 'O que está sendo comparado aqui?', answer: 'Três propostas comerciais com o mesmo núcleo de campanhas. Variam a hipótese de quantidade de perfis, o período de acesso e a necessidade de dimensionamento. Ainda não são condições de contratação.' },
  { question: 'O que significa perfil ativo?', answer: 'A referência proposta é uma conexão autorizada e elegível para operar. Não é simplesmente uma conta registrada no histórico. Regras de contagem e troca ainda precisam de definição; esta prévia não aplica novas quotas.' },
  { question: 'Gmail, OTP e Resolvbot estão incluídos?', answer: 'Não. Gmail/OTP e custos de terceiros são separados. Resolvbot é outro projeto e não integra estas propostas.' },
  { question: 'Todos os recursos disponíveis para outros usuários estão incluídos?', answer: 'Não. Templates de perfil em piloto, novo visual restrito, Stories, leitor de e-mails e convites não são uma inclusão universal. A promessa comum desta apresentação se concentra em perfis habilitados, campanhas e fila.' },
  { question: 'O ResolvFlow garante publicação, alcance ou vendas?', answer: 'Não há garantia de entrega, alcance ou vendas. A execução depende de conexão, permissões e regras da plataforma. A ferramenta apresenta estados operacionais; não transforma um resultado incerto em sucesso.' },
  { question: 'Posso contratar, pagar ou cadastrar meu contato nesta página?', answer: 'Sim, nos planos com preço fechado. O botão abre o checkout Pix. Após a confirmação do pagamento, seu acesso é liberado. A demonstração de campanha acima continua com dados fictícios.' },
];

export const specificQuestions: Record<'1' | '2' | '3', Question[]> = {
  '1': [
    { question: 'A ferramenta cria os vídeos por mim?', answer: 'Esta apresentação mostra a preparação de campanhas com mídia própria. Não inclui promessa de geração automática de vídeos ou disponibilidade universal de templates.' },
    { question: 'Posso usar qualquer perfil Instagram?', answer: 'A operação depende de conta elegível, conexão e permissões. A quantidade proposta em um plano não torna qualquer perfil compatível.' },
    { question: 'Escolher um plano aqui já libera acesso?', answer: 'Não. A escolha abre apenas um resumo para comparação nesta prévia.' },
  ],
  '2': [
    { question: 'O plano de volume garante publicações simultâneas?', answer: 'Não. As faixas de perfis são hipóteses comerciais. Não representam throughput, simultaneidade ou garantia de entrega.' },
    { question: 'Um perfil que precisa de atenção será recuperado automaticamente?', answer: 'Esta apresentação não promete recuperação automática. A condição indicada precisa ser conferida; um resultado incerto não autoriza repetir a operação.' },
    { question: 'Os planos incluem equipe e aprovação dos meus clientes?', answer: 'Esses recursos não são uma inclusão pronta nesta proposta. A configuração comercial de referência é um operador e um workspace, ainda sujeita à definição das condições.' },
  ],
  '3': [
    { question: 'Preciso conectar minha conta para experimentar?', answer: 'Não. A demo funciona com dados fictícios e não pede login Instagram ou arquivos pessoais.' },
    { question: 'Terminar a demo já agenda alguma coisa?', answer: 'Não. A fila exibida pertence ao exemplo. Nenhuma publicação real é criada.' },
    { question: 'A demo garante que meus perfis serão compatíveis?', answer: 'Não. Ela explica o fluxo; a elegibilidade e as permissões dos perfis reais precisam ser verificadas separadamente.' },
  ],
};

export const footerCopy = 'ResolvFlow · Prévia para avaliação. Dados da demonstração fictícios. Propostas comerciais em validação; sem contratação, coleta de contatos ou operação real do Instagram nesta página.';
