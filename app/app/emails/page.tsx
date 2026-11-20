import { requireChatGPTUser } from "../chatgpt-auth";
import { canReadCloudMail } from "../../lib/cloud-mail-access";
import { CloudMailReader } from "../components/CloudMailReader";
export const dynamic = "force-dynamic";
export const metadata = { title: "Meus e-mails · resolvflow", description: "Seu leitor pessoal de caixas e códigos." };
export default async function Emails(){
 const user=await requireChatGPTUser("/emails"),login=user.email.trim().toLowerCase();
 return canReadCloudMail(login)?<CloudMailReader
  readerScope={user.userId+":"+login}
  providerTabs={login==="lucasbgn.affiliate@gmail.com"}
  personalPanel={true}
  workbench={["lucasbgn.affiliate@gmail.com","soaresyago-_-@hotmail.com"].includes(login)}
  quickImport={["lucasbgn.affiliate@gmail.com","henriquerbrandao06@gmail.com","soaresyago-_-@hotmail.com"].includes(login)}
 />:<main style={{padding:40}}><h1>Acesso restrito</h1><p>Este leitor não está habilitado para sua conta.</p><a href="https://resolvflow.online/">Voltar ao painel</a></main>;
}
