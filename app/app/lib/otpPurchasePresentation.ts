export type PurchaseResult = "processing"|"awaiting_confirmation"|"delivered"|"out_of_stock"|"unavailable"|"cancelled"|"review_completed"|"unconfirmed_refunded"|"insufficient_balance";
export type PurchaseItem = {index:number;result:PurchaseResult;steps:Array<{result:PurchaseResult}>};

export function purchaseReason(code?:string) {
  switch(code){
    case "delivered":return "Entrega confirmada";
    case "out_of_stock":return "Sem estoque no fornecedor";
    case "rejected":return "Solicitação recusada";
    case "awaiting_confirmation":return "Entrega aguardando confirmação";
    case "processing":return "Solicitação em andamento";
    case "review_completed":return "Pedido encerrado";
    case "unconfirmed_refunded":return "Entrega não confirmada · pedido encerrado";
    case "cancelled":return "Novas tentativas canceladas";
    case "insufficient_balance":return "Saldo insuficiente";
    case "unavailable":return "Serviço indisponível nesta solicitação";
    default:return "Resultado ainda não confirmado";
  }
}
