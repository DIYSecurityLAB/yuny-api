import { IEmailProvider } from '../../domain/email.interfaces';
import { Email, EmailResult, EmailProvider } from '../../domain/email.entity';

export class MockEmailProvider implements IEmailProvider {
  async send(email: Email): Promise<EmailResult> {
    // Simular um pequeno delay como um provider real
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('=== MOCK EMAIL PROVIDER ===');
    console.log(`From: ${email.from || 'noreply@yuny-api.com'}`);
    console.log(`To: ${email.to}`);
    console.log(`Subject: ${email.subject}`);
    
    if (email.cc && email.cc.length > 0) {
      console.log(`CC: ${email.cc.join(', ')}`);
    }
    
    if (email.bcc && email.bcc.length > 0) {
      console.log(`BCC: ${email.bcc.join(', ')}`);
    }
    
    console.log('HTML Content:');
    console.log(email.htmlContent);
    
    if (email.textContent) {
      console.log('Text Content:');
      console.log(email.textContent);
    }
    
    if (email.attachments && email.attachments.length > 0) {
      console.log(`Attachments: ${email.attachments.length} file(s)`);
      email.attachments.forEach((attachment, index) => {
        console.log(`  ${index + 1}. ${attachment.filename} (${attachment.contentType || 'unknown'})`);
      });
    }
    
    console.log('========================');

    return {
      success: true,
      messageId: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      provider: EmailProvider.MOCK,
      timestamp: new Date(),
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  getProviderName(): string {
    return 'Mock Email Provider';
  }
}