import nodemailer from 'nodemailer'

// Outgoing e-mail (sign-up codes). Any SMTP service works: Gmail/Google Workspace, Resend, SendGrid, Amazon SES…
// Without SMTP settings, development prints the message to the server console instead of sending it.

const smtp = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null
const FROM = process.env.MAIL_FROM ?? 'CofDesk <nao-responda@cofdesk.local>'

export const mailConfigured = () => !!smtp

export async function sendMail(to: string, subject: string, text: string, html: string) {
  if (!smtp) {
    if (process.env.NODE_ENV === 'production') throw new Error('O envio de e-mails não está configurado (SMTP_HOST).')
    console.log(`\n[e-mail para ${to}] ${subject}\n${text}\n`)
    return
  }
  await smtp.sendMail({ from: FROM, to, subject, text, html })
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function codeEmail(name: string, code: string) {
  const text = `Olá, ${name}!\n\nSeu código para criar a conta no CofDesk é: ${code}\n\nEle vale por 15 minutos. Se você não pediu, ignore este e-mail.`
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:440px;margin:0 auto;padding:32px 24px;color:#37352f">
  <div style="font-size:20px;font-weight:700;margin-bottom:24px">CofDesk</div>
  <p style="font-size:15px;line-height:1.5">Olá, ${escape(name)}! Use este código para confirmar seu e-mail e criar sua conta:</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f7f6f3;border-radius:10px;padding:16px;text-align:center;margin:20px 0">${code}</div>
  <p style="font-size:13px;color:#787774;line-height:1.5">O código vale por 15 minutos. Se você não pediu para criar uma conta, pode ignorar este e-mail.</p>
</div>`
  return { subject: `${code} é o seu código do CofDesk`, text, html }
}
