import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const DEFAULT_EXPENSE = ['Еда', 'Транспорт', 'Жильё', 'Здоровье', 'Развлечения', 'Покупки', 'Прочее'];
const DEFAULT_INCOME = ['Зарплата', 'Подработка', 'Подарки', 'Прочее'];

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
  ) {}

  async findAllByUser(userId: string): Promise<Category[]> {
    const list = await this.repo.find({
      where: { userId },
      order: { type: 'ASC', sortOrder: 'ASC', name: 'ASC' },
    });
    if (list.length === 0) {
      await this.seedDefaults(userId);
      return this.repo.find({
        where: { userId },
        order: { type: 'ASC', sortOrder: 'ASC', name: 'ASC' },
      });
    }
    return list;
  }

  private async seedDefaults(userId: string): Promise<void> {
    let order = 0;
    for (const name of DEFAULT_EXPENSE) {
      await this.repo.save(this.repo.create({ userId, name, type: 'expense', sortOrder: order++ }));
    }
    order = 0;
    for (const name of DEFAULT_INCOME) {
      await this.repo.save(this.repo.create({ userId, name, type: 'income', sortOrder: order++ }));
    }
  }

  async findOne(id: string, userId: string): Promise<Category> {
    const cat = await this.repo.findOne({ where: { id, userId } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    const maxOrder = await this.repo
      .createQueryBuilder('c')
      .select('MAX(c.sortOrder)', 'max')
      .where('c.userId = :userId', { userId })
      .andWhere('c.type = :type', { type: dto.type })
      .getRawOne<{ max: number }>();
    const sortOrder = (maxOrder?.max ?? -1) + 1;
    const category = this.repo.create({
      userId,
      name: dto.name,
      type: dto.type,
      icon: dto.icon ?? null,
      color: dto.color ?? null,
      sortOrder,
    });
    return this.repo.save(category);
  }

  async update(id: string, userId: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id, userId);
    if (dto.name !== undefined) category.name = dto.name;
    if (dto.type !== undefined) category.type = dto.type;
    if (dto.icon !== undefined) category.icon = dto.icon;
    if (dto.color !== undefined) category.color = dto.color;
    return this.repo.save(category);
  }

  async remove(id: string, userId: string): Promise<void> {
    const category = await this.findOne(id, userId);
    await this.repo.softRemove(category);
  }
}
