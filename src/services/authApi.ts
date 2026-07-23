/**
 * Custom authentication API helpers
 */
export const authApi = {
  /**
   * Sends a custom activation email via the backend using Nodemailer and Gmail SMTP.
   * This replaces the native Firebase sendEmailVerification to improve deliverability.
   */
  async sendActivationEmail(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch('/api/auth/send-activation-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao enviar e-mail de ativação');
      }

      return { success: true, message: data.message };
    } catch (error: any) {
      console.error('[Auth API] Erro ao enviar email:', error);
      return { success: false, error: error.message };
    }
  }
};
