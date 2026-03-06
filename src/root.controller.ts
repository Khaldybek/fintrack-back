import { Controller, Get } from '@nestjs/common';

/**
 * Handles GET / (excluded from global prefix v1) so root returns 200 instead of 404.
 */
@Controller('/')
export class RootController {
  @Get()
  root() {
    return {
      api: 'v1',
      docs: '/v1',
      health: 'ok',
    };
  }
}
