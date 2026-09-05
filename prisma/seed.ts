import * as bcrypt from 'bcrypt';

import {
  PrismaClient,
  UserRole,
} from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
 adapter
});

async function main() {
  // ==================================================
  // READ ADMIN CONFIGURATION
  // ==================================================

  const adminPassword =
    process.env.ADMIN_PASSWORD;

  const adminPhone =
    process.env.ADMIN_PHONE;

  if (!adminPassword || !adminPhone) {
    throw new Error(
      'ADMIN_PASSWORD and ADMIN_PHONE must be defined in .env',
    );
  }

  // ==================================================
  // READ CASHIER CONFIGURATION
  // ==================================================

  const cashierPassword =
    process.env.CASHIER_PASSWORD;

  const cashierPhone =
    process.env.CASHIER_PHONE;

  if (!cashierPassword || !cashierPhone) {
    throw new Error(
      'CASHIER_PASSWORD and CASHIER_PHONE must be defined in .env',
    );
  }

  // ==================================================
  // HASH PASSWORDS
  // ==================================================

  const adminPasswordHash =
    await bcrypt.hash(adminPassword, 12);

  const cashierPasswordHash =
    await bcrypt.hash(cashierPassword, 12);

  // ==================================================
  // CREATE / UPDATE ADMIN
  // ==================================================

  const admin =
    await prisma.user.upsert({
      where: {
        phone: adminPhone,
      },

      update: {
        fullName:
          process.env.ADMIN_FULL_NAME ??
          'Hotel Administrator',

        email:
          process.env.ADMIN_EMAIL ??
          null,

        nationalId:
          process.env.ADMIN_NATIONAL_ID ??
          'ADMIN-001',

        nationality:
          process.env.ADMIN_NATIONALITY ??
          'Ethiopian',

        passwordHash:
          adminPasswordHash,

        role: UserRole.ADMIN,

        isActive: true,
      },

      create: {
        fullName:
          process.env.ADMIN_FULL_NAME ??
          'Hotel Administrator',

        phone: adminPhone,

        email:
          process.env.ADMIN_EMAIL ??
          null,

        nationalId:
          process.env.ADMIN_NATIONAL_ID ??
          'ADMIN-001',

        nationality:
          process.env.ADMIN_NATIONALITY ??
          'Ethiopian',

        passwordHash:
          adminPasswordHash,

        role: UserRole.ADMIN,

        isActive: true,
      },
    });

  // ==================================================
  // CREATE / UPDATE CASHIER
  // ==================================================

  const cashier =
    await prisma.user.upsert({
      where: {
        phone: cashierPhone,
      },

      update: {
        fullName:
          process.env.CASHIER_FULL_NAME ??
          'Hotel Cashier',

        email:
          process.env.CASHIER_EMAIL ??
          null,

        nationalId:
          process.env.CASHIER_NATIONAL_ID ??
          'CASHIER-001',

        nationality:
          process.env.CASHIER_NATIONALITY ??
          'Ethiopian',

        passwordHash:
          cashierPasswordHash,

        role: UserRole.CASHIER,

        isActive: true,
      },

      create: {
        fullName:
          process.env.CASHIER_FULL_NAME ??
          'Hotel Cashier',

        phone: cashierPhone,

        email:
          process.env.CASHIER_EMAIL ??
          null,

        nationalId:
          process.env.CASHIER_NATIONAL_ID ??
          'CASHIER-001',

        nationality:
          process.env.CASHIER_NATIONALITY ??
          'Ethiopian',

        passwordHash:
          cashierPasswordHash,

        role: UserRole.CASHIER,

        isActive: true,
      },
    });

  console.log(
    `Admin ready: ${admin.phone}`,
  );

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