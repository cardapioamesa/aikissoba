# Cardápio digital — Aikissoba

Cardápio online da Aikissoba, feito pelo **Cardápio à Mesa**. O cliente abre pelo
QR Code da mesa ou pelo link da bio; o dono atualiza pelo celular, na
**Área do dono**, com e-mail e senha.

**Endereço:** https://cardapioamesa.github.io/aikissoba/

## Como funciona

A página é estática (GitHub Pages) e busca o cardápio no **Firebase Firestore**.
O dono entra com e-mail e senha do **Firebase Auth**, edita no painel e clica em
**Publicar**: a mudança vai para o banco e aparece na hora para quem está com o
cardápio aberto.

| Arquivo | O que é |
|---|---|
| `index.html` | A página: estilo e estrutura |
| `app.js` | Lê o cardápio, desenha a página, painel do dono e publicação |
| `config.js` | Qual restaurante e qual projeto do Firebase |
| `firestore.rules` | Quem pode ler e escrever — colar no console do Firebase |
| `semear.html` + `semente.js` | Carga inicial do cardápio no banco (uma vez, pelo administrador) |
| `gerar_semente.py` | Gera o `semente.js` a partir das fotos em `img/` |

### Onde ficam os dados

```
restaurantes/aikissoba                 textos, seções, logo         leitura pública
restaurantes/aikissoba/itens/{id}      um prato por documento       leitura pública
restaurantes/aikissoba/privado/acesso  e-mails de quem pode editar  só dono e administrador
```

As fotos ficam dentro do próprio documento do prato, já comprimidas (a maior tem
uns 30 KB; o limite do Firestore é 1 MB por documento). Isso evita o Cloud
Storage, que em projeto novo exige o plano pago.

## Ao publicar uma mudança no código

O GitHub Pages manda o navegador guardar os arquivos por 10 minutos. Ao mexer
em `app.js` ou `config.js`, **suba o número de versão** nos `<script>` do
`index.html` (`app.js?v=2` → `app.js?v=3`): com o endereço novo, o navegador
baixa o arquivo de novo na hora. Mudanças feitas pelo painel do dono não
precisam disso — elas vêm do banco.

## Segurança

- Quem confere a senha é o servidor do Google, não a página.
- Quem pode gravar é decidido pelas **regras do Firestore**, no servidor: só os
  e-mails da lista `privado/acesso` daquele restaurante, e o administrador.
  Mesmo que alguém abra o painel mexendo no código, o banco recusa a gravação.
- Os e-mails dos donos ficam num documento que ninguém de fora consegue ler.
- O `config.js` **não é segredo**: identifica o projeto, como em qualquer site
  que usa Firebase.
- A criação de conta pelo próprio usuário fica **desligada** no console: só
  existem as contas que o administrador cadastra.
- Nenhum dado pessoal entra neste repositório (ele é público). O administrador é
  identificado nas regras pelo UID, um código opaco do Firebase.

## Novo restaurante

1. Novo repositório na organização, com o nome do restaurante (`pizzaria-do-ze`).
2. Copiar estes arquivos, trocar `restaurante` no `config.js` e as fotos em `img/`.
3. Configurar a autoria só naquele repositório, antes do primeiro commit:
   `git config --local user.name "Cardápio à Mesa"` e
   `git config --local user.email "cardapioamesa@users.noreply.github.com"`.
4. Gerar o `semente.js`, publicar e carregar pelo `semear.html`.
5. Cadastrar o login do dono no console e colocar o e-mail dele na carga.

O mesmo projeto do Firebase atende todos os restaurantes: as regras separam um
do outro pelo nome.
