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

// [GET] /mentorings/one-on-one - 1:1 멘토링 상대 목록 조회 엔드포인트
router.get('/one-on-one', requireUser, async (req, res, next) => {
    try {
        const peers = new Map();
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

        for (const mentoring of histories) {
            const isHost = mentoring.userId === currentUserId;
            const peerInfo = isHost
                ? mentoring.participants.find((p) => p.userId !== currentUserId)?.user
                : mentoring.hostMentor;

            if (peerInfo && !peers.has(peerInfo.userId.toString())) {
                peers.set(peerInfo.userId.toString(), {
                    userId: peerInfo.userId,
                    nickname: peerInfo.nickname,
                    mentorId: isHost ? null : mentoring.hostMentor.mentorProfile?.mentorId ?? null,
                    fields: mentoring.hostMentor.mentorProfile?.fields
                        ? mentoring.hostMentor.mentorProfile.fields.map(f => f.fieldName)
                        : [],
                });
            }
        }

        res.json(
            serialize({
                peers: Array.from(peers.values()),
            })
        );
    } catch (error) {
        next(error);
    }
});

export default router;