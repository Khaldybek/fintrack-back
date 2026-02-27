import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly config: ConfigService) {
    const clientID = config.getOrThrow<string>('auth.google.clientId');
    const clientSecret = config.getOrThrow<string>('auth.google.clientSecret');
    const callbackURL = config.getOrThrow<string>('auth.google.callbackUrl');
    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { id, emails, displayName, photos } = profile;
    done(null, {
      id,
      emails: emails ?? [],
      displayName,
      photos: photos ?? [],
    });
  }
}
