"use client";
import { canReadCloudMail } from "../../lib/cloud-mail-access";
export function MailReaderNavLink({email,className="stories-nav-link",onNavigate}:{email?:string|null;className?:string;onNavigate?:()=>void}){
 if(!canReadCloudMail(email))return null;
 return <a href="/emails" title="E-mails" className={className} onClick={onNavigate}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg><span>E-mails</span></a>;
}
