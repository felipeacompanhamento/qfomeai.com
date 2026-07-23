/**
 * Função utilitária para formatar os campos no padrão ID + Tamanho + Valor
 */
function campo(id: string, valor: string): string {
  const tamanho = valor.length.toString().padStart(2, "0");
  return id + tamanho + valor;
}

/**
 * Remove acentos, caracteres especiais e limita a 25 caracteres
 * Usado para TXID
 */
function removerEspacosECaracteres(texto: string): string {
  if (!texto) return '';
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9_]/gi, "")
    .toUpperCase()
    .substring(0, 25);
}

/**
 * Normaliza texto para Nome e Cidade
 */
function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/gi, "")
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();
}

/**
 * Cálculo do CRC16 (CCITT-FALSE)
 */
function calculateCRC16(payload: string): string {
  let crc = 0xFFFF;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface PixParams {
  chavePix: string;
  valor: number;
  nome: string;
  cidade: string;
  descricao?: string;
}

/**
 * Valida se uma string é um CPF válido
 */
function isValidCPF(cpf: string): boolean {
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
  const values = cpf.split('').map(el => parseInt(el));
  const rest = (count: number) => (values.slice(0, count - 12).reduce((soma, el, index) => (soma + el * (count - index)), 0) * 10) % 11 % 10;
  return rest(10) === values[9] && rest(11) === values[10];
}

/**
 * Formata a chave PIX corretamente.
 * Chaves de telefone PRECISAM começar com +55. Se o usuário digitar apenas os números, o banco rejeita por "tamanho inválido".
 */
function formatarChavePix(chave: string): string {
  const limpa = chave.trim();
  
  // Se for email ou chave aleatória (UUID), retorna como está
  if (limpa.includes('@') || limpa.includes('-')) {
    return limpa;
  }
  
  // Remove tudo que não for número ou '+'
  const apenasNumeros = limpa.replace(/[^\d+]/g, '');
  
  // Se tem 11 dígitos numéricos e não começa com +, pode ser CPF ou Celular
  if (/^\d{11}$/.test(apenasNumeros)) {
    // Se não for um CPF válido, assumimos que é um número de celular sem o +55
    if (!isValidCPF(apenasNumeros)) {
      return '+55' + apenasNumeros;
    }
  }
  
  // Se tem 12 ou 13 dígitos numéricos e não começa com +, assumimos que é celular com DDI mas sem o +
  if (/^\d{12,13}$/.test(apenasNumeros) && !apenasNumeros.startsWith('+')) {
     return '+' + apenasNumeros;
  }
  
  return apenasNumeros || limpa;
}

/**
 * Gera PIX Copia e Cola válido
 */
export function gerarPixPayload(dados: PixParams): string {
  const { chavePix, valor, nome, cidade, descricao = '' } = dados;

  // 🔐 Sanitizar e formatar chave PIX
  const chaveFormatada = formatarChavePix(chavePix);

  // 🧩 Campo 26
  const gui = campo("00", "br.gov.bcb.pix");
  const chave = campo("01", chaveFormatada);
  
  // 📝 Info Adicional (Campo 26, subcampo 02) - Permite espaços
  let infoAdicional = "";
  if (descricao) {
    const descLimpa = normalizeText(descricao).substring(0, 70);
    if (descLimpa) {
      infoAdicional = campo("02", descLimpa);
    }
  }
  
  const merchantAccount = campo("26", gui + chave + infoAdicional);

  // 🧾 TXID (Campo 62, subcampo 05)
  // O Banco Central exige que o TXID não tenha espaços. 
  // Como movemos a descrição para o Info Adicional, usamos "***" (padrão para sem TXID)
  const txid = "***";
  const additionalData = campo("62", campo("05", txid));

  // 🏪 Nome e Cidade
  const nomeLimpo = normalizeText(nome).substring(0, 25) || 'NOME';
  const cidadeLimpa = normalizeText(cidade).substring(0, 15) || 'CIDADE';

  // 💰 Valor (somente se maior que zero)
  const valorFormatado = valor.toFixed(2);
  const valorCampo = valor > 0 ? campo("54", valorFormatado) : '';

  // 🧱 Payload
  const payload =
    campo("00", "01") +
    campo("01", "12") +
    merchantAccount +
    campo("52", "0000") +
    campo("53", "986") +
    valorCampo +
    campo("58", "BR") +
    campo("59", nomeLimpo) +
    campo("60", cidadeLimpa) +
    additionalData +
    "6304";

  // 🔐 CRC
  const crc = calculateCRC16(payload);

  return payload + crc;
}

/**
 * Wrapper para uso simples
 */
export function gerarPix(
  pixKey: string,
  amount: number,
  merchantName: string,
  merchantCity: string,
  description: string
): string {
  return gerarPixPayload({
    chavePix: pixKey,
    valor: amount,
    nome: merchantName,
    cidade: merchantCity,
    descricao: description
  });
}