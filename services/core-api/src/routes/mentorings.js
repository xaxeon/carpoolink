import { Router } from 'express';
import { prisma } from '@carpoolink/database';
import { requireUser } from '../middleware/requireUser.js';
import { serialize } from '../utils/serialize.js';
import { emitQuestionEvent } from '../lib/questionEventBridge.js';

const router = Router();

// 클라이언트가 원하는 1:N 멘토링 상태를 파싱하는 함수
function parseMentoringStatus(status) {
    if (!status) return 'ON_AIR';
    const normalized = String(status).toUpperCase();
    return ['READY', 'ON_AIR', 'COMPLETED'].includes(normalized) ? normalized : 'ON_AIR';
}

function parseQuestionStatus(status) {
    if (!status) return undefined;
    const normalized = String(status).toUpperCase();
    return ['BEFORE', 'ANSWERING', 'COMPLETED'].includes(normalized) ? normalized : 'BEFORE';
}

function parseBigIntId(value) {
    try {
        if (value === undefined || value === null || value === '') {
            return null;
        }

        return BigInt(value);
    } catch {
        return null;
    }
}

function isNonEmptyString(value) {
    return typeof value === 'string' && Boolean(value.trim());
}

function mapQuestion(question) {
    return {
        questionId: question.questionId,
        mentoringId: question.mentoringId,
        content: question.content,
        isPaid: question.isPaid,
        isPrivate: question.isPrivate,
        priorityScore: question.priorityScore,
        status: question.status,
        createdAt: question.createdAt,
        answerContent: question.answerContent ?? null,
        answeredAt: question.answeredAt ?? null,
        user: question.user
            ? {
                userId: question.user.userId,
                nickname: question.user.nickname,
            }
            : null,
        answerer: question.answerer
            ? {
                userId: question.answerer.userId,
                nickname: question.answerer.nickname,
            }
            : null,
    };
}

async function findAccessibleMentoring(mentoringId, currentUserId) {
    return prisma.mentoring.findFirst({
        where: {
            mentoringId,
            OR: [
                { userId: currentUserId },
                {
                    participants: {
                        some: { userId: currentUserId },
                    },
                },
            ],
        },
        include: {
            hostMentor: {
                select: {
                    userId: true,
                    nickname: true,
                },
            },
        },
    });
}

