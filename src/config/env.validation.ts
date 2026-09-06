import { IsNotEmpty, IsString, IsUrl, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  CHAPA_SECRET_KEY!: string;

  @IsUrl()
  CHAPA_BASE_URL!: string;

  @IsUrl()
  CHAPA_CALLBACK_URL!: string;

  // @IsUrl()
  // CHAPA_RETURN_URL!: string;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const environment = Object.assign(new EnvironmentVariables(), config);

  const errors = validateSync(environment, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed: ${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('; ')}`,
    );
  }

  return config;
}
