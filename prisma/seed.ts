import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  const nationalId = process.env.ADMIN_NATIONAL_ID;

  if (!phone || !password || !nationalId) {
    throw new Error(
      'ADMIN_PHONE, ADMIN_PASSWORD and ADMIN_NATIONAL_ID must be defined in .env',
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { phone },
    update: {
      role: 'ADMIN',
      isActive: true,
      passwordHash,
    },
    create: {
      fullName: 'System Administrator',
      phone,
      nationalId,
      nationality: 'Ethiopian',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log(`Admin ready: ${admin.phone}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });