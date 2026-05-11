import { Router } from 'express';
import { prisma } from '@carpoolink/database';
import { requireUser } from '../middleware/requireUser.js';
import { serialize } from '../utils/serialize.js';

const router = Router();

// 클라이언트가 원하는 스크립트 유형을 파싱하는 함수
function parseType(type) {
    const normalized = String(type ?? 'all').toLowerCase();

    if (normalized === 'all' || normalized === 'group' || normalized === 'one-on-one') {
        return normalized;
    }

    return 'all';
}

// 클라이언트가 참여한 멘토링 중 스크립트가 존재하는 멘토링을 찾는 함수
function buildParticipatedMentoringWhere(userId, type) {
    const where = {
        status: 'COMPLETED',
        OR: [
            { userId },
            {
                participants: {
                    some: { userId },
                },
            },
        ],
    };

    if (type === 'group') {
        where.isGroup = true;
    }

    if (type === 'one-on-one') {
        where.isGroup = false;
    }

    return where;
}

// 스크립트 단락에 마스킹된 부분이 있는지 확인하는 함수
function hasMaskedFlag(content) {
    if (!content || typeof content !== 'object') {
        return false;
    }

    // pieces 배열 내부 검사
    if (Array.isArray(content.pieces)) {
        return content.pieces.some(piece => piece.isMasked === true);
    }

    // 전체 단락이 마스킹된 경우 검사
    return content.isMasked === true;
}

// 스크립트 조회 권한을 판단하는 함수
function canViewPrivateScript(script, viewerUserId) {
    if (!script.isPrivate) {
        return true;
    }

    // 비공개 질문 단락: 발화자 멘티(작성자)와 주관 멘토만 조회 가능
    return script.userId === viewerUserId || script.mentoring.userId === viewerUserId;
}

// 조회 권한을 확인해 마스킹/비공개 처리가 완료된 스크립트 단락을 반환하는 함수
function getVisibleContent(script, viewerUserId) {
    if (!canViewPrivateScript(script, viewerUserId)) {
        return {
            visible: true,
            masked: false,
            content: {
                isPrivate: true,
                text: '비공개 질문입니다.',
            },
        };
    }

    const content = script.content;

    if (content && Array.isArray(content.pieces)) {
        const isMaskedParagraph = content.pieces.some(p => p.isMasked);

        return {
            visible: true,
            masked: isMaskedParagraph,
            content: {
                pieces: content.pieces.map(piece => {
                    if (piece.isMasked) {
                        return {
                            ...piece,
                            text: '마스킹된 부분입니다.',
                        };
                    }
                    return piece;
                })
            }
        };
    }

    if (hasMaskedFlag(script.content)) {
        // 마스킹된 단락은 멘토/멘티 모두 원문 비노출
        return {
            visible: true,
            masked: true,
            content: {
                isMasked: true,
                text: '마스킹된 단락입니다.',
            },
        };
    }

    return {
        visible: true,
        masked: false,
        content: script.content,
    };
}

// 스크립트 단락을 클라이언트에 반환할 형태로 매핑하는 함수
function mapScriptParagraph(script, viewerUserId) {
    const visibility = getVisibleContent(script, viewerUserId);

    return {
        scriptId: script.scriptId,
        isPrivate: script.isPrivate,
        createdAt: script.createdAt,
        content: visibility.content,
        speaker: {
            userId: script.userId,
            nickname: script.user?.nickname ?? null,
            role: script.user?.role ?? null,
            isHostMentor: script.userId === script.mentoring.userId,
        },
    };
}

// [GET] /scripts - 사용자가 참여했던 멘토링 중 스크립트가 존재하는 멘토링 목록 조회
router.get('/', requireUser, async (req, res, next) => {
    try {
        // 스크립트 유형 (전체/1:N/1:1)
        const type = parseType(req.query.type);

        // 조건에 맞는 멘토링 목록 조회
        const mentorings = await prisma.mentoring.findMany({
            where: {
                ...buildParticipatedMentoringWhere(req.user.userId, type),
                scripts: {
                    some: {},
                },
            },
            include: {
                hostMentor: {
                    include: {
                        mentorProfile: {
                            select: { mentorId: true },
                        },
                    },
                },
                _count: {
                    select: {
                        scripts: true,
                    },
                },
            },
            orderBy: [{ startedAt: 'desc' }, { mentoringId: 'desc' }],
        });

        res.json(
            serialize({
                mentorings: mentorings.map((mentoring) => ({
                    mentoringId: mentoring.mentoringId,
                    title: mentoring.title,
                    startedAt: mentoring.startedAt,
                    endedAt: mentoring.endedAt ?? null,
                    isGroup: mentoring.isGroup,
                    isScriptPublished: mentoring.isScriptPublished,
                    host: {
                        userId: mentoring.hostMentor.userId,
                        nickname: mentoring.hostMentor.nickname,
                        mentorId: mentoring.hostMentor.mentorProfile?.mentorId ?? null,
                    },
                    scriptCount: mentoring._count.scripts,
                })),
            })
        );
    } catch (error) {
        next(error);
    }
});

