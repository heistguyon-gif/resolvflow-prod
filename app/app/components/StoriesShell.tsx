"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { MailReaderNavLink } from "./MailReaderNavLink";
import styles from "./StoriesShell.module.css";

const links = [
  { href: "/", name: "Visão geral", path: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
  { href: "/contas", name: "Contas", path: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0" },
  { href: "/campanhas", name: "Campanhas", path: "m3 11 18-5v12L3 13zM7 14l2 7h4l-2-6" },
  { href: "/fila", name: "Fila", path: "M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01" },
  { href: "/stories", name: "Stories e destaques", path: "M12 3a9 9 0 1 1-9 9M3 7V3h4M9 8l7 4-7 4z" },
];
export function StoriesShell({ children, name, role, owner, email }: { children: ReactNode; name: string; role: string; owner: boolean; email?:string }) {
  const [open, setOpen] = useState(false);
  return <div className={`app-shell ${styles.shell}`}>
    <a className="skip-link" href="#stories-content">Ir para o conteúdo</a>
    {open && <button className="mobile-nav-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? "mobile-open" : ""}`}>
      <button className="mobile-sidebar-close" aria-label="Fechar menu" onClick={() => setOpen(false)}>×</button>
      <Link className="brand" href="/"><span>resolv<strong>flow</strong></span></Link>
      <div className="workspace-switcher"><span className="workspace-avatar">{name.slice(0, 2).toUpperCase()}</span><span><small>Espaço de trabalho</small><strong>{name}</strong></span></div>
      <nav aria-label="Navegação principal"><span className="nav-label">Operação</span>{links.map(link => <Link key={link.href} href={link.href} className={`${styles.navLink} ${link.href === "/stories" ? styles.active : ""}`} aria-current={link.href === "/stories" ? "page" : undefined}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={link.path}/></svg><span>{link.name}</span></Link>)}<MailReaderNavLink email={email} className={styles.navLink} onNavigate={()=>setOpen(false)}/></nav>
      <div className="sidebar-footer"><span className="mini-avatar">{name.slice(0, 2).toUpperCase()}</span><span><strong>{name}</strong><small>{role === "owner" ? "Proprietário" : role === "editor" ? "Editor" : "Somente leitura"}</small></span></div>
    </aside>
    <div className={styles.main}><header className={styles.topbar}><button type="button" className="outline-button" aria-label="Abrir menu" onClick={() => setOpen(true)}>☰</button><span>Operação / <strong>Stories e destaques</strong></span>{owner && <Link href="https://top.resolvflow.online/admin?view=stories">Gerenciar no TOP ↗</Link>}</header><div id="stories-content" className={styles.content}>{children}</div></div>
  </div>;
}
