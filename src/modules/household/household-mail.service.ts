import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class HouseholdMailService {
  constructor(private readonly config: ConfigService) {}

  async sendInviteEmail(params: {
    to: string;
    householdName: string;
    role: string;
    acceptLink: string;
  }): Promise<boolean> {
    const smtp = this.config.get<{
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      from: string;
    }>('auth.smtp');
    const configured = Boolean(smtp?.host && smtp?.user && smtp?.pass && params.acceptLink);

    if (!configured) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[HouseholdMail] invite link for ${params.to}: ${params.acceptLink}`);
      }
      return false;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtp!.host,
        port: smtp!.port,
        secure: smtp!.secure,
        auth: { user: smtp!.user, pass: smtp!.pass },
      });
      await transporter.sendMail({
        from: smtp!.from,
        to: params.to,
        subject: `Приглашение в семью «${params.householdName}» — FinTrack`,
        text:
          `Вас пригласили в семейный бюджет «${params.householdName}» с ролью ${params.role}.\n\n` +
          `Перейдите по ссылке (действует 7 дней):\n${params.acceptLink}\n\n` +
          `Если у вас ещё нет аккаунта FinTrack — зарегистрируйтесь с этим email, затем откройте ссылку снова.`,
        html:
          `<p>Вас пригласили в семейный бюджет <strong>${params.householdName}</strong> ` +
          `(роль: ${params.role}).</p>` +
          `<p><a href="${params.acceptLink}">Принять приглашение</a></p>` +
          `<p>Ссылка действует 7 дней. Если аккаунта нет — зарегистрируйтесь с этим email и откройте ссылку снова.</p>`,
      });
      return true;
    } catch (err) {
      console.error(
        '[HouseholdMail] Failed to send invite:',
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  }
}
