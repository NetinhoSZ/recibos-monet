# Recibos Monet

Gerador de recibos da Monet Creative (app de Windows feito em Electron).

- Monta o recibo com os produtos cadastrados e salva em PNG ou PDF.
- **Pix**: QR Code estático com o valor total, gerado no próprio app.
- **Cartão**: link de pagamento do Mercado Pago (Checkout Pro), com QR Code e botão no recibo.
  O Access Token fica só no computador de quem usa, cifrado pelo Windows (`dados-app/mercadopago.key`).
- **Atualização automática**: a versão instalada confere as versões publicadas aqui no GitHub,
  baixa sozinha e oferece "Reiniciar e atualizar". A versão portátil só avisa e leva ao download.

## Baixar

Última versão em [Releases](https://github.com/NetinhoSZ/recibos-monet/releases/latest):
`Recibos-Monet-Instalador-x.y.z.exe` (recomendado, se atualiza sozinho) ou `Recibos-Monet-Portatil-x.y.z.exe`.

## Desenvolver

```bash
npm install
npm start
```

Como publicar uma versão nova: veja [PUBLICAR.md](PUBLICAR.md).
