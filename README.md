# Cardápio digital — Aikissoba

Cardápio online da Aikissoba, com painel de administração embutido na própria página.

**Página publicada:** https://claude.ai/artifact/83tFxNo3e18tCFnkDLPRPH

- **Link do cliente:** a URL acima, limpa. Não tem nenhum vestígio do painel.
- **Link do administrador:** a mesma URL com `#admin` no fim. Pede usuário e senha.

São a mesma página: o que o administrador publica é o que o cliente passa a ver.

## Como a página se atualiza sozinha

A página guarda uma cópia do próprio modelo, em base64, dentro de
`<script type="text/plain" id="tpl">`, com dois marcadores: `__TPL__` e `__DADOS__`.
Quando o dono clica em **Publicar**, o JavaScript decodifica esse modelo, encaixa a
cópia do modelo e os dados novos, e manda o documento inteiro de volta pela API
`artifact.publish()`. A versão nova vira a página que todo mundo abre.

Por isso o código monta os marcadores em pedaços:

```js
const MARCA_TPL = "__" + "TPL" + "__";
```

Se eles aparecessem inteiros no arquivo, o `build.py` os substituiria também e a
página perderia a capacidade de se reconstruir.

Todas as fotos e o logotipo são **data URIs dentro do HTML**. Nada de arquivo
separado: o dono nunca perde imagem ao republicar.

## Quem pode alterar o cardápio

Duas camadas, e só uma delas é segurança de verdade:

1. **Acesso de edição à página** — conferido no servidor. Quem não tem, tem a
   publicação recusada, mesmo abrindo o painel. **É isso que protege o cardápio.**
2. **Usuário e senha** — guardados como resumo SHA-256 com sal, nunca em texto.
   Servem para manter o painel fora da vista de quem abrir o link de administração.
   Não são um cofre: quem lê o código-fonte vê o resumo. Quem tem acesso de edição
   pode redefinir a senha pela própria tela de entrada, caso esqueça.

## GitHub Pages

O cardápio do cliente funciona publicado aqui como página estática. **A
administração não**: fora da plataforma de artifacts não existe `artifact.publish()`,
então o botão Publicar não tem para onde salvar. Uma cópia no GitHub Pages fica
congelada no estado do último `build.py`.

Se quiser endereço próprio e administração funcionando ao mesmo tempo, o caminho é
deixar o GitHub Pages redirecionar para o link acima.

## Desenvolvimento

```bash
python build.py
```

Lê `corpo.html`, embute as fotos de `img/`, monta o modelo completo e escreve
`index.html`. Edite sempre o `corpo.html` — o `index.html` é gerado.

Origem das imagens: as fotos dos pratos e o logotipo foram recortados das cinco
artes de cardápio da casa (Yakisoba, Lámen, Porções, Especiais, Bebidas).
