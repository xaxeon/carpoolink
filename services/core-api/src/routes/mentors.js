import { Router } from 'express';
import { prisma } from '@carpoolink/database';
import { requireUser } from '../middleware/requireUser.js';
import { serialize } from '../utils/serialize.js';

const router = Router();

// 멘토 정보 매핑 함수
function mapMentor(mentor) {
    return {
        mentorId: mentor.mentorId,
        userId: mentor.userId,
        nickname: mentor.user.nickname,
        price: mentor.price,
        fields: mentor.fields.map((field) => field.fieldName),
        updatedAt: mentor.updatedAt,
    };
}

// 멘토 상세 정보 매핑 함수
function mapMentorDetail(mentor) {
    return {
        mentorId: mentor.mentorId,
        userId: mentor.userId,
        nickname: mentor.user.nickname,
        bio: mentor.bio,
        info: mentor.info,
        price: mentor.price,
        fields: mentor.fields.map((field) => field.fieldName),
        updatedAt: mentor.updatedAt,
    };
}

// [GET] /mentors - 전체 멘토 목록 조회
router.get('/', async (req, res, next) => {
    try {
        const mentors = await prisma.mentor.findMany({
            include: {
                user: true,
                fields: true,
            },
            orderBy: { updatedAt: 'desc' },
        });

        res.json(serialize({ mentors: mentors.map(mapMentor) }));
    } catch (error) {
        next(error);
    }
});

// [GET] /mentors/:mentorId - 특정 멘토 상세 정보 조회
router.get('/:mentorId', async (req, res, next) => {
    try {
        const mentorId = BigInt(req.params.mentorId);

        const mentor = await prisma.mentor.findUnique({
            where: { mentorId },
            include: {
                user: true,
                fields: true,
            },
        });

        if (!mentor) {
            return res.status(404).json({ message: '멘토를 찾을 수 없습니다.' });
        }

        res.json(serialize({ mentor: mapMentorDetail(mentor) }));
    } catch (error) {
        if (error instanceof SyntaxError || error instanceof RangeError) {
            return res.status(400).json({ message: '유효하지 않은 mentorId입니다.' });
        }

        next(error);
    }
});

// [POST] /mentors/:mentorId/register - 일대일 멘토링 예약
router.post('/:mentorId/register', requireUser, async (req, res, next) => {
    try {
        if (req.user.role !== 'MENTEE') {
            return res.status(403).json({ message: '멘티만 멘토링을 예약할 수 있습니다.' });
        }

        const mentorId = BigInt(req.params.mentorId);
        const menteeUserId = req.user.userId;

        const mentor = await prisma.mentor.findUnique({
            where: { mentorId },
            include: {
                user: true,
                fields: true,
            },
        });

        if (!mentor) {
            return res.status(404).json({ message: '멘토를 찾을 수 없습니다.' });
        }

        const existingReservation = await prisma.mentoring.findFirst({
            where: {
                isGroup: false,
                status: 'READY',
                userId: mentor.userId,
                participants: {
                    some: {
                        userId: menteeUserId,
                    },
                },
            },
            include: {
                hostMentor: true,
                participants: true,
            },
            orderBy: [{ startedAt: 'desc' }, { mentoringId: 'desc' }],
        });

        if (existingReservation) {
            return res.status(200).json(
                serialize({
                    mentoring: {
                        mentoringId: existingReservation.mentoringId,
                        title: existingReservation.title,
                        status: existingReservation.status,
                        startedAt: existingReservation.startedAt,
                        endedAt: existingReservation.endedAt ?? null,
                        host: {
                            userId: mentor.userId,
                            nickname: mentor.user.nickname,
                            fields: mentor.fields.map((field) => field.fieldName),
                        },
                    },
                    created: false,
                })
            );
        }

        const result = await prisma.$transaction(async (tx) => {
            const mentoring = await tx.mentoring.create({
                data: {
                    title: `${mentor.user.nickname} 님과의 1:1 멘토링`,
                    isGroup: false,
                    status: 'READY',
                    isScriptPublished: false,
                    userId: mentor.userId,
                },
            });

            await tx.mentoringHistory.create({
                data: {
                    mentoringId: mentoring.mentoringId,
                    userId: menteeUserId,
                },
            });

            return mentoring;
        });

        return res.status(201).json(
            serialize({
                mentoring: {
                    mentoringId: result.mentoringId,
                    title: result.title,
                    status: result.status,
                    startedAt: result.startedAt,
                    endedAt: result.endedAt ?? null,
                    host: {
                        userId: mentor.userId,
                        nickname: mentor.user.nickname,
                        fields: mentor.fields.map((field) => field.fieldName),
                    },
                },
                created: true,
            })
        );
    } catch (error) {
        if (error instanceof SyntaxError || error instanceof RangeError) {
            return res.status(400).json({ message: '유효하지 않은 mentorId입니다.' });
        }

        next(error);
    }
});

export default router;