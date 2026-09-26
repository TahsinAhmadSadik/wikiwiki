// lib/prisma.js
import { PrismaClient } from '@prisma/client';

// Allow JSON.stringify to serialize BigInt fields as regular numbers
BigInt.prototype.toJSON = function () {
  return Number(this);
};

export const prisma = new PrismaClient();