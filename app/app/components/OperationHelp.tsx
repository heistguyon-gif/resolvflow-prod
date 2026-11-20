const guides={
  accounts:{title:"Como preparar suas contas",steps:[{title:"Conecte ao Instagram",text:"Use a conexão direta e autorize o acesso à conta."},{title:"Confira o status",text:"Uma conta com pendência precisa ser revisada antes de publicar."},{title:"Escolha as contas na campanha",text:"Selecione os perfis que vão receber as publicações."}]},
  queue:{title:"Entenda o que acontece na fila",steps:[{title:"Em andamento",text:"Posts agendados e novas tentativas. A publicação respeita horário, intervalo e limite da conta."},{title:"Publicados",text:"Veja o resultado e abra a publicação quando o link estiver disponível."},{title:"Com problema",text:"Leia o motivo da falha. Corrija a conta ou a campanha antes de tentar novamente."}]},
} as const;
export function OperationHelp({page}:{page:keyof typeof guides}) {
  const guide=guides[page];
  return <details className="operation-help"><summary>{guide.title}</summary><ol>{guide.steps.map((step,index)=><li key={step.title}><span aria-hidden="true">0{index+1}</span><div><strong>{step.title}</strong><p>{step.text}</p></div></li>)}</ol></details>;
}
