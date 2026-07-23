const payload = '00020101021226330014br.gov.bcb.pix011188998620009520400005303986540514.905802BR5920FRATELO HAMBURGUERIA6007MOMBACA62230519QFOMEAISE3EAPFELIPE63040ADE';
const payloadWithoutCrc = payload.slice(0, -4);
const crc = payload.slice(-4);

function calculateCRC16(payload) {
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

console.log('Payload without CRC:', payloadWithoutCrc);
console.log('Provided CRC:', crc);
console.log('Calculated CRC:', calculateCRC16(payloadWithoutCrc));
