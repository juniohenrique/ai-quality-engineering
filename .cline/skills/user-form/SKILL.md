---
name: user-form
description: Cria e refatora formularios de usuario em HTML/CSS/JS vanilla.
---

# Skill: Formulario de Usuario

## Stack

- HTML5 semantico (use `form`, `label`, `fieldset`).
- CSS moderno com custom properties.
- JavaScript vanilla com `fetch`.
- SEM frameworks (sem React, Vue, jQuery).

## Estrutura de arquivos

- HTML em `public/*.html`
- CSS em `public/css/*.css` ou `<style>` no `<head>`
- JS em `public/js/*.js` ou `public/app.js`

## Validacao

- Use a Constraint Validation API nativa (`required`, `type="email"`, `minlength`, `pattern`).
- Complemente com validacao JS para regras customizadas.
- Exiba erros abaixo do campo com `aria-describedby` e `role="alert"`.

## Acessibilidade (obrigatorio)

- Todo `input` precisa de `label for="..."`.
- Erros com `role="alert"` e `aria-describedby`.
- Estados de loading com `aria-busy="true"`.
- Botao de submit desabilitado durante o envio.

## Feedback visual

- Estados: `:focus`, `:invalid`, `:valid`, `:disabled`, `[aria-busy]`.
- Mensagens de sucesso/erro em container com `role="status"`.

## Estilizacao

- Use custom properties no `:root` para cores, espacamento e tipografia.
- Prefira `flex` e `grid` a `float` ou `position` absoluto.
- Transicoes suaves (`transition: 0.2s ease`).
- Nao use bibliotecas CSS externas sem autorizacao.
