"use client";

import { useRef, useState, type FormEvent } from "react";
import styles from "./AdminCreateUserForm.module.css";
import loginStyles from "./AdminLoginManager.module.css";

type LoginUser = { id: string; email: string; status: string; isPlatformOwner: boolean; canManageLogin: boolean };

export function AdminLoginManager({ user, onUpdated }: { user: LoginUser; onUpdated: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<"disabled" | "revoked" | null>(null);

  if (!user.canManageLogin) return <p>Este acesso administrativo é gerenciado pelo proprietário.</p>;

  async function save(changes: Record<string, string>) {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/users/login", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user.id, ...changes }) });
      const body = await response.json() as { error?: string; reloginRequired?: boolean; updated?: boolean };
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar o acesso.");
      setPassword(""); setConfirmation(null);
      if (body.reloginRequired) { window.location.assign("/login"); return; }
      setMessage(body.updated ? "Acesso atualizado. As sessões anteriores foram encerradas." : "Nenhuma alteração para salvar.");
      onUpdated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o acesso."); }
    finally { saveLock.current = false; setSaving(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) { setError(""); setMessage("Informe uma nova senha. A senha atual foi mantida."); return; }
    void save({ password });
  }

  return <form className={styles.form} onSubmit={submit} aria-label="Gerenciar senha e acesso">
    <div className={styles.heading}><h3>Senha e acesso</h3></div>
    <div className={styles.fields}>
      <label>Nova senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={200} autoComplete="new-password" disabled={saving} placeholder="Deixe vazio para manter a senha" /></label>
    </div>
    <p className={styles.help}>A nova senha deve ter pelo menos 10 caracteres, com letras e números. Alterações encerram as sessões existentes.</p>
    <div className={`${styles.actions} ${loginStyles.actions}`}>
      <button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar senha"}</button>
      {!user.isPlatformOwner && user.status === "active" ? <button type="button" disabled={saving} onClick={() => setConfirmation("disabled")}>Bloquear acesso</button> : null}
      {!user.isPlatformOwner && user.status !== "active" ? <button type="button" disabled={saving} onClick={() => void save({ status: "active" })}>Reativar acesso</button> : null}
      {!user.isPlatformOwner && user.status !== "revoked" ? <button type="button" disabled={saving} onClick={() => setConfirmation("revoked")}>Remover acesso</button> : null}
    </div>
    {confirmation ? <div className={loginStyles.confirmation} role="group" aria-label="Confirmar mudança de acesso"><p>{confirmation === "revoked" ? "Remover" : "Bloquear"} o acesso de {user.email}? A pessoa será desconectada e não poderá entrar. O histórico será preservado e você poderá reativar o acesso.</p><div className={`${styles.actions} ${loginStyles.actions}`}><button type="button" disabled={saving} onClick={() => setConfirmation(null)}>Cancelar</button><button type="button" disabled={saving} onClick={() => void save({ status: confirmation })}>Confirmar</button></div></div> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </form>;
}
