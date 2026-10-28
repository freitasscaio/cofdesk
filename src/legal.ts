// Who is responsible for CofDesk, as shown in the Privacy Policy and Terms of Use.
// FILL IN BEFORE PUBLISHING: every value between [ ] must be replaced with real information.
// The LGPD (art. 9 and 41) requires the controller's identity and contact and the data protection
// officer's (encarregado) contact to be clearly available.

export const LEGAL = {
  /** person or company responsible for the service (controlador) */
  controller: '[Nome completo ou razão social]',
  /** CPF for an individual, CNPJ for a company */
  document: '[CPF ou CNPJ]',
  address: '[Endereço completo, cidade e UF]',
  /** where people send privacy requests and reports; must be read and answered */
  privacyEmail: '[privacidade@seu-dominio.com.br]',
  /** data protection officer (encarregado, LGPD art. 41) */
  dpo: '[Nome do encarregado pelo tratamento de dados]',
  /** where the server runs (e.g. "Amazon Web Services, região São Paulo") */
  hosting: '[Nome do provedor de hospedagem e país/região dos servidores]',
  /** who sends CofDesk's e-mails (e.g. "Resend, Inc. (EUA)") */
  emailProvider: '[Nome do provedor de envio de e-mails e país]',
  updatedAt: '28 de outubro de 2026',
}

/** Values still holding a placeholder. */
export const legalPending = () => Object.entries(LEGAL).filter(([, v]) => v.startsWith('[')).map(([k]) => k)
