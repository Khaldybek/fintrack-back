import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { CreateTransactionTemplateDto } from './dto/create-template.dto';
import { SetSplitsDto } from './dto/set-splits.dto';
import { VoiceParseDto } from './dto/voice-parse.dto';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('voice-parse')
  voiceParse(@Body() dto: VoiceParseDto) {
    return this.transactionsService.voiceParse(dto.text);
  }

  @Post('receipt-ocr')
  @UseInterceptors(FileInterceptor('file'))
  receiptOcr(@UploadedFile() file: Express.Multer.File) {
    return this.transactionsService.receiptOcr(file);
  }

  @Get('templates')
  getTemplates(@CurrentUser() user: User) {
    return this.transactionsService.findAllTemplates(user.id);
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateTransactionTemplateDto, @CurrentUser() user: User) {
    return this.transactionsService.createTemplate(user.id, dto);
  }

  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string, @CurrentUser() user: User) {
    await this.transactionsService.deleteTemplate(id, user.id);
    return { success: true };
  }

  @Get()
  findAll(@CurrentUser() user: User, @Query() query: QueryTransactionsDto) {
    return this.transactionsService.findAllByUser(user.id, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.transactionsService.findOneResponse(id, user.id);
  }

  @Post()
  create(@Body() dto: CreateTransactionDto, @CurrentUser() user: User) {
    return this.transactionsService.create(user.id, dto);
  }

  @Post(':id/splits')
  setSplits(
    @Param('id') id: string,
    @Body() dto: SetSplitsDto,
    @CurrentUser() user: User,
  ) {
    return this.transactionsService.setSplits(id, user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
    @CurrentUser() user: User,
  ) {
    return this.transactionsService.update(id, user.id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    await this.transactionsService.remove(id, user.id);
    return { success: true };
  }
}
