import { prisma } from "@carpoolink/database"

//const prisma = new PrismaClient();

/**
 * @param {{ text: string, chunkIndex: number, startTime?: number, endTime?: number }} chunk
 * @param {{ userId: bigint, mentoringId: bigint }} meta
 */
export async function saveScript(
  { text, chunkIndex, startTime, endTime, isPrivate = false, sessionOffset },
  { userId, mentoringId }
) {
  return await prisma.script.create({
    data: {
      content: {
        chunkIndex,
        text,
        startTime: startTime ?? null,
        endTime: endTime ?? null,
        sessionOffset: sessionOffset ?? null,
      },
      isPrivate,
      userId: BigInt(userId),
      mentoringId: BigInt(mentoringId),
    },
  });
}