# Security Study Plan — Sprint 06

**Duração:** 7 dias (paralelo à execução das issues)
**Objetivo:** Fundamentar tecnicamente as decisões da Fase A + B antes de implementá-las
**Formato:** 1h/dia — leitura + hands-on mínimo + nota no learning-log

---

## Dia 1 — Password Hashing & Timing Attacks
**Issues relacionadas:** S06-00a, S06-00b

**Objetivos:**
- Entender bcrypt: salt, work factor (cost), por que é lento por design
- Comparar bcrypt vs argon2 vs scrypt (trade-offs reais, não marketing)
- Entender timing attack em comparação de strings e como `crypto.timingSafeEqual` resolve

**Hands-on:**
- Gerar hash com bcrypt cost 10, 12, 14 — medir tempo
- Escrever exemplo de comparação insegura vs `timingSafeEqual`

**Referências:**
- OWASP Password Storage Cheat Sheet
- npm `bcrypt` README
- Node.js `crypto.timingSafeEqual` docs

---

## Dia 2 — JWT: Assinatura, Expiração, Rotation
**Issues relacionadas:** S06-00b, #65, #66

**Objetivos:**
- Estrutura do JWT (header.payload.signature), base64url
- Algoritmos: HS256 vs RS256 — quando usar cada um
- Access token (curto) + refresh token (longo) + rotation
- Blacklist de tokens revogados (logout real)

**Hands-on:**
- Decodificar um JWT manualmente em jwt.io
- Assinar e verificar com `jsonwebtoken` HS256
- Simular token expirado

**Referências:**
- OWASP JWT Cheat Sheet
- jwt.io Introduction
- `jsonwebtoken` npm docs

---

## Dia 3 — Session Security & CSRF
**Issues relacionadas:** S06-00d, #68

**Objetivos:**
- Session fixation vs session hijacking
- Cookies: HttpOnly, Secure, SameSite (Strict/Lax/None)
- CSRF: por que tokens em localStorage são vulneráveis, por que cookies HttpOnly + SameSite + CSRF token é o padrão
- Double-submit cookie pattern

**Hands-on:**
- Inspecionar cookies de um login real (DevTools)
- Testar SameSite=Lax vs Strict em cenário cross-origin

**Referências:**
- OWASP CSRF Prevention Cheat Sheet
- OWASP Session Management Cheat Sheet
- MDN: SameSite cookies

---

## Dia 4 — Authorization: RBAC & IDOR
**Issues relacionadas:** S06-00e, S06-02, S06-03

**Objetivos:**
- RBAC: roles → permissions → resources
- Least privilege por padrão
- Function-level authorization (middleware) vs data-level (ownership check)
- IDOR: por que `/users/:id` sem checagem é a falha mais comum

**Hands-on:**
- Modelar matriz de permissões para admin/user no projeto
- Escrever pseudocódigo de middleware `requireRole('admin')`
- Identificar 3 pontos de IDOR no código atual

**Referências:**
- OWASP Authorization Cheat Sheet
- OWASP IDOR (Testing Guide)
- PortSwigger: Access Control vulnerabilities

---

## Dia 5 — Input Validation & XSS
**Issues relacionadas:** #68, S06-00d

**Objetivos:**
- Validação: whitelist vs blacklist, schema validation (zod/joi)
- XSS: stored vs reflected vs DOM-based
- Output encoding por contexto (HTML, atributo, JS, URL)
- CSP: como mitiga XSS mesmo quando encoding falha

**Hands-on:**
- Adicionar validação com zod no endpoint de login
- Injetar `<script>` em campo e ver comportamento
- Configurar CSP básico em Express

**Referências:**
- OWASP XSS Prevention Cheat Sheet
- OWASP Input Validation Cheat Sheet
- MDN: Content-Security-Policy

---

## Dia 6 — Rate Limiting, Lockout, Headers, CORS
**Issues relacionadas:** #69, S06-06

**Objetivos:**
- Rate limiting por IP vs por usuário vs por endpoint
- Account lockout: trade-off entre segurança e DoS (atacante tranca conta alheia)
- Helmet.js: quais headers protegem o quê
- CORS: preflight, credenciais, `Access-Control-Allow-Origin` dinâmico

**Hands-on:**
- Aplicar `express-rate-limit` no `/auth/login`
- Configurar Helmet e inspecionar headers
- Simular requisição CORS cross-origin

**Referências:**
- OWASP: Authentication Cheat Sheet (seção rate limiting)
- `helmet` npm docs
- MDN: CORS

---

## Dia 7 — Password Reset & Email Enumeration
**Issues relacionadas:** S06-00c

**Objetivos:**
- Fluxo seguro de reset: token aleatório, hash do token no banco, TTL curto, single-use
- Por que salvar o token em texto puro no banco é falha
- Email enumeration: resposta idêntica para email existente/inexistente
- Timing side-channel em `/forgot-password`

**Hands-on:**
- Desenhar o fluxo (RabbitMQ → consumer → nodemailer → Ethereal)
- Verificar que a resposta de `/forgot-password` é idêntica em ambos os casos

**Referências:**
- OWASP Forgot Password Cheat Sheet
- `nodemailer` + Ethereal docs
- OWASP: User Enumeration

---

## Checklist de saída

Ao final dos 7 dias, você deve conseguir responder sem consultar:
- [ ] Por que bcrypt é melhor que SHA-256 para senhas
- [ ] Diferença entre access token e refresh token
- [ ] O que SameSite=Lax previne
- [ ] Como IDOR é diferente de broken auth
- [ ] O que CSP previne que output encoding sozinho não previne
- [ ] Por que account lockout pode ser uma vulnerabilidade
- [ ] Por que o token de reset deve ser hasheado no banco
