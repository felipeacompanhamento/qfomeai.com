import nodemailer from 'nodemailer';
import { logger } from './logger';

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "qfomeai.com@gmail.com",
    pass: "cebd xwdd zrxe kdmf"
  }
});

export async function sendActivationEmail(email: string, link: string) {
  await new Promise(resolve => setTimeout(resolve, 600));

  const mailOptions = {
    from: '"QFomeai" <qfomeai.com@gmail.com>',
    to: email,
    subject: "Confirme seu cadastro no QFomeai",
    text: `
Confirmação de cadastro

Recebemos seu cadastro no QFomeai.

Acesse o link para ativar sua conta:
${link}

Se não foi você, ignore este e-mail.
    `,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; color: #333; line-height: 1.6;">
        <h2 style="color: #059669; font-size: 24px; margin-bottom: 20px;">Olá!</h2>
        <p style="font-size: 16px;">Tudo bem? Recebemos sua solicitação de cadastro no <strong>QFomeai</strong>.</p>
        <p style="font-size: 16px;">Para confirmar e ativar sua conta com total segurança, clique no botão abaixo:</p>
        
        <div style="text-align: center; margin: 40px 0;">
          <a href="${link}" style="background-color: #059669; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(5, 150, 105, 0.1);">
            Confirmar meu cadastro
          </a>
        </div>
        
        <p style="font-size: 14px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
          Se o botão acima não funcionar, você pode copiar e colar o link abaixo no seu navegador:
        </p>
        <p style="font-size: 12px; color: #059669; word-break: break-all; background-color: #f0fdf4; padding: 10px; border-radius: 6px;">
          ${link}
        </p>
        
        <p style="font-size: 14px; color: #999; margin-top: 30px;">
          Se você não realizou esse cadastro, pode desconsiderar esta mensagem com segurança.
        </p>
        
        <p style="font-size: 16px; margin-top: 40px; font-weight: 500;">
          Atenciosamente,<br>
          <span style="color: #059669;">Equipe QFomeai</span>
        </p>
      </div>
    `,
    headers: {
      "X-Mailer": "QFome AI System",
      "X-Priority": "3",
      "List-Unsubscribe": "mailto:qfomeai.com@gmail.com"
    }
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.debug(`Email de ativação enviado com sucesso (MessageID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    logger.error("Erro ao enviar email de ativação:", { error: error.message });
    throw error;
  }
}

export async function sendStatusUpdateEmail(email: string, title: string, body: string) {
  const mailOptions = {
    from: '"QFomeai" <qfomeai.com@gmail.com>',
    to: email,
    subject: `Atualização: ${title}`,
    text: body,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; color: #333; line-height: 1.6;">
        <h2 style="color: #059669; font-size: 24px; margin-bottom: 20px;">${title}</h2>
        <p style="font-size: 16px;">${body}</p>
        <p style="font-size: 16px; margin-top: 40px; font-weight: 500;">
          Atenciosamente,<br>
          <span style="color: #059669;">Equipe QFomeai</span>
        </p>
      </div>
    `,
    headers: {
      "X-Mailer": "QFome AI System",
      "X-Priority": "3",
      "List-Unsubscribe": "mailto:qfomeai.com@gmail.com"
    }
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.debug(`Email de status enviado com sucesso (MessageID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    logger.error("Erro ao enviar email de status:", { error: error.message });
  }
}
