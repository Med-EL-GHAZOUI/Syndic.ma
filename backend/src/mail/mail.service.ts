import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

export interface Mail { to: string; subject: string; text: string }

/**
 * Provider-agnostic outgoing mail. `MAIL_TRANSPORT`:
 *  - `smtp`   (production) any SMTP relay: MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM
 *  - `log`    (development default) prints the message to the console — NEVER enabled in production
 *  - `memory` (tests) keeps messages in `outbox`
 * Choosing a transactional-mail provider (and its data-processing terms, hosting region, SPF/DKIM
 * setup) is a business/compliance decision (Law 09-08); this class only needs an SMTP endpoint.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  readonly outbox: Mail[] = [];
  private readonly mode: 'smtp' | 'log' | 'memory';
  private smtp: Transporter | null = null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const mode = (config.get<string>('MAIL_TRANSPORT') ?? (config.get('NODE_ENV') === 'production' ? 'smtp' : 'log')) as 'smtp' | 'log' | 'memory';
    if (config.get('NODE_ENV') === 'production' && mode !== 'smtp') throw new Error('MAIL_TRANSPORT must be "smtp" in production');
    this.mode = mode;
    this.from = config.get<string>('MAIL_FROM') ?? 'Syndic.ma <no-reply@localhost>';
    if (mode === 'smtp') {
      const host = config.get<string>('MAIL_HOST');
      if (!host) throw new Error('MAIL_HOST is required when MAIL_TRANSPORT=smtp');
      const port = Number(config.get('MAIL_PORT') ?? 587);
      this.smtp = createTransport({
        host,
        port,
        secure: port === 465, // implicit TLS on 465, STARTTLS otherwise
        requireTLS: port !== 465 && config.get('MAIL_REQUIRE_TLS') !== 'false',
        auth: config.get('MAIL_USER') ? { user: config.get<string>('MAIL_USER'), pass: config.get<string>('MAIL_PASS') } : undefined,
      });
    }
  }

  async send(mail: Mail): Promise<void> {
    if (this.mode === 'memory') {
      this.outbox.push(mail);
      return;
    }
    if (this.mode === 'log') {
      // Development convenience only: the message (including any reset link) is printed.
      this.log.warn(`[dev mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
      return;
    }
    await this.smtp!.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text });
  }
}
