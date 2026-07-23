import { gerarPixPayload } from './src/utils/pixUtils.js';

const payload = gerarPixPayload({
  chavePix: '88998620009',
  valor: 14.90,
  nome: 'FRATELO HAMBURGUERIA',
  cidade: 'MOMBACA',
  descricao: 'QFOMEAISE3EAPFELIPE'
});

console.log('Generated PIX:', payload);
