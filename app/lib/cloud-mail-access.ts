// Shared visibility contract; API authorization still uses authenticated identity.
// No workspace role, administrator status or client-selected storage grants access.
export const MAIL_READERS = [
  "lucasbgn.affiliate@gmail.com",
  "wendelmarques167@gmail.com",
  "henriquerbrandao06@gmail.com",
  "soaresyago-_-@hotmail.com",
];
export const canReadCloudMail = (email: unknown) => typeof email === "string" && MAIL_READERS.includes(email.trim().toLowerCase());
