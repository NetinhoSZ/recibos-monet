# Como publicar uma versão nova

Quem instalou pelo instalador recebe a versão nova sozinho: ao abrir o app, ele baixa
em segundo plano e mostra **"Reiniciar e atualizar"**.

## Uma vez só: criar o token do GitHub

1. GitHub → foto → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Nome: `recibos-monet`. Validade: a que preferir.
3. **Repository access** → *Only select repositories* → `recibos-monet`.
4. **Permissions** → *Repository permissions* → **Contents: Read and write**.
5. Gere e copie o token.
6. No PowerShell, guarde no Windows (troque `SEU_TOKEN`):

   ```powershell
   setx GH_TOKEN "SEU_TOKEN"
   ```

   Feche e abra o terminal de novo para valer.

## A cada versão nova

1. Faça as mudanças no código.
2. Em `package.json`, aumente `"version"` (ex.: `1.1.0` → `1.2.0`). **Sem isso ninguém recebe a atualização.**
3. Salve no GitHub:

   ```bash
   git add -A
   git commit -m "Versão 1.2.0: o que mudou"
   git push
   ```

4. Gere e publique:

   ```bash
   npm run publicar
   ```

   Isso cria a versão em [Releases](https://github.com/NetinhoSZ/recibos-monet/releases) com o
   instalador, o portátil e o `latest.yml` (o arquivo que os apps consultam).

Pronto. Na próxima vez que cada pessoa abrir o app, a atualização chega.

## Observações

- `npm run build` só gera os arquivos em `dist/`, sem publicar.
- O build usa o cache em `D:\electron-cache` (o C: está sem espaço) — ajuste em `build.js` se mudar.
- Erros da checagem de atualização ficam em `dados-app/atualizacao.log` (instalado: `%APPDATA%\Recibos Monet`).
