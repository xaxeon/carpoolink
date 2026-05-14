import { Router } from 'express';
import { prisma } from '@carpoolink/database';
import { requireUser } from '../middleware/requireUser.js';
import { serialize } from '../utils/serialize.js';

const router = Router();

// 클라이언트가 원하는 1:N 멘토링 상태를 파싱하는 함수
function parseMentoringStatus(status) {
    if (!status) return 'ON_AIR';
    const normalized = String(status).toUpperCase();
    return ['READY', 'ON_AIR', 'COMPLETED'].includes(normalized) ? normalized : 'ON_AIR';
}

// [GET] /mentorings/group - 1:N 멘토링 목록 조회 엔드포인트
router.get('/group', async (req, res, next) => {
    try {
        // 상태 파라미터 읽기 (기본값: ON_AIR)
        const status = parseMentoringStatus(req.query.status);

        // 조건에 맞는 멘토링 목록 조회
        const mentorings = await prisma.mentoring.findMany({
            where: {
                isGroup: true,
                status: status,
            },
            include: {
                hostMentor: {
                    include: {
                        mentorProfile: {
                            include: { fields: true },
                        }
                    }
                },
                _count: {
                    select: { participants: true },
                }
            },
            orderBy: [{ startedAt: 'desc' }, { mentoringId: 'desc' }],
        });

        // 응답 직렬화 및 전송
        res.json(
            serialize({
                mentorings: mentorings.map((mentoring) => ({
                    mentoringId: mentoring.mentoringId,
                    title: mentoring.title,
                    status: mentoring.status,
                    startedAt: mentoring.startedAt,
                    endedAt: mentoring.endedAt ?? null,
                    host: {
                        userId: mentoring.hostMentor.userId,
                        nickname: mentoring.hostMentor.nickname,
                        fields: mentoring.hostMentor.mentorProfile?.fields
                            ? mentoring.hostMentor.mentorProfile.fields.map(f => f.fieldName)
                            : [],
                    },
                    participantCount: mentoring._count.participants + 1,
                })),
            })
        );
    } catch (error) {
        next(error);
    }
});

// [GET] /mentorings/one-on-one - 내가 참여한 1:1 멘토링 목록 조회 엔드포인트
router.get('/one-on-one', requireUser, async (req, res, next) => {
    try {
        const currentUserId = req.user.userId;

        const histories = await prisma.mentoring.findMany({
            where: {
                isGroup: false,
                OR: [
                    { userId: currentUserId },
                    { participants: { some: { userId: currentUserId } } },
                ],
            },
            include: {
                hostMentor: {
                    include: {
                        mentorProfile: {
                            select: {
                                mentorId: true,
                                fields: true,
                            },
                        },
                    },
                },
                participants: {
                    include: { user: true },
                },
            },
            orderBy: [{ startedAt: 'desc' }, { mentoringId: 'desc' }],
        });

        const mentorings = histories.map((mentoring) => {
            const isHost = mentoring.userId === currentUserId;
            const counterpart = isHost
                ? mentoring.participants.find((p) => p.userId !== currentUserId)?.user
                : mentoring.hostMentor;
            const normalizedStatus = mentoring.status === 'COMPLETED' ? 'COMPLETE' : mentoring.status;
            const counterpartRole = isHost ? 'MENTEE' : 'MENTOR';

            return {
                mentoringId: mentoring.mentoringId,
                title: mentoring.title,
                status: normalizedStatus,
                rawStatus: mentoring.status,
                startedAt: mentoring.startedAt,
                endedAt: mentoring.endedAt ?? null,
                scheduledAt: mentoring.startedAt ?? mentoring.endedAt ?? null,
                counterpartName: counterpart?.nickname ?? null,
                counterpartRole,
                counterpart: counterpart
                    ? {
                        userId: counterpart.userId,
                        nickname: counterpart.nickname,
                    }
                    : null,
                host: {
                    userId: mentoring.hostMentor.userId,
                    nickname: mentoring.hostMentor.nickname,
                    mentorId: mentoring.hostMentor.mentorProfile?.mentorId ?? null,
                    fields: mentoring.hostMentor.mentorProfile?.fields
                        ? mentoring.hostMentor.mentorProfile.fields.map((f) => f.fieldName)
                        : [],
                },
            };
        });

        res.json(
            serialize({
                mentorings,
            })
        );
    } catch (error) {
        next(error);
    }
});

// [POST] /mentorings/:id/join - 멘토링 참여 기록(History) 명시적 생성
router.post('/:id/join', requireUser, async (req, res, next) => {
    try {
        const mentoringId = BigInt(req.params.id);
        const userId = req.user.userId;

        // 1. 방장인지 확인 (방장은 History 불필요)
        const mentoring = await prisma.mentoring.findUnique({ where: { mentoringId } });
        if (mentoring && Number(mentoring.userId) === Number(userId)) {
            return res.json({ success: true, isHost: true });
        }

        // 2. 멘티라면 History 확인 및 생성
        const existingHistory = await prisma.mentoringHistory.findFirst({
            where: { mentoringId, userId: BigInt(userId) },
        });

        if (!existingHistory) {
            try {
                // DB에 기록 생성 시도
                await prisma.mentoringHistory.create({
                    data: { mentoringId, userId: BigInt(userId) },
                });
            } catch (error) {
                // 중복 방지
                if (error.code === 'P2002') {
                    console.log('✅ [Join API] 방 입장 기록이 이미 생성되어 통과합니다 (Race condition 방어).');
                } else {
                    // 다른 진짜 에러라면 정상적으로 던짐
                    throw error;
                }
            }
        }

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export default router;