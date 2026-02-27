import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => {
    const url = process.env.DATABASE_URL;
    if (url) {
      return {
        type: 'postgres',
        url,
        autoLoadEntities: true,
        synchronize: process.env.NODE_ENV === 'development',
        logging: process.env.NODE_ENV === 'development',
      };
    }
    return {
      type: 'postgres',
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
      username: process.env.POSTGRES_USER ?? 'fintrack',
      password: process.env.POSTGRES_PASSWORD ?? 'fintrack_secret',
      database: process.env.POSTGRES_DB ?? 'fintrack',
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV === 'development',
      logging: process.env.NODE_ENV === 'development',
    };
  },
);
