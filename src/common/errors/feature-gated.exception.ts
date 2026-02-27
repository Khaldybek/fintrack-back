import { ForbiddenException } from '@nestjs/common';

/**
 * Throw when Free plan limit is reached. Frontend uses feature_code and upgrade_hint.
 */
export class FeatureGatedException extends ForbiddenException {
  constructor(featureCode: string, upgradeHint: string) {
    super({
      statusCode: 403,
      code: 'FEATURE_GATED',
      feature_code: featureCode,
      upgrade_hint: upgradeHint,
    });
  }
}
