# Casa — Controle Doméstico

Sistema web pra vocês dois: lista de compras com previsão, contas recorrentes,
manutenção do carro e solicitações de reparo. 100% grátis (Supabase free tier
+ GitHub Pages).

## 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com), crie conta grátis, clique em **New project**.
2. Escolha um nome, senha do banco (guarde essa senha) e região `South America (São Paulo)`.
3. Espere o projeto terminar de criar (~2 min).
4. Vá em **SQL Editor** → **New query**, cole todo o conteúdo do arquivo
   `supabase/schema.sql` deste projeto, e clique em **Run**.
5. Vá em **Project Settings** → **API**. Copie:
   - `Project URL` → isso é o `VITE_SUPABASE_URL`
   - `anon public` key → isso é o `VITE_SUPABASE_ANON_KEY`

## 2. Testar localmente (opcional, mas recomendado)

Precisa ter [Node.js](https://nodejs.org) instalado (versão 18+).

```bash
cd casa-app
cp .env.example .env
# edite o .env e cole a URL e a anon key do Supabase
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## 3. Subir pro GitHub

1. Crie um repositório novo no GitHub (ex: `casa-app`). **Pode ser privado** —
   recomendado, já que os dados de vocês dois ficam ligados a esse código.
2. No arquivo `vite.config.js`, confira se a linha `base: '/casa-app/'` bate
   com o nome do repositório. Se o repo tiver outro nome, ajuste essa linha.
3. Suba o código:

```bash
cd casa-app
git init
git add .
git commit -m "primeira versão"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/casa-app.git
git push -u origin main
```

## 4. Configurar os "segredos" no GitHub (pra build funcionar)

No repositório: **Settings → Secrets and variables → Actions → New repository secret**.
Crie dois:

- `VITE_SUPABASE_URL` → cole a Project URL do Supabase
- `VITE_SUPABASE_ANON_KEY` → cole a anon key do Supabase

## 5. Ativar o GitHub Pages

No repositório: **Settings → Pages → Build and deployment → Source → GitHub Actions**.

Pronto. O workflow (`.github/workflows/deploy.yml`) já publica automaticamente
toda vez que você der `git push` na branch `main`. Em alguns minutos o app
fica disponível em:

```
https://SEU-USUARIO.github.io/casa-app/
```

Acesse esse link no celular de cada um e adicionem à tela inicial — funciona
como um app.

## Observações importantes

- **Repositório privado é recomendado.** Se for público, qualquer pessoa que
  achar o link do site consegue ler/editar os dados (não tem login de
  verdade, só a anon key liberada por RLS). Pra uso doméstico isso é
  aceitável, mas não divulgue o link.
- **Leitura de comprovante é gratuita** (roda no navegador via Tesseract.js),
  mas é mais simples que uma IA de verdade — funciona melhor com foto nítida
  e cupom fiscal bem impresso. Sempre revise os itens antes de confirmar.
- **Identificação** é só um seletor local (Jairon / Cônjuge), sem senha. Se
  no futuro quiserem mais segurança, dá pra evoluir pra Supabase Auth.
- Pra atualizar o app depois, é só mexer no código e dar `git push` de novo —
  o deploy é automático.

## Estrutura

```
src/
  components/     → cada módulo (compras, contas, carro, reparos)
  lib/             → lógica de previsão + cliente Supabase
supabase/
  schema.sql       → schema completo do banco (rodar uma vez)
.github/workflows/ → deploy automático pro GitHub Pages
```
