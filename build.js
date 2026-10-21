// Gera o instalador e o portátil.  npm run build     -> só gera em dist/
//                                   npm run publicar  -> gera e publica a versão no GitHub (precisa de GH_TOKEN)
// O cache do electron-builder fica no D: porque o C: está sem espaço.
process.env.ELECTRON_BUILDER_CACHE ||= 'D:\\electron-cache\\builder';
const publish = process.argv[2] === 'publicar' ? 'always' : 'never';
if (publish === 'always' && !process.env.GH_TOKEN) {
  console.error('Falta o GH_TOKEN (token do GitHub). Veja PUBLICAR.md.');
  process.exit(1);
}
process.argv = [process.argv[0], 'electron-builder', '--win', '--publish', publish];
require('electron-builder/cli.js');
