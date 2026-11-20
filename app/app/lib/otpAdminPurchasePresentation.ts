// TOP only. Client presentation must not import supplier names or technical diagnostics.
export function providerName(provider:string) {return provider==="otpgmail"?"OTPGmail":provider==="instacaster"?"InstaCaster":"Fornecedor";}
export function purchaseReason(code?:string) {
  switch(code){
    case "delivered":return "Entrega confirmada";
    case "out_of_stock":return "Sem estoque no fornecedor";
    case "rejected":return "Solicitação recusada";
    case "confirmation_pending":return "Entrega sem confirmação";
    case "credentials_changed":return "Credencial original indisponível";
    case "review_no_delivery":return "Encerrado após conferência";
    case "cancelled":return "Novas tentativas canceladas";
    case "insufficient_balance":return "Saldo insuficiente";
    case "unavailable":return "Fornecedor indisponível";
    default:return "Resultado não informado";
  }
}
export function traceSummary(step:{provider:string;warehouse:number;code:string}) {
  return `${providerName(step.provider)}${step.provider==="otpgmail"?` · armazém ${step.warehouse}`:""} · ${purchaseReason(step.code)}`;
}