async function findMentoringForHost(mentoringId, hostUserId) {
    return prisma.mentoring.findFirst({
        where: {
            mentoringId,
            userId: hostUserId,
        },
        select: {
            mentoringId: true,
            userId: true,
            status: true,
            title: true,
        },
    });
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

// [GET] /mentorings/:id/questions - 멘토링 내의 질문 목록 조회
router.get('/:id/questions', requireUser, async (req, res, next) => {
    try {
        const mentoringId = parseBigIntId(req.params.id);
        const status = parseQuestionStatus(req.query.status);

        if (!mentoringId) {
            return res.status(400).json({ message: '유효하지 않은 mentoringId입니다.' });
        }

        if (req.user.role === 'MENTEE') {
            return res.status(403).json({ message: '멘티는 질문 목록을 조회할 수 없습니다.' });
        }

        const mentoring = await findAccessibleMentoring(mentoringId, req.user.userId);
        if (!mentoring) {
            return res.status(404).json({ message: '멘토링을 찾을 수 없거나 접근 권한이 없습니다.' });
        }

        const questions = await prisma.question.findMany({
            where: {
                mentoringId: mentoringId,
                status: status
            },
            include: {
                user: {
                    select: {
                        userId: true,
                        nickname: true,
                    },
                },
                answerer: {
                    select: {
                        userId: true,
                        nickname: true,
                    },
                },
            },
            orderBy: [
                { createdAt: 'asc' },
                { questionId: 'asc' },
            ],
        });

        return res.json(
            serialize({
                mentoring: {
                    mentoringId: mentoring.mentoringId,
                    title: mentoring.title,
                    status: mentoring.status,
                    host: mentoring.hostMentor,
                },
                questions: questions.map(mapQuestion),
            })
        );
    } catch (error) {
        next(error);
    }
});

// [POST] /mentorings/:id/questions - 유료 질문 등록
router.post('/:id/questions', requireUser, async (req, res, next) => {
    try {
        if (req.user.role !== 'MENTEE') {
            return res.status(403).json({ message: '멘티만 질문을 등록할 수 있습니다.' });
        }

        const mentoringId = parseBigIntId(req.params.id);
        if (!mentoringId) {
            return res.status(400).json({ message: '유효하지 않은 mentoringId입니다.' });
        }

        if (!req.body?.isPaid) {
            return res.status(400).json({ message: '무료 질문은 등록할 수 없습니다.' });
        }

        const content = isNonEmptyString(req.body?.content) ? req.body.content.trim() : '';
        if (!content) {
            return res.status(400).json({ message: '질문 내용이 필요합니다.' });
        }

        if (content.length > 200) {
            return res.status(400).json({ message: '질문은 최대 200자까지 입력할 수 있습니다.' });
        }

        const isPaid = Boolean(req.body?.isPaid);
        const isPrivate = req.body?.isPrivate === undefined ? false : Boolean(req.body.isPrivate);

        const mentoring = await prisma.mentoring.findFirst({
            where: {
                mentoringId,
                status: 'ON_AIR',
                participants: {
                    some: { userId: req.user.userId },
                },
            },
            select: {
                mentoringId: true,
                title: true,
                status: true,
                userId: true,
            },
        });

        if (!mentoring) {
            return res.status(404).json({ message: '질문을 등록할 수 있는 멘토링을 찾을 수 없습니다.' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const menteeProfile = await tx.mentee.findUnique({
                where: { userId: req.user.userId },
                select: { balance: true },
            });

            if (!menteeProfile) {
                return {
                    error: {
                        status: 404,
                        message: '멘티 프로필을 찾을 수 없습니다.',
                    },
                };
            }

            if (isPaid) {
                if (menteeProfile.balance < 1) {
                    return {
                        error: {
                            status: 400,
                            message: '보유한 질문권이 부족합니다.',
                        },
                    };
                }

                const updatedBalance = await tx.mentee.updateMany({
                    where: {
                        userId: req.user.userId,
                        balance: { gte: 1 },
                    },
                    data: {
                        balance: {
                            decrement: 1,
                        },
                    },
                });

                if (updatedBalance.count === 0) {
                    return {
                        error: {
                            status: 400,
                            message: '보유한 질문권이 부족합니다.',
                        },
                    };
                }
            }

            const question = await tx.question.create({
                data: {
                    content,
                    isPaid,
                    isPrivate,
                    userId: req.user.userId,
                    mentoringId,
                    status: 'BEFORE',
                },
                include: {
                    user: {
                        select: {
                            userId: true,
                            nickname: true,
                        },
                    },
                    answerer: {
                        select: {
                            userId: true,
                            nickname: true,
                        },
                    },
                },
            });

            const refreshedBalance = isPaid
                ? await tx.mentee.findUnique({
                    where: { userId: req.user.userId },
                    select: { balance: true },
                })
                : menteeProfile;

            return {
                question,
                balance: refreshedBalance?.balance ?? 0,
            };
        });

        if (result.error) {
            return res.status(result.error.status).json({ message: result.error.message });
        }

        await emitQuestionEvent({
            mentoringId,
            event: 'question:registered',
            payload: {
                question: mapQuestion(result.question),
                balance: result.balance,
            },
        });

        return res.status(201).json(
            serialize({
                question: mapQuestion(result.question),
                balance: result.balance,
            })
        );
    } catch (error) {
        next(error);
    }
});

// [POST] /mentorings/:id/questions/:questionId/acknowledge - 멘토 질문 확인(질문 답변 시작할 때 호출)
router.post('/:id/questions/:questionId/acknowledge', requireUser, async (req, res, next) => {
    try {
        if (req.user.role !== 'MENTOR') {
            return res.status(403).json({ message: '멘토만 질문을 확인할 수 있습니다.' });
        }

        const mentoringId = parseBigIntId(req.params.id);
        const questionId = parseBigIntId(req.params.questionId);

        if (!mentoringId || !questionId) {
            return res.status(400).json({ message: '유효하지 않은 파라미터입니다.' });
        }

        const mentoring = await findMentoringForHost(mentoringId, req.user.userId);
        if (!mentoring) {
            return res.status(404).json({ message: '질문을 확인할 수 있는 멘토링이 아닙니다.' });
        }

        const question = await prisma.question.findFirst({
            where: {
                questionId,
                mentoringId,
            },
            include: {
                user: {
                    select: {
                        userId: true,
                        nickname: true,
                    },
                },
                answerer: {
                    select: {
                        userId: true,
                        nickname: true,
                    },
                },
            },
        });

        if (!question) {
            return res.status(404).json({ message: '질문을 찾을 수 없습니다.' });
        }

        const updatedQuestion = await prisma.question.update({
            where: { questionId },
            data: {
                status: question.status === 'COMPLETED' ? 'COMPLETED' : 'ANSWERING',
            },
            include: {
                user: {
                    select: {
                        userId: true,
                        nickname: true,
                    },
                },
                answerer: {
                    select: {
                        userId: true,
                        nickname: true,
                    },
                },
            },
        });

        await emitQuestionEvent({
            mentoringId,
            event: 'question:acknowledged',
            payload: {
                question: mapQuestion(updatedQuestion),
            },
        });

        return res.json(
            serialize({
                question: mapQuestion(updatedQuestion),
            })
        );
    } catch (error) {
        next(error);
    }
});

// [POST] /mentorings/:id/questions/:questionId/complete - 멘토 질문 답변 완료 (답변에 해당하는 STT 스크립트 수집 종료)
router.post('/:id/questions/:questionId/complete', requireUser, async (req, res, next) => {
    try {
        if (req.user.role !== 'MENTOR') {
            return res.status(403).json({ message: '멘토만 질문을 완료할 수 있습니다.' });
        }

        const mentoringId = parseBigIntId(req.params.id);
        const questionId = parseBigIntId(req.params.questionId);

        if (!mentoringId || !questionId) {
            return res.status(400).json({ message: '유효하지 않은 파라미터입니다.' });
        }

        const mentoring = await findMentoringForHost(mentoringId, req.user.userId);
        if (!mentoring) {
            return res.status(404).json({ message: '질문을 완료할 수 있는 멘토링이 아닙니다.' });
        }

        const question = await prisma.question.findFirst({
            where: {
                questionId,
                mentoringId,
            },
            include: {
                user: {
                    select: {
                        userId: true,
                        nickname: true,
                    },
                },
                answerer: {
                    select: {
                        userId: true,
                        nickname: true,
                    },
                },
            },
        });

        if (!question) {
            return res.status(404).json({ message: '질문을 찾을 수 없습니다.' });
        }

        if (question.status !== 'ANSWERING') {
            return res.status(400).json({ message: '답변 중인 질문만 완료할 수 있습니다.' });
        }

        const updatedQuestion = await prisma.question.update({
            where: { questionId },
            data: {
                status: 'COMPLETED',
                answeredAt: new Date(),
                answeredByUserId: req.user.userId,
            },
            include: {
                user: {
                    select: {
                        userId: true,
                        nickname: true,
                    },
                },
                answerer: {
                    select: {
                        userId: true,
                        nickname: true,
                    },
                },
            },
        });

        await emitQuestionEvent({
            mentoringId,
            event: 'question:completed',
            payload: {
                question: mapQuestion(updatedQuestion),
            },
        });

        return res.json(
            serialize({
                question: mapQuestion(updatedQuestion),
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