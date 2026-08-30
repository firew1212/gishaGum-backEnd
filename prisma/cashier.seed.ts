import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

import bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const phone =
    process.env.CASHIER_PHONE;

  const password =
    process.env.CASHIER_PASSWORD;

  const nationalId =
    process.env.CASHIER_NATIONAL_ID;

  if (
    !phone ||
    !password ||
    !nationalId
  ) {
    throw new Error(
      'CASHIER_PHONE, CASHIER_PASSWORD and CASHIER_NATIONAL_ID must be defined in .env',
    );
  }

  const passwordHash =
    await bcrypt.hash(password, 12);

  const cashier =
    await prisma.user.upsert({
      where: {
        phone,
      },

      update: {
        role: 'CASHIER',
        isActive: true,
        passwordHash,
      },

      create: {
        fullName: 'challe',
        phone,
        nationalId,
        nationality: 'Ethiopian',
        passwordHash,
        role: 'CASHIER',
        isActive: true,
      },
    });

  console.log(
    `Cashier ready: ${cashier.phone}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });