// Never return a full email in an API response — only enough to let the
// patient confirm it's their own address.
export function maskEmail(email) {
  if (!email || !email.includes('@')) return 'the email on file';
  const [name, domain] = email.split('@');
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'•'.repeat(Math.max(name.length - visible.length, 3))}@${domain}`;
}
