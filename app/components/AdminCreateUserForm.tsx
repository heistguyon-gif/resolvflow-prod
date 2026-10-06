"use client";

import { useState, type FormEvent } from "react";
import styles from "./AdminCreateUserForm.module.css";

type WorkspaceKind = "independent" | "shared";
type SharedRole = "editor" | "viewer";

export function AdminCreateUserForm({ onCreated, onCancel }: { onCreated: (email: string) => void; onCancel: () => void }) {
  const [workspaceKind, setWorkspaceKind] = useState<WorkspaceKind>("independent");
  const [role, setRole] = useState<SharedRole>("editor");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim(), email: email.trim(), password, workspaceKind,
          ...(workspaceKind === "shared" ? { role } : {}) }),
      });
      const result = await response.json() as { email?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível criar o usuário.");
      setPassword("");
      onCreated(result.email || email.trim().toLowerCase());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  return <form className={styles.form} onSubmit={(event) => void submit(event)} aria-label="Criar usuário">
    <div className={styles.heading}><div><span className="panel-kicker">Novo acesso</span><h3>Criar usuário</h3><p>A pessoa entrará com senha temporária e deverá trocá-la no primeiro login.</p></div></div>
    <div className={styles.fields}>
      <label>Tipo de conta<select value={workspaceKind} onChange={(event) => setWorkspaceKind(event.target.value as WorkspaceKind)} disabled={saving}>
        <option value="independent">Workspace independente · começa vazio</option>
        <option value="shared">Workspace compartilhado · operação atual</option>
      </select></label>
      <label>Nome<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={120} autoComplete="name" disabled={saving} /></label>
      <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoComplete="email" disabled={saving} /></label>
      <label>Senha temporária<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} maxLength={200} autoComplete="new-password" disabled={saving} /></label>
      {workspaceKind === "shared" ? <label>Papel<select value={role} onChange={(event) => setRole(event.target.value as SharedRole)} disabled={saving}>
        <option value="editor">Editor · organiza e opera</option>
        <option value="viewer">Somente leitura · consulta dados</option>
      </select></label> : <p className={styles.note}>A pessoa será dona do próprio workspace, sem dados desta operação.</p>}
    </div>
    <p className={styles.help}>Senha: pelo menos 10 caracteres, com letras e números. Apps Meta são atribuídos separadamente.</p>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <div className={styles.actions}><button type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? "Criando..." : "Criar usuário"}</button></div>
  </form>;
}