// [GET] /scripts/{mentoringId} - 해당 멘토링의 스크립트 전문 조회
router.get('/:mentoringId', requireUser, async (req, res, next) => {
    try {
        let mentoringId;
        try {
            mentoringId = BigInt(req.params.mentoringId);
        } catch {
            return res.status(400).json({ message: '유효하지 않은 mentoringId입니다.' });
        }

        // 멘토링과 스크립트 조회 (접근 권한 및 스크립트 존재 여부 검증 포함)
        const mentoring = await prisma.mentoring.findFirst({
            where: {
                status: 'COMPLETED',
                isScriptPublished: req.user.role === 'MENTOR' ? undefined : true, // 멘토는 발행 여부 상관없이 조회 가능, 멘티는 발행된 스크립트인 경우만 조회 가능
                mentoringId,
                ...buildParticipatedMentoringWhere(req.user.userId),
                scripts: {
                    some: {},
                },
            },
            include: {
                hostMentor: {
                    include: {
                        mentorProfile: {
                            select: { mentorId: true },
                        },
                    },
                },
                scripts: {
                    include: {
                        user: true,
                    },
                    orderBy: [{ createdAt: 'asc' }, { scriptId: 'asc' }],
                },
            },
        });

        if (!mentoring) {
            return res.status(404).json({ message: '멘토링을 찾을 수 없거나 접근이 거부되었습니다.' });
        }

        // 스크립트 단락별로 조회 권한을 판단해 마스킹/비공개 처리를 적용한 후 반환, createdAt 기준으로 정렬
        const scripts = mentoring.scripts
            .map((script) => mapScriptParagraph({ ...script, mentoring }, req.user.userId))
            .filter(Boolean)
            .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));

        res.json(
            serialize({
                mentoring: {
                    mentoringId: mentoring.mentoringId,
                    title: mentoring.title,
                    startedAt: mentoring.startedAt,
                    endedAt: mentoring.endedAt,
                    status: mentoring.status,
                    isGroup: mentoring.isGroup,
                    isScriptPublished: mentoring.isScriptPublished,
                    host: {
                        mentorId: mentoring.hostMentor.mentorProfile?.mentorId ?? null,
                        userId: mentoring.hostMentor.userId,
                        nickname: mentoring.hostMentor.nickname,
                    },
                },
                scripts,
            })
        );
    } catch (error) {
        next(error);
    }
});

// [PATCH] /scripts/:mentoringId/publish - 스크립트 단락 수정 및 멘토링 스크립트 발행
router.patch('/:mentoringId/publish', requireUser, async (req, res, next) => {
    try {
        let mentoringId;
        try {
            mentoringId = BigInt(req.params.mentoringId);
        } catch {
            return res.status(400).json({ message: '유효하지 않은 mentoringId입니다.' });
        }

        const { scripts } = req.body;

        if (!Array.isArray(scripts) || scripts.length === 0) {
            return res.status(400).json({ message: '업데이트할 스크립트 단락 배열(scripts)이 필요합니다.' });
        }

        // 1. 멘토링 정보 및 권한 확인
        const mentoring = await prisma.mentoring.findUnique({
            where: { mentoringId },
            select: {
                userId: true,
                status: true,
                isScriptPublished: true
            },
        });

        if (!mentoring) {
            return res.status(404).json({ message: '멘토링을 찾을 수 없습니다.' });
        }

        // 주관 멘토인지 확인
        if (mentoring.userId !== req.user.userId) {
            return res.status(403).json({ message: '스크립트를 발행할 권한이 없습니다.' });
        }

        if (mentoring.status !== 'COMPLETED') {
            return res.status(400).json({ message: '완료된 멘토링의 스크립트만 발행할 수 있습니다.' });
        }

        if (mentoring.isScriptPublished) {
            return res.status(400).json({ message: '이미 발행된 스크립트입니다. 더 이상 수정하거나 발행할 수 없습니다.' });
        }

        // 2. 트랜잭션으로 단락별 내용 업데이트 및 발행 상태 변경 수행
        await prisma.$transaction(async (tx) => {
            // 전달받은 스크립트 단락들 업데이트
            for (const script of scripts) {
                let scriptId;
                try {
                    scriptId = BigInt(script.scriptId);
                } catch {
                    continue; // 유효하지 않은 scriptId는 무시
                }

                await tx.script.update({
                    where: { scriptId },
                    data: {
                        content: script.content,
                    },
                });
            }

            // 멘토링 스크립트 발행 상태를 true로 변경
            await tx.mentoring.update({
                where: { mentoringId },
                data: {
                    isScriptPublished: true,
                },
            });
        });

        res.json(serialize({ message: '스크립트가 발행되었습니다.' }));
    } catch (error) {
        next(error);
    }
});

export default router;