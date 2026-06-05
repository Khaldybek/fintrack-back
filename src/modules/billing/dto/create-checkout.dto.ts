import { IsIn, IsString } from 'class-validator';
import { PAID_PLAN_CODES } from '../../../config/plans.config';

export class CreateCheckoutDto {
  @IsString()
  @IsIn(PAID_PLAN_CODES)
  planCode: string;
}
